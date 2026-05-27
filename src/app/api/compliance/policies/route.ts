/**
 * GET  /api/compliance/policies?companyId=xxx — List policies for a company
 * POST /api/compliance/policies — Create/upload a policy + trigger AI analysis
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import type { CompliancePolicy, PolicyAnalysis } from '@/lib/compliance/types'
import { applyPolicyPresenceHook } from '@/lib/compliance/policy-presence-hook'
import { loadLatestApprovalsForPolicies, type ApprovalSnapshot } from '@/lib/compliance/policy-approval-store'
import {
  fetchSharePointFileText,
  fetchSharePointFileTextByUrl,
} from '@/lib/compliance/policy-generation/sharepoint-fetch'
import { trackApiUsage } from '@/lib/api-usage-tracker'

// JSON-safe shape for an approval snapshot. Strips internal fields,
// keeps what the UI badge + publish modal need.
function toSerializable(s: ApprovalSnapshot) {
  return {
    id: s.id,
    decision: s.decision,
    decisionNotes: s.decisionNotes,
    decidedAt: s.decidedAt,
    recipientEmail: s.recipientEmail,
    requesterEmail: s.requesterEmail,
    expiresAt: s.expiresAt,
    createdAt: s.createdAt,
    freshForCurrentContent: s.freshForCurrentContent,
  }
}

export const dynamic = 'force-dynamic'
// 120s covers SharePoint download (≤30s for a large PDF) + pdf-parse
// extraction (≤30s for image-heavy PDFs) + the Anthropic analysis call
// (45s ceiling). A bulk import does one POST per file so the per-file
// budget is what matters, not the bulk total.
export const maxDuration = 120

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
    const policies = await client.query<CompliancePolicy & { hasSourcePointer: boolean; hasSourceBytes: boolean }>(
      `SELECT id, "companyId", title, source, content, category, tags, "frameworkIds", "controlIds",
              "createdBy", "createdAt", "updatedAt",
              ("sourcePointer" IS NOT NULL) AS "hasSourcePointer",
              ("sourceBytes"   IS NOT NULL) AS "hasSourceBytes"
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

    // Latest customer-portal approval per policy — drives the badge
    // in the operator UI and lets the publish modal auto-cite the
    // approval instead of asking the operator to vouch.
    const approvalMap = await loadLatestApprovalsForPolicies(client, companyId, policyIds)
    const approvals: Record<string, ReturnType<typeof toSerializable>> = {}
    approvalMap.forEach((snap, pid) => {
      approvals[pid] = toSerializable(snap)
    })

    return NextResponse.json({
      success: true,
      data: { policies: policies.rows, analyses, approvals },
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
      // Preferred SharePoint import shape: scan endpoint hands the
      // operator a driveId + itemId per file, so a single Graph call
      // fetches the bytes. Caller passes a placeholder for `content`.
      sharePointRef?: { driveId: string; itemId: string; fileName?: string }
    }

    if (!body.companyId || !body.title) {
      return NextResponse.json({ error: 'companyId and title are required' }, { status: 400 })
    }
    if (!body.content && !body.sharePointRef) {
      return NextResponse.json({ error: 'content or sharePointRef is required' }, { status: 400 })
    }

    let policyContent = body.content ?? ''
    // Preserve the ORIGINAL uploaded bytes when the import came from
    // SharePoint, so Download .docx can serve a byte-perfect copy of
    // the customer's source document (heading styles, lists, branding
    // — everything mammoth/pdf-parse discards). Only populated for
    // SharePoint imports; pasted/generated policies remain renderer-only.
    let sourceBytes: Buffer | null = null
    let sourceMimeType: string | null = null
    let sourceFileName: string | null = null
    // sourcePointer records HOW to find the file again in SharePoint
    // so a "Re-sync from SharePoint" action can re-pull the latest
    // bytes without asking the operator to delete + re-import.
    let sourcePointer: { driveId?: string; itemId?: string; webUrl?: string; fileName?: string; mimeType?: string } | null = null

    // Resolve a SharePoint import to actual document text before storing.
    // Three call shapes converge here:
    //   1. sharePointRef: { driveId, itemId } — preferred (one Graph call)
    //   2. content === '[SHAREPOINT:<webUrl>]' — legacy bulk-import marker
    //   3. plain text in content — pass through unchanged
    if (body.sharePointRef) {
      try {
        const fetched = await fetchSharePointFileText(body.companyId, body.sharePointRef)
        policyContent = fetched.text
        sourceBytes = fetched.bytes
        sourceMimeType = fetched.mimeType
        sourceFileName = fetched.fileName
        sourcePointer = {
          driveId: body.sharePointRef.driveId,
          itemId: body.sharePointRef.itemId,
          fileName: fetched.fileName,
          mimeType: fetched.mimeType,
        }
      } catch (err) {
        return NextResponse.json({
          error: `Failed to fetch SharePoint document: ${err instanceof Error ? err.message : String(err)}`,
        }, { status: 400 })
      }
    } else {
      const spMatch = policyContent.match(/^\[SHAREPOINT:(https?:\/\/.+)]$/)
      if (spMatch) {
        try {
          const fetched = await fetchSharePointFileTextByUrl(body.companyId, spMatch[1])
          policyContent = fetched.text
          sourceBytes = fetched.bytes
          sourceMimeType = fetched.mimeType
          sourceFileName = fetched.fileName
          // No driveId / itemId for URL-based imports; the re-sync
          // path will resolve the URL again at refetch time.
          sourcePointer = {
            webUrl: spMatch[1],
            fileName: fetched.fileName,
            mimeType: fetched.mimeType,
          }
        } catch (err) {
          return NextResponse.json({
            error: `Failed to fetch SharePoint document: ${err instanceof Error ? err.message : String(err)}`,
          }, { status: 400 })
        }
      }
    }

    await ensureComplianceTables()
    const pool = getPool()
    const client = await pool.connect()

    try {
      // Create policy. sourceBytes / sourceMimeType / sourceFileName +
      // sourcePointer are populated only for SharePoint-sourced imports.
      // Pasted / generated policies leave them NULL and fall back to
      // the docx renderer at download time.
      const policyRes = await client.query<{ id: string }>(
        `INSERT INTO compliance_policies (
            "companyId", title, source, content, category, tags,
            "frameworkIds", "controlIds", "createdBy",
            "sourceBytes", "sourceMimeType", "sourceFileName", "sourcePointer"
         )
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13::jsonb)
         RETURNING id`,
        [
          body.companyId, body.title, body.source ?? 'paste', policyContent,
          body.category ?? '', JSON.stringify(body.tags ?? []),
          JSON.stringify(body.frameworkIds ?? ['cis-v8']),
          JSON.stringify(body.controlIds ?? []),
          session.user.email,
          sourceBytes, sourceMimeType, sourceFileName,
          sourcePointer ? JSON.stringify(sourcePointer) : null,
        ]
      )
      const policyId = policyRes.rows[0].id

      // Trigger AI analysis if requested
      let analysis: PolicyAnalysis | null = null
      if (body.analyze !== false) {
        const analyzeFramework = body.frameworkIds?.[0] ?? 'cis-v8'
        analysis = await analyzePolicyWithAI(client, policyId, body.companyId, body.title, policyContent, session.user.email, analyzeFramework)
      }

      // Auto-update the customer profile's "Documented Policies" presence-keys
      // so the profile reflects what's been delivered. Failures here are
      // logged but never block the policy write — see policy-presence-hook.ts.
      const presenceResult = await applyPolicyPresenceHook(
        body.companyId,
        { title: body.title, category: body.category ?? '', source: body.source ?? 'paste' },
        session.user.email
      )

      return NextResponse.json({
        success: true,
        policyId,
        analysis,
        profileKeysSet: presenceResult.keysSet,
      })
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
        // Run the new analysis BEFORE deleting the old one. If the new
        // analysis fails (timeout, parse error), the operator gets to
        // keep their previous controlDetails / counts instead of being
        // left with an empty error card. Only swap on success.
        const analysis = await analyzePolicyWithAI(client, p.id, p.companyId, p.title, p.content, session.user.email, body.frameworkId ?? 'cis-v8')
        if (analysis && analysis.status === 'complete') {
          // New analysis succeeded — purge the older rows. Keep the
          // analysis we just inserted (its id is the latest).
          await client.query(
            `DELETE FROM compliance_policy_analyses WHERE "policyId" = $1 AND id <> $2`,
            [p.id, analysis.id]
          )
        }
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

/**
 * Build a short, human-readable summary from analysis counts when the
 * AI didn't return a `summary` field of its own. Surfaced verbatim in
 * the policy-card UI, so it must read as natural English — never a
 * stringified JSON blob, even when the analysis turned up nothing.
 */
