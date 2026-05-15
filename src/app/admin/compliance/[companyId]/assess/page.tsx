/**
 * Step 5 — Run Assessment.
 *
 * Picks a framework + runs the evaluator. Shows the latest completed
 * assessment as a summary panel (score, pass/fail/needs_review,
 * delta vs the previous run) and a history table of every assessment
 * for this customer. Each row deep-links to the legacy AssessmentResults
 * drilldown until the dedicated Findings step (slice 4) lands.
 *
 * Framework picker reads the customer profile's `org_target_frameworks`
 * multi-select so the default + ordering reflects what the customer
 * actually adheres to. Falls back to CIS v8 IG1 if the profile is empty.
 */

import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { frameworkLabel } from '@/lib/compliance/labels'
import { getCustomerProfileAnswers } from '@/lib/compliance/customer-profile-schema'
import { getWorkflowState, adjacentSteps } from '@/lib/compliance/workflow-state'
import AssessRunPanel, { type FrameworkOption } from '@/components/compliance/AssessRunPanel'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ companyId: string }>
}

/** Same set the /api/compliance POST validates against. */
const SUPPORTED_FRAMEWORK_IDS = [
  'cis-v8-ig1', 'cis-v8-ig2', 'cis-v8-ig3', 'cis-v8',
  'cmmc-l1', 'cmmc-l2', 'hipaa', 'nist-800-171', 'pci',
] as const

interface AssessmentRow {
  id: string
  frameworkId: string
  status: string
  createdAt: string
  completedAt: string | null
  totalControls: number
  passedControls: number
  failedControls: number
  manualReviewControls: number
}

export default async function AssessStepPage({ params }: Props) {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')
  const { companyId } = await params

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, displayName: true },
  })
  if (!company) notFound()

  await ensureComplianceTables()
  const [assessments, profile, steps] = await Promise.all([
    loadAssessments(companyId),
    getCustomerProfileAnswers(companyId),
    getWorkflowState(companyId),
  ])
  const { prev, next } = adjacentSteps(steps, 'assess')

  // Build framework picker options. The customer's profile-selected
  // frameworks float to the top (tagged `in profile`). The full
  // supported list always renders below so the operator can still pick
  // anything the engine supports.
  const profileFrameworks = parseFrameworkArray(profile.org_target_frameworks)
  const orderedIds: string[] = []
  for (const id of profileFrameworks) if (SUPPORTED_FRAMEWORK_IDS.includes(id as typeof SUPPORTED_FRAMEWORK_IDS[number])) orderedIds.push(id)
  for (const id of SUPPORTED_FRAMEWORK_IDS) if (!orderedIds.includes(id)) orderedIds.push(id)
  const options: FrameworkOption[] = orderedIds.map((id) => ({
    id,
    label: frameworkLabel(id),
    fromProfile: profileFrameworks.includes(id),
  }))
  const defaultFrameworkId = options[0]?.id ?? 'cis-v8-ig1'

  const latest = assessments.find((a) => a.status === 'complete') ?? null
  const previous = latest
    ? assessments.find((a) => a.status === 'complete' && a.id !== latest.id) ?? null
    : null

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs uppercase tracking-wider text-cyan-400">Step 5</p>
        <h2 className="text-2xl font-bold text-white">Run Assessment</h2>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">
          Score this customer against a framework. The engine pulls
          evidence from every verified connector, evaluates each control,
          and writes findings ready for disposition in the next step.
          Re-run any time — the previous result is preserved so you can
          see what changed.
        </p>
      </header>

      <AssessRunPanel
        companyId={companyId}
        options={options}
        defaultFrameworkId={defaultFrameworkId}
      />

      {latest ? (
        <LatestSummary latest={latest} previous={previous} companyId={companyId} />
      ) : (
        <section className="bg-slate-900/50 border border-white/10 rounded-xl p-8 text-center">
          <p className="text-sm text-slate-400">
            No completed assessments yet. Pick a framework above and click
            <span className="text-cyan-300"> Run assessment</span> to get the
            first baseline.
          </p>
        </section>
      )}

      <HistoryTable assessments={assessments} latestId={latest?.id ?? null} companyId={companyId} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
        {prev ? (
          <Link href={prev.href} className="text-xs text-slate-400 hover:text-cyan-300">
            ← Back to {prev.title}
          </Link>
        ) : <span />}
        {next && (
          <Link
            href={next.href}
            className="inline-block px-4 py-2 text-sm font-medium rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/30"
          >
            Next: {next.title} →
          </Link>
        )}
      </div>
    </div>
  )
}

