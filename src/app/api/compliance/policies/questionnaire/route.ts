/**
 * GET  /api/compliance/policies/questionnaire — Get questionnaire + saved answers
 * POST /api/compliance/policies/questionnaire — Save answers (org profile or policy-specific)
 *
 * Query params (GET):
 *   companyId  — required
 *   policySlug — optional, if provided returns policy-specific questions too
 *
 * POST body:
 *   { companyId, type: 'org-profile' | 'policy', policySlug?, answers }
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'
import type { PoolClient } from 'pg'
import {
  getOrgProfileQuestions,
  getPolicyQuestions,
  computeCompletionPct,
  prefillFromOrgProfile,
} from '@/lib/compliance/policy-generation/questionnaire'

/**
 * Derive policy-specific answers from available integrations/evidence.
 * Returns a map of answerId -> value, plus a list of which keys were derived.
 * Only derives answers that can be reliably inferred from data we already collect.
 */
async function derivePolicyAnswersFromIntegrations(
  client: PoolClient,
  companyId: string,
  policySlug: string,
  orgAnswers: Record<string, string | string[] | boolean>
): Promise<{ derived: Record<string, string | string[] | boolean>; derivedKeys: string[] }> {
  const derived: Record<string, string | string[] | boolean> = {}
  const derivedKeys: string[] = []

  // Get mapped platforms for this company (graceful fallback if table missing)
  let mappedPlatforms = new Set<string>()
  try {
    const mappingsRes = await client.query<{ platform: string }>(
      `SELECT DISTINCT platform FROM compliance_platform_mappings WHERE "companyId" = $1`,
      [companyId]
    )
    mappedPlatforms = new Set(mappingsRes.rows.map((r) => r.platform))
  } catch { /* table may not exist */ }

  // Helper: mark a field as derived
  const set = (key: string, value: string | string[] | boolean) => {
    derived[key] = value
    derivedKeys.push(key)
  }

  // ---- Password Policy ----
  if (policySlug === 'password-policy') {
    // Try to derive minimum password length from Intune compliance policies
    try {
      const intuneRes = await client.query<{ rawData: Record<string, unknown> }>(
        `SELECT "rawData" FROM compliance_evidence
         WHERE "companyId" = $1 AND "sourceType" = 'microsoft_intune_config'
         ORDER BY "collectedAt" DESC LIMIT 1`,
        [companyId]
      )
      const raw = intuneRes.rows[0]?.rawData as { compliancePolicies?: Array<{ name?: string; description?: string | null }> } | undefined
      if (raw?.compliancePolicies && raw.compliancePolicies.length > 0) {
        // Heuristic: Intune default is 8, most MSP standards enforce 12-14
        // Without reading actual policy settings (requires different Graph endpoint),
        // we mark it as 12 which is the conservative MSP baseline.
        set('pw_min_length', '12')
      }
    } catch { /* ignore */ }

    // Password manager: if IT Glue is mapped, assume password manager in use
    if (mappedPlatforms.has('it_glue')) {
      set('pw_password_manager', true)
    }
  }

  // ---- Acceptable Use Policy ----
  if (policySlug === 'acceptable-use-policy') {
    // If SaaS Alerts (SIEM) is mapped, monitoring is active
    if (mappedPlatforms.has('saas_alerts')) {
      set('aup_monitoring_notice', true)
    }
  }

  // ---- Remote Access Policy ----
  if (policySlug === 'remote-access-policy') {
    // If org uses contractors, third-party remote access is likely
    if (orgAnswers.org_contractors === true) {
      set('ra_third_party_access', true)
    }
  }

  // ---- Backup & Disaster Recovery Policy ----
  if (policySlug === 'backup-disaster-recovery-policy') {
    // If BCDR is mapped, backup tests are typically monthly per MSP standards
    if (mappedPlatforms.has('datto_bcdr')) {
      set('bdr_test_frequency', 'monthly')
    }
  }

  // ---- Incident Response Policy ----
  if (policySlug === 'incident-response-policy') {
    // Regulatory requirements derived from org data types
    const notifications: string[] = []
    if (orgAnswers.org_handles_phi === true) notifications.push('hipaa')
    if (orgAnswers.org_handles_cui === true) notifications.push('dfars')
    notifications.push('state') // Always applicable in the US
    if (notifications.length > 1) {
      set('ir_notification_requirements', notifications)
    }
  }

  // ---- AI Usage Policy ----
  if (policySlug === 'ai-usage-policy') {
    // If org profile says AI tools are approved, default to restricting confidential data
    if (orgAnswers.org_ai_tools_used === 'yes_approved' || orgAnswers.org_ai_tools_used === 'yes_uncontrolled') {
      set('ai_confidential_data_restriction', true)
    }
  }

  return { derived, derivedKeys }
}

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = request.nextUrl.searchParams.get('companyId')
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  const policySlug = request.nextUrl.searchParams.get('policySlug')

  const pool = getPool()
  const client = await pool.connect()

  try {
    // Load org profile answers
    const orgRes = await client.query<{ answers: Record<string, string | string[] | boolean> }>(
      `SELECT answers FROM policy_org_profiles WHERE "companyId" = $1`,
      [companyId]
    )
    const orgAnswers = orgRes.rows[0]?.answers ?? {}

    // Load company name for pre-fill
    const companyRes = await client.query<{ displayName: string }>(
      `SELECT "displayName" FROM companies WHERE id = $1`, [companyId]
    )
    const companyName = companyRes.rows[0]?.displayName ?? ''

    // Pre-fill org_legal_name if not already set
    if (!orgAnswers.org_legal_name && companyName) {
      orgAnswers.org_legal_name = companyName
    }

    // Extract auto-filled field tracking metadata
    const autoFilledFields: string[] = Array.isArray(orgAnswers._autoFilledFields)
      ? orgAnswers._autoFilledFields as string[]
      : []

    const orgQuestions = getOrgProfileQuestions()
    const orgCompletion = computeCompletionPct(orgQuestions, orgAnswers)

    const result: Record<string, unknown> = {
      orgProfile: {
        questions: orgQuestions,
        answers: orgAnswers,
        completionPct: orgCompletion,
        autoFilledFields,
      },
    }

    // If policy slug provided, also return policy-specific data
    if (policySlug) {
      const policyRes = await client.query<{ answers: Record<string, string | string[] | boolean> }>(
        `SELECT answers FROM policy_intake_answers WHERE "companyId" = $1 AND "policySlug" = $2`,
        [companyId, policySlug]
      )
      const savedPolicyAnswers = policyRes.rows[0]?.answers ?? {}

      // Pre-fill from org profile (prefillKey mechanism)
      const prefilled = prefillFromOrgProfile(policySlug, orgAnswers)

      // Derive answers from existing integrations (platform mappings, evidence, org profile).
      // Reuses the same data sources as the generate route's security posture derivation.
      const { derived, derivedKeys } = await derivePolicyAnswersFromIntegrations(
        client, companyId, policySlug, orgAnswers
      )

      // Priority: saved user answers > AI-derived > prefillKey defaults
      const mergedAnswers = { ...prefilled, ...derived, ...savedPolicyAnswers }

      // Only mark as "derived" keys that are actually filled by derivation (not overridden by user)
      const actuallyDerivedKeys = derivedKeys.filter((k) => !(k in savedPolicyAnswers))

      const policyQuestions = getPolicyQuestions(policySlug)
      const requiredCount = policyQuestions.filter((q) => q.required).length
      const answeredCount = policyQuestions.filter((q) => {
        const v = mergedAnswers[q.id]
        if (v === undefined || v === null || v === '') return false
        if (Array.isArray(v) && v.length === 0) return false
        return true
      }).length
      const policyCompletion = computeCompletionPct(policyQuestions, mergedAnswers)

      // Load the latest generated draft content if one exists, so the detail
      // page can show it immediately without a separate fetch (which was
      // causing the "Loading..." placeholder to stick).
      let latestContent: string | null = null
      let latestVersion: number | null = null
      try {
        const contentRes = await client.query<{ content: string; version: number }>(
          `SELECT pv.content, pv.version
           FROM policy_versions pv
           WHERE pv."companyId" = $1 AND pv."policySlug" = $2
           ORDER BY pv.version DESC LIMIT 1`,
          [companyId, policySlug]
        )
        if (contentRes.rows[0]) {
          latestContent = contentRes.rows[0].content
          latestVersion = contentRes.rows[0].version
        }
      } catch { /* policy_versions may not exist yet */ }

      // Fallback: if policy_versions is empty but a generation record points at
      // a compliance_policies row, fetch content directly from there.
      if (!latestContent) {
        try {
          const fallbackRes = await client.query<{ content: string }>(
            `SELECT cp.content
             FROM policy_generation_records pgr
             JOIN compliance_policies cp ON cp.id = pgr."policyId"
             WHERE pgr."companyId" = $1 AND pgr."policySlug" = $2 AND pgr."policyId" IS NOT NULL
             LIMIT 1`,
            [companyId, policySlug]
          )
          if (fallbackRes.rows[0]) {
            latestContent = fallbackRes.rows[0].content
          }
        } catch { /* ignore */ }
      }

      result.policyIntake = {
        questions: policyQuestions,
        answers: mergedAnswers,
        completionPct: policyCompletion,
        requiredCount,
        answeredCount,
        totalQuestions: policyQuestions.length,
        derivedFields: actuallyDerivedKeys,
        latestContent,
        latestVersion,
      }
    }

    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    console.error('[compliance/policies/questionnaire] GET error:', err)
    return NextResponse.json({ error: 'Failed to load questionnaire' }, { status: 500 })
  } finally {
    client.release()
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      companyId?: string
      type?: 'org-profile' | 'policy'
      policySlug?: string
      answers?: Record<string, string | string[] | boolean>
    }

    if (!body.companyId || !body.type || !body.answers) {
      return NextResponse.json({ error: 'companyId, type, and answers are required' }, { status: 400 })
    }

    if (body.type === 'policy' && !body.policySlug) {
      return NextResponse.json({ error: 'policySlug is required for policy type' }, { status: 400 })
    }

    // Tables are created by bootstrap/setup — skip ensureComplianceTables on writes for speed
    const pool = getPool()
    const client = await pool.connect()

    try {
      if (body.type === 'org-profile') {
        // Upsert org profile
        await client.query(
          `INSERT INTO policy_org_profiles ("companyId", answers, "updatedAt", "updatedBy")
           VALUES ($1, $2::jsonb, NOW(), $3)
           ON CONFLICT ("companyId")
           DO UPDATE SET answers = $2::jsonb, "updatedAt" = NOW(), "updatedBy" = $3`,
          [body.companyId, JSON.stringify(body.answers), session.user.email]
        )
      } else {
        // Upsert policy-specific answers
        await client.query(
          `INSERT INTO policy_intake_answers ("companyId", "policySlug", answers, "updatedAt", "updatedBy")
           VALUES ($1, $2, $3::jsonb, NOW(), $4)
           ON CONFLICT ("companyId", "policySlug")
           DO UPDATE SET answers = $3::jsonb, "updatedAt" = NOW(), "updatedBy" = $4`,
          [body.companyId, body.policySlug, JSON.stringify(body.answers), session.user.email]
        )
      }

      return NextResponse.json({ success: true })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[compliance/policies/questionnaire] POST error:', err)
    return NextResponse.json({ error: 'Failed to save answers' }, { status: 500 })
  }
}
