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
                "missingControls", gaps, recommendations, "analysisText",
                COALESCE("controlDetails", '[]'::jsonb) as "controlDetails", "analyzedAt"
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

    let policyContent = body.content

    // If content is a SharePoint URL, fetch the document via Graph API
    const spMatch = policyContent.match(/^\[SHAREPOINT:(https?:\/\/.+)]$/)
    if (spMatch) {
      try {
        policyContent = await fetchSharePointDocument(body.companyId, spMatch[1])
      } catch (err) {
        return NextResponse.json({
          error: `Failed to fetch SharePoint document: ${err instanceof Error ? err.message : String(err)}`,
        }, { status: 400 })
      }
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
          body.companyId, body.title, body.source ?? 'paste', policyContent,
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
        analysis = await analyzePolicyWithAI(client, policyId, body.companyId, body.title, policyContent, session.user.email)
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

/**
 * PATCH /api/compliance/policies — Re-analyze an existing policy with the latest prompt
 */
export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as { policyId?: string; companyId?: string; reanalyzeAll?: boolean }

    await ensureComplianceTables()
    const pool = getPool()
    const client = await pool.connect()

    try {
      if (body.reanalyzeAll && body.companyId) {
        // Return list of policy IDs — client will re-analyze one at a time to avoid timeout
        const policies = await client.query<{ id: string; title: string }>(
          `SELECT id, title FROM compliance_policies WHERE "companyId" = $1`,
          [body.companyId]
        )
        return NextResponse.json({
          success: true,
          action: 'list',
          policies: policies.rows.map((p) => ({ id: p.id, title: p.title })),
        })
      }

      if (body.policyId) {
        // Re-analyze a single policy
        const policy = await client.query<{ id: string; title: string; content: string; companyId: string }>(
          `SELECT id, title, content, "companyId" FROM compliance_policies WHERE id = $1`,
          [body.policyId]
        )
        if (policy.rows.length === 0) {
          return NextResponse.json({ error: 'Policy not found' }, { status: 404 })
        }
        const p = policy.rows[0]
        // Delete old analyses
        await client.query(`DELETE FROM compliance_policy_analyses WHERE "policyId" = $1`, [p.id])
        const analysis = await analyzePolicyWithAI(client, p.id, p.companyId, p.title, p.content, session.user.email)
        return NextResponse.json({ success: true, analysis })
      }

      return NextResponse.json({ error: 'policyId or (companyId + reanalyzeAll) required' }, { status: 400 })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[compliance/policies] PATCH error:', err)
    return NextResponse.json({ error: 'Failed to re-analyze policy' }, { status: 500 })
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
${content.substring(0, 12000)}

Analyze this policy and provide a JSON response with:
1. "controlDetails" - array of objects for EACH relevant control with:
   - "controlId": CIS v8 control ID (e.g. "cis-v8-3.4")
   - "status": "satisfied" | "partial" | "missing"
   - "reasoning": 1-2 sentence explanation of WHY this control is satisfied/partial/missing
   - "quote": exact quote from the policy text that addresses this control (null if missing)
   - "section": the section heading or title where the relevant text appears (null if missing)
2. "satisfiedControls" - array of control IDs fully satisfied (for backward compatibility)
3. "partialControls" - array of control IDs partially addressed
4. "missingControls" - array of control IDs this policy SHOULD address but doesn't
5. "gaps" - array of strings describing specific gaps
6. "recommendations" - array of specific actionable recommendations
7. "summary" - a 2-3 sentence overall assessment

IMPORTANT: For each control in controlDetails, include an exact "quote" from the policy text that demonstrates compliance. Keep quotes under 200 characters. If the control is "missing", set quote to null.

CIS v8 Controls to evaluate against:
1.1 Asset Inventory, 1.2 Address Unauthorized Assets, 1.3 Active Discovery Tool, 1.4 DHCP Logging, 1.5 Passive Discovery,
2.1 Software Inventory, 2.2 Authorized Software, 2.3 Address Unauthorized Software,
3.1 Data Management Process, 3.2 Data Inventory, 3.3 Data Access Control, 3.4 Data Retention, 3.5 Data Disposal, 3.6 Encrypt End-User Devices,
4.1 Secure Configuration Process, 4.2 Network Secure Config, 4.3 Session Locking, 4.4 Server Firewall, 4.5 Endpoint Firewall, 4.6 Encryption, 4.7 Default Accounts,
5.1 Account Inventory, 5.2 Unique Passwords, 5.3 Disable Dormant Accounts, 5.4 Restrict Admin Privileges,
6.1 Access Granting Process, 6.2 Access Revoking Process, 6.3 MFA for External Apps, 6.4 MFA for Remote Access, 6.5 MFA for Admin Access,
7.1 Vulnerability Management, 7.2 Remediation Process, 7.3 OS Patch Management, 7.4 Application Patch Management,
8.1 Audit Log Management Process, 8.2 Collect Audit Logs, 8.3 Audit Log Storage, 8.5 Detailed Audit Logs,
9.1 Supported Browsers, 9.2 DNS Filtering,
10.1 Anti-Malware, 10.2 Configure Anti-Malware, 10.3 Disable Autorun,
11.1 Data Recovery Practice, 11.2 Automated Backups, 11.3 Protect Recovery Data, 11.4 Isolated Recovery Data,
12.1 Network Infrastructure Up-to-Date, 12.6 Encryption in Transit,
13.1 Centralized Security Alerting,
14.1 Security Awareness Program, 14.2-14.8 Specific Training Topics,
15.1 Service Provider Inventory, 15.2 Service Provider Management, 15.7 Decommission Service Providers,
16.1 Secure Application Development,
17.1 Incident Handling Personnel, 17.2 Incident Reporting Process, 17.3 Incident Response Plan

Use control IDs in format "cis-v8-X.Y" (e.g. "cis-v8-17.1", "cis-v8-6.3").
Only include controls that are RELEVANT to this type of policy. A password policy shouldn't list backup controls as missing.

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
        max_tokens: 4000,
        system: 'You are a compliance policy analyst. Always respond with valid JSON only. No markdown, no preamble, no explanation outside the JSON object.',
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
      controlDetails?: Array<{ controlId: string; status: string; reasoning: string; quote: string | null; section: string | null }>
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
      // Try to extract JSON from text — Claude sometimes adds preamble or markdown
      try {
        // Remove markdown code fences if present
        const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '')
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0])
        }
      } catch {
        // If still can't parse, store the raw text as the summary
        console.error('[compliance/policies] Failed to parse AI response as JSON:', text.substring(0, 500))
        parsed = { summary: text.substring(0, 2000) }
      }
    }

    // If controlDetails provided, derive satisfied/partial/missing from it
    if (parsed.controlDetails && parsed.controlDetails.length > 0 && !parsed.satisfiedControls) {
      parsed.satisfiedControls = parsed.controlDetails.filter((c) => c.status === 'satisfied').map((c) => c.controlId)
      parsed.partialControls = parsed.controlDetails.filter((c) => c.status === 'partial').map((c) => c.controlId)
      parsed.missingControls = parsed.controlDetails.filter((c) => c.status === 'missing').map((c) => c.controlId)
    }

    // Ensure controlDetails column exists (added after initial table creation)
    try {
      await client.query(`ALTER TABLE compliance_policy_analyses ADD COLUMN IF NOT EXISTS "controlDetails" JSONB DEFAULT '[]'`)
    } catch { /* column may already exist */ }

    await client.query(
      `UPDATE compliance_policy_analyses
       SET status = 'complete',
           "satisfiedControls" = $1::jsonb,
           "partialControls" = $2::jsonb,
           "missingControls" = $3::jsonb,
           gaps = $4::jsonb,
           recommendations = $5::jsonb,
           "analysisText" = $6,
           "controlDetails" = $7::jsonb,
           "analyzedAt" = NOW()
       WHERE id = $8`,
      [
        JSON.stringify(parsed.satisfiedControls ?? []),
        JSON.stringify(parsed.partialControls ?? []),
        JSON.stringify(parsed.missingControls ?? []),
        JSON.stringify(parsed.gaps ?? []),
        JSON.stringify(parsed.recommendations ?? []),
        parsed.summary ?? text,
        JSON.stringify(parsed.controlDetails ?? []),
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

// ---------------------------------------------------------------------------
// SharePoint Document Fetcher
// ---------------------------------------------------------------------------

/**
 * Fetch a document from SharePoint using the customer's M365 Graph credentials.
 * Extracts text content from the document (supports .docx, .txt, .pdf via Graph content API).
 */
async function fetchSharePointDocument(companyId: string, sharePointUrl: string): Promise<string> {
  const { getTenantCredentials } = await import('@/lib/graph')
  const creds = await getTenantCredentials(companyId)
  if (!creds) {
    throw new Error('M365 credentials not configured for this company. Set up M365 in the company onboarding wizard first.')
  }

  // Get token
  const tokenUrl = `https://login.microsoftonline.com/${creds.tenantId}/oauth2/v2.0/token`
  const tokenBody = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
  })

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody.toString(),
    signal: AbortSignal.timeout(15_000),
  })
  if (!tokenRes.ok) throw new Error(`Graph auth failed: ${tokenRes.status}`)
  const tokenData = (await tokenRes.json()) as { access_token: string }
  const token = tokenData.access_token

  // Parse the SharePoint URL to extract site and file path
  // Format: https://{tenant}.sharepoint.com/sites/{siteName}/Shared Documents/{path}
  const url = new URL(sharePointUrl)
  const pathParts = url.pathname.split('/')
  const sitesIdx = pathParts.indexOf('sites')

  if (sitesIdx === -1) {
    throw new Error('Invalid SharePoint URL — must contain /sites/{siteName}/...')
  }

  const siteName = pathParts[sitesIdx + 1]
  const hostname = url.hostname

  // Get the site ID
  const siteRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${hostname}:/sites/${siteName}`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }
  )
  if (!siteRes.ok) throw new Error(`SharePoint site not found: ${siteName} (${siteRes.status})`)
  const siteData = (await siteRes.json()) as { id: string }
  const siteId = siteData.id

  // Find the file — extract path after "Shared Documents" or "Documents"
  const docsIdx = pathParts.findIndex((p) =>
    p === 'Shared%20Documents' || p === 'Shared Documents' || p === 'Documents'
  )
  if (docsIdx === -1) {
    throw new Error('Could not determine document path. URL should contain /Shared Documents/ or /Documents/')
  }

  const filePath = pathParts.slice(docsIdx).map(decodeURIComponent).join('/')

  // Get file by path from default document library
  const driveRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${filePath}`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }
  )
  if (!driveRes.ok) throw new Error(`File not found in SharePoint: ${filePath} (${driveRes.status})`)
  const fileData = (await driveRes.json()) as { id: string; name: string; size: number; '@microsoft.graph.downloadUrl'?: string }

  // Download file content
  const downloadUrl = fileData['@microsoft.graph.downloadUrl']
  if (!downloadUrl) throw new Error('Could not get download URL for the document')

  const contentRes = await fetch(downloadUrl, { signal: AbortSignal.timeout(30_000) })
  if (!contentRes.ok) throw new Error(`Failed to download document: ${contentRes.status}`)

  const contentType = contentRes.headers.get('content-type') ?? ''
  const fileName = fileData.name.toLowerCase()

  // Extract text based on file type
  if (fileName.endsWith('.txt') || fileName.endsWith('.md') || contentType.includes('text/')) {
    return await contentRes.text()
  }

  // For .docx, .pdf — return raw text (Graph doesn't natively extract text)
  // We'll pass the content to Claude which can handle document analysis
  if (fileName.endsWith('.docx') || fileName.endsWith('.pdf')) {
    const buffer = await contentRes.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    return `[Document: ${fileData.name}, ${(fileData.size / 1024).toFixed(0)}KB, fetched from SharePoint]\n\n[BASE64_CONTENT:${base64.substring(0, 50000)}]`
  }

  // Fallback: try as text
  return await contentRes.text()
}
