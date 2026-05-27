'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { DebtsConfig, CategoryMap, QbSnapshot, ArSnapshot, ScheduledOutflow, ScheduledOutflowCategory } from '@/lib/cfo/types'

const OUTFLOW_CATEGORIES: ScheduledOutflowCategory[] = ['payroll', 'subcontractor', 'vendor', 'tax', 'other']

function newId() {
  // Browser crypto.randomUUID() exists in modern browsers; fall back to a
  // short random for older ones — uniqueness is local-to-the-list.
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `s-${Math.random().toString(36).slice(2, 10)}`
}

const CATEGORY_OPTIONS = ['', 'credit-card', 'payroll', 'loan', 'tax', 'insurance', 'vendor', 'personal', 'transfer-out', 'other']

interface QbStatus {
  configured: boolean
  connected: boolean
  realmId?: string
  env?: string
  connectedAt?: string
  accessTokenValid?: boolean
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-white/10 bg-white/5 p-5">{children}</div>
}

export default function CfoSettingsClient() {
  const qbParam = useSearchParams().get('qb')

  const [qb, setQb] = useState<QbStatus | null>(null)
  const [debtsText, setDebtsText] = useState('')
  const [categories, setCategories] = useState<CategoryMap>({})
  const [loading, setLoading] = useState(true)
  const [debtsMsg, setDebtsMsg] = useState<string | null>(null)
  const [catMsg, setCatMsg] = useState<string | null>(null)
  const [qbSnapText, setQbSnapText] = useState('')
  const [arSnapText, setArSnapText] = useState('')
  const [qbSnapMsg, setQbSnapMsg] = useState<string | null>(null)
  const [arSnapMsg, setArSnapMsg] = useState<string | null>(null)
  const [scheduled, setScheduled] = useState<ScheduledOutflow[]>([])
  const [scheduledMsg, setScheduledMsg] = useState<string | null>(null)

  const loadStatus = useCallback((signal?: AbortSignal) => {
    return fetch('/api/admin/cfo/qb/status', { signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setQb(d))
      .catch((e) => { if (!(e instanceof DOMException && e.name === 'AbortError')) {/* leave null */} })
  }, [])

  useEffect(() => {
    const c = new AbortController()
    Promise.all([
      loadStatus(c.signal),
      fetch('/api/admin/cfo/config', { signal: c.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { debts: DebtsConfig; categories: CategoryMap; qbSnapshot: QbSnapshot | null; arSnapshot: ArSnapshot | null; scheduledOutflows?: { items: ScheduledOutflow[] } } | null) => {
          if (!d) return
          setDebtsText(JSON.stringify(d.debts, null, 2))
          setCategories(d.categories || {})
          setQbSnapText(d.qbSnapshot ? JSON.stringify(d.qbSnapshot, null, 2) : '')
          setArSnapText(d.arSnapshot ? JSON.stringify(d.arSnapshot, null, 2) : '')
          setScheduled(d.scheduledOutflows?.items ?? [])
        })
        .catch((e) => { if (!(e instanceof DOMException && e.name === 'AbortError')) {/* ignore */} }),
    ]).finally(() => setLoading(false))
    return () => c.abort()
  }, [loadStatus])

  const disconnectQb = useCallback(async () => {
    await fetch('/api/admin/cfo/qb/disconnect', { method: 'POST' })
    await loadStatus()
  }, [loadStatus])

  const saveDebts = useCallback(async () => {
    setDebtsMsg(null)
    let parsed: DebtsConfig
    try {
      parsed = JSON.parse(debtsText)
    } catch {
      setDebtsMsg('Invalid JSON — check syntax.')
      return
    }
    const res = await fetch('/api/admin/cfo/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ debts: parsed }),
    })
    setDebtsMsg(res.ok ? 'Saved.' : (await res.json().catch(() => ({})))?.error || 'Save failed.')
  }, [debtsText])

  const saveCategories = useCallback(async () => {
    setCatMsg(null)
    const res = await fetch('/api/admin/cfo/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories }),
    })
    setCatMsg(res.ok ? 'Saved.' : 'Save failed.')
  }, [categories])

  const saveScheduled = useCallback(async () => {
    setScheduledMsg(null)
    const cleaned = scheduled.filter((s) => s.label.trim() && s.date && Number.isFinite(s.amountCents))
    const res = await fetch('/api/admin/cfo/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledOutflows: { items: cleaned } }),
    })
    setScheduledMsg(res.ok ? 'Saved. Refresh the dashboard to apply.' : (await res.json().catch(() => ({})))?.error || 'Save failed.')
  }, [scheduled])

  const saveSnapshot = useCallback(async (kind: 'qbSnapshot' | 'arSnapshot', text: string, setMsg: (m: string) => void) => {
    setMsg('')
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { setMsg('Invalid JSON — check syntax.'); return }
    const res = await fetch('/api/admin/cfo/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [kind]: parsed }),
    })
    setMsg(res.ok ? 'Saved. Refresh the dashboard to apply.' : (await res.json().catch(() => ({})))?.error || 'Save failed.')
  }, [])

  if (loading) {
    return <div className="h-40 animate-pulse rounded-xl border border-white/10 bg-white/5" />
  }

  const banner = qbParam && {
    connected: ['QuickBooks connected.', 'text-emerald-300'],
    error: ['QuickBooks connection failed. Try again.', 'text-red-300'],
    csrf: ['QuickBooks connection blocked (state mismatch). Try again.', 'text-red-300'],
    not_configured: ['QuickBooks app keys not configured (set QB_CLIENT_ID / QB_CLIENT_SECRET).', 'text-rose-300'],
  }[qbParam]

  return (
    <div className="space-y-8">
      {banner && <p className={`text-sm ${banner[1]}`}>{banner[0]}</p>}

      {/* QuickBooks */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">QuickBooks Online</h2>
        <Card>
          {!qb?.configured ? (
            <p className="text-sm text-rose-300">
              App keys not configured. Set <code className="text-slate-300">QB_CLIENT_ID</code> and{' '}
              <code className="text-slate-300">QB_CLIENT_SECRET</code> (and <code className="text-slate-300">ENCRYPTION_MASTER_KEY_V1</code>) in Vercel.
            </p>
          ) : qb.connected ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <p className="text-emerald-300">Connected · realm {qb.realmId} · {qb.env}</p>
                <p className="text-slate-400">
                  Since {qb.connectedAt ? new Date(qb.connectedAt).toLocaleDateString() : '—'} ·
                  access token {qb.accessTokenValid ? 'valid' : 'will refresh on next use'}
                </p>
              </div>
              <button onClick={disconnectQb} className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/20">
                Disconnect
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-400">Not connected. Live balance sheet, P&amp;L, and AR aging will use stored snapshots until you connect.</p>
              <a href="/api/admin/cfo/qb/connect" className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-300 hover:bg-cyan-500/20">
                Connect QuickBooks
              </a>
            </div>
          )}
        </Card>
      </section>

      {/* Scheduled outflows — known upcoming payments (next payroll, subcontractor invoices, etc.) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">Scheduled outflows</h2>
        <Card>
          <p className="mb-3 text-xs text-slate-400">
            Enter known upcoming payments — next payroll, subcontractor invoices, one-off bills.
            The dashboard uses these for the 30-day forecast and the &quot;Covers payroll + Amex&quot;
            card, falling back to the rolling baseline when none are set.
          </p>
          {scheduled.length === 0 ? (
            <p className="text-sm text-slate-400">No scheduled outflows yet.</p>
          ) : (
            <div className="space-y-2">
              {scheduled.map((s, i) => (
                <div key={s.id} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="date"
                    value={s.date}
                    onChange={(e) => setScheduled((prev) => prev.map((x, j) => j === i ? { ...x, date: e.target.value } : x))}
                    className="col-span-3 rounded-md border border-white/10 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-200 focus:border-cyan-500/40 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Label (e.g. Payroll 5/24, James King invoice)"
                    value={s.label}
                    onChange={(e) => setScheduled((prev) => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                    className="col-span-4 rounded-md border border-white/10 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-200 focus:border-cyan-500/40 focus:outline-none"
                  />
                  <div className="col-span-2 flex items-center gap-1">
                    <span className="text-sm text-slate-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={s.amountCents ? (s.amountCents / 100).toFixed(2) : ''}
                      onChange={(e) => {
                        const dollars = parseFloat(e.target.value)
                        const cents = Number.isFinite(dollars) ? Math.round(dollars * 100) : 0
                        setScheduled((prev) => prev.map((x, j) => j === i ? { ...x, amountCents: cents } : x))
                      }}
                      className="w-full rounded-md border border-white/10 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-200 focus:border-cyan-500/40 focus:outline-none"
                    />
                  </div>
                  <select
                    value={s.category ?? 'other'}
                    onChange={(e) => setScheduled((prev) => prev.map((x, j) => j === i ? { ...x, category: e.target.value as ScheduledOutflowCategory } : x))}
                    className="col-span-2 rounded-md border border-white/10 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-200 focus:border-cyan-500/40 focus:outline-none"
                  >
                    {OUTFLOW_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setScheduled((prev) => prev.filter((_, j) => j !== i))}
                    className="col-span-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-sm text-red-300 hover:bg-red-500/20"
                    aria-label="Delete row"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setScheduled((prev) => [...prev, { id: newId(), date: new Date().toISOString().slice(0, 10), label: '', amountCents: 0, category: 'payroll' }])}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10"
            >
              + Add scheduled outflow
            </button>
            <button onClick={saveScheduled} className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-300 hover:bg-cyan-500/20">
              Save scheduled outflows
            </button>
            {scheduledMsg && <span className="text-sm text-slate-300">{scheduledMsg}</span>}
          </div>
        </Card>
      </section>

      {/* Debts */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">Debts</h2>
        <Card>
          <p className="mb-2 text-xs text-slate-400">
            JSON list of debts. Amounts are in cents. Fields: <code>name</code>, <code>kind</code> (business|personal),
            <code> balanceCents</code>, <code>aprPct</code>, <code>minPaymentCents</code>, optional <code>paidFromPod</code>, <code>note</code>.
          </p>
          <textarea
            value={debtsText}
            onChange={(e) => setDebtsText(e.target.value)}
            spellCheck={false}
            className="h-72 w-full rounded-lg border border-white/10 bg-slate-950/60 p-3 font-mono text-xs text-slate-200 focus:border-cyan-500/40 focus:outline-none"
          />
          <div className="mt-3 flex items-center gap-3">
            <button onClick={saveDebts} className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-300 hover:bg-cyan-500/20">
              Save debts
            </button>
            {debtsMsg && <span className="text-sm text-slate-300">{debtsMsg}</span>}
          </div>
        </Card>
      </section>

      {/* QuickBooks / AR snapshots (fallback used until QuickBooks is connected) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">QuickBooks &amp; AR snapshots</h2>
        <Card>
          <p className="mb-3 text-xs text-slate-400">
            Used as a fallback until QuickBooks is connected (once connected, live data overrides these).
            Paste the contents of <code>qb-snapshot.json</code> and <code>ar-snapshot.json</code> from your local project.
            These populate the QuickBooks panel, AR aging, and the what-if simulator.
          </p>
          <label className="text-xs font-medium uppercase tracking-wide text-slate-400">QuickBooks snapshot (qb-snapshot.json)</label>
          <textarea
            value={qbSnapText}
            onChange={(e) => setQbSnapText(e.target.value)}
            spellCheck={false}
            placeholder="{ ... contents of qb-snapshot.json ... }"
            className="mt-1 h-48 w-full rounded-lg border border-white/10 bg-slate-950/60 p-3 font-mono text-xs text-slate-200 focus:border-cyan-500/40 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-3">
            <button onClick={() => saveSnapshot('qbSnapshot', qbSnapText, setQbSnapMsg)} className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-300 hover:bg-cyan-500/20">
              Save QuickBooks snapshot
            </button>
            {qbSnapMsg && <span className="text-sm text-slate-300">{qbSnapMsg}</span>}
          </div>

          <label className="mt-5 block text-xs font-medium uppercase tracking-wide text-slate-400">AR aging snapshot (ar-snapshot.json)</label>
          <textarea
            value={arSnapText}
            onChange={(e) => setArSnapText(e.target.value)}
            spellCheck={false}
            placeholder="{ ... contents of ar-snapshot.json ... }"
            className="mt-1 h-48 w-full rounded-lg border border-white/10 bg-slate-950/60 p-3 font-mono text-xs text-slate-200 focus:border-cyan-500/40 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-3">
            <button onClick={() => saveSnapshot('arSnapshot', arSnapText, setArSnapMsg)} className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-300 hover:bg-cyan-500/20">
              Save AR snapshot
            </button>
            {arSnapMsg && <span className="text-sm text-slate-300">{arSnapMsg}</span>}
          </div>
        </Card>
      </section>

      {/* Categories */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">Destination categories</h2>
        <Card>
          {Object.keys(categories).length === 0 ? (
            <p className="text-sm text-slate-400">No destinations yet — they populate after the first dashboard build.</p>
          ) : (
            <>
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {Object.keys(categories).sort().map((name) => (
                  <div key={name} className="flex items-center gap-3">
                    <span className="flex-1 truncate text-sm text-slate-300" title={name}>{name}</span>
                    <select
                      value={categories[name] || ''}
                      onChange={(e) => setCategories((prev) => ({ ...prev, [name]: e.target.value }))}
                      className="rounded-md border border-white/10 bg-slate-950/60 px-2 py-1 text-sm text-slate-200 focus:border-cyan-500/40 focus:outline-none"
                    >
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c} value={c}>{c || '— untagged —'}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button onClick={saveCategories} className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-300 hover:bg-cyan-500/20">
                  Save categories
                </button>
                {catMsg && <span className="text-sm text-slate-300">{catMsg}</span>}
              </div>
            </>
          )}
        </Card>
      </section>
    </div>
  )
}
