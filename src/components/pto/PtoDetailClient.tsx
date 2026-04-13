'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PTO_KIND_LABELS } from '@/lib/pto/types'
import StatusBadge from './StatusBadge'
import SyncBadge from './SyncBadge'

interface RequestDetail {
  id: string
  employeeStaffId: string
  employeeName: string
  employeeEmail: string
  gustoEmployeeUuid: string
  kind: string
  gustoPolicyUuid: string | null
  gustoPolicyName: string | null
  startDate: string
  endDate: string
  totalHours: number
  hoursPerDay: Record<string, number> | null | unknown
  notes: string | null
  coverage: string | null
  status: string
  reviewedByName: string | null
  reviewedAt: string | null
  managerNotes: string | null
  gustoSyncStatus: string | null
  gustoSyncError: string | null
  graphSyncStatus: string | null
  graphSyncError: string | null
  createdAt: string
}

interface AuditLogEntry {
  id: string
  actorEmail: string
  actorName: string | null
  action: string
  details: unknown
  severity: string
  createdAt: string
}

interface BalanceItem {
  policyName: string
  balanceHours: number
}

export default function PtoDetailClient({
  id,
  canApprove,
  currentStaffId,
}: {
  id: string
  canApprove: boolean
  currentStaffId: string | null
}) {
  const router = useRouter()
  const [req, setReq] = useState<RequestDetail | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [balances, setBalances] = useState<BalanceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [managerNotes, setManagerNotes] = useState('')
  const [acting, setActing] = useState<null | 'approve' | 'deny' | 'cancel' | 'retry'>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/pto/requests/${id}`, { signal })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Request failed (${res.status})`)
      }
      const data = await res.json()
      setReq(data.request)
      setAuditLogs(data.auditLogs ?? [])

      // Fetch balances for the requesting employee (approvers only)
      if (canApprove && data.request?.employeeStaffId) {
        const balRes = await fetch(`/api/pto/balance?staffUserId=${data.request.employeeStaffId}`, {
          signal,
        })
        if (balRes.ok) {
          const balData = await balRes.json()
          setBalances(balData.balances ?? [])
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [id, canApprove])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const call = useCallback(
    async (path: string, method = 'POST', body?: unknown): Promise<boolean> => {
      try {
        const res = await fetch(path, {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          alert(data.error ?? 'Action failed')
          return false
        }
        return true
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Action failed')
        return false
      }
    },
    []
  )

  const approve = async () => {
    if (!req) return
    setActing('approve')
    const ok = await call(`/api/pto/requests/${req.id}/approve`, 'POST', { managerNotes })
    setActing(null)
    if (ok) await load()
  }
  const deny = async () => {
    if (!req) return
    if (!managerNotes.trim() && !confirm('Deny without a note?')) return
    setActing('deny')
    const ok = await call(`/api/pto/requests/${req.id}/deny`, 'POST', { managerNotes })
    setActing(null)
    if (ok) await load()
  }
  const cancel = async () => {
    if (!req) return
    if (!confirm('Cancel this request?')) return
    setActing('cancel')
    const ok = await call(`/api/pto/requests/${req.id}/cancel`, 'POST')
    setActing(null)
    if (ok) {
      await load()
      router.refresh()
    }
  }
  const retry = async () => {
    if (!req) return
    setActing('retry')
    const ok = await call(`/api/pto/requests/${req.id}/retry-sync`, 'POST')
    setActing(null)
    if (ok) await load()
  }

  if (loading && !req) {
    return <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-slate-400">Loading…</div>
  }
  if (error) {
    return (
      <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-6 text-rose-100">
        {error}
      </div>
    )
  }
  if (!req) return null

  const isOwner = currentStaffId === req.employeeStaffId
  const canAct = canApprove && req.status === 'PENDING'

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        {/* Header */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                {PTO_KIND_LABELS[req.kind as keyof typeof PTO_KIND_LABELS] ?? req.kind}
              </p>
              <h2 className="text-xl font-semibold text-white mt-1">
                {req.startDate === req.endDate ? req.startDate : `${req.startDate} → ${req.endDate}`}
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                {req.totalHours.toFixed(2)} hrs
                {req.gustoPolicyName ? ` · ${req.gustoPolicyName}` : ''}
              </p>
            </div>
            <StatusBadge status={req.status} />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 text-sm">
            <div>
              <p className="text-xs text-slate-400 uppercase mb-1">Employee</p>
              <p className="text-white font-medium">{req.employeeName}</p>
              <p className="text-slate-400 text-xs">{req.employeeEmail}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase mb-1">Submitted</p>
              <p className="text-white">{new Date(req.createdAt).toLocaleString()}</p>
            </div>
          </div>

          {req.coverage && (
            <div className="mt-4 rounded-md border-l-2 border-cyan-500 bg-cyan-500/5 p-3">
              <p className="text-xs font-semibold text-cyan-300 uppercase">Shift coverage</p>
              <p className="text-sm text-slate-100 mt-1 whitespace-pre-wrap">{req.coverage}</p>
            </div>
          )}
          {req.notes && (
            <div className="mt-3 rounded-md border-l-2 border-slate-500 bg-slate-500/5 p-3">
              <p className="text-xs font-semibold text-slate-300 uppercase">Employee notes</p>
              <p className="text-sm text-slate-100 mt-1 whitespace-pre-wrap">{req.notes}</p>
            </div>
          )}

          {req.status === 'APPROVED' && (
            <div className="mt-4 flex flex-wrap gap-2">
              <SyncBadge label="Gusto" status={req.gustoSyncStatus} error={req.gustoSyncError} />
              <SyncBadge label="M365 Calendar" status={req.graphSyncStatus} error={req.graphSyncError} />
              {canApprove && (req.gustoSyncStatus === 'error' || req.graphSyncStatus === 'error') && (
                <button
                  type="button"
                  onClick={retry}
                  disabled={acting === 'retry'}
                  className="text-xs px-2 py-1 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30"
                >
                  {acting === 'retry' ? 'Retrying…' : 'Retry sync'}
                </button>
              )}
            </div>
          )}

          {req.status !== 'PENDING' && req.reviewedByName && (
            <div className="mt-4 text-xs text-slate-400">
              {req.status === 'APPROVED' ? 'Approved' : req.status === 'DENIED' ? 'Denied' : 'Cancelled'} by{' '}
              <span className="text-white font-medium">{req.reviewedByName}</span>{' '}
              {req.reviewedAt && <span>on {new Date(req.reviewedAt).toLocaleString()}</span>}
              {req.managerNotes && (
                <div className="mt-2 p-3 rounded border border-white/10 bg-white/5 text-slate-100 whitespace-pre-wrap">
                  <span className="text-slate-400">Manager notes:</span> {req.managerNotes}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex flex-wrap gap-2">
            {canAct && (
              <>
                <div className="basis-full">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Manager notes (optional — sent to employee)
                  </label>
                  <textarea
                    value={managerNotes}
                    onChange={(e) => setManagerNotes(e.target.value)}
                    rows={2}
                    maxLength={2000}
                    className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={approve}
                  disabled={acting !== null}
                  className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-400 disabled:opacity-50"
                >
                  {acting === 'approve' ? 'Approving…' : 'Approve'}
                </button>
                <button
                  type="button"
                  onClick={deny}
                  disabled={acting !== null}
                  className="px-4 py-2 rounded-lg bg-rose-500 text-white text-sm font-semibold hover:bg-rose-400 disabled:opacity-50"
                >
                  {acting === 'deny' ? 'Denying…' : 'Deny'}
                </button>
              </>
            )}
            {(isOwner && req.status === 'PENDING') ||
            (canApprove && (req.status === 'PENDING' || req.status === 'APPROVED')) ? (
              <button
                type="button"
                onClick={cancel}
                disabled={acting !== null}
                className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-semibold hover:bg-slate-600 disabled:opacity-50"
              >
                {acting === 'cancel' ? 'Cancelling…' : 'Cancel request'}
              </button>
            ) : null}
          </div>
        </div>

        {/* Audit log */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">Audit trail</h3>
          {auditLogs.length === 0 ? (
            <p className="text-sm text-slate-400">No activity yet.</p>
          ) : (
            <ul className="space-y-2">
              {auditLogs.map((a) => (
                <li key={a.id} className="text-sm text-slate-200">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium mr-2 ${
                      a.severity === 'error'
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-slate-500/20 text-slate-300'
                    }`}
                  >
                    {a.action}
                  </span>
                  <span className="text-slate-400">{a.actorName ?? a.actorEmail}</span>{' '}
                  <span className="text-slate-500">· {new Date(a.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <aside className="space-y-6">
        {canApprove && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-5">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">
              Employee balances (Gusto)
            </h3>
            {balances.length === 0 ? (
              <p className="text-sm text-slate-400">No balance data.</p>
            ) : (
              <ul className="space-y-2">
                {balances.map((b) => (
                  <li key={b.policyName} className="flex justify-between text-sm">
                    <span className="text-slate-300">{b.policyName}</span>
                    <span className="text-white font-semibold">{b.balanceHours.toFixed(2)} hrs</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div>
          <Link href="/admin/pto" className="text-sm text-cyan-400 hover:text-cyan-300">
            ← Back to time off
          </Link>
        </div>
      </aside>
    </div>
  )
}
