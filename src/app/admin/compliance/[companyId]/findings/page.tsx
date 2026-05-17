/**
 * Step 6 — Findings.
 *
 * Per-control results from one assessment, rendered in the
 * AssessmentResults-style layout (control families → control rows
 * → expand for reasoning / remediation / evidence). Operator feedback
 * on slice 4: the disposition-form-per-row default was confusing.
 *
 * New defaults:
 *   - Primary action on fail/partial/review = Remediate button
 *     (preview → confirm → apply, no bundle/customer-approval needed
 *     for routine MSP-managed config changes).
 *   - Disposition data (accept risk, customer declined, scheduled-
 *     for-later) collapsed behind a small "Set disposition" link per
 *     row, only mounted on click.
 *
 * Which assessment? Latest completed by default; `?assessmentId=`
 * lets step 5's history table deep-link to a specific run.
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
import { suggestActionsForControl } from '@/lib/compliance/actions/catalog'
import { FRAMEWORK_POLICY_MAPPINGS } from '@/lib/compliance/policy-generation/framework-mappings'
import { getCatalogItem as getPolicyCatalogItem } from '@/lib/compliance/policy-generation/catalog'
import { isDocumentationPrimaryControl } from '@/lib/compliance/policy-generation/doc-primary-controls'
import { frameworkLabel } from '@/lib/compliance/labels'
import { getWorkflowState, adjacentSteps } from '@/lib/compliance/workflow-state'
import FindingsResultsList, { type FindingRowData } from '@/components/compliance/FindingsResultsList'
import type { FrameworkId } from '@/lib/compliance/types'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ companyId: string }>
  searchParams: Promise<{ assessmentId?: string }>
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

export default async function FindingsStepPage({ params, searchParams }: Props) {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')
  const { companyId } = await params
  const { assessmentId: paramAssessmentId } = await searchParams

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, displayName: true },
  })
  if (!company) notFound()

  await ensureComplianceTables()

  const assessments = await loadAssessmentPicks(companyId)
  const activeId = pickActiveAssessmentId(assessments, paramAssessmentId)

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

  // Build per-control metadata (title, description, category) from the
  // framework definition — same lookup AssessmentResults uses.
  const framework = getFrameworkDefinition(summary.assessment.frameworkId as FrameworkId)
  const controlMeta = new Map(framework.controls.map((c) => [c.controlId, c]))

  // Frameworks with IG variants (cis-v8-ig1/ig2/ig3) reuse the base
  // framework's controls — control ids are 'cis-v8-1.1', not
  // 'cis-v8-ig1-1.1'. Strip the IG suffix to derive the prefix used
  // for control-id lookup and action-catalog matching.
  const basePrefix = summary.assessment.frameworkId.replace(/-ig\d$/, '')

  const findingRows: FindingRowData[] = summary.findings.map((f) => {
    // Findings may store controlId in either the full prefixed form
    // ('cis-v8-1.1') or the short form ('1.1') depending on when they
    // were written. Try both keys against the framework definition so
    // the title/description/category resolve correctly.
    const prefixed = f.controlId.includes('-')
      ? f.controlId
      : `${basePrefix}-${f.controlId}`
    const meta = controlMeta.get(f.controlId) ?? controlMeta.get(prefixed)
    const disposition = dispositionByKey.get(`${summary.assessment.frameworkId}::${f.controlId}`)
      ?? dispositionByKey.get(`${summary.assessment.frameworkId}::${prefixed}`)
    // The action catalog stores (frameworkId='cis-v8', controlId='5.2')
    // — short form, base framework. Findings may store either short
    // ('5.2') or prefixed ('cis-v8-5.2') control ids depending on
    // origin. The framework on the assessment row may be an IG
    // variant (cis-v8-ig1). Try every reasonable combo so the
    // Remediate button finds matching actions whatever the shape.
    const shortControl = f.controlId.replace(/^[a-z]+-[a-z0-9]+-/, '')
    const actions = [
      ...suggestActionsForControl(summary.assessment.frameworkId, f.controlId),
      ...suggestActionsForControl(summary.assessment.frameworkId, shortControl),
      ...suggestActionsForControl(basePrefix, f.controlId),
      ...suggestActionsForControl(basePrefix, shortControl),
    ]
      .filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i)
      // Suppress the policy-generate option when this control is NOT
      // documentation-primary. Operator caught it: control 2.3 needs
      // an Intune compliance policy (technical), not a written
      // "Software Management Policy" doc. Allowlist is in
      // doc-primary-controls.ts; controls not on it just don't see
      // the policy-generate Remediate option. (They can still create
      // a backing doc manually from step 4 if they want.)
      .filter((a) => {
        if (a.id !== 'policy.generate_for_control') return true
        return isDocumentationPrimaryControl(basePrefix, shortControl)
      })
      .map((a) => {
        const cov = a.satisfiesControls.find(
          (c) =>
            (c.frameworkId === summary.assessment.frameworkId || c.frameworkId === basePrefix) &&
            (c.controlId === f.controlId || c.controlId === shortControl)
        )?.coverage ?? 'partial'
        // Decorate per-control so the picker tells the operator
        // EXACTLY what each option does. Crucially distinguishes
        // documentation-policy generation from technical-tenant
        // changes — the operator complaint that surfaced this was
        // assuming "Generate / revise the documented policy" was
        // going to create an Intune compliance policy when it
        // actually creates a written doc.
        let name = a.name
        if (a.id === 'policy.generate_for_control') {
          const mapping = FRAMEWORK_POLICY_MAPPINGS.find((m) =>
            (m.frameworkId === basePrefix || m.frameworkId === summary.assessment.frameworkId) &&
            (m.controlId === f.controlId ||
             m.controlId === shortControl ||
             m.controlId === `${basePrefix}-${shortControl}`) &&
            m.coverageType !== 'supporting'
          )
          const catalog = mapping ? getPolicyCatalogItem(mapping.policySlug) : null
          if (catalog) {
            name = `Generate written policy: "${catalog.name}" (documentation only — does NOT push to the customer tenant)`
          } else {
            name = `${a.name} (written documentation — does NOT push to the customer tenant)`
          }
        } else if (a.id.startsWith('graph.') || a.id.startsWith('defender.') || a.id.startsWith('m365.')) {
          // Tag tenant-mutating actions explicitly so the operator
          // sees them as DIFFERENT from documentation generation.
          name = `${a.name} (technical: pushes change to the customer's M365 tenant)`
        }
        return { id: a.id, name, coverage: cov }
      })
    return {
      id: f.id,
      controlId: f.controlId,
      controlTitle: meta?.title ?? '(control title unavailable)',
      controlDescription: meta?.description ?? '',
      controlCategory: meta?.category ?? 'Controls',
      status: f.status,
      effectiveStatus: (f.overrideStatus ?? f.status) as string,
      confidence: f.confidence,
      reasoning: f.reasoning,
      remediation: f.remediation,
      missingEvidence: Array.isArray(f.missingEvidence) ? f.missingEvidence as string[] : [],
      overrideStatus: f.overrideStatus,
      overrideReason: f.overrideReason,
      overrideBy: f.overrideBy,
      overrideAt: f.overrideAt,
      remediationActions: actions,
      disposition: {
        lifecycleStatus: disposition?.lifecycleStatus ?? null,
        assignedTo: disposition?.assignedTo ?? null,
        dueDate: disposition?.dueDate ?? null,
        acceptedRiskRationale: disposition?.acceptedRiskRationale ?? null,
        customerImpactSummary: disposition?.customerImpactSummary ?? null,
        internalNotes: disposition?.internalNotes ?? null,
      },
    }
  })

  // Counter rows used to live here; they're now in FindingsResultsList
  // alongside the filter state (each card is a clickable filter shortcut).

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-cyan-400">Step 6</p>
          <h2 className="text-2xl font-bold text-white">Findings</h2>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Per-control results from the most recent assessment. Click any
            row to read the engine&apos;s reasoning, suggested remediation,
            and supporting evidence. Failing or partial controls get a
            <span className="text-cyan-300"> Remediate</span> button that
            previews + applies the catalog action against the customer&apos;s
            tenant in one round-trip.
          </p>
        </div>
        {/* Single-click PDF export of the active assessment — cover page,
            executive summary, per-control findings (with reviewer
            overrides + dispositions), appendix. Same data the operator
            sees on this page. */}
        <a
          href={`/api/compliance/assessments/${activeId}/report.pdf`}
          download
          className="shrink-0 px-3 py-2 text-xs font-medium rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/25"
          title="Download a printable PDF of this assessment — cover, summary, per-control findings, dispositions, appendix"
        >
          Download PDF report
        </a>
      </header>

      <AssessmentPicker
        companyId={companyId}
        assessments={assessments}
        activeId={activeId}
      />

      {/* Counter cards have moved into FindingsResultsList where the
          filter state lives — each card is now a clickable shortcut
          that flips the filter, so clicking "Failed" drills into
          just the failed findings. */}

      {/* Cross-link to the per-recommendation Secure Score breakdown.
          Useful for the operator who hits a "Microsoft Secure Score
          is X%" finding (CIS 4.1) and wants to see / remediate the
          underlying recommendations directly. */}
      <Link
        href={`/admin/compliance/${companyId}/secure-score`}
        className="block bg-cyan-500/5 border border-cyan-500/30 rounded-xl p-4 hover:bg-cyan-500/10 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-cyan-400">Microsoft Secure Score</p>
            <p className="text-sm text-white font-medium mt-1">
              Per-recommendation breakdown with one-click Remediate &rarr;
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Drill into Secure Score and apply TCT-automated remediations directly to each open recommendation.
            </p>
          </div>
          <span className="text-cyan-300 text-xl">&rarr;</span>
        </div>
      </Link>

      <FindingsResultsList
        companyId={companyId}
        frameworkId={summary.assessment.frameworkId}
        findings={findingRows}
      />

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
}: {
  companyId: string
  assessments: AssessmentPickRow[]
  activeId: string
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



function pickActiveAssessmentId(
  assessments: AssessmentPickRow[],
  paramId: string | undefined,
): string | null {
  if (paramId && assessments.some((a) => a.id === paramId)) return paramId
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
