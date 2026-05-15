/**
 * Step 6 — Findings.
 *
 * Per-control findings from one assessment, with inline disposition
 * editing. Each row uses FindingDispositionRow (already-built client
 * component) which POSTs to /api/compliance/[companyId]/dispositions.
 *
 * Which assessment? The latest completed one by default; an optional
 * `?assessmentId=` query param lets the assessment-history table on
 * step 5 deep-link to a specific run. The picker at the top of the
 * page also lets the operator switch between runs.
 *
 * Disposition rows survive reassessments — the disposition table is
 * keyed on (companyId, frameworkId, controlId), not assessmentId, so
 * "Accept risk" or "Schedule" on a CIS v8 control stays attached to
 * that control across every run.
 */

import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import {
  getAssessmentSummary,
  getFrameworkDefinition,
} from '@/lib/compliance/engine'
import { frameworkLabel } from '@/lib/compliance/labels'
import { getWorkflowState, adjacentSteps } from '@/lib/compliance/workflow-state'
import FindingDispositionRow from '@/components/compliance/FindingDispositionRow'
import type { FrameworkId, Finding } from '@/lib/compliance/types'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ companyId: string }>
  searchParams: Promise<{ assessmentId?: string; status?: string }>
}

interface AssessmentPickRow {
  id: string
  frameworkId: string
  status: string
  createdAt: string
  completedAt: string | null
  totalControls: number
  passedControls: number
}

interface DispositionRow {
  frameworkId: string
  controlId: string
  lifecycleStatus: string
  assignedTo: string | null
  dueDate: string | null
  acceptedRiskRationale: string | null
  customerImpactSummary: string | null
  internalNotes: string | null
}

type StatusFilter = 'all' | 'open' | 'passed' | 'not_applicable' | 'with_disposition'

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open (fail / review)' },
  { key: 'passed', label: 'Passed' },
  { key: 'not_applicable', label: 'Not applicable' },
  { key: 'with_disposition', label: 'With disposition' },
]

export default async function FindingsStepPage({ params, searchParams }: Props) {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')
  const { companyId } = await params
  const { assessmentId: paramAssessmentId, status: filterParam } = await searchParams

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, displayName: true },
  })
  if (!company) notFound()

  await ensureComplianceTables()

  const assessments = await loadAssessmentPicks(companyId)
  const activeId = pickActiveAssessmentId(assessments, paramAssessmentId)

  // No assessments at all → empty state.
  if (!activeId) {
    const steps = await getWorkflowState(companyId)
    const { prev, next } = adjacentSteps(steps, 'findings')
    return <EmptyFindings companyId={companyId} prev={prev} next={next} />
  }

  const [summary, dispositions, steps] = await Promise.all([
    getAssessmentSummary(activeId),
    loadDispositions(companyId),
    getWorkflowState(companyId),
  ])
  if (!summary) notFound()

  const { prev, next } = adjacentSteps(steps, 'findings')

  const dispositionByKey = new Map<string, DispositionRow>()
  for (const d of dispositions) {
    dispositionByKey.set(`${d.frameworkId}::${d.controlId}`, d)
  }

  // Pull titles from the framework definition so the list isn't all
  // control IDs.
  const framework = getFrameworkDefinition(summary.assessment.frameworkId as FrameworkId)
  const titleByControl = new Map(framework.controls.map((c) => [c.controlId, c.title]))

  // Effective status (override wins) + filter.
  const filter: StatusFilter = isValidFilter(filterParam) ? filterParam : 'all'
  const filteredFindings = summary.findings.filter((f) => matchesFilter(
    f,
    filter,
    dispositionByKey.has(`${summary.assessment.frameworkId}::${f.controlId}`)
  ))
  const sortedFindings = sortByControl(filteredFindings)

  // Counters across ALL findings in this assessment (not filtered) so
  // the operator can see the full posture at a glance.
  const counts = countByEffectiveStatus(summary.findings)
  const withDisposition = summary.findings.reduce((n, f) => {
    return n + (dispositionByKey.has(`${summary.assessment.frameworkId}::${f.controlId}`) ? 1 : 0)
  }, 0)

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs uppercase tracking-wider text-cyan-400">Step 6</p>
        <h2 className="text-2xl font-bold text-white">Findings</h2>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">
          Per-control results from the most recent assessment. Click any
          row to read the engine&apos;s reasoning, suggested remediation,
          and to set a disposition (Accept risk, Schedule, Customer
          declined, Billable project). Dispositions persist across
          re-runs — they&apos;re keyed on framework + control, not on
          this specific assessment.
        </p>
      </header>

      <AssessmentPicker
        companyId={companyId}
        assessments={assessments}
        activeId={activeId}
        currentFilter={filter}
      />

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Counter label="Total"           value={summary.findings.length}      tone="slate" />
        <Counter label="Passed"          value={counts.pass}                  tone="emerald" />
        <Counter label="Needs review"    value={counts.needs_review}          tone="cyan" />
        <Counter label="Failed"          value={counts.fail}                  tone="rose" />
        <Counter label="Not applicable"  value={counts.not_applicable}        tone="slate" />
        <Counter label="With disposition" value={withDisposition}             tone="violet" />
      </section>

      <FilterChips companyId={companyId} activeId={activeId} current={filter} />

      <section className="space-y-2">
        {sortedFindings.length === 0 ? (
          <div className="bg-slate-900/50 border border-white/10 rounded-xl p-8 text-center">
            <p className="text-sm text-slate-400">
              No findings match this filter.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {sortedFindings.map((f) => {
              const k = `${summary.assessment.frameworkId}::${f.controlId}`
              const disposition = dispositionByKey.get(k)
              const effective = (f.overrideStatus ?? f.status) as string
              return (
                <FindingDispositionRow
                  key={f.id}
                  companyId={companyId}
                  frameworkId={summary.assessment.frameworkId}
                  controlId={f.controlId}
                  title={titleByControl.get(f.controlId) ?? '(unknown control)'}
                  findingStatus={f.status}
                  effectiveStatus={effective}
                  confidence={f.confidence}
                  reasoning={f.reasoning}
                  remediation={f.remediation}
                  disposition={{
                    lifecycleStatus: disposition?.lifecycleStatus ?? null,
                    assignedTo: disposition?.assignedTo ?? null,
                    dueDate: disposition?.dueDate ?? null,
                    acceptedRiskRationale: disposition?.acceptedRiskRationale ?? null,
                    customerImpactSummary: disposition?.customerImpactSummary ?? null,
                    internalNotes: disposition?.internalNotes ?? null,
                  }}
                />
              )
            })}
          </ul>
        )}
      </section>

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

