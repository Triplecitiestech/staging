'use client'

/**
 * DispositionToggleButton — secondary action on a finding row that
 * exposes the FindingDispositionRow form on demand (per operator
 * feedback: "dispositions are confusing; less visible or optional").
 *
 * Renders a tiny "Set disposition" link by default. Click to expand
 * the existing FindingDispositionRow inline (which owns the form
 * fields + the POST to /api/compliance/[companyId]/dispositions).
 *
 * Doesn't mount FindingDispositionRow until first click — keeps the
 * findings page DOM light when most controls don't have dispositions.
 */

import { useState, lazy, Suspense } from 'react'

const FindingDispositionInline = lazy(() => import('./FindingDispositionInline'))

interface DispositionFields {
  lifecycleStatus: string | null
  assignedTo: string | null
  dueDate: string | null
  acceptedRiskRationale: string | null
  customerImpactSummary: string | null
  internalNotes: string | null
}

interface Props {
  companyId: string
  frameworkId: string
  controlId: string
  disposition: DispositionFields
}

export default function DispositionToggleButton(props: Props) {
  const [open, setOpen] = useState(false)
  const hasDisposition = Boolean(props.disposition.lifecycleStatus)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Disposition tracks WHAT YOU'RE DOING about a finding — open, accepted risk, scheduled, billable project, customer declined, etc. Distinct from an Analyst Attestation, which changes WHAT THE STATUS IS."
        className={`text-[11px] underline transition-colors ${
          hasDisposition
            ? 'text-violet-300 hover:text-violet-200'
            : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        {open ? 'Hide disposition' : hasDisposition
          ? `Disposition: ${props.disposition.lifecycleStatus!.replace(/_/g, ' ')}`
          : 'Set disposition (workflow tracker — what are we doing about this?)'}
      </button>
      {open && (
        <Suspense fallback={<p className="text-[11px] text-slate-500 mt-2">Loading…</p>}>
          <div className="mt-3">
            <p className="text-[11px] text-slate-500 mb-2">
              <span className="text-slate-400 font-medium">Disposition vs. Analyst Attestation:</span>{' '}
              disposition tracks the workflow state (accepted risk, scheduled, billable project,
              customer declined…). To change the actual pass/fail status, use the
              <span className="text-violet-300"> Analyst Attestation </span>
              section above instead.
            </p>
            <FindingDispositionInline {...props} />
          </div>
        </Suspense>
      )}
    </>
  )
}
