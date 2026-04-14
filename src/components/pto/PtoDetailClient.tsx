'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PTO_KIND_LABELS } from '@/lib/pto/types'
import StatusBadge from './StatusBadge'
import SyncBadge from './SyncBadge'
import PipelineStepper from './PipelineStepper'

interface RequestDetail {
  id: string
  employeeStaffId: string
  employeeName: string
  employeeEmail: string
  kind: string
  startDate: string
  endDate: string
  totalHours: number
  hoursPerDay: Record<string, number> | null | unknown
  notes: string | null
  coverage: string | null
  coverageStaffId: string | null
  coverageStaffName: string | null
  coverageStaffEmail: string | null
  coverageResponse: string | null
  coverageRespondedAt: string | null
  coverageResponseNotes: string | null
  coverageRequestSentAt: string | null
  status: string
  intakeByStaffId: string | null
  intakeByName: string | null
  intakeAt: string | null
  intakeLastTimeOffNotes: string | null
  intakeBalanceNotes: string | null
  intakeCoverageConfirmed: boolean | null
  intakeCoverageNotes: string | null
  intakeAdditionalNotes: string | null
  intakeSkipped: boolean
  reviewedByName: string | null
  reviewedAt: string | null
  managerNotes: string | null
  gustoRecordedAt: string | null
  gustoRecordedByName: string | null
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

type Action = null | 'intake' | 'skip' | 'approve' | 'deny' | 'cancel' | 'record' | 'unrecord'

export default function PtoDetailClient({
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

  // Intake form state
  const [intakeBalance, setIntakeBalance] = useState('')
  const [intakeLastTimeOff, setIntakeLastTimeOff] = useState('')
  const [intakeCoverageConfirmed, setIntakeCoverageConfirmed] = useState<'yes' | 'no' | 'unknown'>('unknown')
  const [intakeCoverageNotes, setIntakeCoverageNotes] = useState('')
  const [intakeAdditionalNotes, setIntakeAdditionalNotes] = useState('')

  // Approval notes state
  const [managerNotes, setManagerNotes] = useState('')

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/pto/requests/${id}`, { signal })
        const text = await res.text()
        if (!res.ok) {
          let msg = `Request failed (${res.status})`
          try {
            msg = (JSON.parse(text).error as string) || msg
          } catch {}
          throw new Error(msg)
        }
        const data = text ? JSON.parse(text) : null
        setReq(data?.request ?? null)
        setAuditLogs(data?.auditLogs ?? [])
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    },
    [id]
  )

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
    const ok = await call(`/api/pto/requests/${req.id}/intake`, {
      balanceNotes: intakeBalance || null,
      lastTimeOffNotes: intakeLastTimeOff || null,
      coverageConfirmed:
        intakeCoverageConfirmed === 'yes' ? true : intakeCoverageConfirmed === 'no' ? false : null,
      coverageNotes: intakeCoverageNotes || null,
      additionalNotes: intakeAdditionalNotes || null,
    })
    setActing(null)
    if (ok) await load()
  }
  const skipIntakeNow = async () => {
    if (!req) return
    if (!confirm('Skip HR intake and go straight to final approval?')) return
    setActing('skip')
    const ok = await call(`/api/pto/requests/${req.id}/skip-intake`)
    setActing(null)
    if (ok) await load()
  }
  const approve = async () => {
    if (!req) return
    setActing('approve')
    const ok = await call(`/api/pto/requests/${req.id}/approve`, { managerNotes })
    setActing(null)
    if (ok) await load()
  }
  const deny = async () => {
    if (!req) return
    if (!managerNotes.trim() && !confirm('Deny without a note?')) return
    setActing('deny')
    const ok = await call(`/api/pto/requests/${req.id}/deny`, { managerNotes })
    setActing(null)
    if (ok) await load()
  }
  const cancel = async () => {
    if (!req) return
    if (!confirm('Cancel this request?')) return
    setActing('cancel')
    const ok = await call(`/api/pto/requests/${req.id}/cancel`)
    setActing(null)
    if (ok) {
      await load()
      router.refresh()
    }
  }
  const markRecorded = async (recorded: boolean) => {
    if (!req) return
    setActing(recorded ? 'record' : 'unrecord')
    const ok = await call(`/api/pto/requests/${req.id}/mark-recorded`, { recorded })
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
  const canCompleteIntake =
    (canIntake || canApprove) && (req.status === 'PENDING_INTAKE' || req.status === 'PENDING')
  const canFinalApprove =
    canApprove &&
    (req.status === 'PENDING_APPROVAL' || req.status === 'PENDING_INTAKE' || req.status === 'PENDING')

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        {/* Pipeline */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">
            Request pipeline
          </h3>
          <PipelineStepper
            status={req.status}
            intakeSkipped={req.intakeSkipped}
            gustoRecordedAt={req.gustoRecordedAt}
          />
        </div>

        {/* Request summary */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                {PTO_KIND_LABELS[req.kind as keyof typeof PTO_KIND_LABELS] ?? req.kind}
              </p>
              <h2 className="text-xl font-semibold text-white mt-1">
                {req.startDate === req.endDate ? req.startDate : `${req.startDate} → ${req.endDate}`}
              </h2>
              <p className="text-sm text-slate-400 mt-1">{req.totalHours.toFixed(2)} hrs</p>
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

          {req.coverageStaffName && (
            <div
              className={`mt-4 rounded-md border p-3 ${
                req.coverageResponse === 'accepted'
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : req.coverageResponse === 'declined'
                  ? 'border-rose-500/30 bg-rose-500/5'
                  : 'border-amber-500/30 bg-amber-500/5'
              }`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                  Coverage:{' '}
                  <span
                    className={
                      req.coverageResponse === 'accepted'
                        ? 'text-emerald-300'
                        : req.coverageResponse === 'declined'
                        ? 'text-rose-300'
                        : 'text-amber-300'
                    }
                  >
                    {req.coverageResponse === 'accepted'
                      ? '✓ Accepted'
                      : req.coverageResponse === 'declined'
                      ? '✕ Declined'
                      : '⏳ Awaiting response'}
                  </span>
                </p>
                <p className="text-xs text-slate-400">
                  {req.coverageRespondedAt
                    ? `Responded ${new Date(req.coverageRespondedAt).toLocaleString()}`
                    : req.coverageRequestSentAt
                    ? `Requested ${new Date(req.coverageRequestSentAt).toLocaleString()}`
                    : ''}
                </p>
              </div>
              <p className="text-sm text-white mt-1 font-medium">{req.coverageStaffName}</p>
              {req.coverageStaffEmail && (
                <p className="text-xs text-slate-400">{req.coverageStaffEmail}</p>
              )}
              {req.coverageResponseNotes && (
                <p className="text-sm text-slate-200 mt-2 whitespace-pre-wrap italic">
                  &ldquo;{req.coverageResponseNotes}&rdquo;
                </p>
              )}
              {req.coverage && (
                <p className="text-xs text-slate-400 mt-2 whitespace-pre-wrap">
                  Note from employee: {req.coverage}
                </p>
              )}
            </div>
          )}
          {!req.coverageStaffName && req.coverage && (
            <div className="mt-4 rounded-md border-l-2 border-cyan-500 bg-cyan-500/5 p-3">
              <p className="text-xs font-semibold text-cyan-300 uppercase">Shift coverage (from employee)</p>
              <p className="text-sm text-slate-100 mt-1 whitespace-pre-wrap">{req.coverage}</p>
            </div>
          )}
          {req.notes && (
            <div className="mt-3 rounded-md border-l-2 border-slate-500 bg-slate-500/5 p-3">
              <p className="text-xs font-semibold text-slate-300 uppercase">Employee notes</p>
              <p className="text-sm text-slate-100 mt-1 whitespace-pre-wrap">{req.notes}</p>
            </div>
          )}
        </div>

        {/* Stage 1: HR Intake */}
        {(req.status === 'PENDING_INTAKE' ||
          req.status === 'PENDING' ||
          req.intakeAt ||
          req.intakeSkipped) && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-6">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">
              Step 1 · HR Intake
            </h3>

            {req.intakeAt || req.intakeSkipped ? (
              <div className="space-y-3 text-sm">
                {req.intakeSkipped ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-100">
                    Intake was <strong>skipped</strong> by the final approver.
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-slate-400">
                      Completed by{' '}
                      <span className="text-white">{req.intakeByName ?? 'Unknown'}</span>{' '}
                      {req.intakeAt && (
                        <span className="text-slate-500">
                          · {new Date(req.intakeAt).toLocaleString()}
                        </span>
                      )}
                    </p>
                    <IntakeField label="PTO balance (from Gusto)" value={req.intakeBalanceNotes} />
                    <IntakeField label="Last time off" value={req.intakeLastTimeOffNotes} />
                    <IntakeField
                      label="Coverage confirmed"
                      value={
                        req.intakeCoverageConfirmed === true
                          ? `Yes${req.intakeCoverageNotes ? ` — ${req.intakeCoverageNotes}` : ''}`
                          : req.intakeCoverageConfirmed === false
                          ? `No${req.intakeCoverageNotes ? ` — ${req.intakeCoverageNotes}` : ''}`
                          : req.intakeCoverageNotes
                      }
                    />
                    <IntakeField label="Additional notes" value={req.intakeAdditionalNotes} />
                  </>
                )}
              </div>
            ) : canCompleteIntake ? (
              <>
                <p className="text-sm text-slate-400 mb-4">
                  Gather context so the final approver can make an informed decision. Look up the employee&apos;s
                  balance in Gusto and paste it below.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Current PTO balance (from Gusto)
                    </label>
                    <input
                      type="text"
                      value={intakeBalance}
                      onChange={(e) => setIntakeBalance(e.target.value)}
                      maxLength={500}
                      placeholder="e.g. Vacation: 48 hrs, Sick: 16 hrs"
                      className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Prior time off
                    </label>
                    <textarea
                      value={intakeLastTimeOff}
                      onChange={(e) => setIntakeLastTimeOff(e.target.value)}
                      rows={2}
                      maxLength={2000}
                      placeholder="e.g. Last took PTO March 14–16 (vacation); no absences this quarter"
                      className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Coverage confirmed?
                    </label>
                    <div className="flex gap-2 mb-2">
                      {(['yes', 'no', 'unknown'] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setIntakeCoverageConfirmed(v)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                            intakeCoverageConfirmed === v
                              ? v === 'yes'
                                ? 'bg-emerald-500 text-white'
                                : v === 'no'
                                ? 'bg-rose-500 text-white'
                                : 'bg-slate-600 text-white'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {v === 'yes' ? 'Yes' : v === 'no' ? 'No' : 'Unknown'}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={intakeCoverageNotes}
                      onChange={(e) => setIntakeCoverageNotes(e.target.value)}
                      maxLength={500}
                      placeholder="Who will cover? Any concerns?"
                      className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Anything else for the final approver
                    </label>
                    <textarea
                      value={intakeAdditionalNotes}
                      onChange={(e) => setIntakeAdditionalNotes(e.target.value)}
                      rows={2}
                      maxLength={4000}
                      className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
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
                        onClick={skipIntakeNow}
                        disabled={acting !== null}
                        className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-semibold hover:bg-slate-600 disabled:opacity-50"
                      >
                        Skip intake
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">Waiting on HR intake.</p>
            )}
          </div>
        )}

        {/* Stage 2: Final approval */}
        {(req.status === 'PENDING_APPROVAL' ||
          req.status === 'APPROVED' ||
          req.status === 'DENIED') && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-6">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">
              Step 2 · Final Approval
            </h3>
            {req.reviewedAt ? (
              <div className="text-sm text-slate-200">
                <p className="text-xs text-slate-400 mb-1">
                  {req.status === 'APPROVED' ? 'Approved by' : 'Denied by'}{' '}
                  <span className="text-white">{req.reviewedByName ?? 'Unknown'}</span>{' '}
                  <span className="text-slate-500">
                    · {req.reviewedAt && new Date(req.reviewedAt).toLocaleString()}
                  </span>
                </p>
                {req.managerNotes && (
                  <div className="mt-2 p-3 rounded border border-white/10 bg-white/5 text-slate-100 whitespace-pre-wrap">
                    <span className="text-slate-400 text-xs">Manager notes:</span> {req.managerNotes}
                  </div>
                )}
              </div>
            ) : canFinalApprove ? (
              <div className="space-y-3">
                <div>
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
                <div className="flex gap-2">
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
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Waiting on final approver.</p>
            )}
          </div>
        )}

        {/* Stage 4: Recorded in Gusto */}
        {req.status === 'APPROVED' && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-6">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">
              Step 4 · Recorded in Gusto (manual)
            </h3>
            <p className="text-sm text-slate-400 mb-3">
              Live Gusto write-back isn&apos;t available yet. After approving, HR enters the PTO
              hours in Gusto manually, then flips the switch below.
            </p>
            {req.gustoRecordedAt ? (
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm">
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                    ✓ Recorded in Gusto
                  </span>
                  <span className="text-slate-400 ml-3">
                    by {req.gustoRecordedByName ?? 'Unknown'}{' '}
                    {req.gustoRecordedAt &&
                      `on ${new Date(req.gustoRecordedAt).toLocaleString()}`}
                  </span>
                </div>
                {(canIntake || canApprove) && (
                  <button
                    type="button"
                    onClick={() => markRecorded(false)}
                    disabled={acting !== null}
                    className="text-xs text-slate-400 hover:text-white underline"
                  >
                    Undo
                  </button>
                )}
              </div>
            ) : (
              canIntake || canApprove ? (
                <button
                  type="button"
                  onClick={() => markRecorded(true)}
                  disabled={acting !== null}
                  className="px-4 py-2 rounded-lg bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-400 disabled:opacity-50"
                >
                  {acting === 'record' ? 'Marking…' : 'Mark as recorded in Gusto'}
                </button>
              ) : (
                <p className="text-sm text-slate-400">
                  Waiting on HR to enter this in Gusto.
                </p>
              )
            )}
          </div>
        )}

        {/* Step 3: Calendar sync */}
        {req.status === 'APPROVED' && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-6">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">
              Step 3 · Calendar sync (automatic)
            </h3>
            {req.graphSyncStatus === 'ok' ? (
              <div className="text-sm text-emerald-200">
                ✓ Event created on the shared PTO calendar and an invite was sent to{' '}
                {req.employeeEmail}.
              </div>
            ) : req.graphSyncStatus === 'error' ? (
              <>
                <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-4">
                  <p className="text-sm font-semibold text-rose-200">Calendar sync failed</p>
                  <p className="text-xs text-rose-100 mt-1">
                    Common causes: the PTO calendar mailbox doesn&apos;t exist as a mailbox (set{' '}
                    <code>PTO_CALENDAR_TYPE=group</code> to target an M365 group&apos;s calendar
                    instead), or the Azure AD app is missing the <code>Calendars.ReadWrite</code>{' '}
                    application permission / admin consent. Error below:
                  </p>
                  {req.graphSyncError && (
                    <pre className="mt-2 p-2 rounded bg-rose-500/10 text-xs text-rose-100 overflow-x-auto whitespace-pre-wrap break-words">
                      {req.graphSyncError}
                    </pre>
                  )}
                </div>
                {canApprove && (
                  <button
                    type="button"
                    onClick={() =>
                      fetch(`/api/pto/requests/${req.id}/retry-sync`, { method: 'POST' }).then(() =>
                        load()
                      )
                    }
                    className="mt-3 text-xs px-3 py-1.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30"
                  >
                    Retry calendar sync
                  </button>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <SyncBadge label="Calendar" status={req.graphSyncStatus} error={req.graphSyncError} />
                <span>Attempting to create event…</span>
              </div>
            )}
          </div>
        )}

        {/* Cancel */}
        {((isOwner && (req.status === 'PENDING_INTAKE' || req.status === 'PENDING' || req.status === 'PENDING_APPROVAL')) ||
          (canApprove &&
            (req.status === 'PENDING_INTAKE' ||
              req.status === 'PENDING' ||
              req.status === 'PENDING_APPROVAL' ||
              req.status === 'APPROVED'))) && (
          <div>
            <button
              type="button"
              onClick={cancel}
              disabled={acting !== null}
              className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-semibold hover:bg-slate-600 disabled:opacity-50"
            >
              {acting === 'cancel' ? 'Cancelling…' : 'Cancel request'}
            </button>
          </div>
        )}

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

      <aside className="space-y-4">
        <div className="rounded-lg border border-white/10 bg-white/5 p-5">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">How this works</h3>
          <ol className="space-y-3 text-sm text-slate-300">
            <li><span className="text-cyan-400 font-semibold">1.</span> Employee submits a PTO request.</li>
            <li><span className="text-cyan-400 font-semibold">2.</span> HR intake collects context: current balance (from Gusto), history, coverage.</li>
            <li><span className="text-cyan-400 font-semibold">3.</span> Final approver reviews everything and approves or denies.</li>
            <li><span className="text-cyan-400 font-semibold">4.</span> Approved → calendar event + employee invite automatically. HR then manually enters the PTO in Gusto and marks it recorded here.</li>
          </ol>
        </div>
        <div>
          <Link href="/admin/pto" className="text-sm text-cyan-400 hover:text-cyan-300">
            ← Back to time off
          </Link>
        </div>
      </aside>
    </div>
  )
}

function IntakeField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-slate-100 whitespace-pre-wrap text-sm mt-0.5">{value}</p>
    </div>
  )
}
