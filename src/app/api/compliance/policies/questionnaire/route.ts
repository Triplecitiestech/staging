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
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import {
  getOrgProfileQuestions,
  getPolicyQuestions,
  computeCompletionPct,
  prefillFromOrgProfile,
} from '@/lib/compliance/policy-generation/questionnaire'

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

  await ensureComplianceTables()
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
    const companyRes = await client.query<{ name: string }>(
      `SELECT name FROM companies WHERE id = $1`, [companyId]
    )
    const companyName = companyRes.rows[0]?.name ?? ''

    // Pre-fill org_legal_name if not already set
    if (!orgAnswers.org_legal_name && companyName) {
      orgAnswers.org_legal_name = companyName
    }

    const orgQuestions = getOrgProfileQuestions()
    const orgCompletion = computeCompletionPct(orgQuestions, orgAnswers)

    const result: Record<string, unknown> = {
      orgProfile: {
        questions: orgQuestions,
        answers: orgAnswers,
        completionPct: orgCompletion,
      },
    }

    // If policy slug provided, also return policy-specific data
    if (policySlug) {
      const policyRes = await client.query<{ answers: Record<string, string | string[] | boolean> }>(
        `SELECT answers FROM policy_intake_answers WHERE "companyId" = $1 AND "policySlug" = $2`,
        [companyId, policySlug]
      )
      const savedPolicyAnswers = policyRes.rows[0]?.answers ?? {}

      // Pre-fill from org profile
      const prefilled = prefillFromOrgProfile(policySlug, orgAnswers)
      const mergedAnswers = { ...prefilled, ...savedPolicyAnswers }

      const policyQuestions = getPolicyQuestions(policySlug)
      const policyCompletion = computeCompletionPct(policyQuestions, mergedAnswers)

      result.policyIntake = {
        questions: policyQuestions,
        answers: mergedAnswers,
        completionPct: policyCompletion,
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

    await ensureComplianceTables()
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
