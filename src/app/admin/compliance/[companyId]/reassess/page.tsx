/**
 * Step 8 — Reassess (the comparison view).
 *
 * Per the architecture redesign: no "Final Assessment" stage anymore.
 * This page is on-demand comparison between two completed assessments
 * for the same customer — default is latest vs baseline (the first
 * complete assessment for the chosen framework), with a picker to
 * compare any other pair.
 *
 * What the operator gets:
 *   - Score delta prominently (current % vs previous %)
 *   - Side-by-side counts: pass / fail / review / N/A in each run
 *   - Four diff lists: newly passed / newly failed / improved /
 *     regressed (with deep-links to /findings?assessmentId=...)
 *   - In-flight remediation hint — if changes are still in
 *     deploying/verifying state, suggests waiting before re-running
 *   - Re-run shortcut to step 5 (the actual launch lives there)
 *
 * Uses engine.compareAssessments() which already implements the
 * status-rank diff math.
 */

import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import {
  compareAssessments,
  getAssessmentSummary,
  getFrameworkDefinition,
} from '@/lib/compliance/engine'
import { frameworkLabel } from '@/lib/compliance/labels'
import { getWorkflowState, adjacentSteps } from '@/lib/compliance/workflow-state'
import type { FrameworkId } from '@/lib/compliance/types'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ companyId: string }>
  searchParams: Promise<{ current?: string; previous?: string }>
}

