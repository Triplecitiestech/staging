'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import type { CachedSnapshot } from '@/lib/cfo/build'
import { useDemoMode } from '@/components/admin/DemoModeProvider'
import { applyCfoDemo } from '@/lib/cfo/demo'
import CfoSimulator from './CfoSimulator'
import CfoAccordion, { type Tone, type AccordionRow } from './CfoAccordion'

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

// Visual treatment for the Recommended actions cards (severity → label, tints).
// Compliant with the forbidden-color rule (no yellow/amber/orange).
const SEVERITY_META: Record<string, { label: string; tint: string; bar: string; pill: string }> = {
  red:    { label: 'Urgent',      tint: 'border-red-500/30 bg-red-500/5',         bar: 'bg-red-500',     pill: 'bg-red-500/20 text-red-200' },
  yellow: { label: 'Recommended', tint: 'border-rose-500/30 bg-rose-500/5',       bar: 'bg-rose-500',    pill: 'bg-rose-500/20 text-rose-200' },
  green:  { label: 'Quick win',   tint: 'border-emerald-500/30 bg-emerald-500/5', bar: 'bg-emerald-500', pill: 'bg-emerald-500/20 text-emerald-200' },
  gray:   { label: 'Note',        tint: 'border-slate-500/30 bg-slate-500/5',     bar: 'bg-slate-500',   pill: 'bg-slate-500/20 text-slate-200' },
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
  const total = rows.reduce((s, r) => s + r.amountCents, 0)
  const accRows: AccordionRow[] = rows.map((r, i) => ({
    id: `${r.label}-${i}`,
    rank: `#${i + 1}`,
    label: cap(r.label),
    badge: { label: `${Math.round(r.pct * 100)}%`, tone: 'slate' },
    value: usd(r.amountCents),
    bar: { pct: r.pct * 100, tone: 'cyan' },
    details: [
      { label: 'Amount', value: usd(r.amountCents) },
      { label: 'Share of total', value: `${Math.round(r.pct * 100)}%` },
      { label: 'Window total', value: usd(total) },
    ],
  }))
  return <CfoAccordion rows={accRows} empty={empty} />
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

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

      {/* Recommended actions — placed first so they're the headline item */}
      {d.actions.length > 0 && (
        <div>
          <SectionTitle>Recommended actions</SectionTitle>
          <div className="space-y-3">
            {d.actions.map((a, i) => {
              const sev = SEVERITY_META[a.severity] ?? SEVERITY_META.gray
              return (
                <div key={i} className={`relative overflow-hidden rounded-xl border ${sev.tint}`}>
                  <div className={`absolute inset-y-0 left-0 w-1 ${sev.bar}`} />
                  <div className="flex gap-4 p-5 pl-6">
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${sev.pill} text-sm font-bold`}>
                      {a.priority}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-white">{a.title}</h3>
                        <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sev.pill}`}>
                          {sev.label}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-300">{a.why}</p>
                      <div className="mt-3 rounded-md border border-cyan-500/20 bg-cyan-500/5 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Do this</p>
                        <p className="mt-1 text-sm text-slate-100">{a.action}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
            <div className="mt-4">
              <CfoAccordion
                empty="No upcoming outflows."
                rows={d.opsForecast.expectedOut.map((o, i) => ({
                  id: `out-${i}`,
                  badge: { label: cap(o.cadence), tone: 'slate' },
                  label: o.name,
                  value: usd(o.avgAmountCents),
                  details: [
                    { label: 'Cadence', value: cap(o.cadence) },
                    { label: 'Next expected', value: shortDate(o.nextExpectedDate) },
                    { label: 'Amount', value: usd(o.avgAmountCents) },
                  ],
                }))}
              />
            </div>
          )}
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
          <BarList empty="No operations spend in window." rows={d.opsBreakdown.byCategory.map((c) => ({ label: c.category, amountCents: c.amountCents, pct: c.pct }))} />
        </div>
        <div>
          <SectionTitle>Operations spend by destination (90d)</SectionTitle>
          <BarList empty="No operations spend in window." rows={d.opsBreakdown.byDestination.map((c) => ({ label: c.name, amountCents: c.amountCents, pct: c.pct }))} />
        </div>
      </div>

      {/* Recurring obligations */}
      <div>
        <SectionTitle>Upcoming recurring obligations</SectionTitle>
        <CfoAccordion
          empty="No recurring obligations detected."
          rows={d.obligations.slice(0, 15).map((o, i) => ({
            id: `obl-${i}`,
            badge: { label: cap(o.cadence), tone: 'slate' },
            label: o.destName,
            sublabel: o.podName,
            value: usd(o.avgAmountCents),
            details: [
              { label: 'Pod', value: o.podName },
              { label: 'Cadence', value: cap(o.cadence) },
              { label: 'Next', value: shortDate(o.nextExpectedDate) },
              { label: 'Amount', value: usd(o.avgAmountCents) },
              { label: 'Annualized', value: usd(o.annualizedCents) },
            ],
          }))}
        />
      </div>

      {/* Credit-card earmark */}
      {d.cards.cardCount > 0 && (
        <div>
          <SectionTitle>Credit-card set-aside</SectionTitle>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi label="Total set aside" value={usd(d.cards.totalSetAsideCents)} sub={`${d.cards.cardCount} card pod${d.cards.cardCount === 1 ? '' : 's'}`} />
            <Kpi label="Funded last month" value={usd(d.cards.lastMonthFundedCents)} />
            <div>
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">Per card</span>
              <CfoAccordion
                empty="No card pods."
                rows={d.cards.cards.map((c, i) => ({
                  id: `card-${i}`,
                  label: c.name,
                  value: usd(c.balanceCents),
                  details: [{ label: 'Balance', value: usd(c.balanceCents) }],
                }))}
              />
            </div>
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
            <div>
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">Top destinations (90d)</span>
              <BarList empty="—" rows={d.ownerPay.topDestinations.map((t) => ({ label: t.name, amountCents: t.amountCents, pct: t.pct }))} />
            </div>
            <div>
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">By category (90d)</span>
              <BarList empty="—" rows={d.ownerPay.byCategory.map((c) => ({ label: c.category, amountCents: c.amountCents, pct: c.pct }))} />
            </div>
            <div>
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">Recurring</span>
              <CfoAccordion
                empty="None detected."
                rows={d.ownerPay.recurring.map((r, i) => ({
                  id: `opr-${i}`,
                  badge: { label: cap(r.cadence), tone: 'slate' },
                  label: r.name,
                  value: usd(r.avgAmountCents),
                  details: [
                    { label: 'Cadence', value: cap(r.cadence) },
                    { label: 'Avg amount', value: usd(r.avgAmountCents) },
                  ],
                }))}
              />
            </div>
          </div>
        </div>
      )}

      {/* Income distribution */}
      {d.incomeSplit && d.incomeSplit.podRatios.length > 0 && (
        <div>
          <SectionTitle>Income distribution across pods ({d.incomeSplit.lookbackDays}d)</SectionTitle>
          <BarList empty="—" rows={d.incomeSplit.podRatios.map((p) => ({ label: p.podName ?? '—', amountCents: p.totalCents, pct: p.ratioPct }))} />
          {!d.incomeSplit.sampleSizeAdequate && <p className="mt-3 text-xs text-slate-500">Small sample — ratios may not be representative yet.</p>}
        </div>
      )}

      {/* Per-pod anomalies */}
      {d.anomalies.length > 0 && (
        <div>
          <SectionTitle>Spending anomalies (weekly spikes)</SectionTitle>
          <CfoAccordion
            empty="No anomalies detected."
            rows={d.anomalies.slice(0, 12).map((a, i) => {
              const tone: Tone = a.ratio >= 3 ? 'red' : a.ratio >= 2 ? 'rose' : 'slate'
              return {
                id: `anom-${i}`,
                badge: { label: `${a.ratio.toFixed(1)}×`, tone },
                label: a.driverName,
                sublabel: a.podName,
                value: usd(a.sumCents),
                valueTone: 'rose',
                dot: tone,
                details: [
                  { label: 'Pod', value: a.podName },
                  { label: 'Week', value: a.week },
                  { label: 'Driver', value: a.driverName },
                  { label: 'Spent', value: usd(a.sumCents) },
                  { label: 'vs baseline', value: `${a.ratio.toFixed(1)}×`, tone: 'rose' },
                ],
              }
            })}
          />
        </div>
      )}

      {/* Year-over-year by destination */}
      {d.yoy.length > 0 && (
        <div>
          <SectionTitle>Year-over-year spend by destination</SectionTitle>
          <CfoAccordion
            empty="No year-over-year data."
            rows={d.yoy.map((y, i) => {
              const change = y.prior > 0 ? (y.current - y.prior) / y.prior : null
              const tone: Tone = change == null ? 'slate' : change > 0 ? 'rose' : 'emerald'
              const changeLabel = change == null ? '—' : `${change > 0 ? '+' : ''}${Math.round(change * 100)}%`
              return {
                id: `yoy-${i}`,
                badge: { label: changeLabel, tone },
                label: y.name ?? '—',
                value: usd(y.current),
                dot: tone,
                details: [
                  { label: 'Last 12mo', value: usd(y.current) },
                  { label: 'Prior 12mo', value: usd(y.prior) },
                  { label: 'Change', value: changeLabel, tone },
                ],
              }
            })}
          />
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
          <div className="mt-4">
            <CfoAccordion
              empty="No debts configured."
              rows={d.debts.all.map((dt, i) => {
                const apr = dt.aprPct ?? 0
                const tone: Tone = apr >= 20 ? 'red' : apr >= 10 ? 'rose' : 'slate'
                return {
                  id: `debt-${i}`,
                  badge: { label: cap(dt.kind ?? 'business'), tone: 'violet' },
                  label: dt.name,
                  value: usd(dt.balanceCents),
                  dot: tone,
                  details: [
                    { label: 'Kind', value: cap(dt.kind ?? 'business') },
                    { label: 'Balance', value: usd(dt.balanceCents) },
                    { label: 'APR', value: `${dt.aprPct}%${dt.aprIsEstimate ? '*' : ''}`, tone },
                    { label: 'Min/mo', value: usd(dt.minPaymentCents) },
                    { label: 'Interest/mo', value: usd(dt.monthlyInterestCents), tone: 'rose' },
                    { label: 'Payoff', value: dt.minMonths == null ? '∞' : `${dt.minMonths} mo` },
                  ],
                }
              })}
            />
            <p className="mt-2 text-xs text-slate-500">* APR is an estimate — confirm against the statement in Settings.</p>
          </div>

          {d.debts.business && (
            <div className="mt-4">
              <p className="mb-2 text-sm text-slate-300">
                Business avalanche order (highest APR first):{' '}
                <span className="text-white">{d.debts.business.avalancheOrder.join(' → ')}</span>
              </p>
              <div>
                <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">Business paydown scenarios (avalanche)</span>
                <CfoAccordion
                  rows={([
                    ['Minimums only', d.debts.business.scenarios.minOnly],
                    ['+$500', d.debts.business.scenarios.plus500],
                    ['+$1,000', d.debts.business.scenarios.plus1000],
                    ['+$2,000', d.debts.business.scenarios.plus2000],
                  ] as const).map(([label, s], i) => ({
                    id: `scen-${i}`,
                    label,
                    value: `${s.months} mo`,
                    details: [
                      { label: 'Months to zero', value: `${s.months}` },
                      { label: 'Total interest', value: usd(s.totalInterestCents), tone: 'rose' },
                    ],
                  }))}
                />
              </div>
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
            <div className="mt-4">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">Aging buckets</span>
              {(() => {
                const order = ['Current', '1 - 30 days past due', '31 - 60 days past due', '61 - 90 days past due', '91 or more days past due']
                const tones: Record<string, Tone> = {
                  'Current': 'emerald', '1 - 30 days past due': 'cyan',
                  '31 - 60 days past due': 'blue', '61 - 90 days past due': 'rose',
                  '91 or more days past due': 'red',
                }
                const buckets = d.ar!.bucketTotalsCents!
                const total = Object.values(buckets).reduce((s, v) => s + v, 0)
                const max = Math.max(...Object.values(buckets), 1)
                const keys = order.filter((k) => buckets[k]).concat(Object.keys(buckets).filter((k) => !order.includes(k)))
                return (
                  <CfoAccordion
                    rows={keys.map((k) => {
                      const tone = tones[k] ?? 'slate'
                      return {
                        id: `bucket-${k}`,
                        label: k,
                        value: usd(buckets[k]),
                        valueTone: tone,
                        bar: { pct: (buckets[k] / max) * 100, tone },
                        details: [
                          { label: 'Amount', value: usd(buckets[k]), tone },
                          { label: 'Share of open', value: total > 0 ? `${Math.round((buckets[k] / total) * 100)}%` : '—' },
                        ],
                      }
                    })}
                  />
                )
              })()}
            </div>
          )}
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">Top customers by balance</span>
              <CfoAccordion
                empty="No open balances."
                rows={d.ar.topCustomers.slice(0, 8).map((c, i) => ({
                  id: `arc-${i}`,
                  rank: `#${i + 1}`,
                  label: c.name,
                  value: usd(c.totalCents),
                  details: [{ label: 'Open balance', value: usd(c.totalCents) }],
                }))}
              />
            </div>
            <div>
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">Stale (91+ days) — chase these</span>
              <CfoAccordion
                empty="Nothing 91+ days past due."
                rows={d.ar.staleCustomers.slice(0, 8).map((c, i) => ({
                  id: `ars-${i}`,
                  badge: { label: '91+', tone: 'red' },
                  label: c.name,
                  value: usd(c.atRiskCents),
                  valueTone: 'rose',
                  dot: 'red',
                  details: [{ label: 'At risk', value: usd(c.atRiskCents), tone: 'rose' }],
                }))}
              />
            </div>
          </div>
        </div>
      )}

      {/* Sequence automation rules health */}
      {d.rules.length > 0 && (
        <div>
          <SectionTitle>Sequence automation rules ({d.rules.length})</SectionTitle>
          <CfoAccordion
            empty="No automation rules."
            rows={d.rules.map((r) => {
              const active = r.status === 'ACTIVE' || r.status === 'ENABLED'
              return {
                id: r.id,
                badge: { label: active ? 'On' : 'Off', tone: active ? 'emerald' : 'slate' },
                label: r.name,
                dot: r.isSupported === false ? 'rose' : active ? 'emerald' : 'slate',
                details: [
                  { label: 'Status', value: r.status ?? 'unknown', tone: active ? 'emerald' : 'slate' },
                  { label: 'Supported', value: r.isSupported === false ? 'No' : 'Yes', tone: r.isSupported === false ? 'rose' : 'emerald' },
                ],
              }
            })}
          />
        </div>
      )}

      {/* Uncategorized spend — drives the category editor */}
      {d.activityByDest.some((a) => !a.categorized) && (
        <div>
          <SectionTitle>Top uncategorized destinations</SectionTitle>
          <p className="mb-3 text-xs text-slate-400">
            Tag these in <Link href="/admin/cfo/settings" className="text-cyan-300 hover:text-cyan-200">Settings</Link> so they roll into the right category.
          </p>
          <CfoAccordion
            empty="Everything is categorized."
            rows={d.activityByDest.filter((a) => !a.categorized).slice(0, 10).map((a, i) => ({
              id: `uncat-${i}`,
              label: a.name,
              sublabel: `${a.transferCount}×`,
              value: usd(a.totalCents),
              details: [
                { label: 'Total', value: usd(a.totalCents) },
                { label: 'Transfers', value: `${a.transferCount}` },
              ],
            }))}
          />
        </div>
      )}

      <p className="pt-4 text-center text-xs text-slate-500">
        Questions about this dashboard or a data issue?{' '}
        <a href="mailto:info@triplecitiestech.com" className="text-cyan-400 hover:text-cyan-300">Contact support</a>.
      </p>
    </div>
  )
}
