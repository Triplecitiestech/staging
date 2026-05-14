'use client'

/**
 * BundleComposer — the operator UI for one Change Bundle.
 *
 * Capabilities depend on bundle.status:
 *   drafted              → add/remove items, open preview, send, cancel
 *   awaiting_customer    → record per-item customer decision, cancel
 *   partially_approved   → record remaining decisions
 *   fully_approved       → (read-only here; deploy lives on the per-change route)
 *   complete / cancelled → fully read-only
 *
 * Every mutation refreshes the page via router.refresh() to re-pull from
 * the server.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Item {
  id: string
  pendingChangeId: string
  actionId: string
  actionName: string
  customerImpactSummary: string
  displayOrder: number
  customerDecision: string | null
  agreedDeploymentDate: string | null
  changeStatus: string
}

interface DraftedOption {
  pendingChangeId: string
  actionId: string
  actionName: string
  customerImpactSummary: string
}

interface Props {
  companyId: string
  bundleId: string
  bundleStatus: string
  customerFacingNotes: string
  items: Item[]
  draftedOptions: DraftedOption[]
}

export default function BundleComposer(props: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isDrafted = props.bundleStatus === 'drafted'
  const isAwaitingResponse =
    props.bundleStatus === 'awaiting_customer' || props.bundleStatus === 'partially_approved'
  const isTerminal = props.bundleStatus === 'complete' || props.bundleStatus === 'cancelled'

  async function call(path: string, init: RequestInit, op: string): Promise<boolean> {
    setBusy(op)
    setError(null)
    try {
      const res = await fetch(path, init)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : `${op} failed (${res.status})`)
        return false
      }
      router.refresh()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
      return false
    } finally {
      setBusy(null)
    }
  }

  async function addItem(pendingChangeId: string) {
    await call(
      `/api/compliance/${props.companyId}/bundles/${props.bundleId}/items`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingChangeId }),
      },
      'add item'
    )
  }

  async function removeItem(pendingChangeId: string) {
    if (!confirm('Remove this change from the bundle?')) return
    await call(
      `/api/compliance/${props.companyId}/bundles/${props.bundleId}/items?pendingChangeId=${encodeURIComponent(pendingChangeId)}`,
      { method: 'DELETE' },
      'remove item'
    )
  }

  async function send(sentVia: 'email' | 'portal' | 'manual', recipientEmail?: string) {
    if (sentVia === 'email' && !recipientEmail) {
      const r = prompt('Recipient email (leave blank to use the primary contact):')
      if (r === null) return
      recipientEmail = r.trim() || undefined
    }
    await call(
      `/api/compliance/${props.companyId}/bundles/${props.bundleId}/send`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentVia, recipientEmail: recipientEmail ?? null }),
      },
      'send'
    )
  }

  async function cancel() {
    const reason = prompt('Cancel reason (optional):') ?? undefined
    if (reason === null) return
    await call(
      `/api/compliance/${props.companyId}/bundles/${props.bundleId}/cancel`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      },
      'cancel'
    )
  }

  async function recordDecision(itemId: string, decision: 'approved' | 'declined' | 'deferred') {
    let agreedDeploymentDate: string | null = null
    let deferredUntil: string | null = null
    if (decision === 'approved') {
      const d = prompt('Agreed deployment date (YYYY-MM-DD):')
      if (!d) return
      agreedDeploymentDate = new Date(d).toISOString()
    } else if (decision === 'deferred') {
      const d = prompt('Defer until (YYYY-MM-DD):')
      if (!d) return
      deferredUntil = new Date(d).toISOString()
    }
    const note = prompt(`Customer note (optional):`) ?? undefined
    await call(
      `/api/compliance/${props.companyId}/bundles/${props.bundleId}/items/${itemId}/decision`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerDecision: decision,
          customerNote: note,
          agreedDeploymentDate,
          deferredUntil,
        }),
      },
      'record decision'
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm">
          {error}
        </div>
      )}

      {/* Action bar */}
      <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/api/compliance/${props.companyId}/bundles/${props.bundleId}/preview`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-2 text-xs font-medium rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20"
        >
          Open preview ↗
        </Link>
        {isDrafted && (
          <>
            <button
              type="button"
              onClick={() => send('email')}
              disabled={busy !== null || props.items.length === 0}
              className="px-3 py-2 text-xs font-medium rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-50"
            >
              Send via Email
            </button>
            <button
              type="button"
              onClick={() => send('portal')}
              disabled={busy !== null || props.items.length === 0}
              className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-700/50 border border-white/10 text-slate-200 hover:bg-slate-700/70 disabled:opacity-50"
            >
              Mark Sent (Portal)
            </button>
            <button
              type="button"
              onClick={() => send('manual')}
              disabled={busy !== null || props.items.length === 0}
              className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-700/50 border border-white/10 text-slate-200 hover:bg-slate-700/70 disabled:opacity-50"
            >
              Mark Sent (Manual)
            </button>
          </>
        )}
        {!isTerminal && (
          <button
            type="button"
            onClick={cancel}
            disabled={busy !== null}
            className="ml-auto px-3 py-2 text-xs font-medium rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
          >
            Cancel bundle
          </button>
        )}
      </div>

      {/* Items */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
          Items ({props.items.length})
        </h2>
        {props.items.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">
            No items yet. Add drafted pending changes below.
          </p>
        ) : (
          <ul className="space-y-2">
            {props.items.map((it) => (
              <li key={it.id} className="bg-slate-800/40 border border-white/5 rounded-lg p-3">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{it.actionName}</p>
                    <p className="text-xs text-slate-500 truncate">
                      Change status: {it.changeStatus.replace(/_/g, ' ')}
                      {it.agreedDeploymentDate && (
                        <span className="ml-2">· deploy {it.agreedDeploymentDate.slice(0, 10)}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {it.customerDecision ? (
                      <span className={`text-[10px] uppercase tracking-wider rounded px-2 py-0.5 border ${
                        it.customerDecision === 'approved'
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                          : it.customerDecision === 'declined'
                            ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                            : 'bg-violet-500/10 text-violet-300 border-violet-500/20'
                      }`}>
                        {it.customerDecision}
                      </span>
                    ) : (
                      isDrafted && (
                        <button
                          type="button"
                          onClick={() => removeItem(it.pendingChangeId)}
                          disabled={busy !== null}
                          className="text-xs text-rose-400 hover:text-rose-300"
                        >
                          remove
                        </button>
                      )
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-400 line-clamp-3">{it.customerImpactSummary}</p>

                {isAwaitingResponse && !it.customerDecision && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => recordDecision(it.id, 'approved')}
                      disabled={busy !== null}
                      className="px-2 py-1 text-[11px] rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20"
                    >
                      Customer approved
                    </button>
                    <button
                      type="button"
                      onClick={() => recordDecision(it.id, 'declined')}
                      disabled={busy !== null}
                      className="px-2 py-1 text-[11px] rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 hover:bg-rose-500/20"
                    >
                      Customer declined
                    </button>
                    <button
                      type="button"
                      onClick={() => recordDecision(it.id, 'deferred')}
                      disabled={busy !== null}
                      className="px-2 py-1 text-[11px] rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-300 hover:bg-violet-500/20"
                    >
                      Defer
                    </button>
                  </div>
                )}

                {it.customerDecision === 'approved' && it.changeStatus === 'scheduled' && (
                  <p className="mt-2 text-[11px] text-slate-400">
                    Deploy this change from <Link href={`/admin/compliance/${props.companyId}/changes`} className="text-cyan-400 hover:text-cyan-300">the change list</Link>.
                    Use <code className="bg-slate-900 px-1 rounded">/communicate</code> + <code className="bg-slate-900 px-1 rounded">/deploy</code> on the pending change endpoint.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Available drafted changes to add */}
      {isDrafted && (
        <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
            Drafted changes ({props.draftedOptions.length} available)
          </h2>
          {props.draftedOptions.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">
              No drafted pending changes available.{' '}
              <Link href={`/admin/compliance/${props.companyId}/findings`} className="text-cyan-400 hover:text-cyan-300 underline">
                Stage some from findings
              </Link>{' '}
              first.
            </p>
          ) : (
            <ul className="space-y-2">
              {props.draftedOptions.map((opt) => (
                <li key={opt.pendingChangeId} className="bg-slate-800/40 border border-white/5 rounded-lg p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{opt.actionName}</p>
                    <p className="text-xs text-slate-400 line-clamp-2">{opt.customerImpactSummary}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => addItem(opt.pendingChangeId)}
                    disabled={busy !== null}
                    className="shrink-0 px-2 py-1 text-[11px] font-medium rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20"
                  >
                    + Add
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