interface AssessmentPick {
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

interface InFlightChange {
  id: string
  actionId: string
  status: string
}

export default async function ReassessStepPage({ params, searchParams }: Props) {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')
  const { companyId } = await params
  const { current: paramCurrent, previous: paramPrevious } = await searchParams

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, displayName: true },
  })
  if (!company) notFound()

  await ensureComplianceTables()

  const [completed, inFlight, steps] = await Promise.all([
    loadCompletedAssessments(companyId),
    loadInFlightChanges(companyId),
    getWorkflowState(companyId),
  ])
  const { prev, next } = adjacentSteps(steps, 'reassess')

  // Empty states
  if (completed.length === 0) {
    return <NeedsAssessment companyId={companyId} prev={prev} next={next} />
  }
  if (completed.length === 1) {
    return (
      <NeedsSecondAssessment
        companyId={companyId}
        only={completed[0]}
        inFlight={inFlight}
        prev={prev}
        next={next}
      />
    )
  }

  // Pick the two assessments to compare. Default: latest vs baseline.
  // Baseline = the OLDEST completed assessment for the same framework
  // as the latest, since cross-framework deltas are meaningless.
  const latestComplete = completed[0]
  const baseline = completed
    .filter((a) => a.frameworkId === latestComplete.frameworkId)
    .slice(-1)[0] ?? completed[completed.length - 1]

  const currentId = paramCurrent && completed.some((a) => a.id === paramCurrent) ? paramCurrent : latestComplete.id
  const previousId = paramPrevious && completed.some((a) => a.id === paramPrevious && a.id !== currentId)
    ? paramPrevious
    : (baseline.id !== currentId ? baseline.id : completed[1]?.id ?? completed[0].id)

  const current = completed.find((a) => a.id === currentId)!
  const previous = completed.find((a) => a.id === previousId)!

  const [comparison, currentSummary] = await Promise.all([
    compareAssessments(currentId, previousId),
    getAssessmentSummary(currentId),
  ])

  // Friendly control IDs for the diff lists: framework defs use the
  // base prefix ("cis-v8-1.1"), assessments often hold short ids
  // ("1.1"). Use the framework def for titles where we can.
  const framework = currentSummary
    ? getFrameworkDefinition(currentSummary.assessment.frameworkId as FrameworkId)
    : null
  const controlTitle = (controlId: string): string => {
    if (!framework) return controlId
    const direct = framework.controls.find((c) => c.controlId === controlId)
    if (direct) return direct.title
    const prefixed = framework.controls.find((c) => c.controlId.endsWith(`-${controlId}`))
    return prefixed?.title ?? controlId
  }
  const shortId = (controlId: string): string => controlId.replace(/^[a-z]+-[a-z0-9]+-/, '')

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs uppercase tracking-wider text-cyan-400">Step 8</p>
        <h2 className="text-2xl font-bold text-white">Reassess</h2>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">
          See what changed between two assessments &mdash; by default,
          the latest run compared against the customer&apos;s baseline.
          Pick any other pair below to compare. Re-running an assessment
          lives on{' '}
          <Link href={`/admin/compliance/${companyId}/assess`} className="text-cyan-400 hover:text-cyan-300 underline">
            step 5
          </Link>
          .
        </p>
      </header>

      {inFlight.length > 0 && (
        <section className="bg-cyan-500/5 border border-cyan-500/30 rounded-xl p-4 flex items-start gap-3">
          <span className="text-cyan-300 text-xl leading-none">⟳</span>
          <div className="text-sm text-cyan-100/90">
            <p className="font-medium">{inFlight.length} remediation{inFlight.length === 1 ? '' : 's'} still in flight.</p>
            <p className="text-xs text-cyan-200/80 mt-1">
              Wait for them to verify (or roll back) before re-running so
              the delta reflects the right state.{' '}
              <Link href={`/admin/compliance/${companyId}/changes`} className="underline hover:text-cyan-100">
                View in-flight changes →
              </Link>
            </p>
          </div>
        </section>
      )}

      <ComparePicker
        companyId={companyId}
        completed={completed}
        currentId={currentId}
        previousId={previousId}
      />

      {comparison ? (
        <ScoreBanner
          currentScore={comparison.currentScore}
          previousScore={comparison.previousScore}
          delta={comparison.scoreDelta}
          currentDate={comparison.currentDate}
          previousDate={comparison.previousDate}
          frameworkLabel={frameworkLabel(current.frameworkId)}
        />
      ) : (
        <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
          <p className="text-sm text-slate-400">
            These two assessments can&apos;t be compared (likely different
            frameworks). Pick assessments from the same framework above.
          </p>
        </section>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <RunCard label="Previous" assessment={previous} accent="slate" />
        <RunCard label="Current"  assessment={current}  accent="cyan" />
      </section>

      {comparison && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <DiffList
            title="Newly passed"
            controls={comparison.newlyPassed}
            controlTitle={controlTitle}
            shortId={shortId}
            tone="emerald"
            companyId={companyId}
            assessmentId={currentId}
          />
          <DiffList
            title="Newly failed"
            controls={comparison.newlyFailed}
            controlTitle={controlTitle}
            shortId={shortId}
            tone="rose"
            companyId={companyId}
            assessmentId={currentId}
          />
          <DiffList
            title="Improved"
            controls={comparison.improved}
            controlTitle={controlTitle}
            shortId={shortId}
            tone="cyan"
            companyId={companyId}
            assessmentId={currentId}
          />
          <DiffList
            title="Regressed"
            controls={comparison.regressed}
            controlTitle={controlTitle}
            shortId={shortId}
            tone="rose"
            companyId={companyId}
            assessmentId={currentId}
          />
        </section>
      )}

      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Ready for another round?</h3>
          <p className="text-xs text-slate-400 mt-1">
            Kick another run from step 5. New runs appear here for
            comparison automatically.
          </p>
        </div>
        <Link
          href={`/admin/compliance/${companyId}/assess`}
          className="shrink-0 px-4 py-2 text-sm font-medium rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/30"
        >
          Re-run on step 5 →
        </Link>
      </section>

      <PrevNextNav prev={prev} next={next} />
    </div>
  )
}

function NeedsAssessment({ companyId, prev, next }: {
  companyId: string
  prev?: { href: string; title: string }
  next?: { href: string; title: string }
}) {
  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs uppercase tracking-wider text-cyan-400">Step 8</p>
        <h2 className="text-2xl font-bold text-white">Reassess</h2>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">
          Compare assessments over time to see progress. Need at least
          two completed runs before there&apos;s anything to compare.
        </p>
      </header>
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-8 text-center space-y-3">
        <p className="text-sm text-slate-400">No completed assessments yet for this customer.</p>
        <Link
          href={`/admin/compliance/${companyId}/assess`}
          className="inline-block px-4 py-2 text-sm font-medium rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/30"
        >
          Run the first assessment →
        </Link>
      </section>
      <PrevNextNav prev={prev} next={next} />
    </div>
  )
}

