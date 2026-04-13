import type { PtoStatus } from '@/lib/pto/types'

/**
 * Visual pipeline showing which stage a PTO request is in.
 * Four steps: Submitted → HR Intake → Final Approval → Recorded in Gusto
 */

type StepState = 'complete' | 'current' | 'upcoming' | 'skipped' | 'rejected'

interface StepperProps {
  status: PtoStatus | string
  intakeSkipped?: boolean
  gustoRecordedAt?: string | null
}

function stepsFor({
  status,
  intakeSkipped,
  gustoRecordedAt,
}: StepperProps): Array<{ label: string; state: StepState; hint?: string }> {
  const s = status as PtoStatus

  // Cancelled or Denied — terminal states shown plainly
  if (s === 'CANCELLED') {
    return [
      { label: 'Submitted', state: 'complete' },
      { label: 'Cancelled', state: 'rejected', hint: 'Request was cancelled' },
    ]
  }
  if (s === 'DENIED') {
    return [
      { label: 'Submitted', state: 'complete' },
      { label: 'HR Intake', state: intakeSkipped ? 'skipped' : 'complete' },
      { label: 'Final Approval', state: 'rejected', hint: 'Denied' },
    ]
  }

  const steps: Array<{ label: string; state: StepState; hint?: string }> = [
    {
      label: 'Submitted',
      state: 'complete',
    },
    {
      label: 'HR Intake',
      state:
        s === 'PENDING_INTAKE' || s === 'PENDING'
          ? 'current'
          : intakeSkipped
          ? 'skipped'
          : 'complete',
      hint: intakeSkipped ? 'Skipped by final approver' : undefined,
    },
    {
      label: 'Final Approval',
      state:
        s === 'APPROVED'
          ? 'complete'
          : s === 'PENDING_APPROVAL'
          ? 'current'
          : 'upcoming',
    },
    {
      label: 'Recorded in Gusto',
      state: gustoRecordedAt
        ? 'complete'
        : s === 'APPROVED'
        ? 'current'
        : 'upcoming',
      hint: 'HR enters the PTO hours in Gusto manually',
    },
  ]
  return steps
}

function stepColor(state: StepState) {
  switch (state) {
    case 'complete':
      return 'bg-emerald-500 text-white border-emerald-500'
    case 'current':
      return 'bg-cyan-500 text-white border-cyan-500 ring-2 ring-cyan-500/40'
    case 'skipped':
      return 'bg-slate-700 text-slate-300 border-slate-600'
    case 'rejected':
      return 'bg-rose-500 text-white border-rose-500'
    default:
      return 'bg-slate-800 text-slate-500 border-slate-700'
  }
}

function stepIcon(state: StepState, idx: number) {
  if (state === 'complete') return '✓'
  if (state === 'rejected') return '✕'
  if (state === 'skipped') return '—'
  return String(idx + 1)
}

function connectorColor(fromState: StepState) {
  if (fromState === 'complete') return 'bg-emerald-500/60'
  if (fromState === 'rejected') return 'bg-rose-500/40'
  if (fromState === 'skipped') return 'bg-slate-600/60'
  return 'bg-slate-700'
}

export default function PipelineStepper(props: StepperProps) {
  const steps = stepsFor(props)
  return (
    <div className="w-full">
      <ol className="flex items-start w-full overflow-x-auto">
        {steps.map((step, i) => (
          <li
            key={step.label}
            className="flex-1 min-w-[120px] flex items-start"
          >
            <div className="flex flex-col items-center text-center w-full">
              <div className="flex items-center w-full">
                {i > 0 && (
                  <div
                    className={`h-0.5 flex-1 ${connectorColor(steps[i - 1].state)}`}
                  />
                )}
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full border-2 text-xs font-semibold shrink-0 ${stepColor(step.state)}`}
                  title={step.hint}
                >
                  {stepIcon(step.state, i)}
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 ${connectorColor(step.state)}`}
                  />
                )}
              </div>
              <p
                className={`mt-2 text-xs font-medium ${
                  step.state === 'current'
                    ? 'text-cyan-300'
                    : step.state === 'complete'
                    ? 'text-emerald-300'
                    : step.state === 'rejected'
                    ? 'text-rose-300'
                    : 'text-slate-400'
                }`}
              >
                {step.label}
              </p>
              {step.hint && (
                <p className="mt-0.5 text-[10px] text-slate-500 max-w-[140px]">
                  {step.hint}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
