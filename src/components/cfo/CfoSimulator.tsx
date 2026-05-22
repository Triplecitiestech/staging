'use client'

import { useMemo, useState } from 'react'

// What-if simulator: collect AR → Sequence rules split it across pods →
// pay down business debt within debt-paying pods → show interest/time saved.
// Ported from the standalone tool's renderSimulator + client script.

interface SimDebt {
  name: string
  paidFromPod?: string
  balanceCents: number
  aprPct: number
  minPaymentCents: number
}
interface PodRatio { podName?: string | null; ratioPct: number }
export interface SimulatorProps {
  businessDebts: SimDebt[]
  incomeSplit: { sampleSizeAdequate: boolean; lookbackDays: number; podRatios: PodRatio[] } | null
  maxCollectCents: number
}

const fmt = (c: number): string => {
  const d = Math.abs(c) / 100
  const sign = c < 0 ? '-' : ''
  return d >= 1000 ? `${sign}$${Math.round(d).toLocaleString('en-US')}` : `${sign}$${d.toFixed(0)}`
}
const monthsLabel = (m: number): string =>
  !isFinite(m) ? '∞' : m >= 240 ? '20+ yrs' : m >= 12 ? `${(m / 12).toFixed(1)} yrs` : `${m} mo`

type Ordering = (state: SimDebt[]) => SimDebt[]
function orderingForStrategy(strategy: string): Ordering {
  if (strategy === 'snowball') return (s) => [...s].sort((a, b) => a.balanceCents - b.balanceCents)
  if (strategy.startsWith('specific:')) {
    const name = strategy.slice(9)
    return (s) => {
      const first = s.find((d) => d.name === name)
      return first ? [first, ...s.filter((d) => d.name !== name)] : s
    }
  }
  return (s) => [...s].sort((a, b) => b.aprPct - a.aprPct)
}

function podBudgets(collectCents: number, debts: SimDebt[], split: SimulatorProps['incomeSplit']) {
  const budgets: Record<string, number> = {}
  if (!split || !split.sampleSizeAdequate) {
    budgets['Operations'] = collectCents
    return budgets
  }
  for (const r of split.podRatios) {
    if (!r.podName) continue
    const amt = Math.round(collectCents * r.ratioPct)
    if (debts.some((d) => d.paidFromPod === r.podName)) budgets[r.podName] = (budgets[r.podName] || 0) + amt
  }
  return budgets
}

function applyBudgets(budgets: Record<string, number>, strategy: string, debts: SimDebt[]) {
  const out = debts.map((d) => ({ ...d, appliedCents: 0 }))
  const ordering = orderingForStrategy(strategy)
  for (const [podName, podBudget] of Object.entries(budgets)) {
    let remaining = podBudget
    const ordered = ordering(out.filter((d) => d.paidFromPod === podName)) as (SimDebt & { appliedCents: number })[]
    for (const d of ordered) {
      if (remaining <= 0) break
      const apply = Math.min(remaining, d.balanceCents - d.appliedCents)
      if (apply > 0) { d.appliedCents += apply; remaining -= apply }
    }
  }
  return out
}

function simulateFull(debts: { balanceCents: number; aprPct: number; minPaymentCents: number; appliedCents?: number }[]) {
  const state = debts.map((d) => ({ ...d, balanceCents: Math.max(0, d.balanceCents - (d.appliedCents || 0)) }))
  let months = 0
  let totalInt = 0
  while (state.some((d) => d.balanceCents > 0) && months < 600) {
    months++
    for (const d of state) {
      if (d.balanceCents > 0) {
        const interest = d.balanceCents * (d.aprPct / 100) / 12
        d.balanceCents += interest
        totalInt += interest
        d.balanceCents -= Math.min(d.minPaymentCents, d.balanceCents)
      }
    }
  }
  return { months, totalInterestCents: Math.round(totalInt) }
}

