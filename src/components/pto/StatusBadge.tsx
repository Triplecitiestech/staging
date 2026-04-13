import type { PtoStatus } from '@/lib/pto/types'

const CLASSES: Record<PtoStatus, string> = {
  PENDING: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  PENDING_INTAKE: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  PENDING_APPROVAL: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  APPROVED: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  DENIED: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  CANCELLED: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
}

const LABELS: Record<PtoStatus, string> = {
  PENDING: 'Pending',
  PENDING_INTAKE: 'Pending HR intake',
  PENDING_APPROVAL: 'Pending final approval',
  APPROVED: 'Approved',
  DENIED: 'Denied',
  CANCELLED: 'Cancelled',
}

export default function StatusBadge({ status }: { status: PtoStatus | string }) {
  const s = (status as PtoStatus) in CLASSES ? (status as PtoStatus) : 'PENDING_INTAKE'
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border ${CLASSES[s]}`}
    >
      Status: {LABELS[s]}
    </span>
  )
}
