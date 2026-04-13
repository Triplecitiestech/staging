/**
 * PTO domain types.
 */

export type PtoStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELLED'

export type PtoKind =
  | 'VACATION'
  | 'SICK'
  | 'PERSONAL'
  | 'BEREAVEMENT'
  | 'JURY_DUTY'
  | 'UNPAID'
  | 'OTHER'

export const PTO_KIND_LABELS: Record<PtoKind, string> = {
  VACATION: 'Vacation',
  SICK: 'Sick',
  PERSONAL: 'Personal',
  BEREAVEMENT: 'Bereavement',
  JURY_DUTY: 'Jury Duty',
  UNPAID: 'Unpaid Leave',
  OTHER: 'Other',
}

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
  createdAt: string
  reviewedAt: string | null
  reviewedByName: string | null
}