function EmptyFindings({ companyId, prev, next }: {
  companyId: string
  prev?: { href: string; title: string }
  next?: { href: string; title: string }
}) {
  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs uppercase tracking-wider text-cyan-400">Step 6</p>
        <h2 className="text-2xl font-bold text-white">Findings</h2>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">
          Per-control results from the most recent assessment. Run an
          assessment first to see findings here.
        </p>
      </header>

      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-8 text-center space-y-3">
        <p className="text-sm text-slate-400">No assessments have been run for this customer yet.</p>
        <Link
          href={`/admin/compliance/${companyId}/assess`}
          className="inline-block px-4 py-2 text-sm font-medium rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/30"
        >
          Go to Run Assessment →
        </Link>
      </section>

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

function AssessmentPicker({
  companyId,
  assessments,
  activeId,
  currentFilter,
}: {
  companyId: string
  assessments: AssessmentPickRow[]
  activeId: string
  currentFilter: StatusFilter
}) {
  if (assessments.length === 0) return null
  const active = assessments.find((a) => a.id === activeId)
  return (
    <section className="bg-slate-900/50 border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="text-xs uppercase tracking-wider text-slate-400 shrink-0 sm:w-32">
        Viewing
      </div>
      <div className="flex-1 flex flex-wrap items-center gap-2">
        {active && (
          <>
            <span className="text-sm text-white">
              {frameworkLabel(active.frameworkId)}
            </span>
            <span className="text-xs text-slate-500">
              · {active.completedAt
                ? new Date(active.completedAt).toLocaleString()
                : new Date(active.createdAt).toLocaleString()}
            </span>
            {active.totalControls > 0 && (
              <span className="text-xs text-cyan-300">
                · {Math.round((active.passedControls / active.totalControls) * 100)}%
              </span>
            )}
          </>
        )}
      </div>
      {assessments.length > 1 && (
        <form action={`/admin/compliance/${companyId}/findings`} className="shrink-0">
          {currentFilter !== 'all' && (
            <input type="hidden" name="status" value={currentFilter} />
          )}
          <select
            name="assessmentId"
            defaultValue={activeId}
            className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
          >
            {assessments.map((a) => (
              <option key={a.id} value={a.id}>
                {new Date(a.completedAt ?? a.createdAt).toLocaleDateString()} · {frameworkLabel(a.frameworkId)}
                {a.totalControls > 0 ? ` · ${Math.round((a.passedControls / a.totalControls) * 100)}%` : ''}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="ml-2 text-xs px-2 py-1.5 rounded-lg bg-slate-800/60 border border-white/10 text-slate-200 hover:bg-slate-800/80"
          >
            View
          </button>
        </form>
      )}
    </section>
  )
}

function FilterChips({ companyId, activeId, current }: {
  companyId: string
  activeId: string
  current: StatusFilter
}) {
  return (
    <nav className="flex flex-wrap gap-2">
      {STATUS_FILTERS.map((f) => {
        const isActive = f.key === current
        const href = `/admin/compliance/${companyId}/findings?assessmentId=${activeId}${f.key === 'all' ? '' : `&status=${f.key}`}`
        return (
          <Link
            key={f.key}
            href={href}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              isActive
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-100'
                : 'bg-slate-800/40 border-white/10 text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            {f.label}
          </Link>
        )
      })}
    </nav>
  )
}

function Counter({ label, value, tone }: {
  label: string
  value: number
  tone: 'emerald' | 'cyan' | 'rose' | 'slate' | 'violet'
}) {
  const cls =
    tone === 'emerald' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
    tone === 'cyan'    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20' :
    tone === 'rose'    ? 'bg-rose-500/10 text-rose-300 border-rose-500/20' :
    tone === 'violet'  ? 'bg-violet-500/10 text-violet-300 border-violet-500/20' :
                         'bg-slate-800/40 text-slate-300 border-white/10'
  return (
    <div className={`rounded-lg border p-3 text-center ${cls}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider">{label}</p>
    </div>
  )
}

function isValidFilter(s: string | undefined): s is StatusFilter {
  return s === 'all' || s === 'open' || s === 'passed' || s === 'not_applicable' || s === 'with_disposition'
}

function matchesFilter(f: Finding, filter: StatusFilter, hasDisposition: boolean): boolean {
  const effective = (f.overrideStatus ?? f.status) as string
  switch (filter) {
    case 'all': return true
    case 'open': return effective === 'fail' || effective === 'needs_review' || effective === 'partial'
    case 'passed': return effective === 'pass'
    case 'not_applicable': return effective === 'not_applicable'
    case 'with_disposition': return hasDisposition
  }
}

function countByEffectiveStatus(findings: Finding[]) {
  const counts = {
    pass: 0, fail: 0, needs_review: 0, partial: 0,
    not_applicable: 0, not_assessed: 0, collection_failed: 0,
  }
  for (const f of findings) {
    const e = (f.overrideStatus ?? f.status) as keyof typeof counts
    if (e in counts) counts[e]++
  }
  return counts
}

/** Sort findings by numeric control IDs — "1.2" before "1.10" before "2.1". */
function sortByControl<T extends { controlId: string }>(findings: T[]): T[] {
  return [...findings].sort((a, b) => {
    const numA = a.controlId.replace(/^[a-z]+-[a-z0-9]+-/, '').split('.').map(Number)
    const numB = b.controlId.replace(/^[a-z]+-[a-z0-9]+-/, '').split('.').map(Number)
    for (let i = 0; i < Math.max(numA.length, numB.length); i++) {
      const diff = (numA[i] ?? 0) - (numB[i] ?? 0)
      if (diff !== 0) return diff
    }
    return 0
  })
}

function pickActiveAssessmentId(
  assessments: AssessmentPickRow[],
  paramId: string | undefined,
): string | null {
  if (paramId && assessments.some((a) => a.id === paramId)) return paramId
  // Latest complete; fall back to the absolute latest row if none complete.
  const complete = assessments.find((a) => a.status === 'complete')
  if (complete) return complete.id
  return assessments[0]?.id ?? null
}

async function loadAssessmentPicks(companyId: string): Promise<AssessmentPickRow[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<AssessmentPickRow>(
      `SELECT id,
              "frameworkId",
              status,
              "createdAt"::text AS "createdAt",
              "completedAt"::text AS "completedAt",
              "totalControls",
              "passedControls"
         FROM compliance_assessments
        WHERE "companyId" = $1
        ORDER BY COALESCE("completedAt", "createdAt") DESC`,
      [companyId]
    )
    return res.rows
  } catch (err) {
    console.error('[compliance/findings] loadAssessmentPicks failed', err)
    return []
  } finally {
    client.release()
  }
}

async function loadDispositions(companyId: string): Promise<DispositionRow[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<DispositionRow>(
      `SELECT "frameworkId",
              "controlId",
              "lifecycleStatus",
              "assignedTo",
              "dueDate"::text AS "dueDate",
              "acceptedRiskRationale",
              "customerImpactSummary",
              "internalNotes"
         FROM compliance_finding_dispositions
        WHERE "companyId" = $1`,
      [companyId]
    )
    return res.rows
  } catch (err) {
    console.error('[compliance/findings] loadDispositions failed', err)
    return []
  } finally {
    client.release()
  }
}
