/**
 * Overtime domain types.
 *
 * Two flows determined by timing:
 *   APPROVAL     — planned OT submitted ≥30min before start_time. Goes
 *                  through HR → CEO. Status: PENDING_INTAKE → PENDING_APPROVAL
 *                  → APPROVED / DENIED.
 *   NOTIFICATION — reactive OT logged after the work happened (customer call
 *                  ran past hours, after-hours emergency). HR records;
 *                  cannot be denied because the work was performed.
 *                  Status: PENDING_INTAKE → RECORDED / FLAGGED_FOR_REVIEW.
 */

export type OvertimeStatus =
  | 'PENDING_INTAKE'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'DENIED'
  | 'CANCELLED'
  | 'RECORDED'
  | 'FLAGGED_FOR_REVIEW'

export type OvertimeFlowType = 'APPROVAL' | 'NOTIFICATION'

export const OT_CATEGORIES = [
  'Project work',
  'Maintenance window',
  'Training or certification',
  'Scheduled customer coverage',
  'Other',
] as const
export type OtCategory = (typeof OT_CATEGORIES)[number]

export const REACTIVE_REASONS = [
  'Customer call ran past hours',
  'After-hours emergency response',
  'On-call escalation',
  'Critical incident response',
  'Other',
] as const
export type ReactiveReason = (typeof REACTIVE_REASONS)[number]

/**
 * 30-minute buffer: anything beyond that is "planned", otherwise "reactive".
 * Prevents the obvious workaround of submitting two minutes before starting.
 */
export const PLANNED_OT_BUFFER_MS = 30 * 60 * 1000

/**
 * Reactive OT must be submitted within 24h of end_time. Late submissions are
 * still recorded (the work happened, payroll has to be paid) but flagged.
 */
export const REACTIVE_OT_LATE_WINDOW_MS = 24 * 60 * 60 * 1000

export function isPlannedOt(startAt: Date, now: Date = new Date()): boolean {
  return startAt.getTime() > now.getTime() + PLANNED_OT_BUFFER_MS
}
