/**
 * /admin/compliance — Customer picker.
 *
 * Thin landing page. Lists every customer with their workflow
 * progress, M365 connection status, and a quick "open workflow"
 * link. There's no more dashboard surface here — all per-customer
 * work happens inside the guided workflow at
 * /admin/compliance/[companyId]/*.
 *
 * Operator feedback that drove this collapse: "I thought everything
 * was moved to guided workflow already" + "this seems redundant."
 * Legacy tabs (Assessments / Policy Analysis / Policy Generation /
 * Platform Mapping) are now part of the workflow:
 *
 *   - Assessments → step 5 (Run Assessment) + step 6 (Findings)
 *   - Policy Analysis → step 4 (Policies) — embeds PolicyManager
 *   - Policy Generation → step 6 (Findings) — per-control Remediate
 *     button now generates the matching policy on demand
 *   - Platform Mapping → step 3 (Connect Tools) — embeds
 *     PlatformMappingPanel inline
 */

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminHeader from '@/components/admin/AdminHeader'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'

export const dynamic = 'force-dynamic'

interface CustomerRow {
  id: string
  displayName: string
  slug: string
  m365SetupStatus: string | null
  m365ConsentGrantedAt: Date | null
  /** Steps with status='done' for this customer. */
  completedSteps: number
  /** Most recent assessment completion (any framework). null if never run. */
  latestAssessmentAt: string | null
}

export default async function ComplianceCustomerPickerPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  const customers = await loadCustomers()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-white">Compliance</h1>
          <p className="text-slate-400 mt-1 max-w-2xl">
            Pick a customer to open their guided workflow. Each customer
            has eight steps from onboarding through reassessment; pick up
            wherever they left off.
          </p>
        </div>

        {customers.length === 0 ? (
          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-8 text-center">
            <p className="text-sm text-slate-400">No customers found.</p>
          </section>
        ) : (
          <section className="bg-slate-900/50 border border-white/10 rounded-xl overflow-hidden">
            <header className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                Customers ({customers.length})
              </h2>
              <span className="text-[11px] text-slate-500">
                Workflow progress shown out of 8 steps
              </span>
            </header>
            <ul className="divide-y divide-white/5">
              {customers.map((c) => {
                const pct = Math.round((c.completedSteps / 8) * 100)
                return (
                  <li key={c.id}>
                    <Link
                      href={`/admin/compliance/${c.id}`}
                      className="block px-5 py-4 hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white truncate">
                            {c.displayName}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {c.completedSteps}/8 steps complete
                            {c.latestAssessmentAt && (
                              <> · last assessed {new Date(c.latestAssessmentAt).toLocaleDateString()}</>
                            )}
                            {!c.latestAssessmentAt && <> · never assessed</>}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <M365Badge
                            status={c.m365SetupStatus}
                            consentGrantedAt={c.m365ConsentGrantedAt}
                          />
                          <div className="hidden sm:flex items-center gap-2 w-32">
                            <div className="flex-1 h-1.5 bg-slate-800/60 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500"
                                style={{ width: `${pct}%` }}
                                aria-label={`${pct}% complete`}
                              />
                            </div>
                            <span className="text-[11px] text-slate-400 font-mono w-8 text-right">
                              {pct}%
                            </span>
                          </div>
                          <span className="text-slate-500 text-sm">→</span>
                        </div>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}

function M365Badge({ status, consentGrantedAt }: {
  status: string | null
  consentGrantedAt: Date | null
}) {
  const verified = status === 'verified' || consentGrantedAt !== null
  const configured = status === 'configured'
  if (verified) {
    return (
      <span className="hidden md:inline-flex text-[10px] uppercase tracking-wider px-2 py-1 rounded border bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
        M365 verified
      </span>
    )
  }
  if (configured) {
    return (
      <span className="hidden md:inline-flex text-[10px] uppercase tracking-wider px-2 py-1 rounded border bg-cyan-500/10 text-cyan-300 border-cyan-500/30">
        M365 configured
      </span>
    )
  }
  return (
    <span className="hidden md:inline-flex text-[10px] uppercase tracking-wider px-2 py-1 rounded border bg-slate-700/40 text-slate-400 border-white/10">
      M365 not set up
    </span>
  )
}

/**
 * Pull the customer list with workflow-step counts in one query.
 * The step-completion calculation here is a lightweight approximation
 * of getWorkflowState() — full per-step gating is expensive across N
 * customers, but the operator just wants a "how far along is this
 * customer" signal. The detailed status lives one click away in
 * /admin/compliance/[companyId].
 */
async function loadCustomers(): Promise<CustomerRow[]> {
  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<{
      id: string
      displayName: string
      slug: string
      m365SetupStatus: string | null
      m365ConsentGrantedAt: Date | null
      onboardDone: boolean
      profileAnswerCount: number
      requiredProfileAnswerCount: number
      verifiedConnectorCount: number
      toolRowCount: number
      policyCount: number
      policyWithFrameworkCount: number
      assessmentCount: number
      openFindingCount: number
      latestAssessmentAt: string | null
    }>(
      `SELECT
         c.id,
         c."displayName",
         c.slug,
         c.m365_setup_status AS "m365SetupStatus",
         c.m365_consent_granted_at AS "m365ConsentGrantedAt",
         (c."autotaskCompanyId" IS NOT NULL
          AND (c.m365_consent_granted_at IS NOT NULL OR c.m365_setup_status = 'verified')
         ) AS "onboardDone",
         COALESCE((
           SELECT COUNT(*)::int FROM jsonb_each(fr.answers)
            WHERE jsonb_each.value IS NOT NULL
              AND jsonb_each.value <> 'null'::jsonb
              AND jsonb_each.value <> '""'::jsonb
              AND jsonb_each.value <> '[]'::jsonb
         ), 0) AS "profileAnswerCount",
         0 AS "requiredProfileAnswerCount",
         (SELECT COUNT(*)::int FROM compliance_connectors
            WHERE "companyId" = c.id AND status = 'verified') AS "verifiedConnectorCount",
         (SELECT COUNT(*)::int FROM compliance_company_tools
            WHERE "companyId" = c.id) AS "toolRowCount",
         (SELECT COUNT(*)::int FROM compliance_policies
            WHERE "companyId" = c.id) AS "policyCount",
         (SELECT COUNT(*)::int FROM compliance_policies
            WHERE "companyId" = c.id
              AND jsonb_array_length(COALESCE("frameworkIds", '[]'::jsonb)) > 0
         ) AS "policyWithFrameworkCount",
         (SELECT COUNT(*)::int FROM compliance_assessments
            WHERE "companyId" = c.id AND status = 'complete') AS "assessmentCount",
         (SELECT COUNT(*)::int FROM compliance_findings f
            JOIN compliance_assessments a ON a.id = f."assessmentId"
            WHERE a."companyId" = c.id AND f.status IN ('fail','needs_review')) AS "openFindingCount",
         (SELECT COALESCE("completedAt", "createdAt")::text FROM compliance_assessments
            WHERE "companyId" = c.id AND status = 'complete'
            ORDER BY COALESCE("completedAt", "createdAt") DESC LIMIT 1) AS "latestAssessmentAt"
       FROM companies c
       LEFT JOIN form_responses fr
         ON fr.company_id = c.id AND fr.schema_type = 'customer_profile'
       WHERE COALESCE(c."isTestTenant", false) = COALESCE(c."isTestTenant", false)
       ORDER BY c."displayName" ASC`
    )

    // Approximate step-completion count without invoking the full
    // workflow-state engine per row.
    return res.rows.map((r) => {
      let completedSteps = 0
      if (r.onboardDone) completedSteps++                       // 1 Onboard
      if (r.profileAnswerCount > 0) completedSteps++            // 2 Profile (any answers)
      if (r.verifiedConnectorCount >= 1 && r.toolRowCount >= 1) completedSteps++ // 3 Connect
      if (r.policyCount > 0 && r.policyWithFrameworkCount > 0) completedSteps++  // 4 Policies
      if (r.assessmentCount >= 1) completedSteps++              // 5 Run Assessment
      if (r.assessmentCount >= 1 && r.openFindingCount === 0) completedSteps++   // 6 Findings cleared
      // 7 Changes + 8 Reassess intentionally not counted in this rough view.
      return {
        id: r.id,
        displayName: r.displayName,
        slug: r.slug,
        m365SetupStatus: r.m365SetupStatus,
        m365ConsentGrantedAt: r.m365ConsentGrantedAt,
        completedSteps,
        latestAssessmentAt: r.latestAssessmentAt,
      }
    })
  } catch (err) {
    console.error('[compliance/picker] loadCustomers failed', err)
    return []
  } finally {
    client.release()
  }
}
