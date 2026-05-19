'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import StatusBadge from './StatusBadge'

interface RequestDetail {
  id: string
  employeeStaffId: string
  employeeName: string
  employeeEmail: string
  workDate: string
  startTime: string | null
  endTime?: string | null
  estimatedHours: number
  reason: string
  status: string
  flowType?: 'APPROVAL' | 'NOTIFICATION'
  otCategory?: string | null
  reactiveReason?: string | null
  incidentContext?: string | null
  lateSubmission?: boolean
  lateReason?: string | null
  flagForCeoReview?: boolean
  flagReason?: string | null
  ceoAcknowledgedAt?: string | null
  intakeByName: string | null
  intakeAt: string | null
  intakeNotes: string | null
  intakeSkipped: boolean
  reviewedByName: string | null
  reviewedAt: string | null
  managerNotes: string | null
  actualHoursWorked: number | null
  payrollRecordedAt: string | null
  payrollRecordedByName: string | null
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

type Action = null | 'intake' | 'skip' | 'approve' | 'deny' | 'cancel' | 'record' | 'unrecord'

export default function OvertimeDetailClient({
  id,
  canApprove,
  canIntake,
  currentStaffId,
}: {
  id: string
  canApprove: boolean
  canIntake: boolean
  currentStaffId: string | null
}) {
  const router = useRouter()
  const [req, setReq] = useState<RequestDetail | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState<Action>(null)
  const [intakeNotes, setIntakeNotes] = useState('')
  const [managerNotes, setManagerNotes] = useState('')
  const [actualHours, setActualHours] = useState('')

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/overtime/requests/${id}`, { signal })
      const text = await res.text()
      if (!res.ok) {
        let msg = `Request failed (${res.status})`
        try { msg = JSON.parse(text).error ?? msg } catch {}
        throw new Error(msg)
      }
      const data = text ? JSON.parse(text) : null
      setReq(data?.request ?? null)
      setAuditLogs(data?.auditLogs ?? [])
      if (data?.request?.actualHoursWorked) setActualHours(String(data.request.actualHoursWorked))
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const call = useCallback(async (path: string, body?: unknown): Promise<boolean> => {
    try {
      const res = await fetch(path, {
        method: 'POST',
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
  }, [])

  const submitIntake = async () => {
    if (!req) return
    setActing('intake')
    const ok = await call(`/api/overtime/requests/${req.id}/intake`, { notes: intakeNotes || null })
    setActing(null)
    if (ok) await load()
  }
  const skipIntake = async () => {
    if (!req || !confirm('Skip HR intake and go straight to final approval?')) return
    setActing('skip')
    const ok = await call(`/api/overtime/requests/${req.id}/skip-intake`)
    setActing(null)
    if (ok) await load()
  }
  const approve = async () => {
    if (!req) return
    setActing('approve')
    const ok = await call(`/api/overtime/requests/${req.id}/approve`, { managerNotes })
    setActing(null)
    if (ok) await load()
  }
  const deny = async () => {
    if (!req) return
    if (!managerNotes.trim() && !confirm('Deny without a note?')) return
    setActing('deny')
    const ok = await call(`/api/overtime/requests/${req.id}/deny`, { managerNotes })
    setActing(null)
    if (ok) await load()
  }
  const cancel = async () => {
    if (!req || !confirm('Cancel this overtime request?')) return
    setActing('cancel')
    const ok = await call(`/api/overtime/requests/${req.id}/cancel`)
    setActing(null)
    if (ok) { await load(); router.refresh() }
  }
  const markRecorded = async (recorded: boolean) => {
    if (!req) return
    const hrs = actualHours ? Number.parseFloat(actualHours) : null
    setActing(recorded ? 'record' : 'unrecord')
    const ok = await call(`/api/overtime/requests/${req.id}/mark-recorded`, {
      recorded,
      actualHoursWorked: typeof hrs === 'number' && Number.isFinite(hrs) ? hrs : undefined,
    })
    setActing(null)
    if (ok) await load()
  }

  if (loading && !req) return <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-slate-400">Loading…</div>
  if (error) return <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-6 text-rose-100">{error}</div>
  if (!req) return null

  const isOwner = currentStaffId === req.employeeStaffId
  const isNotificationFlow = req.flowType === 'NOTIFICATION'
  const canCompleteIntake =
    !isNotificationFlow && (canIntake || canApprove) && req.status === 'PENDING_INTAKE'
  const canFinalApprove =
    !isNotificationFlow &&
    canApprove &&
    (req.status === 'PENDING_APPROVAL' || req.status === 'PENDING_INTAKE')
  const canRecordReactive =
    isNotificationFlow &&
    (canIntake || canApprove) &&
    (req.status === 'PENDING_INTAKE' ||
      req.status === 'RECORDED' ||
      req.status === 'FLAGGED_FOR_REVIEW')

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Overtime</p>
              <h2 className="text-xl font-semibold text-white mt-1">
                {req.workDate}{req.startTime ? ` · ${req.startTime}` : ''}
              </h2>
              <p className="text-sm text-slate-400 mt-1">~{req.estimatedHours.toFixed(2)} hrs estimated</p>
            </div>
            <StatusBadge status={req.status} flowType={req.flowType} />
          </div>

          {isNotificationFlow && (
            <div className="mt-4 rounded-md border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-100">
              <strong>Reactive overtime.</strong> Work has already happened. HR records to payroll —
              no approval gate. Cannot be denied.
              {req.lateSubmission && (
                <div className="mt-1 text-rose-200">
                  ⚠ Logged more than 24 hours after end time. Late reason:{' '}
                  {req.lateReason || '(none provided)'}
                </div>
              )}
            </div>
          )}

          {req.flowType === 'APPROVAL' && req.otCategory && (
            <div className="mt-4 text-xs text-slate-400">
              Category: <span className="text-white">{req.otCategory}</span>
            </div>
          )}

          {isNotificationFlow && req.incidentContext && (
            <div className="mt-4 rounded-md border-l-2 border-cyan-500 bg-cyan-500/5 p-3">
              <p className="text-xs font-semibold text-cyan-300 uppercase">Incident context</p>
              <p className="text-sm text-slate-100 mt-1 whitespace-pre-wrap">{req.incidentContext}</p>
              {req.reactiveReason && (
                <p className="text-xs text-slate-400 mt-2">
                  Reason: <span className="text-white">{req.reactiveReason}</span>
                </p>
              )}
              {req.endTime && (
                <p className="text-xs text-slate-400 mt-1">
                  Worked {req.startTime} → {req.endTime}
                </p>
              )}
            </div>
          )}

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

          <div className="mt-4 rounded-md border-l-2 border-violet-500 bg-violet-500/5 p-3">
            <p className="text-xs font-semibold text-violet-300 uppercase">Reason</p>
            <p className="text-sm text-slate-100 mt-1 whitespace-pre-wrap">{req.reason}</p>
          </div>
        </div>

        {/* Notification-flow (reactive OT) record panel */}
        {canRecordReactive && (
          <ReactiveRecordPanel
            id={req.id}
            currentStatus={req.status}
            currentActualHours={req.actualHoursWorked ?? req.estimatedHours}
            currentHrNotes={req.managerNotes ?? null}
            currentFlagged={!!req.flagForCeoReview}
            currentFlagReason={req.flagReason ?? null}
            currentPayrollRecordedAt={req.payrollRecordedAt}
            onRecorded={() => {
              load()
              router.refresh()
            }}
          />
        )}

        {/* Flag acknowledgement for CEO */}
        {isNotificationFlow && req.flagForCeoReview && canApprove && !req.ceoAcknowledgedAt && (
          <FlagAckPanel
            id={req.id}
            flagReason={req.flagReason ?? '(no reason given)'}
            onAcknowledged={() => {
              load()
              router.refresh()
            }}
          />
        )}

        {/* Step 1: HR Intake — approval flow only */}
        {!isNotificationFlow && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">Step 1 · HR Intake</h3>
          {req.intakeAt || req.intakeSkipped ? (
            <div className="space-y-2 text-sm">
              {req.intakeSkipped ? (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-100">
                  Intake was <strong>skipped</strong> by the final approver.
                </div>
              ) : (
                <>
                  <p className="text-xs text-slate-400">
                    Completed by <span className="text-white">{req.intakeByName ?? 'Unknown'}</span>{' '}
                    {req.intakeAt && <span className="text-slate-500">· {new Date(req.intakeAt).toLocaleString()}</span>}
                  </p>
                  {req.intakeNotes && (
                    <div className="rounded border border-white/10 bg-white/5 p-3 whitespace-pre-wrap text-slate-100">
                      {req.intakeNotes}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : canCompleteIntake ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">Add any context the final approver should know, then forward.</p>
              <textarea
                value={intakeNotes}
                onChange={(e) => setIntakeNotes(e.target.value)}
                rows={3}
                maxLength={4000}
                placeholder="e.g. Last overtime was 2 weeks ago; reason aligns with project deadline."
                className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={submitIntake}
                  disabled={acting !== null}
                  className="px-4 py-2 rounded-lg bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-400 disabled:opacity-50"
                >
                  {acting === 'intake' ? 'Sending…' : 'Forward to final approver'}
                </button>
                {canApprove && (
                  <button
                    type="button"
                    onClick={skipIntake}
                    disabled={acting !== null}
                    className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-semibold hover:bg-slate-600 disabled:opacity-50"
                  >
                    Skip intake
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Waiting on HR intake.</p>
          )}
        </div>
        )}

        {/* Step 2: Final Approval */}
        {!isNotificationFlow && (req.status === 'PENDING_APPROVAL' || req.status === 'APPROVED' || req.status === 'DENIED') && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-6">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">Step 2 · Final Approval</h3>
            {req.reviewedAt ? (
              <div className="text-sm text-slate-200">
                <p className="text-xs text-slate-400 mb-1">
                  {req.status === 'APPROVED' ? 'Approved by' : 'Denied by'}{' '}
                  <span className="text-white">{req.reviewedByName ?? 'Unknown'}</span>{' '}
                  <span className="text-slate-500">· {req.reviewedAt && new Date(req.reviewedAt).toLocaleString()}</span>
                </p>
                {req.managerNotes && (
                  <div className="mt-2 p-3 rounded border border-white/10 bg-white/5 whitespace-pre-wrap">
                    <span className="text-slate-400 text-xs">Manager notes:</span> {req.managerNotes}
                  </div>
                )}
              </div>
            ) : canFinalApprove ? (
              <div className="space-y-3">
                <textarea
                  value={managerNotes}
                  onChange={(e) => setManagerNotes(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder="Optional — sent to employee with the decision"
                  className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={approve} disabled={acting !== null}
                    className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-400 disabled:opacity-50">
                    {acting === 'approve' ? 'Approving…' : 'Approve'}
                  </button>
                  <button type="button" onClick={deny} disabled={acting !== null}
                    className="px-4 py-2 rounded-lg bg-rose-500 text-white text-sm font-semibold hover:bg-rose-400 disabled:opacity-50">
                    {acting === 'deny' ? 'Denying…' : 'Deny'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Waiting on final approver.</p>
            )}
          </div>
        )}

        {/* Step 3: Recorded in Payroll */}
        {req.status === 'APPROVED' && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-6">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">Step 3 · Recorded in Payroll</h3>
            <p className="text-sm text-slate-400 mb-3">
              After the work is completed, HR enters the actual overtime hours and marks this as recorded so it&apos;s included in payroll.
            </p>
            {req.payrollRecordedAt ? (
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="text-sm">
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                    ✓ Recorded — {req.actualHoursWorked != null ? `${req.actualHoursWorked.toFixed(2)} hrs` : 'hours not specified'}
                  </span>
                  <span className="text-slate-400 ml-3">
                    by {req.payrollRecordedByName ?? 'Unknown'} on {new Date(req.payrollRecordedAt).toLocaleString()}
                  </span>
                </div>
                {(canIntake || canApprove) && (
                  <button type="button" onClick={() => markRecorded(false)} disabled={acting !== null}
                    className="text-xs text-slate-400 hover:text-white underline">Undo</button>
                )}
              </div>
            ) : canIntake || canApprove ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Actual hours worked (optional)</label>
                  <input
                    type="number"
                    min="0.25"
                    max="24"
                    step="0.25"
                    value={actualHours}
                    onChange={(e) => setActualHours(e.target.value)}
                    placeholder={`Default: estimated ${req.estimatedHours.toFixed(2)}`}
                    className="w-40 rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
                  />
                </div>
                <button type="button" onClick={() => markRecorded(true)} disabled={acting !== null}
                  className="px-4 py-2 rounded-lg bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-400 disabled:opacity-50">
                  {acting === 'record' ? 'Marking…' : 'Mark as recorded in payroll'}
                </button>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Waiting on HR to record this in payroll.</p>
            )}
          </div>
        )}

        {/* Cancel */}
        {((isOwner && (req.status === 'PENDING_INTAKE' || req.status === 'PENDING_APPROVAL')) ||
          (canApprove && (req.status === 'PENDING_INTAKE' || req.status === 'PENDING_APPROVAL' || req.status === 'APPROVED'))) && (
          <div>
            <button type="button" onClick={cancel} disabled={acting !== null}
              className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-semibold hover:bg-slate-600 disabled:opacity-50">
              {acting === 'cancel' ? 'Cancelling…' : 'Cancel request'}
            </button>
          </div>
        )}

        {/* Audit log */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">Audit trail</h3>
          {auditLogs.length === 0 ? <p className="text-sm text-slate-400">No activity yet.</p> : (
            <ul className="space-y-2">
              {auditLogs.map((a) => (
                <li key={a.id} className="text-sm text-slate-200">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mr-2 ${a.severity === 'error' ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-500/20 text-slate-300'}`}>
                    {a.action.replace(/_/g, ' ')}
                  </span>
                  <span className="text-slate-400">{a.actorName ?? a.actorEmail}</span>{' '}
                  <span className="text-slate-500">· {new Date(a.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <aside>
        <Link href="/admin/overtime" className="text-sm text-cyan-400 hover:text-cyan-300">← Back to overtime</Link>
      </aside>
    </div>
  )
}

function ReactiveRecordPanel({
  id,
  currentStatus,
  currentActualHours,
  currentHrNotes,
  currentFlagged,
  currentFlagReason,
  currentPayrollRecordedAt,
  onRecorded,
}: {
  id: string
  currentStatus: string
  currentActualHours: number
  currentHrNotes: string | null
  currentFlagged: boolean
  currentFlagReason: string | null
  currentPayrollRecordedAt: string | null
  onRecorded: () => void
}) {
  const [hours, setHours] = useState(String(currentActualHours))
  const [hrNotes, setHrNotes] = useState(currentHrNotes ?? '')
  const [payrollLogged, setPayrollLogged] = useState(!!currentPayrollRecordedAt)
  const [flagForCeoReview, setFlagForCeoReview] = useState(currentFlagged)
  const [flagReason, setFlagReason] = useState(currentFlagReason ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const alreadyRecorded = currentStatus === 'RECORDED' || currentStatus === 'FLAGGED_FOR_REVIEW'

  const submit = async () => {
    setError(null)
    const h = Number.parseFloat(hours)
    if (!Number.isFinite(h) || h <= 0 || h > 24) {
      setError('Hours must be between 0 and 24')
      return
    }
    if (flagForCeoReview && !flagReason.trim()) {
      setError('Please add a flag reason or uncheck "Flag for CEO review".')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/overtime/requests/${id}/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualHoursWorked: h,
          hrNotes: hrNotes.trim() || null,
          payrollLogged,
          flagForCeoReview,
          flagReason: flagForCeoReview ? flagReason.trim() : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Failed to record')
        return
      }
      onRecorded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-6">
      <h3 className="text-sm font-semibold text-cyan-300 uppercase tracking-wide mb-3">
        {alreadyRecorded ? 'Update record' : 'HR record for payroll'}
      </h3>
      <p className="text-sm text-slate-300 mb-4">
        The work has happened and must be paid. Confirm the actual hours, mark payroll logged when
        you&apos;ve entered it separately, and flag for CEO if anything stands out.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Actual hours worked <span className="text-rose-400">*</span>
          </label>
          <input
            type="number"
            min="0.25"
            max="24"
            step="0.25"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="w-32 rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
          />
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={payrollLogged}
            onChange={(e) => setPayrollLogged(e.target.checked)}
            className="mt-1"
          />
          <span>
            I&apos;ve recorded this in payroll
            {currentPayrollRecordedAt && (
              <span className="text-xs text-slate-500 ml-2">
                ({new Date(currentPayrollRecordedAt).toLocaleString()})
              </span>
            )}
          </span>
        </label>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            HR notes <span className="text-slate-500 font-normal">— optional, visible to requester</span>
          </label>
          <textarea
            value={hrNotes}
            onChange={(e) => setHrNotes(e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
          />
        </div>

        <div className="border-t border-white/10 pt-4">
          <label className="flex items-start gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={flagForCeoReview}
              onChange={(e) => setFlagForCeoReview(e.target.checked)}
              className="mt-1"
            />
            <span>
              Flag for CEO review
              <span className="text-xs text-slate-500 block">
                Unusually high hours, unclear context, or repeated reactive OT. Does not block payroll.
              </span>
            </span>
          </label>
          {flagForCeoReview && (
            <textarea
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="e.g. 3rd reactive OT this week from same employee."
              required
              className="w-full mt-2 rounded-md bg-slate-900 border border-rose-500/30 text-white px-3 py-2 text-sm"
            />
          )}
        </div>

        {error && (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-400 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : alreadyRecorded ? 'Update' : 'Record for payroll'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FlagAckPanel({
  id,
  flagReason,
  onAcknowledged,
}: {
  id: string
  flagReason: string
  onAcknowledged: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/overtime/requests/${id}/acknowledge`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Failed to acknowledge')
        return
      }
      onAcknowledged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to acknowledge')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-6">
      <h3 className="text-sm font-semibold text-rose-300 uppercase tracking-wide mb-2">
        Flagged for CEO review
      </h3>
      <p className="text-sm text-slate-200 mb-3">
        HR flagged this for your visibility. The OT has been recorded and will be paid —
        acknowledging just closes the flag in the dashboard.
      </p>
      <p className="text-sm text-slate-100 mb-4 italic">&ldquo;{flagReason}&rdquo;</p>
      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200 mb-3">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-400 disabled:opacity-50"
      >
        {submitting ? 'Acknowledging…' : 'Acknowledge'}
      </button>
    </div>
  )
}
