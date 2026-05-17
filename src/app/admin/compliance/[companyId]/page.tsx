/**
 * /admin/compliance/[companyId] — Workflow landing.
 *
 * Shows progress through the linear onboard → ... → reassess flow.
 * The persistent step nav (rendered by the layout) is the primary
 * navigation surface; this page summarizes journey state, surfaces
 * the next concrete action, and lists any customer policy approvals
 * still waiting on a customer decision so they don't get lost.
 */

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getWorkflowState } from '@/lib/compliance/workflow-state'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import {
  loadPendingApprovalsForCompany,
  type PendingApprovalRow,
} from '@/lib/compliance/policy-approval-store'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function ComplianceWorkflowLanding({ params }: Props) {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')
  const { companyId } = await params

  await ensureComplianceTables()
  const [steps, pendingApprovals] = await Promise.all([
    getWorkflowState(companyId),
    loadPendingApprovals(companyId),
  ])
  const doneCount = steps.filter((s) => s.status === 'done').length
  const totalCount = steps.length
  const current = steps.find((s) => s.status === 'current') ?? steps[0]

  return (
    <div className="space-y-5">
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
        <p className="text-xs uppercase tracking-wider text-cyan-400">Workflow progress</p>
        <div className="flex flex-wrap items-end gap-4 mt-1">
          <p className="text-3xl font-bold text-white">
            {doneCount} <span className="text-slate-500">/ {totalCount}</span>
          </p>
          <p className="text-sm text-slate-400">steps complete</p>
        </div>
        <div className="mt-3 h-1.5 w-full bg-slate-800/60 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500"
            style={{ width: `${Math.round((doneCount / totalCount) * 100)}%` }}
            aria-label={`${Math.round((doneCount / totalCount) * 100)}% complete`}
          />
        </div>
      </section>

      {/* Pending customer approvals — surfaced here so requests that
          have been sitting for days don't get forgotten. Empty when
          nothing's waiting. */}
      {pendingApprovals.length > 0 && (
        <section className="bg-cyan-500/5 border border-cyan-500/30 rounded-xl p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-wider text-cyan-300">
                Waiting on customer
              </p>
              <h2 className="text-xl font-semibold text-white mt-1">
                {pendingApprovals.length} policy approval{pendingApprovals.length === 1 ? '' : 's'} outstanding
              </h2>
              <p className="text-xs text-cyan-200/80 mt-1">
                These approval requests are sitting in customer inboxes; nudge or resend if anything&apos;s been outstanding too long.
              </p>
            </div>
            <Link
              href={`/admin/compliance/${companyId}/policies`}
              className="shrink-0 px-3 py-2 text-xs font-medium rounded-lg bg-slate-800/60 border border-white/10 text-slate-200 hover:bg-slate-800/80"
            >
              Open Policies →
            </Link>
          </div>
          <ul className="mt-3 space-y-2">
            {pendingApprovals.map((a) => {
              const tone =
                a.daysOutstanding >= 7
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                  : a.daysOutstanding >= 3
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200'
                  : 'bg-slate-800/40 border-white/5 text-slate-200'
              return (
                <li
                  key={a.approvalId}
                  className={`flex items-center justify-between gap-3 flex-wrap rounded-lg border p-3 ${tone}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{a.policyTitle}</p>
                    <p className="text-[11px] opacity-80 truncate">
                      Sent to {a.recipientEmail} by {a.requesterEmail}
                    </p>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border bg-black/20 border-white/10 whitespace-nowrap">
                    {a.daysOutstanding === 0
                      ? 'sent today'
                      : a.daysOutstanding === 1
                      ? '1 day ago'
                      : `${a.daysOutstanding} days ago`}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Next action card */}
      {current && (
        <section className="bg-cyan-500/5 border border-cyan-500/30 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-cyan-300">Next action</p>
          <h2 className="text-xl font-semibold text-white mt-1">
            Step {current.number}: {current.title}
          </h2>
          <p className="text-sm text-slate-300 mt-1">{current.description}</p>
          {current.detail && (
            <p className="text-xs text-cyan-200/80 mt-1">{current.detail}</p>
          )}
          <Link
            href={current.href}
            className="inline-block mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/30"
          >
            Go to {current.title} →
          </Link>
        </section>
      )}
    </div>
  )
}

async function loadPendingApprovals(companyId: string): Promise<PendingApprovalRow[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    return await loadPendingApprovalsForCompany(client, companyId)
  } catch (err) {
    console.error('[compliance/landing] loadPendingApprovals failed', err)
    return []
  } finally {
    client.release()
  }
}
