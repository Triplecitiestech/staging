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
        const analyzeFramework = body.frameworkIds?.[0] ?? 'cis-v8'
        analysis = await analyzePolicyWithAI(client, policyId, body.companyId, body.title, policyContent, session.user.email, analyzeFramework)
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
    const body = (await request.json()) as { policyId?: string; companyId?: string; reanalyzeAll?: boolean; frameworkId?: string }

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
        const analysis = await analyzePolicyWithAI(client, p.id, p.companyId, p.title, p.content, session.user.email, body.frameworkId ?? 'cis-v8')
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

// ---------------------------------------------------------------------------
// Framework-specific control lists for multi-framework policy analysis
// ---------------------------------------------------------------------------

interface FrameworkControlSet {
  name: string
  prefix: string
  controls: string
  idFormat: string
}

const FRAMEWORK_CONTROLS: Record<string, FrameworkControlSet> = {
  'cis-v8': {
    name: 'CIS Controls v8',
    prefix: 'cis-v8',
    idFormat: 'cis-v8-X.Y',
    controls: `1.1 Asset Inventory, 1.2 Address Unauthorized Assets, 1.3 Active Discovery Tool, 1.4 DHCP Logging, 1.5 Passive Discovery,
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
17.1 Incident Handling Personnel, 17.2 Incident Reporting Process, 17.3 Incident Response Plan`,
  },
  'cmmc-l2': {
    name: 'CMMC Level 2',
    prefix: 'cmmc',
    idFormat: 'cmmc-AC.L2-3.1.1',
    controls: `AC.L2-3.1.1 Authorized Access Control, AC.L2-3.1.2 Transaction & Function Control, AC.L2-3.1.3 CUI Flow Enforcement,
AC.L2-3.1.5 Least Privilege, AC.L2-3.1.6 Non-Privileged Account Use, AC.L2-3.1.7 Privileged Functions,
AC.L2-3.1.8 Unsuccessful Logon Attempts, AC.L2-3.1.12 Remote Access Control, AC.L2-3.1.13 Remote Access Encryption,
AC.L2-3.1.14 Remote Access Routing, AC.L2-3.1.15 Privileged Remote Access, AC.L2-3.1.20 External Connections,
AT.L2-3.2.1 Role-Based Awareness, AT.L2-3.2.2 Advanced Training,
AU.L2-3.3.1 System Auditing, AU.L2-3.3.2 User Accountability, AU.L2-3.3.4 Audit Failure Alerting,
AU.L2-3.3.5 Audit Correlation, AU.L2-3.3.6 Audit Reduction, AU.L2-3.3.8 Audit Protection, AU.L2-3.3.9 Audit Management,
CM.L2-3.4.1 System Baseline, CM.L2-3.4.2 Security Configuration Enforcement, CM.L2-3.4.3 System Change Tracking,
CM.L2-3.4.5 Access Restrictions for Change, CM.L2-3.4.6 Least Functionality, CM.L2-3.4.7 Nonessential Functionality,
CM.L2-3.4.8 Application Execution Policy, CM.L2-3.4.9 User-Installed Software,
IA.L2-3.5.1 Identification, IA.L2-3.5.2 Authentication, IA.L2-3.5.3 MFA,
IA.L2-3.5.7 Password Complexity, IA.L2-3.5.8 Password Reuse, IA.L2-3.5.10 Cryptographic Authentication,
IR.L2-3.6.1 Incident Handling, IR.L2-3.6.2 Incident Reporting, IR.L2-3.6.3 Incident Response Testing,
MA.L2-3.7.1 Maintenance, MA.L2-3.7.2 System Maintenance Control, MA.L2-3.7.5 Nonlocal Maintenance,
MP.L2-3.8.1 Media Protection, MP.L2-3.8.3 Media Disposal, MP.L2-3.8.5 Removable Media Access,
PE.L2-3.10.1 Physical Access Limit, PE.L2-3.10.3 Escort Visitors, PE.L2-3.10.4 Physical Access Logs, PE.L2-3.10.5 Physical Access Control,
RA.L2-3.11.1 Risk Assessments, RA.L2-3.11.2 Vulnerability Scan, RA.L2-3.11.3 Vulnerability Remediation,
CA.L2-3.12.1 Security Assessments, CA.L2-3.12.4 System Security Plan,
SC.L2-3.13.1 Boundary Protection, SC.L2-3.13.2 Architectural Designs, SC.L2-3.13.5 Public Access System Separation,
SC.L2-3.13.8 CUI in Transit Encryption, SC.L2-3.13.11 CUI Encryption, SC.L2-3.13.16 CUI at Rest,
SI.L2-3.14.1 Flaw Remediation, SI.L2-3.14.2 Malicious Code Protection, SI.L2-3.14.3 Security Alerts,
SI.L2-3.14.6 Monitor Communications, SI.L2-3.14.7 Identify Unauthorized Use`,
  },
  'hipaa': {
    name: 'HIPAA Security Rule',
    prefix: 'hipaa',
    idFormat: 'hipaa-164.312(a)(1)',
    controls: `164.308(a)(1) Security Management Process, 164.308(a)(2) Assigned Security Responsibility,
164.308(a)(3) Workforce Security, 164.308(a)(4) Information Access Management,
164.308(a)(5) Security Awareness and Training, 164.308(a)(6) Security Incident Procedures,
164.308(a)(7) Contingency Plan, 164.308(a)(8) Evaluation,
164.310(a)(1) Facility Access Controls, 164.310(a)(2) Workstation Use,
164.310(b) Workstation Security, 164.310(c) Device and Media Controls, 164.310(d)(1) Device and Media Controls Implementation,
164.312(a)(1) Access Control, 164.312(a)(2) Audit Controls, 164.312(b) Audit Controls Implementation,
164.312(c)(1) Integrity Controls, 164.312(d) Person or Entity Authentication,
164.312(e)(1) Transmission Security, 164.312(e)(2) Encryption,
164.314(a)(1) Business Associate Contracts, 164.316(a) Policies and Procedures,
164.316(b)(1) Documentation Requirements`,
  },
  'nist-800-171': {
    name: 'NIST SP 800-171 Rev 2',
    prefix: 'nist171',
    idFormat: 'nist171-3.1.1',
    controls: `3.1.1 Limit System Access, 3.1.2 Limit System Access to Functions, 3.1.3 Control CUI Flow,
3.1.5 Least Privilege, 3.1.6 Non-Privileged Accounts, 3.1.7 Prevent Non-Privileged Users,
3.1.8 Limit Unsuccessful Logon, 3.1.12 Monitor Remote Access, 3.1.13 Cryptographic Mechanisms for Remote Access,
3.1.20 Verify External Connections,
3.2.1 Security Awareness, 3.2.2 Training for Roles, 3.2.3 Insider Threat Awareness,
3.3.1 Create System Audit Records, 3.3.2 Trace Actions to Users, 3.3.5 Correlate Audit Processes,
3.3.8 Protect Audit Information, 3.3.9 Limit Audit Management,
3.4.1 Establish System Baselines, 3.4.2 Enforce Security Configurations, 3.4.3 Track Changes,
3.4.5 Access Restrictions, 3.4.6 Least Functionality, 3.4.8 Application Allowlisting,
3.5.1 Identify System Users, 3.5.2 Authenticate Users, 3.5.3 Multifactor Authentication,
3.5.7 Minimum Password Complexity, 3.5.8 Password Reuse Prohibition,
3.6.1 Establish Incident Response, 3.6.2 Track and Report Incidents, 3.6.3 Test Response Capability,
3.7.1 Perform System Maintenance, 3.7.2 Control System Maintenance Tools,
3.8.1 Protect System Media, 3.8.3 Sanitize Media, 3.8.9 Protect CUI Backups,
3.10.1 Limit Physical Access, 3.10.3 Escort Visitors, 3.10.4 Maintain Physical Access Audit Logs,
3.11.1 Periodically Assess Risk, 3.11.2 Scan for Vulnerabilities, 3.11.3 Remediate Vulnerabilities,
3.12.1 Periodically Assess Security Controls, 3.12.4 Develop System Security Plan,
3.13.1 Monitor at External Boundaries, 3.13.2 Employ Architectural Designs,
3.13.8 Implement Cryptographic Mechanisms, 3.13.11 Employ FIPS-Validated Cryptography,
3.14.1 Identify and Correct Flaws, 3.14.2 Provide Malicious Code Protection, 3.14.3 Monitor Security Alerts,
3.14.6 Monitor Organizational Systems, 3.14.7 Identify Unauthorized Use`,
  },
}