function NeedsSecondAssessment({ companyId, only, inFlight, prev, next }: {
  companyId: string
  only: AssessmentPick
  inFlight: InFlightChange[]
  prev?: { href: string; title: string }
  next?: { href: string; title: string }
}) {
  const score = only.totalControls > 0 ? Math.round((only.passedControls / only.totalControls) * 100) : 0
  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs uppercase tracking-wider text-cyan-400">Step 8</p>
        <h2 className="text-2xl font-bold text-white">Reassess</h2>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">
          You&apos;ve got one completed assessment so far &mdash; this
          is your baseline. Run another to see what&apos;s changed since.
        </p>
      </header>
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5 space-y-2">
        <p className="text-xs uppercase tracking-wider text-slate-400">Baseline</p>
        <p className="text-2xl font-bold text-white">{score}%</p>
        <p className="text-xs text-slate-500">
          {frameworkLabel(only.frameworkId)} · {only.completedAt ? new Date(only.completedAt).toLocaleString() : new Date(only.createdAt).toLocaleString()}
        </p>
      </section>
      {inFlight.length > 0 && (
        <section className="bg-cyan-500/5 border border-cyan-500/30 rounded-xl p-4 text-sm text-cyan-100/90">
          {inFlight.length} remediation{inFlight.length === 1 ? '' : 's'} still in flight &mdash; let them verify before re-running.
        </section>
      )}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5 text-center">
        <Link
          href={`/admin/compliance/${companyId}/assess`}
          className="inline-block px-4 py-2 text-sm font-medium rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/30"
        >
          Run another assessment →
        </Link>
      </section>
      <PrevNextNav prev={prev} next={next} />
    </div>
  )
}

