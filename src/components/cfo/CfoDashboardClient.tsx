'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import type { CachedSnapshot } from '@/lib/cfo/build'

// ─── formatting ─────────────────────────────────────────────────────────────

function usd(cents: number | null | undefined, opts: { cents?: boolean } = {}): string {
  const dollars = (cents ?? 0) / 100
  return dollars.toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    maximumFractionDigits: opts.cents ? 2 : 0,
  })
}

type Status = 'green' | 'yellow' | 'red'
// Avoids forbidden yellow/amber/orange — caution maps to rose, danger to red.
const STATUS_CLASSES: Record<Status, string> = {
  green: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  yellow: 'text-rose-300 border-rose-500/30 bg-rose-500/10',
  red: 'text-red-300 border-red-500/30 bg-red-500/10',
}
const STATUS_DOT: Record<Status, string> = {
  green: 'bg-emerald-400', yellow: 'bg-rose-400', red: 'bg-red-400',
}

// ─── primitives ─────────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-white/10 bg-white/5 p-5 ${className}`}>{children}</div>
}

function Kpi({ label, value, sub, status }: { label: string; value: string; sub?: string; status?: Status }) {
  return (
    <Card className={status ? STATUS_CLASSES[status] : ''}>
      <div className="flex items-center gap-2">
        {status && <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />}
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </Card>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">{children}</h2>
}

// ─── main ─────────────────────────────────────────────────────────────────

export default function CfoDashboardClient() {
  const [snapshot, setSnapshot] = useState<CachedSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback((signal?: AbortSignal) => {
    setError(null)
    return fetch('/api/admin/cfo/data', { signal })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`)
        return res.json() as Promise<CachedSnapshot>
      })
      .then((data) => setSnapshot(data))
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Failed to load')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetch('/api/admin/cfo/rebuild', { method: 'POST' })
      await load()
    } finally {
      setRefreshing(false)
    }
  }, [load])

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-white/10 bg-white/5" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-red-500/30 bg-red-500/10">
        <p className="font-medium text-red-300">Couldn&apos;t load the dashboard</p>
        <p className="mt-1 text-sm text-red-200/80">{error}</p>
        <button onClick={() => load()} className="mt-3 rounded-md bg-red-500/20 px-3 py-1.5 text-sm text-red-100 hover:bg-red-500/30">
          Retry
        </button>
      </Card>
    )
  }

  if (!snapshot) return null
  const d = snapshot.data
  const m = d.monthly
  const chartData = d.monthlyPL.map((p) => ({
    label: p.label,
    income: Math.round(p.incomeCents / 100),
    outflow: Math.round(p.outflowCents / 100),
    net: Math.round(p.netCents / 100),
  }))

  return (
    <div className="space-y-8">
      {/* Refresh bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-400">
          Refreshed {d.refreshedAt} · {d.meta.accountCount} accounts · {d.meta.transferCount24mo.toLocaleString()} transfers (24mo)
          {d.meta.qbSource === 'none' && ' · QuickBooks not connected'}
        </p>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50"
        >
          {refreshing ? 'Refreshing…' : 'Refresh data'}
        </button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi
          label="Total cash on hand"
          value={usd(d.totalCashCents)}
          sub="Across all pods + income source"
        />
        <Kpi
          label={`Covers payroll + Amex (${m.monthLabel})`}
          value={usd(m.coverage.cushionCents)}
          status={m.coverage.status as Status}
          sub={`${usd(m.coverage.availableCents)} available vs ${usd(m.coverage.remainingObligationsCents)} remaining`}
        />
        <Kpi
          label={`Projected month P&L`}
          value={usd(m.pl.projectedNetCents)}
          status={m.pl.status as Status}
          sub={`In ${usd(m.pl.projectedInCents)} − Out ${usd(m.pl.projectedOutCents)}`}
        />
        {d.runway && (
          <Kpi
            label="Operations runway"
            value={d.runway.daysOfRunway != null ? `${d.runway.daysOfRunway} days` : '—'}
            sub={`${usd(d.runway.currentBalanceCents)} bal · ${usd(d.runway.dailyOutCents)}/day out`}
          />
        )}
        <Kpi
          label="Net flow (30 days)"
          value={usd(d.netFlow.netCents)}
          sub={`In ${usd(d.netFlow.inflowCents)} · Out ${usd(d.netFlow.outflowCents)}`}
        />
        {d.pace && (
          <Kpi
            label="Monthly spend pace"
            value={d.pace.paceRatio != null ? `${Math.round(d.pace.paceRatio * 100)}%` : '—'}
            sub={`Projected month-end out ${usd(d.pace.projectedMonthEndCents)} vs typical ${usd(d.pace.typicalMonthlyCents)}`}
          />
        )}
      </div>

      {/* Action items */}
      {d.actions.length > 0 && (
        <div>
          <SectionTitle>Recommended actions</SectionTitle>
          <div className="space-y-3">
            {d.actions.map((a, i) => (
              <Card key={i} className={STATUS_CLASSES[(a.severity === 'gray' ? 'green' : a.severity) as Status] ?? ''}>
                <p className="font-semibold text-white">{a.title}</p>
                <p className="mt-1 text-sm text-slate-300">{a.why}</p>
                <p className="mt-2 text-sm text-slate-200"><span className="font-medium text-cyan-300">Do:</span> {a.action}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 12-month P&L */}
      <div>
        <SectionTitle>12-month income vs outflow</SectionTitle>
        <Card>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }}
                  formatter={(value) => `$${Number(value).toLocaleString()}`}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="Income" fill="#34d399" radius={[3, 3, 0, 0]} />
                <Bar dataKey="outflow" name="Outflow" fill="#f87171" radius={[3, 3, 0, 0]} />
                <Line dataKey="net" name="Net" stroke="#22d3ee" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Operations breakdown + obligations */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Operations spend by category (90d)</SectionTitle>
          <Card>
            {d.opsBreakdown.byCategory.length === 0 ? (
              <p className="text-sm text-slate-400">No operations spend in window.</p>
            ) : (
              <ul className="space-y-2">
                {d.opsBreakdown.byCategory.map((c) => (
                  <li key={c.category}>
                    <div className="flex justify-between text-sm">
                      <span className="capitalize text-slate-200">{c.category}</span>
                      <span className="text-slate-300">{usd(c.amountCents)} · {Math.round(c.pct * 100)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-white/5">
                      <div className="h-1.5 rounded-full bg-cyan-400/70" style={{ width: `${Math.min(100, c.pct * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div>
          <SectionTitle>Upcoming recurring obligations</SectionTitle>
          <Card>
            {d.obligations.length === 0 ? (
              <p className="text-sm text-slate-400">No recurring obligations detected.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-slate-500">
                      <th className="pb-2 pr-3">Destination</th>
                      <th className="pb-2 pr-3">Pod</th>
                      <th className="pb-2 pr-3">Cadence</th>
                      <th className="pb-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {d.obligations.slice(0, 10).map((o, i) => (
                      <tr key={i} className="border-t border-white/5">
                        <td className="py-2 pr-3 truncate max-w-[180px]">{o.destName}</td>
                        <td className="py-2 pr-3 text-slate-400">{o.podName}</td>
                        <td className="py-2 pr-3 capitalize text-slate-400">{o.cadence}</td>
                        <td className="py-2 text-right">{usd(o.avgAmountCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Debts (when configured) */}
      {d.debts && (
        <div>
          <SectionTitle>Debt overview</SectionTitle>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Kpi label="Combined balance" value={usd(d.debts.combinedTotalBalanceCents)} />
            <Kpi label="Monthly interest" value={usd(d.debts.combinedMonthlyInterestCents)} />
            <Kpi label="Annual interest burden" value={usd(d.debts.combinedAnnualInterestCents)} />
          </div>
          {d.debts.business && (
            <Card className="mt-4">
              <p className="text-sm text-slate-300">
                Business avalanche order (highest APR first):{' '}
                <span className="text-white">{d.debts.business.avalancheOrder.join(' → ')}</span>
              </p>
            </Card>
          )}
        </div>
      )}

      {/* AR (when snapshot present) */}
      {d.ar && (
        <div>
          <SectionTitle>Accounts receivable (as of {d.ar.asOfDate ?? '—'})</SectionTitle>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Kpi label="Total open" value={usd(d.ar.totalOpenCents)} sub={`${d.ar.invoiceCount ?? 0} invoices`} />
            <Kpi label="Likely collectable" value={usd(d.ar.likelyCollectableCents)} status="green" />
            <Kpi label="At risk (91+ days)" value={usd(d.ar.atRiskCents)} status={d.ar.atRiskCents > 0 ? 'yellow' : 'green'} />
          </div>
        </div>
      )}
    </div>
  )
}
