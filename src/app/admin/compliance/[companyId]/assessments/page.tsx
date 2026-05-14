/**
 * /admin/compliance/[companyId]/assessments — assessment list + run + compare
 *
 * Lists all assessments for one customer grouped by framework, latest first.
 * Each row links to the legacy /admin/compliance dashboard (where the
 * AssessmentResults view lives today) and shows score + delta against the
 * previous assessment in the same framework when one exists.
 *
 * Mutations (run a new assessment, compare against an arbitrary previous)
 * happen via client component buttons that hit /api/compliance/assessments.
 */

import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import AdminHeader from '@/components/admin/AdminHeader'
import { prisma } from '@/lib/prisma'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import RunAssessmentButton from '@/components/compliance/RunAssessmentButton'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ companyId: string }>
}

export default async function AssessmentsPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')
  const { companyId } = await params

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, displayName: true },
  })
  if (!company) notFound()

  await ensureComplianceTables()
  const rows = await loadAssessments(companyId)
  const byFramework = groupByFramework(rows)

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
              <Link href={`/admin/compliance/${companyId}`} className="hover:text-cyan-300">{company.displayName}</Link>
              <span aria-hidden>›</span>
              <span className="text-slate-500">Assessments</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mt-1">Assessments</h1>
            <p className="text-sm text-slate-400 mt-1">
              History across every framework you have assessed this customer against.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/admin/compliance/${companyId}/findings`}
              className="px-3 py-2 text-xs font-medium rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20"
            >
              View Findings →
            </Link>
          </div>
        </div>

        {Object.keys(byFramework).length === 0 ? (
          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-8 text-center">
            <p className="text-sm text-slate-400">
              No assessments yet for this customer. Pick a framework and run one:
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {AVAILABLE_FRAMEWORKS.map((fw) => (
                <RunAssessmentButton
                  key={fw.id}
                  companyId={companyId}
                  frameworkId={fw.id}
                  label={`Run ${fw.label}`}
                />
              ))}
            </div>
          </section>
        ) : (
          Object.entries(byFramework).map(([frameworkId, list]) => (
            <FrameworkBlock
              key={frameworkId}
              companyId={companyId}
              frameworkId={frameworkId}
              assessments={list}
            />
          ))
        )}

        {/* Other frameworks that haven't been run yet */}
        {Object.keys(byFramework).length > 0 && (
          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
              Run another framework
            </h2>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_FRAMEWORKS.filter((f) => !byFramework[f.id]).map((fw) => (
                <RunAssessmentButton
                  key={fw.id}
                  companyId={companyId}
                  frameworkId={fw.id}
                  label={fw.label}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

function FrameworkBlock({
  companyId, frameworkId, assessments,
}: {
  companyId: string
  frameworkId: string
  assessments: AssessmentRow[]
}) {
  const latest = assessments[0]
  const previous = assessments[1]
  const latestScore = pct(latest)
  const previousScore = previous ? pct(previous) : null
  const delta = previousScore !== null ? latestScore - previousScore : null

  return (
    <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
      <header className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{frameworkLabel(frameworkId)}</h2>
          <p className="text-xs text-slate-500">
            {assessments.length} assessment{assessments.length === 1 ? '' : 's'} ·{' '}
            latest score{' '}
            <span className={scoreToneClasses(latestScore, 'inline')}>{latestScore}%</span>
            {delta !== null && (
              <span className={delta > 0 ? 'text-emerald-300 ml-1' : delta < 0 ? 'text-rose-300 ml-1' : 'text-slate-400 ml-1'}>
                ({delta > 0 ? '+' : ''}{delta}% vs previous)
              </span>
            )}
          </p>
        </div>
        <RunAssessmentButton companyId={companyId} frameworkId={frameworkId} label="Re-run" small />
      </header>
      <ul className="space-y-2">
        {assessments.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/40 border border-white/5 rounded-lg p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">
                {a.completedAt ? new Date(a.completedAt).toLocaleString() : 'In progress'}
              </p>
              <p className="text-xs text-slate-500">
                {a.passedControls} pass · {a.failedControls} fail · {a.manualReviewControls} review · {a.totalControls} total
                <span className="ml-2 text-slate-500">by {a.createdBy ?? '—'}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={scoreToneClasses(pct(a), 'badge')}>{pct(a)}%</span>
              <Link
                href={`/admin/compliance/${companyId}/findings?frameworkId=${encodeURIComponent(frameworkId)}`}
                className="text-xs text-cyan-400 hover:text-cyan-300 underline"
              >
                Findings →
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

const AVAILABLE_FRAMEWORKS: Array<{ id: string; label: string }> = [
  { id: 'cis-v8', label: 'CIS v8' },
  { id: 'cis-v8-ig1', label: 'CIS v8 IG1' },
  { id: 'cis-v8-ig2', label: 'CIS v8 IG2' },
  { id: 'cis-v8-ig3', label: 'CIS v8 IG3' },
  { id: 'cmmc-l1', label: 'CMMC L1' },
  { id: 'cmmc-l2', label: 'CMMC L2' },
  { id: 'nist-800-171', label: 'NIST 800-171' },
  { id: 'hipaa', label: 'HIPAA' },
  { id: 'pci', label: 'PCI DSS' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AssessmentRow {
  id: string
  frameworkId: string
  status: string
  completedAt: string | null
  totalControls: number
  passedControls: number
  failedControls: number
  manualReviewControls: number
  createdBy: string | null
}

function pct(a: AssessmentRow): number {
  if (a.totalControls === 0) return 0
  return Math.round((a.passedControls / a.totalControls) * 100)
}

function scoreToneClasses(score: number, variant: 'badge' | 'inline'): string {
  const tone = score >= 80 ? 'emerald' : score >= 50 ? 'cyan' : 'rose'
  if (variant === 'badge') {
    return tone === 'emerald'
      ? 'shrink-0 text-sm font-bold px-3 py-1 rounded-md bg-emerald-500/20 text-emerald-300'
      : tone === 'cyan'
      ? 'shrink-0 text-sm font-bold px-3 py-1 rounded-md bg-cyan-500/20 text-cyan-300'
      : 'shrink-0 text-sm font-bold px-3 py-1 rounded-md bg-rose-500/20 text-rose-300'
  }
  return tone === 'emerald' ? 'text-emerald-300' : tone === 'cyan' ? 'text-cyan-300' : 'text-rose-300'
}

function groupByFramework(rows: AssessmentRow[]): Record<string, AssessmentRow[]> {
  const out: Record<string, AssessmentRow[]> = {}
  for (const r of rows) {
    if (!out[r.frameworkId]) out[r.frameworkId] = []
    out[r.frameworkId].push(r)
  }
  return out
}

async function loadAssessments(companyId: string): Promise<AssessmentRow[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<AssessmentRow>(
      `SELECT id, "frameworkId", status, "completedAt"::text AS "completedAt",
              "totalControls", "passedControls", "failedControls", "manualReviewControls",
              "createdBy"
       FROM compliance_assessments
       WHERE "companyId" = $1
       ORDER BY "frameworkId", "completedAt" DESC NULLS LAST, "createdAt" DESC`,
      [companyId]
    )
    return res.rows.map((r) => ({
      ...r,
      totalControls: Number(r.totalControls),
      passedControls: Number(r.passedControls),
      failedControls: Number(r.failedControls),
      manualReviewControls: Number(r.manualReviewControls),
    }))
  } catch {
    return []
  } finally {
    client.release()
  }
}

function frameworkLabel(id: string): string {
  switch (id) {
    case 'cis-v8': return 'CIS Controls v8'
    case 'cis-v8-ig1': return 'CIS Controls v8 — IG1'
    case 'cis-v8-ig2': return 'CIS Controls v8 — IG2'
    case 'cis-v8-ig3': return 'CIS Controls v8 — IG3'
    case 'cmmc-l1': return 'CMMC Level 1'
    case 'cmmc-l2': return 'CMMC Level 2'
    case 'nist-800-171': return 'NIST SP 800-171'
    case 'hipaa': return 'HIPAA Security Rule'
    case 'pci': return 'PCI DSS v4.0.1'
    default: return id
  }
}