function ComparePicker({
  companyId,
  completed,
  currentId,
  previousId,
}: {
  companyId: string
  completed: AssessmentPick[]
  currentId: string
  previousId: string
}) {
  return (
    <form
      action={`/admin/compliance/${companyId}/reassess`}
      className="bg-slate-900/50 border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-end gap-3"
    >
      <div className="flex-1 min-w-0">
        <label className="block text-[11px] text-slate-400 uppercase tracking-wider mb-1">
          Previous
        </label>
        <select
          name="previous"
          defaultValue={previousId}
          className="w-full bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
        >
          {completed.map((a) => (
            <option key={a.id} value={a.id}>
              {(a.completedAt ? new Date(a.completedAt).toLocaleDateString() : new Date(a.createdAt).toLocaleDateString())} · {frameworkLabel(a.frameworkId)}
              {a.totalControls > 0 ? ` · ${Math.round((a.passedControls / a.totalControls) * 100)}%` : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 min-w-0">
        <label className="block text-[11px] text-slate-400 uppercase tracking-wider mb-1">
          Current
        </label>
        <select
          name="current"
          defaultValue={currentId}
          className="w-full bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
        >
          {completed.map((a) => (
            <option key={a.id} value={a.id}>
              {(a.completedAt ? new Date(a.completedAt).toLocaleDateString() : new Date(a.createdAt).toLocaleDateString())} · {frameworkLabel(a.frameworkId)}
              {a.totalControls > 0 ? ` · ${Math.round((a.passedControls / a.totalControls) * 100)}%` : ''}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800/60 border border-white/10 text-slate-200 hover:bg-slate-800/80"
      >
        Compare
      </button>
    </form>
  )
}

function ScoreBanner({
  currentScore,
  previousScore,
  delta,
  currentDate,
  previousDate,
  frameworkLabel,
}: {
  currentScore: number
  previousScore: number
  delta: number
  currentDate: string
  previousDate: string
  frameworkLabel: string
}) {
  const tone =
    delta > 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' :
    delta < 0 ? 'bg-rose-500/10 border-rose-500/30 text-rose-200' :
                'bg-slate-800/40 border-white/10 text-slate-200'
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '–'
  return (
    <section className={`rounded-xl border p-5 ${tone}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider opacity-80">Score change</p>
          <p className="text-3xl font-bold mt-1">
            {previousScore}% <span className="opacity-50 mx-2">→</span> {currentScore}%
          </p>
          <p className="text-xs opacity-80 mt-1">{frameworkLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold">
            {arrow} {delta > 0 ? '+' : ''}{delta}<span className="text-base font-normal opacity-70"> pts</span>
          </p>
          <p className="text-[10px] mt-2 opacity-70">
            {new Date(previousDate).toLocaleDateString()} → {new Date(currentDate).toLocaleDateString()}
          </p>
        </div>
      </div>
    </section>
  )
}

function RunCard({ label, assessment, accent }: {
  label: string
  assessment: AssessmentPick
  accent: 'slate' | 'cyan'
}) {
  const score = assessment.totalControls > 0
    ? Math.round((assessment.passedControls / assessment.totalControls) * 100)
    : 0
  const cls =
    accent === 'cyan'  ? 'bg-cyan-500/5 border-cyan-500/30' :
                         'bg-slate-800/30 border-white/10'
  const dateStr = assessment.completedAt
    ? new Date(assessment.completedAt).toLocaleString()
    : new Date(assessment.createdAt).toLocaleString()
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{score}%</p>
      <p className="text-xs text-slate-500 mt-1">
        {frameworkLabel(assessment.frameworkId)} · {dateStr}
      </p>
      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <div>
          <p className="text-sm font-mono text-emerald-300">{assessment.passedControls}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">pass</p>
        </div>
        <div>
          <p className="text-sm font-mono text-cyan-300">{assessment.manualReviewControls}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">review</p>
        </div>
        <div>
          <p className="text-sm font-mono text-rose-300">{assessment.failedControls}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">fail</p>
        </div>
      </div>
    </div>
  )
}

function DiffList({
  title,
  controls,
  controlTitle,
  shortId,
  tone,
  companyId,
  assessmentId,
}: {
  title: string
  controls: string[]
  controlTitle: (id: string) => string
  shortId: (id: string) => string
  tone: 'emerald' | 'rose' | 'cyan'
  companyId: string
  assessmentId: string
}) {
  const cls =
    tone === 'emerald' ? 'bg-emerald-500/5 border-emerald-500/20' :
    tone === 'cyan'    ? 'bg-cyan-500/5 border-cyan-500/20' :
                         'bg-rose-500/5 border-rose-500/20'
  const headerColor =
    tone === 'emerald' ? 'text-emerald-300' :
    tone === 'cyan'    ? 'text-cyan-300' :
                         'text-rose-300'
  return (
    <section className={`rounded-xl border p-4 ${cls}`}>
      <header className="flex items-center justify-between mb-2">
        <h3 className={`text-xs uppercase tracking-wider font-semibold ${headerColor}`}>
          {title}
        </h3>
        <span className="text-sm font-mono text-white">{controls.length}</span>
      </header>
      {controls.length === 0 ? (
        <p className="text-[11px] text-slate-500 py-1">&mdash; none &mdash;</p>
      ) : (
        <ul className="space-y-1 max-h-64 overflow-y-auto">
          {controls.slice(0, 30).map((c) => (
            <li key={c} className="text-xs flex items-baseline gap-2">
              <Link
                href={`/admin/compliance/${companyId}/findings?assessmentId=${assessmentId}#${c}`}
                className="font-mono text-slate-300 hover:text-cyan-300 shrink-0"
              >
                {shortId(c)}
              </Link>
              <span className="text-slate-400 truncate">{controlTitle(c)}</span>
            </li>
          ))}
          {controls.length > 30 && (
            <li className="text-[11px] text-slate-500">&hellip; and {controls.length - 30} more</li>
          )}
        </ul>
      )}
    </section>
  )
}

function PrevNextNav({ prev, next }: {
  prev?: { href: string; title: string }
  next?: { href: string; title: string }
}) {
  return (
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
  )
}

async function loadCompletedAssessments(companyId: string): Promise<AssessmentPick[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<AssessmentPick>(
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
        WHERE "companyId" = $1 AND status = 'complete'
        ORDER BY COALESCE("completedAt", "createdAt") DESC`,
      [companyId]
    )
    return res.rows
  } catch (err) {
    console.error('[compliance/reassess] loadCompletedAssessments failed', err)
    return []
  } finally {
    client.release()
  }
}

async function loadInFlightChanges(companyId: string): Promise<InFlightChange[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<InFlightChange>(
      `SELECT id, "actionId", status
         FROM compliance_pending_changes
        WHERE "companyId" = $1 AND status IN ('deploying','verifying')`,
      [companyId]
    )
    return res.rows
  } catch (err) {
    console.error('[compliance/reassess] loadInFlightChanges failed', err)
    return []
  } finally {
    client.release()
  }
}
