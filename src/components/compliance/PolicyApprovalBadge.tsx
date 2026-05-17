/**
 * Status badge surfaced on each policy row showing the latest
 * customer-portal approval (if any).
 *
 *   • approved + fresh           → emerald "✓ Customer approved <date>"
 *   • approved but stale         → cyan    "Customer approved (older content)"
 *   • pending                    → cyan    "Awaiting customer (sent <X>d ago)"
 *   • rejected                   → rose    "Rejected by customer <date>"
 *   • expired                    → slate   "Approval expired"
 *   • no approval ever requested → null (renders nothing)
 *
 * Shared type re-exported from this module so PolicyManager + the
 * publish modal stay typed consistently.
 */

export interface PolicyApprovalSnapshot {
  id: string
  decision: 'pending' | 'approved' | 'rejected' | 'expired'
  decisionNotes: string | null
  decidedAt: string | null
  recipientEmail: string
  requesterEmail: string
  expiresAt: string
  createdAt: string
  freshForCurrentContent: boolean
}

interface Props {
  approval: PolicyApprovalSnapshot | null | undefined
}

export default function PolicyApprovalBadge({ approval }: Props) {
  if (!approval) return null
  const cfg = describe(approval)
  return (
    <span
      className={`inline-flex items-center text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${cfg.tone}`}
      title={cfg.title}
    >
      {cfg.label}
    </span>
  )
}

function describe(a: PolicyApprovalSnapshot): { label: string; tone: string; title: string } {
  const ageDays = Math.max(0, Math.round((Date.now() - new Date(a.createdAt).getTime()) / 86_400_000))
  const decidedAgo = a.decidedAt
    ? Math.round((Date.now() - new Date(a.decidedAt).getTime()) / 86_400_000)
    : null

  if (a.decision === 'approved' && a.freshForCurrentContent) {
    return {
      label: `✓ Approved ${decidedAgo === 0 ? 'today' : decidedAgo === 1 ? '1d ago' : `${decidedAgo}d ago`}`,
      tone: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200',
      title: `Approved by ${a.recipientEmail} on ${a.decidedAt ? new Date(a.decidedAt).toLocaleString() : '(unknown)'}${a.decisionNotes ? ` — Note: ${a.decisionNotes}` : ''}`,
    }
  }
  if (a.decision === 'approved' && !a.freshForCurrentContent) {
    return {
      label: 'Approval stale (content edited)',
      tone: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200',
      title: `${a.recipientEmail} approved an earlier version of this policy. The current content has been edited since — request a new approval.`,
    }
  }
  if (a.decision === 'pending') {
    return {
      label: `Awaiting customer (${ageDays === 0 ? 'sent today' : `${ageDays}d ago`})`,
      tone: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200',
      title: `Approval request sent to ${a.recipientEmail}; link expires ${new Date(a.expiresAt).toLocaleDateString()}.`,
    }
  }
  if (a.decision === 'rejected') {
    return {
      label: `Rejected by customer`,
      tone: 'bg-rose-500/15 border-rose-500/40 text-rose-200',
      title: `${a.recipientEmail} rejected on ${a.decidedAt ? new Date(a.decidedAt).toLocaleString() : '(unknown)'}${a.decisionNotes ? ` — Reason: ${a.decisionNotes}` : ''}`,
    }
  }
  return {
    label: 'Approval expired',
    tone: 'bg-slate-700/40 border-white/10 text-slate-300',
    title: `Approval link expired ${new Date(a.expiresAt).toLocaleDateString()} without a decision from ${a.recipientEmail}.`,
  }
}
