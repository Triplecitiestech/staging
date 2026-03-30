/**
 * GET  /api/compliance/policies?companyId=xxx — List policies for a company
 * POST /api/compliance/policies — Create/upload a policy + trigger AI analysis
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import type { CompliancePolicy, PolicyAnalysis } from '@/lib/compliance/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = request.nextUrl.searchParams.get('companyId')
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()

  try {
    const policies = await client.query<CompliancePolicy>(
      `SELECT id, "companyId", title, source, content, category, tags, "frameworkIds", "controlIds",
              "createdBy", "createdAt", "updatedAt"
       FROM compliance_policies WHERE "companyId" = $1 ORDER BY "createdAt" DESC`,
      [companyId]
    )

    // Get analyses for each policy
    const policyIds = policies.rows.map((p) => p.id)
    let analyses: PolicyAnalysis[] = []
    if (policyIds.length > 0) {
      const analysisRes = await client.query<PolicyAnalysis>(
        `SELECT id, "policyId", "companyId", status, "satisfiedControls", "partialControls",
                "missingControls", gaps, recommendations, "analysisText", "analyzedAt"
         FROM compliance_policy_analyses
         WHERE "policyId" = ANY($1) ORDER BY "createdAt" DESC`,
        [policyIds]
      )
      analyses = analysisRes.rows
    }

    return NextResponse.json({
      success: true,
      data: { policies: policies.rows, analyses },
    })
  } catch (err) {
    console.error('[compliance/policies] GET error:', err)
    return NextResponse.json({ error: 'Failed to load policies' }, { status: 500 })
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
      title?: string
      content?: string
      source?: string
      category?: string
      tags?: string[]
      frameworkIds?: string[]
      controlIds?: string[]
      analyze?: boolean
    }

    if (!body.companyId || !body.title || !body.content) {
      return NextResponse.json({ error: 'companyId, title, and content are required' }, { status: 400 })
    }

    await ensureComplianceTables()
    const pool = getPool()
    const client = await pool.connect()

    try {
      // Create policy
      const policyRes = await client.query<{ id: string }>(
        `INSERT INTO compliance_policies ("companyId", title, source, content, category, tags, "frameworkIds", "controlIds", "createdBy")
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9) RETURNING id`,
        [
          body.companyId, body.title, body.source ?? 'paste', body.content,
          body.category ?? '', JSON.stringify(body.tags ?? []),
          JSON.stringify(body.frameworkIds ?? ['cis-v8']),
          JSON.stringify(body.controlIds ?? []),
          session.user.email,
        ]
      )
      const policyId = policyRes.rows[0].id

      // Trigger AI analysis if requested
      let analysis: PolicyAnalysis | null = null
      if (body.analyze !== false) {
        analysis = await analyzePolicyWithAI(client, policyId, body.companyId, body.title, body.content, session.user.email)
      }

      return NextResponse.json({ success: true, policyId, analysis })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[compliance/policies] POST error:', err)
    return NextResponse.json({ error: 'Failed to create policy' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// AI Policy Analysis
// ---------------------------------------------------------------------------

async function analyzePolicyWithAI(
  client: import('pg').PoolClient,
  policyId: string,
  companyId: string,
  title: string,
  content: string,
  _actor: string
): Promise<PolicyAnalysis | null> {
  // Create pending analysis record
  const analysisRes = await client.query<{ id: string }>(
    `INSERT INTO compliance_policy_analyses ("policyId", "companyId", status)
     VALUES ($1, $2, 'analyzing') RETURNING id`,
    [policyId, companyId]
  )
  const analysisId = analysisRes.rows[0].id

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      await client.query(
        `UPDATE compliance_policy_analyses SET status = 'error', "analysisText" = 'ANTHROPIC_API_KEY not configured' WHERE id = $1`,
        [analysisId]
      )
      return null
    }

    const prompt = `You are a compliance policy analyst for an MSP (Managed Service Provider). Analyze the following customer policy document against CIS Controls v8 requirements.

Policy Title: ${title}

Policy Content:
${content.substring(0, 8000)}

Analyze this policy and provide a JSON response with:
1. "satisfiedControls" - array of CIS v8 control IDs (like "cis-v8-6.3") that this policy adequately addresses
2. "partialControls" - array of control IDs partially addressed
3. "missingControls" - array of control IDs this policy should address but doesn't
4. "gaps" - array of strings describing specific gaps or missing sections
5. "recommendations" - array of specific actionable recommendations to improve the policy
6. "summary" - a 2-3 sentence overall assessment

Use ONLY these control IDs: cis-v8-1.1, cis-v8-3.3, cis-v8-4.1, cis-v8-4.6, cis-v8-4.7, cis-v8-5.2, cis-v8-5.3, cis-v8-6.1, cis-v8-6.2, cis-v8-6.3, cis-v8-6.5, cis-v8-8.2, cis-v8-8.5, cis-v8-9.2, cis-v8-10.1, cis-v8-11.1, cis-v8-12.6, cis-v8-14.1, cis-v8-15.7

Respond with ONLY valid JSON, no markdown.`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(45_000),
    })

    if (!res.ok) {
      throw new Error(`Anthropic API error: ${res.status}`)
    }

    const data = (await res.json()) as { content: Array<{ type: string; text: string }> }
    const text = data.content?.[0]?.text ?? ''

    // Parse JSON from response
    let parsed: {
      satisfiedControls?: string[]
      partialControls?: string[]
      missingControls?: string[]
      gaps?: string[]
      recommendations?: string[]
      summary?: string
    } = {}

    try {
      parsed = JSON.parse(text)
    } catch {
      // Try to extract JSON from text
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
    }

    await client.query(
      `UPDATE compliance_policy_analyses
       SET status = 'complete',
           "satisfiedControls" = $1::jsonb,
           "partialControls" = $2::jsonb,
           "missingControls" = $3::jsonb,
           gaps = $4::jsonb,
           recommendations = $5::jsonb,
           "analysisText" = $6,
           "analyzedAt" = NOW()
       WHERE id = $7`,
      [
        JSON.stringify(parsed.satisfiedControls ?? []),
        JSON.stringify(parsed.partialControls ?? []),
        JSON.stringify(parsed.missingControls ?? []),
        JSON.stringify(parsed.gaps ?? []),
        JSON.stringify(parsed.recommendations ?? []),
        parsed.summary ?? text,
        analysisId,
      ]
    )

    // Fetch and return the completed analysis
    const result = await client.query<PolicyAnalysis>(
      `SELECT * FROM compliance_policy_analyses WHERE id = $1`, [analysisId]
    )
    return result.rows[0] ?? null
  } catch (err) {
    await client.query(
      `UPDATE compliance_policy_analyses SET status = 'error', "analysisText" = $1 WHERE id = $2`,
      [`Analysis failed: ${err instanceof Error ? err.message : String(err)}`, analysisId]
    )
    return null
  }
}
