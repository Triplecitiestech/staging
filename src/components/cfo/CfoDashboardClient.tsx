'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import type { CachedSnapshot } from '@/lib/cfo/build'
import { useDemoMode } from '@/components/admin/DemoModeProvider'
import { applyCfoDemo } from '@/lib/cfo/demo'
import CfoSimulator from './CfoSimulator'

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

function BarList({ rows, empty }: { rows: { label: string; amountCents: number; pct: number }[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-slate-400">{empty}</p>
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <li key={i}>
          <div className="flex justify-between text-sm">
            <span className="truncate pr-2 capitalize text-slate-200" title={r.label}>{r.label}</span>
            <span className="whitespace-nowrap text-slate-300">{usd(r.amountCents)} · {Math.round(r.pct * 100)}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-white/5">
            <div className="h-1.5 rounded-full bg-cyan-400/70" style={{ width: `${Math.min(100, r.pct * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

// ─── main ─────────────────────────────────────────────────────────────────

export default function CfoDashboardClient() {
  const demo = useDemoMode()
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
  const d = applyCfoDemo(snapshot.data, demo)
  const m = d.monthly
  const chartData = d.monthlyPL.map((p) => ({
    label: p.label,
    income: Math.round(p.incomeCents / 100),
    outflow: Math.round(p.outflowCents / 100),
    net: Math.round(p.netCents / 100),
  }))

  return (
    <div className="space-y-8">
      {/* Print-only header (hidden on screen) */}
      <div className="hidden print:block print:mb-6">
        <h1 className="text-2xl font-bold text-black">Triple Cities Tech — CFO Dashboard</h1>
        <p className="text-sm text-slate-700">Refreshed {d.refreshedAt}{demo.active ? ' · Demo mode (values anonymized)' : ''}</p>
      </div>

      {/* Refresh / Print / Settings bar — hidden in print */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-xs text-slate-400">
          Refreshed {d.refreshedAt} · {d.meta.accountCount} accounts · {d.meta.transferCount24mo.toLocaleString()} transfers (24mo)
          {d.meta.qbSource === 'none' && ' · QuickBooks not connected'}
          {demo.active && <span className="ml-2 rounded bg-rose-500/20 px-1.5 py-0.5 text-rose-300">Demo mode</span>}
        </p>
        <div className="flex items-center gap-2">
          <Link href="/admin/cfo/settings" className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10">
            Settings
          </Link>
          <button
            onClick={() => window.print()}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10"
          >
            Print PDF
          </button>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : 'Refresh data'}
          </button>
        </div>
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

      {/* Operations 30-day forecast */}
      {d.opsForecast && (
        <div>
          <SectionTitle>Operations 30-day forecast</SectionTitle>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Kpi label="Projected balance" value={usd(d.opsForecast.projectedBalanceCents)} status={d.opsForecast.status as Status} sub={`From ${usd(d.opsForecast.currentBalanceCents)} today`} />
            <Kpi label="Expected inflows" value={usd(d.opsForecast.expectedInCents)} />
            <Kpi label="Expected outflows" value={usd(d.opsForecast.expectedOutCents)} />
          </div>
          {d.opsForecast.expectedOut.length > 0 && (
            <Card className="mt-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-slate-500">
                      <th className="pb-2 pr-3">Upcoming outflow</th>
                      <th className="pb-2 pr-3">Cadence</th>
                      <th className="pb-2 pr-3">Next</th>
                      <th className="pb-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {d.opsForecast.expectedOut.map((o, i) => (
                      <tr key={i} className="border-t border-white/5">
                        <td className="max-w-[200px] truncate py-2 pr-3">{o.name}</td>
                        <td className="py-2 pr-3 capitalize text-slate-400">{o.cadence}</td>
                        <td className="py-2 pr-3 text-slate-400">{shortDate(o.nextExpectedDate)}</td>
                        <td className="py-2 text-right">{usd(o.avgAmountCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

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

      {/* Operations breakdown — category + destination */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Operations spend by category (90d)</SectionTitle>
          <Card>
            <BarList empty="No operations spend in window." rows={d.opsBreakdown.byCategory.map((c) => ({ label: c.category, amountCents: c.amountCents, pct: c.pct }))} />
          </Card>
        </div>
        <div>
          <SectionTitle>Operations spend by destination (90d)</SectionTitle>
          <Card>
            <BarList empty="No operations spend in window." rows={d.opsBreakdown.byDestination.map((c) => ({ label: c.name, amountCents: c.amountCents, pct: c.pct }))} />
          </Card>
        </div>
      </div>

      {/* Recurring obligations */}
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
                    <th className="pb-2 pr-3">Next</th>
                    <th className="pb-2 text-right">Amount</th>
                    <th className="pb-2 text-right">Annualized</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {d.obligations.slice(0, 15).map((o, i) => (
                    <tr key={i} className="border-t border-white/5">
                      <td className="max-w-[180px] truncate py-2 pr-3">{o.destName}</td>
                      <td className="py-2 pr-3 text-slate-400">{o.podName}</td>
                      <td className="py-2 pr-3 capitalize text-slate-400">{o.cadence}</td>
                      <td className="py-2 pr-3 text-slate-400">{shortDate(o.nextExpectedDate)}</td>
                      <td className="py-2 text-right">{usd(o.avgAmountCents)}</td>
                      <td className="py-2 text-right text-slate-400">{usd(o.annualizedCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Credit-card earmark */}
      {d.cards.cardCount > 0 && (
        <div>
          <SectionTitle>Credit-card set-aside</SectionTitle>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi label="Total set aside" value={usd(d.cards.totalSetAsideCents)} sub={`${d.cards.cardCount} card pod${d.cards.cardCount === 1 ? '' : 's'}`} />
            <Kpi label="Funded last month" value={usd(d.cards.lastMonthFundedCents)} />
            <Card>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Per card</span>
              <ul className="mt-2 space-y-1 text-sm">
                {d.cards.cards.map((c, i) => (
                  <li key={i} className="flex justify-between"><span className="truncate pr-2 text-slate-300">{c.name}</span><span className="text-slate-200">{usd(c.balanceCents)}</span></li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}

      {/* Owner's Pay */}
      {d.ownerPay && (
        <div>
          <SectionTitle>Owner&apos;s Pay</SectionTitle>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Kpi label="Current balance" value={usd(d.ownerPay.currentBalanceCents)} />
            <Kpi label="Net flow (30d)" value={usd(d.ownerPay.netFlow30dCents)} status={d.ownerPay.netFlow30dCents >= 0 ? 'green' : 'yellow'} sub={`In ${usd(d.ownerPay.in30Cents)} · Out ${usd(d.ownerPay.out30Cents)}`} />
            <Kpi label="Spend (90d)" value={usd(d.ownerPay.total90Cents)} />
          </div>
          <Card className="mt-4">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Monthly in / out (12 months)</span>
            <div className="mt-2 h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={d.ownerPay.monthlyTrend.map((p) => ({ label: p.label, in: Math.round(p.inCents / 100), out: Math.round(p.outCents / 100), net: Math.round(p.netCents / 100) }))} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }} formatter={(value) => `$${Number(value).toLocaleString()}`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="in" name="In" fill="#34d399" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="out" name="Out" fill="#f87171" radius={[3, 3, 0, 0]} />
                  <Line dataKey="net" name="Net" stroke="#22d3ee" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Top destinations (90d)</span>
              <div className="mt-2"><BarList empty="—" rows={d.ownerPay.topDestinations.map((t) => ({ label: t.name, amountCents: t.amountCents, pct: t.pct }))} /></div>
            </Card>
            <Card>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">By category (90d)</span>
              <div className="mt-2"><BarList empty="—" rows={d.ownerPay.byCategory.map((c) => ({ label: c.category, amountCents: c.amountCents, pct: c.pct }))} /></div>
            </Card>
            <Card>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Recurring</span>
              <ul className="mt-2 space-y-1 text-sm">
                {d.ownerPay.recurring.length === 0 ? <li className="text-slate-400">None detected.</li> : d.ownerPay.recurring.map((r, i) => (
                  <li key={i} className="flex justify-between"><span className="truncate pr-2 text-slate-300">{r.name} <span className="text-slate-500">· {r.cadence}</span></span><span className="text-slate-200">{usd(r.avgAmountCents)}</span></li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}

      {/* Income distribution */}
      {d.incomeSplit && d.incomeSplit.podRatios.length > 0 && (
        <div>
          <SectionTitle>Income distribution across pods ({d.incomeSplit.lookbackDays}d)</SectionTitle>
          <Card>
            <BarList empty="—" rows={d.incomeSplit.podRatios.map((p) => ({ label: p.podName ?? '—', amountCents: p.totalCents, pct: p.ratioPct }))} />
            {!d.incomeSplit.sampleSizeAdequate && <p className="mt-3 text-xs text-slate-500">Small sample — ratios may not be representative yet.</p>}
          </Card>
        </div>
      )}

      {/* Per-pod anomalies */}
      {d.anomalies.length > 0 && (
        <div>
          <SectionTitle>Spending anomalies (weekly spikes)</SectionTitle>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="pb-2 pr-3">Pod</th>
                    <th className="pb-2 pr-3">Week</th>
                    <th className="pb-2 pr-3">Driver</th>
                    <th className="pb-2 text-right">Spent</th>
                    <th className="pb-2 text-right">vs baseline</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {d.anomalies.slice(0, 12).map((a, i) => (
                    <tr key={i} className="border-t border-white/5">
                      <td className="py-2 pr-3">{a.podName}</td>
                      <td className="py-2 pr-3 text-slate-400">{a.week}</td>
                      <td className="max-w-[180px] truncate py-2 pr-3 text-slate-400">{a.driverName}</td>
                      <td className="py-2 text-right">{usd(a.sumCents)}</td>
                      <td className="py-2 text-right text-rose-300">{a.ratio.toFixed(1)}×</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Year-over-year by destination */}
      {d.yoy.length > 0 && (
        <div>
          <SectionTitle>Year-over-year spend by destination</SectionTitle>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="pb-2 pr-3">Destination</th>
                    <th className="pb-2 text-right">Last 12mo</th>
                    <th className="pb-2 text-right">Prior 12mo</th>
                    <th className="pb-2 text-right">Change</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {d.yoy.map((y, i) => {
                    const change = y.prior > 0 ? (y.current - y.prior) / y.prior : null
                    return (
                      <tr key={i} className="border-t border-white/5">
                        <td className="max-w-[200px] truncate py-2 pr-3">{y.name ?? '—'}</td>
                        <td className="py-2 text-right">{usd(y.current)}</td>
                        <td className="py-2 text-right text-slate-400">{usd(y.prior)}</td>
                        <td className={`py-2 text-right ${change == null ? 'text-slate-500' : change > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                          {change == null ? '—' : `${change > 0 ? '+' : ''}${Math.round(change * 100)}%`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Debts (when configured) */}
      {d.debts && (
        <div>
          <SectionTitle>Debt overview</SectionTitle>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Kpi label="Combined balance" value={usd(d.debts.combinedTotalBalanceCents)} />
            <Kpi label="Monthly interest" value={usd(d.debts.combinedMonthlyInterestCents)} />
            <Kpi label="Annual interest burden" value={usd(d.debts.combinedAnnualInterestCents)} />
          </div>
          <Card className="mt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="pb-2 pr-3">Debt</th>
                    <th className="pb-2 pr-3">Kind</th>
                    <th className="pb-2 text-right">Balance</th>
                    <th className="pb-2 text-right">APR</th>
                    <th className="pb-2 text-right">Min/mo</th>
                    <th className="pb-2 text-right">Interest/mo</th>
                    <th className="pb-2 text-right">Payoff</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {d.debts.all.map((dt, i) => (
                    <tr key={i} className="border-t border-white/5">
                      <td className="max-w-[200px] truncate py-2 pr-3">{dt.name}</td>
                      <td className="py-2 pr-3 capitalize text-slate-400">{dt.kind ?? 'business'}</td>
                      <td className="py-2 text-right">{usd(dt.balanceCents)}</td>
                      <td className="py-2 text-right text-slate-400">{dt.aprPct}%{dt.aprIsEstimate ? '*' : ''}</td>
                      <td className="py-2 text-right">{usd(dt.minPaymentCents)}</td>
                      <td className="py-2 text-right text-rose-300">{usd(dt.monthlyInterestCents)}</td>
                      <td className="py-2 text-right text-slate-400">{dt.minMonths == null ? '∞' : `${dt.minMonths} mo`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">* APR is an estimate — confirm against the statement in Settings.</p>
          </Card>

          {d.debts.business && (
            <div className="mt-4">
              <p className="mb-2 text-sm text-slate-300">
                Business avalanche order (highest APR first):{' '}
                <span className="text-white">{d.debts.business.avalancheOrder.join(' → ')}</span>
              </p>
              <Card>
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Business paydown scenarios (avalanche)</span>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-slate-500">
                        <th className="pb-2 pr-3">Extra/mo</th>
                        <th className="pb-2 text-right">Months to zero</th>
                        <th className="pb-2 text-right">Total interest</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-200">
                      {([
                        ['Minimums only', d.debts.business.scenarios.minOnly],
                        ['+$500', d.debts.business.scenarios.plus500],
                        ['+$1,000', d.debts.business.scenarios.plus1000],
                        ['+$2,000', d.debts.business.scenarios.plus2000],
                      ] as const).map(([label, s], i) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="py-2 pr-3">{label}</td>
                          <td className="py-2 text-right">{s.months}</td>
                          <td className="py-2 text-right text-slate-400">{usd(s.totalInterestCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {d.debts.personal && (
            <p className="mt-6 text-sm text-slate-300">
              Personal debt · <span className="text-white">{usd(d.debts.personal.totalBalanceCents)}</span> balance ·{' '}
              {usd(d.debts.personal.totalMonthlyInterestCents)}/mo interest
              <span className="text-slate-500"> (low-APR personal debt — early payoff is rarely the best use of cash)</span>
            </p>
          )}
        </div>
      )}

      {/* What-if simulator */}
      {d.debts?.business && d.debts.business.debts.length > 0 && d.ar && (
        <div>
          <SectionTitle>What-if · collect AR, pay off debt</SectionTitle>
          <CfoSimulator
            businessDebts={d.debts.business.debts}
            incomeSplit={d.incomeSplit}
            maxCollectCents={d.ar.likelyCollectableCents}
          />
        </div>
      )}

      {/* QuickBooks financials (live or snapshot) */}
      {d.qb && (
        <div>
          <SectionTitle>
            QuickBooks {d.qb.periodLabel ? `· ${d.qb.periodLabel}` : ''}
            <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400 ring-1 ring-white/10">
              {d.meta.qbSource === 'live' ? 'live' : 'snapshot'}
            </span>
          </SectionTitle>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Net income (period)" value={usd(d.qb.pl?.netIncomeCents)} status={(d.qb.pl?.netIncomeCents ?? 0) >= 0 ? 'green' : 'red'} sub={d.qb.pl?.avgMonthlyNetCents != null ? `${usd(d.qb.pl.avgMonthlyNetCents)}/mo avg` : undefined} />
            <Kpi label="Gross margin" value={d.qb.pl?.grossMarginPct != null ? `${Math.round(d.qb.pl.grossMarginPct * 100)}%` : '—'} sub={`Gross ${usd(d.qb.pl?.grossProfitCents)}`} />
            <Kpi label="Total liabilities" value={usd(d.qb.balanceSheet?.totalLiabilitiesCents)} />
            <Kpi label="Total equity" value={usd(d.qb.balanceSheet?.totalEquityCents)} />
          </div>
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
          {d.ar.bucketTotalsCents && Object.keys(d.ar.bucketTotalsCents).length > 0 && (
            <Card className="mt-4">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Aging buckets</span>
              <ul className="mt-3 space-y-2">
                {(() => {
                  const order = ['Current', '1 - 30 days past due', '31 - 60 days past due', '61 - 90 days past due', '91 or more days past due']
                  const colors: Record<string, string> = {
                    'Current': 'bg-emerald-400', '1 - 30 days past due': 'bg-cyan-400',
                    '31 - 60 days past due': 'bg-blue-400', '61 - 90 days past due': 'bg-rose-400',
                    '91 or more days past due': 'bg-red-500',
                  }
                  const buckets = d.ar!.bucketTotalsCents!
                  const max = Math.max(...Object.values(buckets), 1)
                  const keys = order.filter((k) => buckets[k]).concat(Object.keys(buckets).filter((k) => !order.includes(k)))
                  return keys.map((k) => (
                    <li key={k}>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-300">{k}</span>
                        <span className="text-slate-200">{usd(buckets[k])}</span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-white/5">
                        <div className={`h-2 rounded-full ${colors[k] ?? 'bg-slate-400'}`} style={{ width: `${(buckets[k] / max) * 100}%` }} />
                      </div>
                    </li>
                  ))
                })()}
              </ul>
            </Card>
          )}
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Top customers by balance</span>
              <ul className="mt-2 space-y-1 text-sm">
                {d.ar.topCustomers.slice(0, 8).map((c, i) => (
                  <li key={i} className="flex justify-between"><span className="truncate pr-2 text-slate-300">{c.name}</span><span className="text-slate-200">{usd(c.totalCents)}</span></li>
                ))}
              </ul>
            </Card>
            <Card>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Stale (91+ days) — chase these</span>
              {d.ar.staleCustomers.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">Nothing 91+ days past due.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {d.ar.staleCustomers.slice(0, 8).map((c, i) => (
                    <li key={i} className="flex justify-between"><span className="truncate pr-2 text-slate-300">{c.name}</span><span className="text-rose-300">{usd(c.atRiskCents)}</span></li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Sequence automation rules health */}
      {d.rules.length > 0 && (
        <div>
          <SectionTitle>Sequence automation rules ({d.rules.length})</SectionTitle>
          <Card>
            <ul className="space-y-1 text-sm">
              {d.rules.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span className="truncate pr-2 text-slate-300">{r.name}</span>
                  <span className={`whitespace-nowrap text-xs ${r.status === 'ACTIVE' || r.status === 'ENABLED' ? 'text-emerald-300' : 'text-slate-400'}`}>
                    {r.status ?? 'unknown'}{r.isSupported === false ? ' · unsupported' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {/* Uncategorized spend — drives the category editor */}
      {d.activityByDest.some((a) => !a.categorized) && (
        <div>
          <SectionTitle>Top uncategorized destinations</SectionTitle>
          <Card>
            <p className="mb-3 text-xs text-slate-400">
              Tag these in <Link href="/admin/cfo/settings" className="text-cyan-300 hover:text-cyan-200">Settings</Link> so they roll into the right category.
            </p>
            <ul className="space-y-1 text-sm">
              {d.activityByDest.filter((a) => !a.categorized).slice(0, 10).map((a, i) => (
                <li key={i} className="flex justify-between">
                  <span className="truncate pr-2 text-slate-300">{a.name} <span className="text-slate-500">· {a.transferCount}×</span></span>
                  <span className="text-slate-200">{usd(a.totalCents)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <p className="pt-4 text-center text-xs text-slate-500">
        Questions about this dashboard or a data issue?{' '}
        <a href="mailto:info@triplecitiestech.com" className="text-cyan-400 hover:text-cyan-300">Contact support</a>.
      </p>
    </div>
  )
}