function synthesizeAnalysisSummary(counts: {
  satisfied: number
  partial: number
  missing: number
  truncated: boolean
}): string {
  const { satisfied, partial, missing, truncated } = counts
  const total = satisfied + partial + missing
  if (total === 0) {
    return truncated
      ? 'Analysis response was cut off before any control mapping completed. Re-analyze to retry with the full document.'
      : 'No control mappings were produced for this policy. The AI did not find content that mapped to the selected framework — try re-analyzing or confirm the policy text was extracted correctly.'
  }
  const parts: string[] = []
  if (satisfied > 0) parts.push(`${satisfied} fully covered`)
  if (partial > 0)   parts.push(`${partial} partially addressed`)
  if (missing > 0)   parts.push(`${missing} relevant but not in this policy`)
  const tail = truncated
    ? ' Analysis response was truncated — re-analyze for full coverage.'
    : ''
  return `Mapped ${total} controls: ${parts.join(', ')}.${tail}`
}

async function analyzePolicyWithAI(
  client: import('pg').PoolClient,
  policyId: string,
  companyId: string,
  title: string,
  content: string,
  actor: string,
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
   - "reasoning": ONE concise sentence (<= 30 words) explaining WHY the control is satisfied/partial/missing. Don't quote the policy verbatim — just summarize.
2. "satisfiedControls" - array of control IDs fully satisfied
3. "partialControls" - array of control IDs partially addressed
4. "missingControls" - array of control IDs this policy SHOULD address but doesn't
5. "gaps" - array of strings describing specific gaps (3-6 short bullets max)
6. "recommendations" - array of specific actionable recommendations (3-6 short bullets max)
7. "summary" - a 2-3 sentence overall assessment in plain English
8. "orgProfileExtraction" - extract organizational data from the policy text. Only include fields where the policy explicitly mentions the information. Return an object with any of these keys:
   - "org_industry": one of "healthcare"|"manufacturing"|"finance"|"government"|"defense"|"education"|"legal"|"technology"|"retail"|"nonprofit"|"other"
   - "org_employee_count": one of "1-25"|"26-100"|"101-500"|"501-1000"|"1000+"
   - "org_handles_phi": boolean — true if policy mentions PHI, HIPAA, protected health information
   - "org_handles_pii": boolean — true if policy mentions PII, personally identifiable information, personal data
   - "org_handles_cui": boolean — true if policy mentions CUI, controlled unclassified information
   - "org_remote_work": one of "no"|"hybrid"|"full_remote" — based on remote work mentions
   - "org_byod_allowed": one of "no"|"yes_managed"|"yes_unmanaged" — based on BYOD/personal device mentions
   - "org_contractors": boolean — true if policy mentions contractors, temporary workers, third-party staff
   - "org_policy_review_cycle": one of "annual"|"semi-annual"|"quarterly" — if review cadence is mentioned
   - "org_training_cadence": one of "monthly"|"quarterly"|"annual"|"onboarding_only"|"never" — if training frequency is mentioned
   - "org_disciplinary_process": one of "progressive"|"hr_referral"|"not_defined" — if violation handling is described
   - "org_exception_process": boolean — true if a formal exception/waiver process is mentioned
   - "org_vendor_review_process": boolean — true if vendor security reviews are mentioned
   - "org_data_retention_years": one of "1"|"3"|"5"|"7"|"10"|"varies" — if retention period is mentioned
   - "org_legal_name": string — the company/organization name if explicitly stated
   - "org_security_officer": string — name/role of security officer or CISO if mentioned
   - "org_ai_tools_used": one of "yes_approved"|"yes_uncontrolled"|"no"|"evaluating" — if AI tool usage is mentioned
   Only include keys where the policy text provides clear evidence. Do NOT guess.

${fw.name} Controls to evaluate against:
${fw.controls}

Use control IDs in format "${fw.idFormat}" with prefix "${fw.prefix}-".
Only include controls that are RELEVANT to this type of policy. A password policy shouldn't list backup controls as missing.

Respond with ONLY valid JSON, no markdown.`

    const anthropicStart = Date.now()
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        // 6000 tokens after dropping per-control quote+section comfortably
        // fits a full CIS v8 analysis (~50 sub-controls × controlId + status
        // + 30-word reasoning ≈ 4500 tokens) plus summary + gaps +
        // recommendations + orgProfileExtraction.
        max_tokens: 6000,
        system: 'You are a compliance policy analyst. Always respond with valid JSON only. No markdown, no preamble, no explanation outside the JSON object.',
        messages: [{ role: 'user', content: prompt }],
      }),
      // 100s gives ~60s of headroom over our previous 45s ceiling
      // (Sonnet 4.6 generating 5-6k JSON tokens averages 25-50s) while
      // staying well under the 120s Vercel function maxDuration so the
      // catch block still has time to write a clean failure row.
      signal: AbortSignal.timeout(100_000),
    })

    if (!res.ok) {
      await trackApiUsage({
        provider: 'anthropic',
        feature: 'compliance_policy_analysis',
        model: 'claude-sonnet-4-6',
        durationMs: Date.now() - anthropicStart,
        statusCode: res.status,
        error: `Anthropic API error: ${res.status}`,
      })
      throw new Error(`Anthropic API error: ${res.status}`)
    }

    const data = (await res.json()) as {
      content: Array<{ type: string; text: string }>
      stop_reason?: string
      usage?: {
        input_tokens?: number
        output_tokens?: number
        cache_creation_input_tokens?: number
        cache_read_input_tokens?: number
      }
    }
    await trackApiUsage({
      provider: 'anthropic',
      feature: 'compliance_policy_analysis',
      model: 'claude-sonnet-4-6',
      inputTokens:
        (data.usage?.input_tokens ?? 0) +
        (data.usage?.cache_creation_input_tokens ?? 0) +
        (data.usage?.cache_read_input_tokens ?? 0),
      outputTokens: data.usage?.output_tokens ?? 0,
      durationMs: Date.now() - anthropicStart,
      statusCode: 200,
      metadata: { stop_reason: data.stop_reason },
    })
    const text = data.content?.[0]?.text ?? ''
    const truncated = data.stop_reason === 'max_tokens'

    // Parse JSON from response
    let parsed: {
      // quote + section dropped from the prompt to halve output size;
      // accept them as optional in case an older cached response is replayed.
      controlDetails?: Array<{ controlId: string; status: string; reasoning: string; quote?: string | null; section?: string | null }>
      satisfiedControls?: string[]
      partialControls?: string[]
      missingControls?: string[]
      gaps?: string[]
      recommendations?: string[]
      summary?: string
      orgProfileExtraction?: Record<string, string | boolean>
    } = {}

    try {
      parsed = JSON.parse(text)
    } catch {
      // Try to extract JSON from text — Claude sometimes adds preamble or markdown
      try {
        const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '')
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0])
        }
      } catch {
        console.error('[compliance/policies] Failed to parse AI response as JSON:', text.substring(0, 500))
        // Never store raw text as the summary — the UI renders summary
        // verbatim and a JSON blob is unreadable. Synthesize a
        // human-readable failure note instead so the operator can
        // see something went wrong and re-analyze.
        parsed = {
          summary: truncated
            ? 'Analysis response was cut off before completion (hit the max-token budget). Re-analyze to retry with the full document.'
            : 'Analysis response could not be parsed as JSON. Re-analyze to retry.',
        }
      }
    }

    // Derive satisfied/partial/missing buckets from controlDetails when
    // the AI omitted them OR returned empty arrays. The old guard
    // (`!parsed.satisfiedControls`) failed when the AI returned
    // `satisfiedControls: []` because empty arrays are truthy, so the
    // UI counts stayed at 0 even though controlDetails was populated.
    if (parsed.controlDetails && parsed.controlDetails.length > 0) {
      const derived = {
        satisfied: parsed.controlDetails.filter((c) => c.status === 'satisfied').map((c) => c.controlId),
        partial: parsed.controlDetails.filter((c) => c.status === 'partial').map((c) => c.controlId),
        missing: parsed.controlDetails.filter((c) => c.status === 'missing').map((c) => c.controlId),
      }
      if (!parsed.satisfiedControls || parsed.satisfiedControls.length === 0) parsed.satisfiedControls = derived.satisfied
      if (!parsed.partialControls   || parsed.partialControls.length === 0)   parsed.partialControls = derived.partial
      if (!parsed.missingControls   || parsed.missingControls.length === 0)   parsed.missingControls = derived.missing
    }

    // Synthesize a readable summary when the AI didn't provide one.
    // Previously fell back to `text` (the raw JSON response), which
    // the policy-card UI then rendered verbatim. Result: operator sees
    // an unreadable JSON blob where a sentence should be.
    const finalSummary = parsed.summary && parsed.summary.trim().length > 0
      ? parsed.summary
      : synthesizeAnalysisSummary({
          satisfied: parsed.satisfiedControls?.length ?? 0,
          partial: parsed.partialControls?.length ?? 0,
          missing: parsed.missingControls?.length ?? 0,
          truncated,
        })

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
        finalSummary,
        JSON.stringify(parsed.controlDetails ?? []),
        frameworkId,
        analysisId,
      ]
    )

    // Auto-fill org profile from extracted data (only fill empty fields)
    if (parsed.orgProfileExtraction && Object.keys(parsed.orgProfileExtraction).length > 0) {
      try {
        await mergeExtractedOrgProfile(client, companyId, parsed.orgProfileExtraction, actor)
      } catch (mergeErr) {
        console.warn('[compliance/policies] Failed to merge extracted org profile:', mergeErr instanceof Error ? mergeErr.message : mergeErr)
      }
    }

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
// Org Profile Auto-Fill from Policy Analysis
// ---------------------------------------------------------------------------

/**
 * Merge AI-extracted org profile data into the existing org profile.
 * Only fills fields that are currently empty — never overwrites user-provided answers.
 * Tracks which fields were auto-extracted via a metadata key.
 */
async function mergeExtractedOrgProfile(
  client: import('pg').PoolClient,
  companyId: string,
  extracted: Record<string, string | boolean>,
  actor: string
): Promise<void> {
  // Valid org profile field IDs that we accept from extraction
  const VALID_FIELDS = new Set([
    'org_industry', 'org_employee_count', 'org_handles_phi', 'org_handles_pii',
    'org_handles_cui', 'org_remote_work', 'org_byod_allowed', 'org_contractors',
    'org_policy_review_cycle', 'org_training_cadence', 'org_disciplinary_process',
    'org_exception_process', 'org_vendor_review_process', 'org_data_retention_years',
    'org_legal_name', 'org_security_officer', 'org_ai_tools_used',
  ])

  // Filter to only valid fields
  const validExtracted: Record<string, string | boolean> = {}
  for (const [key, value] of Object.entries(extracted)) {
    if (VALID_FIELDS.has(key) && value !== null && value !== undefined && value !== '') {
      validExtracted[key] = value
    }
  }

  if (Object.keys(validExtracted).length === 0) return

  // Load existing org profile
  let existingAnswers: Record<string, string | string[] | boolean> = {}
  try {
    const orgRes = await client.query<{ answers: Record<string, string | string[] | boolean> }>(
      `SELECT answers FROM policy_org_profiles WHERE "companyId" = $1`,
      [companyId]
    )
    existingAnswers = orgRes.rows[0]?.answers ?? {}
  } catch {
    // Table may not exist — will be created by upsert
  }

  // Merge: only fill empty fields, track which were auto-filled
  const autoFilledFields: string[] = existingAnswers._autoFilledFields
    ? [...(existingAnswers._autoFilledFields as string[])]
    : []

  let fieldsAdded = 0
  for (const [key, value] of Object.entries(validExtracted)) {
    const existing = existingAnswers[key]
    const isEmpty = existing === undefined || existing === null || existing === ''
      || (Array.isArray(existing) && existing.length === 0)

    if (isEmpty) {
      existingAnswers[key] = value
      if (!autoFilledFields.includes(key)) {
        autoFilledFields.push(key)
      }
      fieldsAdded++
    }
  }

  if (fieldsAdded === 0) return

  // Store the tracking metadata
  existingAnswers._autoFilledFields = autoFilledFields

  // Upsert org profile
  try {
    await client.query(
      `INSERT INTO policy_org_profiles ("companyId", answers, "updatedAt", "updatedBy")
       VALUES ($1, $2::jsonb, NOW(), $3)
       ON CONFLICT ("companyId")
       DO UPDATE SET answers = $2::jsonb, "updatedAt" = NOW(), "updatedBy" = $3`,
      [companyId, JSON.stringify(existingAnswers), actor]
    )
  } catch {
    // Ensure table exists and retry
    await client.query(
      `CREATE TABLE IF NOT EXISTS policy_org_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "companyId" TEXT NOT NULL UNIQUE,
        answers JSONB NOT NULL DEFAULT '{}',
        "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedBy" TEXT
      )`
    )
    await client.query(
      `INSERT INTO policy_org_profiles ("companyId", answers, "updatedAt", "updatedBy")
       VALUES ($1, $2::jsonb, NOW(), $3)
       ON CONFLICT ("companyId")
       DO UPDATE SET answers = $2::jsonb, "updatedAt" = NOW(), "updatedBy" = $3`,
      [companyId, JSON.stringify(existingAnswers), actor]
    )
  }
}

// SharePoint document fetch + text extraction lives in
// src/lib/compliance/policy-generation/sharepoint-fetch.ts — imported above.
