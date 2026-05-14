/**
 * /admin/compliance/[companyId]/findings — per-finding view + disposition controls
 *
 * Lists the findings of the latest complete assessment per framework
 * (defaulting to a single framework via ?frameworkId; the page also surfaces
 * a framework picker). Each row shows the underlying finding (status,
 * confidence, reasoning excerpt) alongside its durable disposition (lifecycle
 * status, assignee, due date, accepted-risk rationale).
 *
 * Server component for the list; a client component handles inline
 * disposition editing (POSTs to /api/compliance/[companyId]/dispositions).
 *
 * Closes P3/F3 (disposition controls in Findings UI) and feeds C16
 * stale-disposition surfacing.
 */

import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import AdminHeader from '@/components/admin/AdminHeader'
import { prisma } from '@/lib/prisma'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import FindingDispositionRow from '@/components/compliance/FindingDispositionRow'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ companyId: string }>
  searchParams: Promise<{ frameworkId?: string; status?: string }>
}

export default async function FindingsPage({ params, searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')

  const { companyId } = await params
  const { frameworkId: frameworkIdParam, status: statusFilter } = await searchParams

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, displayName: true },
  })
  if (!company) notFound()

  await ensureComplianceTables()

  // Discover which frameworks have a complete assessment.
  const frameworks = await listAssessedFrameworks(companyId)
  // Default to the first available framework if none specified.
  const frameworkId = frameworkIdParam ?? frameworks[0]?.frameworkId ?? null

  // Findings + dispositions, joined.
  const rows = frameworkId
    ? await loadFindings(companyId, frameworkId, statusFilter ?? null)
    : []

  const passCount = rows.filter((r) => effectiveStatus(r) === 'pass').length
  const failCount = rows.filter((r) => effectiveStatus(r) === 'fail').length
  const reviewCount = rows.filter((r) =>
    ['needs_review', 'partial'].includes(effectiveStatus(r))
  ).length

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-xs text-cyan-400 uppercase tracking-wider">
              <Link href="/admin/compliance" className="hover:text-cyan-300">Compliance</Link>
              <span aria-hidden>›</span>
              <Link href={`/admin/compliance/${companyId}`} className="hover:text-cyan-300">
                {company.displayName}
              </Link>
              <span aria-hidden>›</span>
              <span className="text-slate-500">Findings</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mt-1">Findings</h1>
            <p className="text-sm text-slate-400 mt-1">
              {frameworkId
                ? `${frameworkLabel(frameworkId)} — latest complete assessment`
                : 'No completed assessments yet'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {frameworks.map((f) => (
              <Link
                key={f.frameworkId}
                href={`/admin/compliance/${companyId}/findings?frameworkId=${encodeURIComponent(f.frameworkId)}`}
                className={`px-3 py-2 text-xs font-medium rounded-lg border ${
                  f.frameworkId === frameworkId
                    ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200'
                    : 'bg-slate-800/40 border-white/10 text-slate-300 hover:bg-slate-700/50'
                }`}
              >
                {frameworkLabel(f.frameworkId)}
              </Link>
            ))}
          </div>
        </div>

        {/* Counters */}
        {rows.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <Counter label="Total" value={rows.length} tone="slate" />
            <Counter label="Pass" value={passCount} tone="emerald" />
            <Counter label="Fail" value={failCount} tone="rose" />
            <Counter label="Review" value={reviewCount} tone="cyan" />
            <Counter label="Accepted risk" value={rows.filter((r) => r.lifecycleStatus === 'accepted_risk').length} tone="violet" />
            <Counter label="Scheduled" value={rows.filter((r) => r.lifecycleStatus === 'scheduled').length} tone="cyan" />
          </div>
        )}

        {/* Status filter pills */}
        {frameworkId && rows.length > 0 && (
          <nav className="flex flex-wrap gap-2 text-xs">
            <FilterLink companyId={companyId} frameworkId={frameworkId} status={null} active={!statusFilter} label="All" />
            <FilterLink companyId={companyId} frameworkId={frameworkId} status="fail" active={statusFilter === 'fail'} label="Failing" />
            <FilterLink companyId={companyId} frameworkId={frameworkId} status="needs_review" active={statusFilter === 'needs_review'} label="Needs review" />
            <FilterLink companyId={companyId} frameworkId={frameworkId} status="pass" active={statusFilter === 'pass'} label="Passing" />
          </nav>
        )}

        {/* Findings list */}
        {!frameworkId ? (
          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-8 text-center">
            <p className="text-sm text-slate-400">
              No completed assessments yet.{' '}
              <Link href="/admin/compliance/workflow" className="text-cyan-400 hover:text-cyan-300 underline">
                Run one from the Guided Workflow
              </Link>{' '}
              to populate this page.
            </p>
          </section>
        ) : rows.length === 0 ? (
          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-8 text-center">
            <p className="text-sm text-slate-400">No findings match the current filter.</p>
          </section>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <FindingDispositionRow
                key={r.controlId}
                companyId={companyId}
                frameworkId={frameworkId}
                controlId={r.controlId}
                title={r.controlTitle ?? r.controlId}
                findingStatus={r.findingStatus}
                effectiveStatus={effectiveStatus(r)}
                confidence={r.confidence}
                reasoning={r.reasoning}
                remediation={r.remediation}
                disposition={{
                  lifecycleStatus: r.lifecycleStatus,
                  assignedTo: r.assignedTo,
                  dueDate: r.dueDate,
                  acceptedRiskRationale: r.acceptedRiskRationale,
                  customerImpactSummary: r.customerImpactSummary,
                  internalNotes: r.internalNotes,
                }}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function Counter({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'emerald' | 'rose' | 'cyan' | 'violet' }) {
  const cls =
    tone === 'emerald' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
    tone === 'rose' ? 'bg-rose-500/10 text-rose-300 border-rose-500/20' :
    tone === 'cyan' ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20' :
    tone === 'violet' ? 'bg-violet-500/10 text-violet-300 border-violet-500/20' :
    'bg-slate-800/40 text-slate-300 border-white/10'
  return (
    <div className={`rounded-lg border p-2 text-center ${cls}`}>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider truncate">{label}</p>
    </div>
  )
}

function FilterLink({ companyId, frameworkId, status, active, label }: {
  companyId: string
  frameworkId: string
  status: string | null
  active: boolean
  label: string
}) {
  const params = new URLSearchParams({ frameworkId })
  if (status) params.set('status', status)
  return (
    <Link
      href={`/admin/compliance/${companyId}/findings?${params.toString()}`}
      className={`px-3 py-1 rounded-lg border ${
        active
          ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200'
          : 'bg-slate-800/40 border-white/10 text-slate-300 hover:bg-slate-700/50'
      }`}
    >
      {label}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface FindingRow {
  controlId: string
  controlTitle: string | null
  findingStatus: string
  confidence: string
  reasoning: string
  remediation: string | null
  overrideStatus: string | null
  lifecycleStatus: string | null
  assignedTo: string | null
  dueDate: string | null
  acceptedRiskRationale: string | null
  customerImpactSummary: string | null
  internalNotes: string | null
}

function effectiveStatus(r: FindingRow): string {
  return r.overrideStatus ?? r.findingStatus
}

async function listAssessedFrameworks(companyId: string): Promise<Array<{ frameworkId: string }>> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<{ frameworkId: string }>(
      `SELECT DISTINCT "frameworkId"
       FROM compliance_assessments
       WHERE "companyId" = $1 AND status = 'complete'
       ORDER BY "frameworkId"`,
      [companyId]
    )
    return res.rows
  } catch {
    return []
  } finally {
    client.release()
  }
}

async function loadFindings(
  companyId: string,
  frameworkId: string,
  statusFilter: string | null
): Promise<FindingRow[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    // Join findings with dispositions; only the latest complete assessment per
    // (company, framework) is in scope.
    const params: unknown[] = [companyId, frameworkId]
    let statusClause = ''
    if (statusFilter) {
      statusClause = ` AND f.status = $${params.length + 1}`
      params.push(statusFilter)
    }
    const res = await client.query<{
      controlId: string
      findingStatus: string
      confidence: string
      reasoning: string
      remediation: string | null
      overrideStatus: string | null
      lifecycleStatus: string | null
      assignedTo: string | null
      dueDate: string | null
      acceptedRiskRationale: string | null
      customerImpactSummary: string | null
      internalNotes: string | null
    }>(
      `WITH latest AS (
         SELECT id FROM compliance_assessments
         WHERE "companyId" = $1 AND "frameworkId" = $2 AND status = 'complete'
         ORDER BY "completedAt" DESC NULLS LAST
         LIMIT 1
       )
       SELECT
         f."controlId",
         f.status              AS "findingStatus",
         f.confidence,
         f.reasoning,
         f.remediation,
         f."overrideStatus",
         d."lifecycleStatus",
         d."assignedTo",
         d."dueDate"::text     AS "dueDate",
         d."acceptedRiskRationale",
         d."customerImpactSummary",
         d."internalNotes"
       FROM compliance_findings f
       LEFT JOIN compliance_finding_dispositions d
         ON d."companyId" = $1 AND d."frameworkId" = $2 AND d."controlId" = f."controlId"
       WHERE f."assessmentId" IN (SELECT id FROM latest)${statusClause}
       ORDER BY f."controlId"`,
      params
    )
    return res.rows.map((r) => ({
      ...r,
      controlTitle: null, // can be enriched by joining the framework definition; deferred
    }))
  } catch {
    return []
  } finally {
    client.release()
  }
}

function frameworkLabel(id: string): string {
  switch (id) {
    case 'cis-v8':
    case 'cis-v8-ig1':
    case 'cis-v8-ig2':
    case 'cis-v8-ig3':
      return id === 'cis-v8' ? 'CIS Controls v8' : `CIS v8 — ${id.replace('cis-v8-', 'IG').toUpperCase()}`
    case 'cmmc-l1': return 'CMMC Level 1'
    case 'cmmc-l2': return 'CMMC Level 2'
    case 'nist-800-171': return 'NIST SP 800-171'
    case 'hipaa': return 'HIPAA Security Rule'
    case 'pci': return 'PCI DSS v4.0.1'
    default: return id
  }
}
