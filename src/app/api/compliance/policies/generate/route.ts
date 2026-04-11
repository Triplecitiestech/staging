/**
 * POST /api/compliance/policies/generate — Generate a policy using AI
 *
 * Body:
 *   companyId    — required
 *   policySlug   — required
 *   mode         — 'new' | 'improve' | 'update-framework' | 'standardize' | 'fill-missing'
 *   frameworks   — optional, default ['cis-v8']
 *   userInstructions — optional, additional user-provided context
 *
 * PATCH /api/compliance/policies/generate — Update policy status (approve, etc.)
 *
 * Body:
 *   companyId, policySlug, action: 'approve' | 'reject' | 'mark_review'
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { generatePolicy } from '@/lib/compliance/policy-generation/generator'
import { getCatalogItem } from '@/lib/compliance/policy-generation/catalog'
import type { GenerationMode } from '@/lib/compliance/policy-generation/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      companyId?: string
      policySlug?: string
      mode?: GenerationMode
      frameworks?: string[]
      userInstructions?: string
    }

    if (!body.companyId || !body.policySlug) {
      return NextResponse.json({ error: 'companyId and policySlug are required' }, { status: 400 })
    }

    const catalog = getCatalogItem(body.policySlug)
    // Allow gap-remediation-policy slug even if not in catalog
    if (!catalog && body.policySlug !== 'gap-remediation-policy') {
      return NextResponse.json({ error: `Unknown policy slug: ${body.policySlug}` }, { status: 400 })
    }

    const mode = body.mode ?? 'new'
    const frameworks = body.frameworks ?? ['cis-v8']

    await ensureComplianceTables()
    const pool = getPool()
    const client = await pool.connect()

    try {
      // Load company name
      const companyRes = await client.query<{ displayName: string }>(
        `SELECT "displayName" FROM companies WHERE id = $1`, [body.companyId]
      )
      const companyName = companyRes.rows[0]?.displayName
      if (!companyName) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 })
      }

      // Load org profile answers (graceful if table doesn't exist)
      let orgProfile: Record<string, string | string[] | boolean> = {}
      try {
        const orgRes = await client.query<{ answers: Record<string, string | string[] | boolean> }>(
          `SELECT answers FROM policy_org_profiles WHERE "companyId" = $1`,
          [body.companyId]
        )
        orgProfile = orgRes.rows[0]?.answers ?? {}
      } catch { /* table may not exist — use empty profile */ }

      // Pre-fill org_legal_name
      if (!orgProfile.org_legal_name) {
        orgProfile.org_legal_name = companyName
      }

      // Derive security posture from platform mappings
      // Platform mappings tell us what tools are deployed for this company.
      // If datto_edr is mapped → EDR is deployed, if dnsfilter → DNS filtering, etc.
      try {
        const mappingsRes = await client.query<{ platform: string }>(
          `SELECT DISTINCT platform FROM compliance_platform_mappings WHERE "companyId" = $1`,
          [body.companyId]
        )
        const mappedPlatforms = new Set(mappingsRes.rows.map((r) => r.platform))

        // Inject derived security posture into org profile for the AI prompt
        orgProfile.org_edr_deployed = mappedPlatforms.has('datto_edr')
        orgProfile.org_dns_filtering = mappedPlatforms.has('dnsfilter')
        orgProfile.org_siem_deployed = mappedPlatforms.has('saas_alerts')
        orgProfile.org_encryption_at_rest = mappedPlatforms.has('microsoft_graph') // BitLocker data comes from Graph
        orgProfile.org_mdm_deployed = mappedPlatforms.has('microsoft_graph') // Intune data comes from Graph

        // Backup type derived from BCDR + SaaS Protect mappings
        const hasBcdr = mappedPlatforms.has('datto_bcdr')
        const hasSaas = mappedPlatforms.has('datto_saas')
        if (hasBcdr && hasSaas) orgProfile.org_backup_type = 'hybrid'
        else if (hasBcdr) orgProfile.org_backup_type = 'hybrid'
        else if (hasSaas) orgProfile.org_backup_type = 'cloud'
        // If no backup platform mapped, leave unset — AI will note gap

        // MFA status: if Microsoft Graph is connected, try to get actual MFA data from evidence
        if (mappedPlatforms.has('microsoft_graph')) {
          try {
            const mfaEvidence = await client.query<{ data: { mfaRate?: number } }>(
              `SELECT "rawData" as data FROM compliance_evidence
               WHERE "companyId" = $1 AND "sourceType" = 'microsoft_mfa'
               ORDER BY "collectedAt" DESC LIMIT 1`,
              [body.companyId]
            )
            const mfaRate = mfaEvidence.rows[0]?.data?.mfaRate
            if (mfaRate !== undefined) {
              if (mfaRate >= 95) orgProfile.org_mfa_status = 'full'
              else if (mfaRate >= 50) orgProfile.org_mfa_status = 'partial'
              else if (mfaRate > 0) orgProfile.org_mfa_status = 'admins'
              else orgProfile.org_mfa_status = 'none'
            }
          } catch { /* evidence table may not exist — MFA status unknown */ }
        }
      } catch {
        // compliance_platform_mappings table may not exist — skip derivation
      }

      // Load policy-specific answers (graceful if table doesn't exist)
      let policyAnswers: Record<string, string | string[] | boolean> = {}
      try {
        const policyRes = await client.query<{ answers: Record<string, string | string[] | boolean> }>(
          `SELECT answers FROM policy_intake_answers WHERE "companyId" = $1 AND "policySlug" = $2`,
          [body.companyId, body.policySlug]
        )
        policyAnswers = policyRes.rows[0]?.answers ?? {}
      } catch { /* table may not exist — use empty answers */ }

      // Load existing content if mode requires it
      let existingContent: string | undefined
      if (mode !== 'new') {
        try {
          const existingRes = await client.query<{ content: string }>(
            `SELECT cp.content FROM policy_generation_records pgr
             JOIN compliance_policies cp ON cp.id = pgr."policyId"
             WHERE pgr."companyId" = $1 AND pgr."policySlug" = $2 AND pgr."policyId" IS NOT NULL`,
            [body.companyId, body.policySlug]
          )
          existingContent = existingRes.rows[0]?.content
        } catch { /* table may not exist */ }
      }

      // Reset any stuck 'generating' records older than 5 minutes, then set current to 'generating'
      try {
        await client.query(
          `UPDATE policy_generation_records SET status = 'ready_to_generate', "updatedAt" = NOW()
           WHERE "companyId" = $1 AND status = 'generating' AND "updatedAt" < NOW() - INTERVAL '5 minutes'`,
          [body.companyId]
        )
        await client.query(
          `INSERT INTO policy_generation_records ("companyId", "policySlug", status, "updatedAt")
           VALUES ($1, $2, 'generating', NOW())
           ON CONFLICT ("companyId", "policySlug")
           DO UPDATE SET status = 'generating', "updatedAt" = NOW()`,
          [body.companyId, body.policySlug]
        )
      } catch { /* table may not exist — skip status tracking */ }

      // Generate the policy
      const result = await generatePolicy({
        policySlug: body.policySlug,
        companyName,
        orgProfile,
        policyAnswers,
        selectedFrameworks: frameworks,
        mode,
        existingContent,
        userInstructions: body.userInstructions,
      })

      // Store the generated policy in compliance_policies
      const policyCategory = catalog?.category ?? 'governance'
      const policyInsert = await client.query<{ id: string }>(
        `INSERT INTO compliance_policies ("companyId", title, source, content, category, tags, "frameworkIds", "controlIds", "createdBy")
         VALUES ($1, $2, 'generated', $3, $4, '[]'::jsonb, $5::jsonb, '[]'::jsonb, $6) RETURNING id`,
        [
          body.companyId,
          result.metadata.policyTitle,
          result.content,
          policyCategory,
          JSON.stringify(frameworks),
          session.user.email,
        ]
      )
      const policyId = policyInsert.rows[0].id

      // Track version and generation record (graceful if tables don't exist)
      let newVersion = 1
      try {
        const versionRes = await client.query<{ version: number }>(
          `SELECT COALESCE(MAX(version), 0) as version FROM policy_versions
           WHERE "companyId" = $1 AND "policySlug" = $2`,
          [body.companyId, body.policySlug]
        )
        newVersion = (versionRes.rows[0]?.version ?? 0) + 1

        await client.query(
          `INSERT INTO policy_versions ("companyId", "policySlug", version, "policyId", content, status, "inputSnapshot", "generatedAt", "generatedBy")
           VALUES ($1, $2, $3, $4, $5, 'draft', $6::jsonb, NOW(), $7)`,
          [
            body.companyId, body.policySlug, newVersion, policyId,
            result.content,
            JSON.stringify({ orgProfile, policyAnswers, frameworks, mode }),
            session.user.email,
          ]
        )
      } catch (vErr) {
        console.warn('[compliance/policies/generate] policy_versions write failed:', vErr instanceof Error ? vErr.message : vErr)
      }

      try {
        await client.query(
          `UPDATE policy_generation_records
           SET status = 'draft', "policyId" = $1, version = $2,
               "inputSnapshot" = $3::jsonb, "inputHash" = $4,
               "generatedAt" = NOW(), "generatedBy" = $5, "updatedAt" = NOW()
           WHERE "companyId" = $6 AND "policySlug" = $7`,
          [
            policyId, newVersion,
            JSON.stringify({ orgProfile, policyAnswers, frameworks, mode }),
            result.inputHash,
            session.user.email,
            body.companyId, body.policySlug,
          ]
        )
      } catch (rErr) {
        console.warn('[compliance/policies/generate] policy_generation_records write failed:', rErr instanceof Error ? rErr.message : rErr)
      }

      return NextResponse.json({
        success: true,
        data: {
          policyId,
          version: newVersion,
          content: result.content,
          metadata: result.metadata,
        },
      })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[compliance/policies/generate] POST error:', err)

    // Try to revert status if we can
    try {
      const body = await request.clone().json()
      if (body.companyId && body.policySlug) {
        const pool = getPool()
        await pool.query(
          `UPDATE policy_generation_records SET status = 'ready_to_generate', "updatedAt" = NOW()
           WHERE "companyId" = $1 AND "policySlug" = $2 AND status = 'generating'`,
          [body.companyId, body.policySlug]
        )
      }
    } catch { /* ignore cleanup errors */ }

    return NextResponse.json({
      error: `Policy generation failed: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      companyId?: string
      policySlug?: string
      action?: 'approve' | 'reject' | 'mark_review'
    }

    if (!body.companyId || !body.policySlug || !body.action) {
      return NextResponse.json({ error: 'companyId, policySlug, and action are required' }, { status: 400 })
    }

    await ensureComplianceTables()
    const pool = getPool()
    const client = await pool.connect()

    try {
      const statusMap = {
        approve: 'approved',
        reject: 'missing',
        mark_review: 'under_review',
      }
      const newStatus = statusMap[body.action]

      const updateFields = body.action === 'approve'
        ? `, "approvedAt" = NOW(), "approvedBy" = '${session.user.email}'`
        : ''

      await client.query(
        `UPDATE policy_generation_records
         SET status = $1, "updatedAt" = NOW() ${updateFields}
         WHERE "companyId" = $2 AND "policySlug" = $3`,
        [newStatus, body.companyId, body.policySlug]
      )

      // Also update the version record if approving
      if (body.action === 'approve') {
        await client.query(
          `UPDATE policy_versions SET status = 'approved', "approvedAt" = NOW(), "approvedBy" = $1
           WHERE "companyId" = $2 AND "policySlug" = $3
             AND version = (SELECT MAX(version) FROM policy_versions WHERE "companyId" = $2 AND "policySlug" = $3)`,
          [session.user.email, body.companyId, body.policySlug]
        )
      }

      return NextResponse.json({ success: true, status: newStatus })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[compliance/policies/generate] PATCH error:', err)
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
  }
}
