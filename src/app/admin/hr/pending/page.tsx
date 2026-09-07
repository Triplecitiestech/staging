'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AdminHeader from '@/components/admin/AdminHeader'
import type { PendingAction, PendingActionsReport } from '@/lib/hr/pending-actions'

interface ApiPayload extends PendingActionsReport {
  success: true
  tableMissing?: boolean
  limits: {
    readOnly: boolean
    scope: string
    cannotDetermine: string
  }
}

const KIND_LABEL: Record<PendingAction['kind'], string> = {
  pending_deletion: 'Deletion armed',
  wedged_running: 'Stuck',
  never_started: 'Never started',
  armed_scheduled: 'Waiting for its date',
  unknown_status: 'Unknown status',
}

// Palette per docs/UI_STANDARDS.md + CLAUDE.md: no yellow/amber/gold/orange.
const SEVERITY_STYLE: Record<
  PendingAction['severity'],
  { chip: string; card: string; label: string }
> = {
  critical: {
    chip: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    card: 'border-rose-500/40 bg-rose-950/30',
    label: 'Needs attention',
  },
  warning: {
    chip: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
    card: 'border-violet-500/30 bg-violet-950/20',
    label: 'Worth a look',
  },
  info: {
    chip: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    card: 'border-white/10 bg-slate-800/40',
    label: 'Healthy',
  },
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'critical' | 'warning' | 'neutral'
}) {
  const valueTone =
    tone === 'critical'
      ? 'text-rose-300'
      : tone === 'warning'
        ? 'text-violet-300'
        : 'text-slate-200'
  return (
    <div className="rounded-lg border border-white/10 bg-slate-800/40 p-4">
      <div className={`text-2xl font-semibold ${valueTone}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-400">{label}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="truncate text-sm text-slate-200">{children}</div>
    </div>
  )
}

function CancelDeletionButton({
  action,
  onCancelled,
}: {
  action: PendingAction
  onCancelled: (requestId: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cancel() {
    if (
      !confirm(
        `Cancel the scheduled deletion of ${action.subject ?? 'this account'}?\n\n` +
          `It is armed for ${action.scheduledDeletionDate}. Cancelling means the account will NOT be deleted. ` +
          `The offboarding itself still stands.`
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/hr/cancel-deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: action.requestId }),
      })
      const json = await res.json()
      if (!res.ok || json?.success !== true) {
        setError(json?.error ?? `Failed (${res.status})`)
        return
      }
      onCancelled(action.requestId)
    } catch (err) {
      setError((err as Error)?.message ?? 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 border-t border-white/5 pt-3">
      <button
        onClick={cancel}
        disabled={busy}
        className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
      >
        {busy ? 'Cancelling…' : 'Cancel this deletion'}
      </button>
      <p className="mt-2 text-xs text-slate-500">
        Stops the account from being deleted. Does not undo the offboarding. Recorded against
        your name.
      </p>
      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
    </div>
  )
}

function ActionCard({
  action,
  onCancelled,
}: {
  action: PendingAction
  onCancelled: (requestId: string) => void
}) {
  const style = SEVERITY_STYLE[action.severity]
  const overdue = action.daysUntilEffective !== null && action.daysUntilEffective < 0

  return (
    <div className={`rounded-xl border p-4 md:p-5 ${style.card}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${style.chip}`}
            >
              {KIND_LABEL[action.kind]}
            </span>
            <span className="rounded-full border border-white/10 bg-slate-900/60 px-2 py-0.5 text-xs text-slate-400">
              {action.type}
            </span>
            {action.wasFutureDated && (
              <span className="rounded-full border border-white/10 bg-slate-900/60 px-2 py-0.5 text-xs text-slate-400">
                future-dated
              </span>
            )}
          </div>
          <h3 className="mt-2 truncate text-base font-semibold text-white">
            {action.subject ?? 'Unknown subject'}
          </h3>
          <p className="text-sm text-slate-400">{action.companySlug ?? 'unknown company'}</p>
        </div>

        {action.autotaskTicketUrl ? (
          <a
            href={action.autotaskTicketUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-300 transition-colors hover:bg-cyan-500/20"
          >
            {action.autotaskTicketNumber ?? 'Open ticket'} →
          </a>
        ) : (
          <span className="shrink-0 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300">
            No Autotask ticket
          </span>
        )}
      </div>

      <p className="mt-3 text-sm text-slate-300">{action.finding}</p>
      <p className="mt-2 text-sm text-slate-400">{action.consequence}</p>

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/5 pt-3 md:grid-cols-4">
        <Field label="Status">
          <code className="text-xs">{action.status || '(empty)'}</code>
        </Field>
        <Field label={action.type === 'onboarding' ? 'Start date' : 'Last day'}>
          {action.effectiveDate ?? '—'}
          {overdue && (
            <span className="ml-1 text-xs text-rose-300">
              ({Math.abs(action.daysUntilEffective as number)}d ago)
            </span>
          )}
        </Field>
        <Field label="Deletion date">
          {action.scheduledDeletionDate ? (
            <span className="text-rose-300">{action.scheduledDeletionDate}</span>
          ) : (
            '—'
          )}
        </Field>
        <Field label="Entra object id">
          {action.entraObjectId ? (
            <code className="text-xs">{action.entraObjectId}</code>
          ) : (
            <span className="text-slate-500">none resolved</span>
          )}
        </Field>
        <Field label="Submitted by">{action.submittedBy ?? '—'}</Field>
        {action.impersonatedBy && (
          <Field label="Impersonated by">{action.impersonatedBy}</Field>
        )}
        <Field label="Created">{action.createdAt.slice(0, 10)}</Field>
        <Field label="Request id">
          <code className="text-xs">{action.requestId.slice(0, 8)}</code>
        </Field>
      </div>

      {action.errorMessage && (
        <p className="mt-3 rounded-lg border border-rose-500/20 bg-rose-950/30 p-2 text-xs text-rose-200">
          {action.errorMessage}
        </p>
      )}

      {action.kind === 'pending_deletion' && (
        <CancelDeletionButton action={action} onCancelled={onCancelled} />
      )}
    </div>
  )
}

export default function HrPendingPage() {
  const [data, setData] = useState<ApiPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/admin/hr/pending-actions', {
          signal: controller.signal,
        })
        const json = await res.json()
        if (!res.ok || json?.success !== true) {
          setError(json?.error ?? `Request failed (${res.status})`)
          setData(null)
        } else {
          setData(json as ApiPayload)
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return
        setError((err as Error)?.message ?? 'Could not load HR requests')
        setData(null)
      } finally {
        setLoading(false)
      }
    }

    load()
    return () => controller.abort()
  }, [])

  // Drop the cancelled row locally rather than refetching: the server has
  // already confirmed the write, and a silent refetch failure would leave a
  // cancelled deletion still rendered as armed.
  function handleCancelled(requestId: string) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            actions: prev.actions.filter((a) => a.requestId !== requestId),
            summary: {
              ...prev.summary,
              pendingDeletions: Math.max(0, prev.summary.pendingDeletions - 1),
            },
          }
        : prev
    )
  }

  const summary = data?.summary

  return (
    <div className="min-h-screen bg-slate-900">
      <AdminHeader />

      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Link href="/admin" className="text-slate-400 transition-colors hover:text-white">
            Dashboard
          </Link>
          <span className="text-slate-600">/</span>
          <Link
            href="/admin/hr/flow"
            className="text-slate-400 transition-colors hover:text-white"
          >
            HR Automation
          </Link>
          <span className="text-slate-600">/</span>
          <span className="text-slate-200">Pending Actions</span>
        </nav>

        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-white md:text-3xl">
            HR Pending Actions
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Onboarding and offboarding requests that never finished, plus any account
            deletion still armed on a 30-day hold. This page is{' '}
            <strong className="text-slate-300">read-only</strong> — it reports what the
            platform recorded and changes nothing.
          </p>
        </header>

        {loading && (
          <div className="rounded-xl border border-white/10 bg-slate-800/40 p-6 text-slate-400">
            Loading HR requests…
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-5">
            <h2 className="font-semibold text-rose-200">Could not load HR requests</h2>
            <p className="mt-1 text-sm text-rose-300">{error}</p>
            <p className="mt-2 text-sm text-slate-400">
              This is an error, not an empty result. Do not read it as “nothing pending”.
            </p>
          </div>
        )}

        {data?.tableMissing && (
          <div className="mb-6 rounded-xl border border-violet-500/40 bg-violet-950/20 p-5">
            <h2 className="font-semibold text-violet-200">No HR tables in this environment</h2>
            <p className="mt-1 text-sm text-slate-300">
              <code className="text-xs">hr_requests</code> does not exist here, so nothing
              could be read. This is not evidence that nothing is pending.
            </p>
          </div>
        )}

        {summary && !data?.tableMissing && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              <StatTile
                label="Deletions armed"
                value={summary.pendingDeletions}
                tone={summary.pendingDeletions > 0 ? 'critical' : 'neutral'}
              />
              <StatTile
                label="Due within 7 days"
                value={summary.pendingDeletionsUrgent}
                tone={summary.pendingDeletionsUrgent > 0 ? 'critical' : 'neutral'}
              />
              <StatTile
                label="Stuck requests"
                value={summary.wedged}
                tone={summary.wedged > 0 ? 'warning' : 'neutral'}
              />
              <StatTile
                label="Never started"
                value={summary.neverStarted}
                tone={summary.neverStarted > 0 ? 'critical' : 'neutral'}
              />
              <StatTile
                label="Waiting for date"
                value={summary.armedScheduled}
                tone="neutral"
              />
            </div>

            <p className="mb-6 text-xs text-slate-500">
              Examined {summary.examined} request{summary.examined === 1 ? '' : 's'} · dates
              evaluated against {data.today} Eastern · {data.limits.cannotDetermine}
            </p>

            {data.actions.length === 0 ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-6">
                <h2 className="font-semibold text-emerald-200">Nothing pending</h2>
                <p className="mt-1 text-sm text-slate-300">
                  Every HR request in scope reached a terminal status and no account
                  deletion is armed. {summary.examined} request
                  {summary.examined === 1 ? '' : 's'} were read to establish this.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {data.actions.map((action) => (
                  <ActionCard
                    key={action.requestId}
                    action={action}
                    onCancelled={handleCancelled}
                  />
                ))}
              </div>
            )}
          </>
        )}

        <div className="mt-8 border-t border-white/10 pt-5">
          <Link
            href="/admin/hr/flow"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-slate-800/50 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700/50 hover:text-white"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to HR Automation flow
          </Link>
        </div>
      </main>
    </div>
  )
}