function LatestSummary({
  latest,
  previous,
  companyId,
}: {
  latest: AssessmentRow
  previous: AssessmentRow | null
  companyId: string
}) {
  const score = latest.totalControls > 0
    ? Math.round((latest.passedControls / latest.totalControls) * 100)
    : 0
  const prevScore = previous && previous.totalControls > 0
    ? Math.round((previous.passedControls / previous.totalControls) * 100)
    : null
  const delta = prevScore !== null ? score - prevScore : null
  const dateStr = latest.completedAt
    ? new Date(latest.completedAt).toLocaleString()
    : new Date(latest.createdAt).toLocaleString()

  return (
    <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5 space-y-4">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            Latest assessment
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {frameworkLabel(latest.frameworkId)} · {dateStr}
          </p>
        </div>
        <Link
          href={`/admin/compliance/${companyId}/findings?assessmentId=${latest.id}`}
          className="shrink-0 px-3 py-2 text-xs font-medium rounded-lg bg-slate-800/60 border border-white/10 text-slate-200 hover:bg-slate-800/80"
        >
          View findings →
        </Link>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <ScoreCard score={score} delta={delta} />
        <StatCard label="Passed"        value={latest.passedControls}        total={latest.totalControls} tone="emerald" />
        <StatCard label="Needs review"  value={latest.manualReviewControls}  total={latest.totalControls} tone="cyan" />
        <StatCard label="Failed"        value={latest.failedControls}        total={latest.totalControls} tone="rose" />
      </div>

      <p className="text-[11px] text-slate-500 max-w-2xl">
        Drill into{' '}
        <Link
          href={`/admin/compliance/${companyId}/findings?assessmentId=${latest.id}`}
          className="text-cyan-400 hover:text-cyan-300 underline"
        >
          Findings
        </Link>{' '}
        to disposition each control (accept risk, schedule remediation,
        mark out-of-scope). Dispositions persist across re-runs.
      </p>
    </section>
  )
}

function ScoreCard({ score, delta }: { score: number; delta: number | null }) {
  const tone =
    score >= 80 ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' :
    score >= 50 ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' :
                  'bg-rose-500/10 text-rose-300 border-rose-500/30'
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-80">Score</p>
      <p className="text-2xl font-bold mt-1">{score}%</p>
      {delta !== null && (
        <p className="text-[11px] mt-0.5">
          {delta > 0 ? (
            <span className="text-emerald-300">▲ +{delta} pts since prior</span>
          ) : delta < 0 ? (
            <span className="text-rose-300">▼ {delta} pts since prior</span>
          ) : (
            <span className="text-slate-400">Unchanged from prior</span>
          )}
        </p>
      )}
    </div>
  )
}

function StatCard({ label, value, total, tone }: { label: string; value: number; total: number; tone: 'emerald' | 'cyan' | 'rose' }) {
  const cls =
    tone === 'emerald' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-200' :
    tone === 'cyan'    ? 'bg-cyan-500/5 border-cyan-500/20 text-cyan-200' :
                         'bg-rose-500/5 border-rose-500/20 text-rose-200'
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      <p className="text-[10px] opacity-60">of {total}</p>
    </div>
  )
}

function HistoryTable({ assessments, latestId, companyId }: { assessments: AssessmentRow[]; latestId: string | null; companyId: string }) {
  if (assessments.length === 0) return null
  return (
    <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
        Assessment history ({assessments.length})
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
              <th className="py-2 pr-3 font-medium">Date</th>
              <th className="py-2 pr-3 font-medium">Framework</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium text-right">Score</th>
              <th className="py-2 pr-3 font-medium text-right">Pass / Fail / Review</th>
              <th className="py-2 pr-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {assessments.map((a) => {
              const isLatest = a.id === latestId
              const score = a.status === 'complete' && a.totalControls > 0
                ? Math.round((a.passedControls / a.totalControls) * 100)
                : null
              const dateStr = a.completedAt
                ? new Date(a.completedAt).toLocaleDateString()
                : new Date(a.createdAt).toLocaleDateString()
              return (
                <tr key={a.id} className="border-b border-white/5 hover:bg-slate-800/30">
                  <td className="py-2.5 pr-3 text-slate-300 whitespace-nowrap">
                    {dateStr}
                    {isLatest && <span className="ml-2 text-[10px] uppercase text-cyan-300 tracking-wider">Latest</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-slate-300">{frameworkLabel(a.frameworkId)}</td>
                  <td className="py-2.5 pr-3"><StatusBadge status={a.status} /></td>
                  <td className="py-2.5 pr-3 text-right font-mono text-white">
                    {score !== null ? `${score}%` : '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-[11px] text-slate-400">
                    {a.status === 'complete'
                      ? `${a.passedControls} / ${a.failedControls} / ${a.manualReviewControls}`
                      : '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    <Link
                      href={`/admin/compliance/${companyId}/findings?assessmentId=${a.id}`}
                      className="text-xs text-cyan-300 hover:text-cyan-200"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    complete: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200',
    draft: 'bg-slate-700/40 border-white/10 text-slate-300',
    in_progress: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200',
    failed: 'bg-rose-500/15 border-rose-500/40 text-rose-200',
  }
  const cls = map[status] ?? 'bg-slate-700/40 border-white/10 text-slate-300'
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

async function loadAssessments(companyId: string): Promise<AssessmentRow[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<AssessmentRow>(
      `SELECT id,
              "frameworkId",
              status,
              "createdAt"::text AS "createdAt",
              "completedAt"::text AS "completedAt",
              "totalControls",
              "passedControls",
              "failedControls",
              "manualReviewControls"
         FROM compliance_assessments
        WHERE "companyId" = $1
        ORDER BY "createdAt" DESC`,
      [companyId]
    )
    return res.rows
  } catch (err) {
    console.error('[compliance/assess] loadAssessments failed', err)
    return []
  } finally {
    client.release()
  }
}

/** Normalize a profile multi-select answer to a string array. */
function parseFrameworkArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  if (typeof v === 'string' && v.trim().length > 0) {
    // Some legacy multi-select rows are stored as a comma-separated string.
    return v.split(',').map((s) => s.trim()).filter(Boolean)
  }
  return []
}