export default function CfoSimulator({ businessDebts, incomeSplit, maxCollectCents }: SimulatorProps) {
  const [collect, setCollect] = useState(Math.min(maxCollectCents, 1_500_000))
  const [strategy, setStrategy] = useState('avalanche')

  const sim = useMemo(() => {
    const beforeBalance = businessDebts.reduce((s, d) => s + d.balanceCents, 0)
    const beforeMonthlyInterest = businessDebts.reduce((s, d) => s + d.balanceCents * (d.aprPct / 100) / 12, 0)
    const before = simulateFull(businessDebts.map((d) => ({ ...d, appliedCents: 0 })))

    const budgets = podBudgets(collect, businessDebts, incomeSplit)
    const applied = applyBudgets(budgets, strategy, businessDebts)
    const totalApplied = applied.reduce((s, d) => s + d.appliedCents, 0)
    const afterBalance = beforeBalance - totalApplied
    const afterMonthlyInterest = applied.reduce((s, d) => s + Math.max(0, d.balanceCents - d.appliedCents) * (d.aprPct / 100) / 12, 0)
    const after = simulateFull(applied)

    const rows = (incomeSplit?.sampleSizeAdequate ? incomeSplit.podRatios : [])
      .map((r) => {
        const amt = Math.round(collect * r.ratioPct)
        const hasDebt = businessDebts.some((d) => d.paidFromPod === r.podName)
        const podApplied = applied.filter((d) => d.paidFromPod === r.podName && d.appliedCents > 0).map((d) => `${d.name} ${fmt(d.appliedCents)}`).join(', ')
        return { pod: r.podName ?? '—', amt, ratio: r.ratioPct, hasDebt, applied: podApplied }
      })
      .filter((r) => r.amt > 0)
      .sort((a, b) => b.amt - a.amt)

    return {
      beforeBalance, beforeMonthlyInterest, before, afterBalance, afterMonthlyInterest, after,
      totalApplied, protectedCents: collect - totalApplied,
      reachedPct: collect > 0 ? Math.round(totalApplied / collect * 100) : 0,
      savedAnnual: Math.round((beforeMonthlyInterest - afterMonthlyInterest) * 12),
      savedTotal: Math.max(0, before.totalInterestCents - after.totalInterestCents),
      savedMonths: isFinite(before.months) && isFinite(after.months) ? before.months - after.months : 0,
      rows,
    }
  }, [collect, strategy, businessDebts, incomeSplit])

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-slate-400">AR to collect</label>
          <input type="range" min={0} max={maxCollectCents} step={50000} value={collect}
            onChange={(e) => setCollect(Number(e.target.value))}
            className="mt-2 w-full accent-cyan-400" />
          <div className="mt-1 text-2xl font-bold text-white">{fmt(collect)}</div>
          <div className="mt-1 text-xs text-slate-500">Max collectable: {fmt(maxCollectCents)} (excludes 91+ stale)</div>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Payoff strategy (within debt-paying pods)</label>
          <select value={strategy} onChange={(e) => setStrategy(e.target.value)}
            className="mt-2 w-full rounded-md border border-white/10 bg-slate-950/60 px-2 py-2 text-sm text-slate-200 focus:border-cyan-500/40 focus:outline-none">
            <option value="avalanche">Avalanche — highest APR first</option>
            <option value="snowball">Snowball — smallest balance first</option>
            {businessDebts.map((d) => (
              <option key={d.name} value={`specific:${d.name}`}>Specific: {d.name}{d.paidFromPod ? ` (from ${d.paidFromPod})` : ''}</option>
            ))}
          </select>
          <p className="mt-2 text-xs text-slate-500">Tax/reserve pods are protected — the simulator never spends them.</p>
        </div>
      </div>

      <p className="mt-4 text-sm text-slate-300">
        {collect === 0 ? 'Slide to see the impact.' : (
          <><strong className="text-white">{fmt(collect)}</strong> collected — <strong className="text-emerald-300">{fmt(sim.totalApplied)}</strong> ({sim.reachedPct}%) reaches business debt, <strong className="text-slate-200">{fmt(sim.protectedCents)}</strong> stays in tax/reserve pods.</>
        )}
      </p>

      {sim.rows.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="pb-2 pr-3">Pod</th>
                <th className="pb-2 pr-3 text-right">Receives</th>
                <th className="pb-2 pr-3 text-right">%</th>
                <th className="pb-2">Applied to debt</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {sim.rows.map((r, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="py-2 pr-3">{r.pod}{!r.hasDebt && <span className="text-slate-500"> (no tracked debt)</span>}</td>
                  <td className="py-2 pr-3 text-right">{fmt(r.amt)}</td>
                  <td className="py-2 pr-3 text-right text-slate-400">{(r.ratio * 100).toFixed(1)}%</td>
                  <td className="py-2 text-xs text-slate-400">{r.applied || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Before</div>
          <div className="mt-1 text-xl font-bold text-white">{fmt(sim.beforeBalance)}</div>
          <div className="text-xs text-slate-500">total business debt</div>
          <div className="mt-2 text-sm text-rose-300">{fmt(Math.round(sim.beforeMonthlyInterest))}/mo interest</div>
          <div className="text-xs text-slate-500">{monthsLabel(sim.before.months)} to clear (minimums)</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">After applying cash</div>
          <div className="mt-1 text-xl font-bold text-white">{fmt(sim.afterBalance)}</div>
          <div className="text-xs text-slate-500">total business debt</div>
          <div className="mt-2 text-sm text-rose-300">{fmt(Math.round(sim.afterMonthlyInterest))}/mo interest</div>
          <div className="text-xs text-slate-500">{monthsLabel(sim.after.months)} to clear (minimums)</div>
        </div>
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="text-xs uppercase tracking-wide text-emerald-300">You save</div>
          <div className="mt-1 text-xl font-bold text-emerald-200">{fmt(sim.savedAnnual)}/yr</div>
          <div className="text-xs text-emerald-300/70">interest</div>
          <div className="mt-2 text-sm text-emerald-200">{fmt(sim.savedTotal)} total</div>
          <div className="text-xs text-emerald-300/70">{sim.savedMonths} mo sooner</div>
        </div>
      </div>
    </div>
  )
}