async function analyzePolicyWithAI(
  client: import('pg').PoolClient,
  policyId: string,
  companyId: string,
  title: string,
  content: string,
  _actor: string,
  frameworkId: string = 'cis-v8'
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

    const fw = FRAMEWORK_CONTROLS[frameworkId] ?? FRAMEWORK_CONTROLS['cis-v8']

    const prompt = `You are a compliance policy analyst for an MSP (Managed Service Provider). Analyze the following customer policy document against ${fw.name} requirements.

Policy Title: ${title}

Policy Content:
${content.substring(0, 12000)}

Analyze this policy and provide a JSON response with:
1. "controlDetails" - array of objects for EACH relevant control with:
   - "controlId": control ID (e.g. "${fw.idFormat}")
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

${fw.name} Controls to evaluate against:
${fw.controls}

Use control IDs in format "${fw.idFormat}" with prefix "${fw.prefix}-".
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

    // Ensure frameworkId column exists
    try {
      await client.query(`ALTER TABLE compliance_policy_analyses ADD COLUMN IF NOT EXISTS "frameworkId" TEXT DEFAULT 'cis-v8'`)
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
           "frameworkId" = $8,
           "analyzedAt" = NOW()
       WHERE id = $9`,
      [
        JSON.stringify(parsed.satisfiedControls ?? []),
        JSON.stringify(parsed.partialControls ?? []),
        JSON.stringify(parsed.missingControls ?? []),
        JSON.stringify(parsed.gaps ?? []),
        JSON.stringify(parsed.recommendations ?? []),
        parsed.summary ?? text,
        JSON.stringify(parsed.controlDetails ?? []),
        frameworkId,
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
