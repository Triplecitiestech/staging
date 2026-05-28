'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_ASSUMPTIONS, computeUs, computePh,
  type HiringAssumptions, type UsHireInputs, type PhHireInputs, type HiringResult,
} from '@/lib/cfo/hiring'

const usd = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-white/10 bg-white/5 p-5 ${className}`}>{children}</div>
}

// A labeled numeric input. `kind` controls how the stored value maps to display.
function Field({ label, value, onChange, kind = 'number', step, hint }: {
  label: string; value: number; onChange: (v: number) => void
  kind?: 'money' | 'pct' | 'number'; step?: number; hint?: string
}) {
  const display = kind === 'money' ? (value / 100) : value
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-slate-300">{label}{hint && <span className="ml-1 text-slate-500">{hint}</span>}</span>
      <span className="flex items-center gap-1">
        {kind === 'money' && <span className="text-slate-500">$</span>}
        <input
          type="number"
          step={step ?? (kind === 'money' ? 1 : kind === 'pct' ? 0.1 : 1)}
          min={0}
          value={Number.isFinite(display) ? display : ''}
          onChange={(e) => {
            const n = parseFloat(e.target.value)
            const safe = Number.isFinite(n) ? n : 0
            onChange(kind === 'money' ? Math.round(safe * 100) : safe)
          }}
          className="w-28 rounded-md border border-white/10 bg-slate-950/60 px-2 py-1 text-right text-slate-200 focus:border-cyan-500/40 focus:outline-none"
        />
        {kind === 'pct' && <span className="text-slate-500">%</span>}
      </span>
    </label>
  )
}

function ResultPanel({ result, title }: { result: HiringResult; title: string }) {
  return (
    <Card className="border-cyan-500/20 bg-cyan-500/5">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{title}</span>
      <div className="mt-1 text-3xl font-bold text-white">{usd(result.loadedAnnualCents)}<span className="ml-1 text-base font-normal text-slate-400">/yr fully loaded</span></div>
      <div className="mt-1 text-sm text-slate-300">
        {usd(result.loadedMonthlyCents)}/mo · {usd(result.effectiveHourlyCents)}/productive hr · {result.burdenMultiple.toFixed(2)}× base wage
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Base wage</span>
          <span className="text-slate-200">{usd(result.baseAnnualCents)}</span>
        </div>
        {result.lines.map((l, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-slate-400">{l.label}</span>
            <span className="text-slate-300">{usd(l.annualCents)}</span>
          </div>
        ))}
        <div className="mt-2 flex justify-between border-t border-white/10 pt-2 text-sm font-semibold">
          <span className="text-white">Burden total</span>
          <span className="text-rose-300">{usd(result.burdenAnnualCents)}</span>
        </div>
      </div>

      <div className="mt-4 rounded-md border border-white/10 bg-black/20 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Revenue needed to cover</div>
        <div className="mt-1 text-xl font-bold text-white">{usd(result.revenueNeededMonthlyCents)}<span className="ml-1 text-sm font-normal text-slate-400">/mo</span></div>
        <div className="text-xs text-slate-500">{usd(result.revenueNeededAnnualCents)}/yr at your target gross margin</div>
      </div>
    </Card>
  )
}

export default function HiringCalculator() {
  const [a, setA] = useState<HiringAssumptions>(DEFAULT_ASSUMPTIONS)
  const [tab, setTab] = useState<'us' | 'ph'>('us')
  const [monthlyNetCents, setMonthlyNetCents] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  useEffect(() => {
    const c = new AbortController()
    Promise.all([
      fetch('/api/admin/cfo/config', { signal: c.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { hiringAssumptions?: HiringAssumptions } | null) => { if (d?.hiringAssumptions) setA(d.hiringAssumptions) })
        .catch(() => {}),
      fetch('/api/admin/cfo/data', { signal: c.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((snap) => { if (snap?.data?.netFlow) setMonthlyNetCents(snap.data.netFlow.netCents) })
        .catch(() => {}),
    ]).finally(() => setLoaded(true))
    return () => c.abort()
  }, [])

  const usResult = useMemo(() => computeUs(a.us, a.targetGrossMarginPct), [a.us, a.targetGrossMarginPct])
  const phResult = useMemo(() => computePh(a.ph, a.targetGrossMarginPct), [a.ph, a.targetGrossMarginPct])
  const result = tab === 'us' ? usResult : phResult

  const setUs = (patch: Partial<UsHireInputs>) => setA((prev) => ({ ...prev, us: { ...prev.us, ...patch } }))
  const setPh = (patch: Partial<PhHireInputs>) => setA((prev) => ({ ...prev, ph: { ...prev.ph, ...patch } }))

  const save = useCallback(async () => {
    setSaveMsg(null)
    const res = await fetch('/api/admin/cfo/config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hiringAssumptions: a }),
    })
    setSaveMsg(res.ok ? 'Saved as defaults.' : 'Save failed.')
  }, [a])

  if (!loaded) return <div className="h-40 animate-pulse rounded-xl border border-white/10 bg-white/5" />

  const afterHire = monthlyNetCents != null ? monthlyNetCents - result.loadedMonthlyCents : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-1">
          <button onClick={() => setTab('us')} className={`rounded-md px-3 py-1.5 text-sm ${tab === 'us' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}>US employee (W-2)</button>
          <button onClick={() => setTab('ph')} className={`rounded-md px-3 py-1.5 text-sm ${tab === 'ph' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}>Philippines contractor</button>
        </div>
        <div className="flex items-center gap-3">
          {saveMsg && <span className="text-sm text-slate-300">{saveMsg}</span>}
          <button onClick={save} className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-300 hover:bg-cyan-500/20">Save as defaults</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Inputs */}
        <div className="space-y-4">
          {tab === 'us' ? (
            <Card>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">US employee inputs</span>
              <div className="mt-2 divide-y divide-white/5">
                <Field label="Hourly wage" kind="money" value={a.us.hourlyWageCents} onChange={(v) => setUs({ hourlyWageCents: v })} />
                <Field label="Hours / week" value={a.us.hoursPerWeek} onChange={(v) => setUs({ hoursPerWeek: v })} />
                <Field label="Weeks / year" value={a.us.weeksPerYear} onChange={(v) => setUs({ weeksPerYear: v })} />
                <Field label="Paid days off" hint="(PTO + holidays)" value={a.us.ptoDays} onChange={(v) => setUs({ ptoDays: v })} />
                <Field label="Employer payroll tax" kind="pct" value={a.us.payrollTaxPct} onChange={(v) => setUs({ payrollTaxPct: v })} />
                <Field label="Workers' comp" kind="pct" value={a.us.workersCompPct} onChange={(v) => setUs({ workersCompPct: v })} />
                <Field label="Health (employer/mo)" kind="money" value={a.us.healthMonthlyCents} onChange={(v) => setUs({ healthMonthlyCents: v })} />
                <Field label="401(k) match" kind="pct" value={a.us.retirementMatchPct} onChange={(v) => setUs({ retirementMatchPct: v })} />
                <Field label="Software / tooling / mo" kind="money" value={a.us.toolingMonthlyCents} onChange={(v) => setUs({ toolingMonthlyCents: v })} />
                <Field label="Equipment (one-time)" kind="money" value={a.us.equipmentOneTimeCents} onChange={(v) => setUs({ equipmentOneTimeCents: v })} />
                <Field label="Equipment amortized over" hint="(months)" value={a.us.equipmentAmortMonths} onChange={(v) => setUs({ equipmentAmortMonths: v })} />
                <Field label="Other overhead / mo" kind="money" value={a.us.otherMonthlyCents} onChange={(v) => setUs({ otherMonthlyCents: v })} />
              </div>
            </Card>
          ) : (
            <Card>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Philippines contractor inputs</span>
              <div className="mt-2 divide-y divide-white/5">
                <Field label="Monthly rate" kind="money" value={a.ph.monthlyRateCents} onChange={(v) => setPh({ monthlyRateCents: v })} />
                <Field label="Hours / week" hint="(for effective hourly)" value={a.ph.hoursPerWeek} onChange={(v) => setPh({ hoursPerWeek: v })} />
                <label className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-slate-300">13th-month pay</span>
                  <input type="checkbox" checked={a.ph.thirteenthMonth} onChange={(e) => setPh({ thirteenthMonth: e.target.checked })} className="h-4 w-4 accent-cyan-400" />
                </label>
                <Field label="Payment / FX fees" kind="pct" value={a.ph.paymentFeePct} onChange={(v) => setPh({ paymentFeePct: v })} />
                <Field label="HMO / stipend / mo" kind="money" value={a.ph.hmoMonthlyCents} onChange={(v) => setPh({ hmoMonthlyCents: v })} />
                <Field label="Software / tooling / mo" kind="money" value={a.ph.toolingMonthlyCents} onChange={(v) => setPh({ toolingMonthlyCents: v })} />
                <Field label="Equipment (one-time)" kind="money" value={a.ph.equipmentOneTimeCents} onChange={(v) => setPh({ equipmentOneTimeCents: v })} />
                <Field label="Equipment amortized over" hint="(months)" value={a.ph.equipmentAmortMonths} onChange={(v) => setPh({ equipmentAmortMonths: v })} />
                <Field label="Other overhead / mo" kind="money" value={a.ph.otherMonthlyCents} onChange={(v) => setPh({ otherMonthlyCents: v })} />
              </div>
            </Card>
          )}
          <Card>
            <Field label="Target gross margin" hint="(for revenue-needed)" kind="pct" value={a.targetGrossMarginPct} onChange={(v) => setA((p) => ({ ...p, targetGrossMarginPct: v }))} />
            <p className="mt-1 text-xs text-slate-500">Defaults are researched estimates — confirm the per-seat tooling, insurance, and tax numbers via Rio, then Save as defaults.</p>
          </Card>
        </div>

        {/* Output */}
        <div className="space-y-4">
          <ResultPanel result={result} title={tab === 'us' ? 'US employee — fully loaded' : 'PH contractor — fully loaded'} />

          {afterHire != null && (
            <Card className={afterHire >= 0 ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-rose-500/30 bg-rose-500/10'}>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Affordability (vs. trailing 30-day net flow)</span>
              <p className="mt-2 text-sm text-slate-200">
                Your trailing 30-day net flow is <span className="font-semibold">{usd(monthlyNetCents!)}</span>.
                After this hire (−{usd(result.loadedMonthlyCents)}/mo) you&apos;d net{' '}
                <span className={`font-semibold ${afterHire >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{usd(afterHire)}</span>/mo.
              </p>
              <p className="mt-2 text-sm text-slate-300">
                {afterHire >= 0
                  ? 'At your current run rate this hire is covered by existing cash flow.'
                  : `You'd need about ${usd(-afterHire)}/mo more in net cash flow (≈ ${usd(result.revenueNeededMonthlyCents)}/mo in new revenue at your target margin) before this hire is self-funding.`}
              </p>
            </Card>
          )}

          <Card>
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Side-by-side (annual, fully loaded)</span>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-slate-300">US employee</span><span className="text-slate-100">{usd(usResult.loadedAnnualCents)} <span className="text-slate-500">({usResult.burdenMultiple.toFixed(2)}×)</span></span></div>
              <div className="flex justify-between"><span className="text-slate-300">PH contractor</span><span className="text-slate-100">{usd(phResult.loadedAnnualCents)} <span className="text-slate-500">({phResult.burdenMultiple.toFixed(2)}×)</span></span></div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
