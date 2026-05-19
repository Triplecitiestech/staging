/**
 * PTO domain types.
 *
 * The PTO system has two flows:
 *   APPROVAL     — planned time off (vacation, personal, jury duty, planned
 *                  unpaid, other). Goes through reliever → HR → CEO.
 *   NOTIFICATION — unplanned time off that already happened (sick,
 *                  bereavement, family emergency, same-day medical).
 *                  HR records to Gusto; no approval gate.
 */

export type PtoStatus =
  // Approval flow
  | 'PENDING' // legacy (migrated to PENDING_INTAKE)
  | 'PENDING_INTAKE'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'DENIED'
  | 'CANCELLED'
  // Notification flow
  | 'RECORDED_PAID'
  | 'RECORDED_UNPAID'
  | 'FLAGGED_FOR_REVIEW'

export type PtoFlowType = 'APPROVAL' | 'NOTIFICATION'

export type PtoKind =
  | 'VACATION'
  | 'SICK'
  | 'PERSONAL'
  | 'BEREAVEMENT'
  | 'JURY_DUTY'
  | 'UNPAID'
  | 'OTHER'
  | 'FAMILY_EMERGENCY'
  | 'SAME_DAY_MEDICAL'

export const PTO_KIND_LABELS: Record<PtoKind, string> = {
  VACATION: 'Vacation',
  SICK: 'Sick',
  PERSONAL: 'Personal',
  BEREAVEMENT: 'Bereavement',
  JURY_DUTY: 'Jury Duty',
  UNPAID: 'Unpaid Leave (planned)',
  OTHER: 'Other',
  FAMILY_EMERGENCY: 'Family Emergency',
  SAME_DAY_MEDICAL: 'Same-day Medical',
}

/**
 * Map a leave type to its flow. Used at submission time to decide whether
 * the request goes through the approval gate or straight to HR recording.
 */
export function flowForKind(kind: PtoKind): PtoFlowType {
  switch (kind) {
    case 'SICK':
    case 'BEREAVEMENT':
    case 'FAMILY_EMERGENCY':
    case 'SAME_DAY_MEDICAL':
      return 'NOTIFICATION'
    case 'VACATION':
    case 'PERSONAL':
    case 'JURY_DUTY':
    case 'UNPAID':
    case 'OTHER':
    default:
      return 'APPROVAL'
  }
}

export const APPROVAL_FLOW_KINDS: PtoKind[] = [
  'VACATION',
  'PERSONAL',
  'JURY_DUTY',
  'UNPAID',
  'OTHER',
]

export const NOTIFICATION_FLOW_KINDS: PtoKind[] = [
  'SICK',
  'BEREAVEMENT',
  'FAMILY_EMERGENCY',
  'SAME_DAY_MEDICAL',
]

export interface PtoRequestSummary {
  id: string
  employeeStaffId: string
  employeeName: string
  employeeEmail: string
  kind: PtoKind
  startDate: string // YYYY-MM-DD
  endDate: string
  totalHours: number
  status: PtoStatus
  flowType: PtoFlowType
  createdAt: string
  reviewedAt: string | null
  reviewedByName: string | null
}
