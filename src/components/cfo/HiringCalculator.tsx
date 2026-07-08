'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_ASSUMPTIONS, computeAll, isHiringAssumptions, sumItems,
  type HiringAssumptions, type HireTierInputs, type HireType, type HireTierResult, type CostItem,
  type UsW2Policy, type PhPolicy, type SharedCosts,
} from '@/lib/cfo/hiring'

const usd = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usd2 = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })

const TYPE_META: Record<HireType, { tab: string; heading: string }> = {
  usW2: { tab: 'US employee (W-2)', heading: 'US employees (W-2)' },
  us1099: { tab: 'US contractor (1099)', heading: 'US contractors (1099)' },
  ph: { tab: 'PH contractor', heading: 'Philippines contractors (W-8BEN)' },
}
const TYPES: HireType[] = ['usW2', 'us1099', 'ph']

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-white/10 bg-white/5 p-5 ${className}`}>{children}</div>
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{children}</span>
}

// Full-width labeled input row (policy panels).
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
          step={step ?? (kind === 'money' ? 0.01 : kind === 'pct' ? 0.1 : 1)}
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

// Compact numeric input for table cells.
function NumCell({ value, onChange, kind = 'number', step }: {
  value: number; onChange: (v: number) => void; kind?: 'money' | 'number'; step?: number
}) {
  const display = kind === 'money' ? (value / 100) : value
  return (
    <input
      type="number"
      step={step ?? (kind === 'money' ? 0.01 : 1)}
      min={0}
      value={Number.isFinite(display) ? display : ''}
      onChange={(e) => {
        const n = parseFloat(e.target.value)
        const safe = Number.isFinite(n) ? n : 0
        onChange(kind === 'money' ? Math.round(safe * 100) : safe)
      }}
      className="w-20 rounded-md border border-white/10 bg-slate-950/60 px-1.5 py-1 text-right text-slate-200 focus:border-cyan-500/40 focus:outline-none"
    />
  )
}

// Itemized cost list editor (tooling / equipment / onboarding).
function ItemsEditor({ title, subtitle, items, onChange, totalSuffix, footer }: {
  title: string; subtitle: string; items: CostItem[]; onChange: (items: CostItem[]) => void
  totalSuffix: string; footer?: React.ReactNode
}) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      <div className="mt-2 space-y-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <input
              type="text"
              value={it.label}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-slate-950/60 px-2 py-1 text-slate-300 focus:border-cyan-500/40 focus:outline-none"
            />
            <span className="text-slate-500">$</span>
            <NumCell kind="money" value={it.cents} onChange={(v) => onChange(items.map((x, j) => (j === i ? { ...x, cents: v } : x)))} />
            <button
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              aria-label={`Remove ${it.label}`}
              className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"
            >×</button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2 text-sm">
        <button onClick={() => onChange([...items, { label: 'New item', cents: 0 }])} className="text-cyan-300 hover:text-cyan-200">+ Add item</button>
        <span className="font-semibold text-slate-100">{usd2(sumItems(items))}<span className="ml-1 font-normal text-slate-500">{totalSuffix}</span></span>
      </div>
      {footer}
    </Card>
  )
}

// The spreadsheet-style build-up: tiers as columns, cost lines as rows.
function BuildUpTable({ tiers, results }: { tiers: HireTierInputs[]; results: HireTierResult[] }) {
  const money = (fn: (r: HireTierResult) => number, cls = 'text-slate-300', fmt = usd) =>
    results.map((r, i) => <td key={i} className={`px-2 py-1 text-right ${cls}`}>{fmt(fn(r))}</td>)
  const label = (text: string, cls = 'text-slate-400') => <td className={`py-1 pr-2 ${cls}`}>{text}</td>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[26rem] text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-500">
            <th className="py-1 pr-2 text-left font-medium">Monthly build-up</th>
            {tiers.map((t, i) => <th key={i} className="px-2 py-1 text-right font-medium text-slate-400">{t.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          <tr>{label('Base pay')}{money((r) => r.baseMonthlyCents, 'text-slate-200')}</tr>
          {results[0].lines.map((line, li) => (
            <tr key={li}>{label(line.label)}{money((r) => r.lines[li]?.monthlyCents ?? 0)}</tr>
          ))}
          <tr className="font-semibold">
            {label('Fully-loaded monthly cost', 'text-white')}
            {money((r) => r.totalMonthlyCents, 'text-white')}
          </tr>
          <tr>
            {label('Billable hours / month')}
            {results.map((r, i) => <td key={i} className="px-2 py-1 text-right text-slate-300">{r.billableHoursPerMonth.toLocaleString('en-US', { maximumFractionDigits: 1 })}</td>)}
          </tr>
          <tr>{label('Cost per billable hour')}{money((r) => r.costPerBillableHourCents, 'text-slate-200', usd2)}</tr>
          <tr>{label('Month 1 total (+ onboarding)')}{money((r) => r.month1TotalCents)}</tr>
          <tr className="font-semibold">
            {label('Required billing rate / hr', 'text-cyan-300')}
            {money((r) => r.requiredBillingRateCents, 'text-cyan-300', usd2)}
          </tr>
          <tr className="font-semibold">
            {label('Required monthly revenue', 'text-cyan-300')}
            {money((r) => r.requiredMonthlyRevenueCents, 'text-cyan-300')}
          </tr>
          {results[0].referenceRevenue.map((ref, ri) => (
            <tr key={ri} className="text-xs">
              {label(`· @ ${ref.marginPct}% margin`, 'text-slate-500')}
              {results.map((r, i) => <td key={i} className="px-2 py-1 text-right text-slate-500">{usd(r.referenceRevenue[ri].monthlyCents)}</td>)}
            </tr>
          ))}
          <tr>{label('Yearly total cost')}{money((r) => r.yearlyTotalCents)}</tr>
          <tr>{label('Year 1 total (+ onboarding)')}{money((r) => r.year1TotalCents)}</tr>
          <tr>{label('Required annual revenue')}{money((r) => r.requiredAnnualRevenueCents)}</tr>
        </tbody>
      </table>
    </div>
  )
}

export default function HiringCalculator() {
  const [a, setA] = useState<HiringAssumptions>(DEFAULT_ASSUMPTIONS)
  const [tab, setTab] = useState<HireType>('usW2')
  const [monthlyNetCents, setMonthlyNetCents] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  useEffect(() => {
    const c = new AbortController()
    Promise.all([
      fetch('/api/admin/cfo/config', { signal: c.signal })
        .then((r) => (r.ok ? r.json() : null))
        // Pre-v2 payloads (old us/ph shape) fail the guard → defaults win.
        .then((d: { hiringAssumptions?: unknown } | null) => { if (d && isHiringAssumptions(d.hiringAssumptions)) setA(d.hiringAssumptions) })
        .catch(() => {}),
      fetch('/api/admin/cfo/data', { signal: c.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((snap) => { if (snap?.data?.netFlow) setMonthlyNetCents(snap.data.netFlow.netCents) })
        .catch(() => {}),
    ]).finally(() => setLoaded(true))
    return () => c.abort()
  }, [])

  const results = useMemo(() => computeAll(a), [a])

  const setTier = (type: HireType, idx: number, patch: Partial<HireTierInputs>) =>
    setA((prev) => {
      const next = {
        ...prev,
        usW2: { ...prev.usW2, tiers: [...prev.usW2.tiers] },
        us1099: { tiers: [...prev.us1099.tiers] },
        ph: { ...prev.ph, tiers: [...prev.ph.tiers] },
      }
      next[type].tiers = next[type].tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t))
      return next
    })
  const setUsPolicy = (patch: Partial<UsW2Policy>) => setA((prev) => ({ ...prev, usW2: { ...prev.usW2, policy: { ...prev.usW2.policy, ...patch } } }))
  const setPhPolicy = (patch: Partial<PhPolicy>) => setA((prev) => ({ ...prev, ph: { ...prev.ph, policy: { ...prev.ph.policy, ...patch } } }))
  const setShared = (patch: Partial<SharedCosts>) => setA((prev) => ({ ...prev, shared: { ...prev.shared, ...patch } }))

  const save = useCallback(async () => {
    setSaveMsg(null)
    const res = await fetch('/api/admin/cfo/config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hiringAssumptions: a }),
    })
    setSaveMsg(res.ok ? 'Saved as defaults.' : 'Save failed.')
  }, [a])

  if (!loaded) return <div className="h-40 animate-pulse rounded-xl border border-white/10 bg-white/5" />

  const tiers = a[tab].tiers
  const tierResults = results[tab]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-lg border border-white/10 bg-white/5 p-1">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm ${tab === t ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
            >{TYPE_META[t].tab}</button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {saveMsg && <span className="text-sm text-slate-300">{saveMsg}</span>}
          <button onClick={save} className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-300 hover:bg-cyan-500/20">Save as defaults</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Inputs */}
        <div className="space-y-4">
          <Card>
            <CardTitle>{TYPE_META[tab].heading} — tiers & schedule</CardTitle>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[24rem] text-sm">
                <thead>
                  <tr>
                    <th className="py-1 pr-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Input</th>
                    {tiers.map((t, i) => (
                      <th key={i} className="px-1 py-1">
                        <input
                          type="text"
                          value={t.label}
                          onChange={(e) => setTier(tab, i, { label: e.target.value })}
                          className="w-24 rounded-md border border-white/10 bg-slate-950/60 px-1.5 py-1 text-right text-xs text-slate-300 focus:border-cyan-500/40 focus:outline-none"
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {([
                    ['Hourly rate ($)', 'hourlyRateCents', 'money'],
                    ['Hours / day', 'hoursPerDay', 'number'],
                    ['PTO hrs / yr', 'ptoHoursPerYear', 'number'],
                    ['Paid holiday hrs / yr', 'holidayHoursPerYear', 'number'],
                  ] as const).map(([rowLabel, key, kind]) => (
                    <tr key={key}>
                      <td className="py-1 pr-2 text-slate-300">{rowLabel}</td>
                      {tiers.map((t, i) => (
                        <td key={i} className="px-1 py-1 text-right">
                          <NumCell kind={kind} value={t[key]} onChange={(v) => setTier(tab, i, { [key]: v })} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">Paid hours/yr = hours/day × 5 days × 52 weeks. PTO and holidays reduce billable availability, not pay.</p>
          </Card>

          {tab === 'usW2' && (
            <Card>
              <CardTitle>Employer taxes, insurance & benefits (NY, 2026)</CardTitle>
              <div className="mt-2 divide-y divide-white/5">
                <Field label="Employer FUTA" kind="pct" step={0.1} value={a.usW2.policy.futaRatePct} onChange={(v) => setUsPolicy({ futaRatePct: v })} />
                <Field label="FUTA wage base" hint="(annual cap)" kind="money" step={100} value={a.usW2.policy.futaWageBaseCents} onChange={(v) => setUsPolicy({ futaWageBaseCents: v })} />
                <Field label="Employer SUTA (NY UI)" kind="pct" step={0.005} value={a.usW2.policy.sutaRatePct} onChange={(v) => setUsPolicy({ sutaRatePct: v })} />
                <Field label="NY Re-employment Services Fund" kind="pct" step={0.005} value={a.usW2.policy.rsfRatePct} onChange={(v) => setUsPolicy({ rsfRatePct: v })} />
                <Field label="SUTA/RSF wage base" hint="(annual cap)" kind="money" step={100} value={a.usW2.policy.sutaWageBaseCents} onChange={(v) => setUsPolicy({ sutaWageBaseCents: v })} />
                <Field label="Employer Medicare" kind="pct" step={0.05} value={a.usW2.policy.medicareRatePct} onChange={(v) => setUsPolicy({ medicareRatePct: v })} />
                <Field label="Employer Social Security" kind="pct" step={0.1} value={a.usW2.policy.socialSecurityRatePct} onChange={(v) => setUsPolicy({ socialSecurityRatePct: v })} />
                <Field label="Social Security wage base" hint="(annual cap)" kind="money" step={100} value={a.usW2.policy.socialSecurityWageBaseCents} onChange={(v) => setUsPolicy({ socialSecurityWageBaseCents: v })} />
                <Field label="Workers' comp" hint="(class 5191 techs)" kind="pct" step={0.01} value={a.usW2.policy.workersCompRatePct} onChange={(v) => setUsPolicy({ workersCompRatePct: v })} />
                <Field label="PPO health (employer/mo)" kind="money" value={a.usW2.policy.healthMonthlyCents} onChange={(v) => setUsPolicy({ healthMonthlyCents: v })} />
                <label className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-slate-300">Include health insurance?</span>
                  <input type="checkbox" checked={a.usW2.policy.includeHealth} onChange={(e) => setUsPolicy({ includeHealth: e.target.checked })} className="h-4 w-4 accent-cyan-400" />
                </label>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                NY DBL/PFL is employee-paid via payroll deduction (reimbursed to TCT) — not an employer cost here.
                Clerical staff would use workers&apos; comp class 8810 at 0.10%.
              </p>
            </Card>
          )}

          {tab === 'us1099' && (
            <Card>
              <CardTitle>1099 contractor costs</CardTitle>
              <p className="mt-2 text-sm text-slate-300">
                No employer taxes, workers&apos; comp, health insurance, equipment, or onboarding — the contractor covers their own.
                Only per-seat tooling is added on top of pay.
              </p>
            </Card>
          )}

          {tab === 'ph' && (
            <Card>
              <CardTitle>PH contractor costs</CardTitle>
              <div className="mt-2 divide-y divide-white/5">
                <Field label="13th-month pay accrual" kind="pct" step={0.01} value={a.ph.policy.thirteenthMonthPct} onChange={(v) => setPhPolicy({ thirteenthMonthPct: v })} />
                <Field label="Payment fee (Gusto/Wise)" hint="($12/user + $5/txn)" kind="money" value={a.ph.policy.paymentFeeMonthlyCents} onChange={(v) => setPhPolicy({ paymentFeeMonthlyCents: v })} />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                13th-month pay and ~10 paid holidays are customary. No HMO or equipment provided.
                2026 market rates: techs $5–15/hr, admins $4–14/hr by experience.
              </p>
            </Card>
          )}

          <Card>
            <Field label="Target gross margin on labor" hint="(drives required revenue)" kind="pct" value={a.targetGrossMarginPct} onChange={(v) => setA((p) => ({ ...p, targetGrossMarginPct: v }))} />
            <p className="mt-1 text-xs text-slate-500">Defaults come from the New Hire Break-Even workbook + cost-of-hire Q&A (July 2026). Edit anything, then Save as defaults.</p>
          </Card>
        </div>

        {/* Output */}
        <div className="space-y-4">
          <Card className="border-cyan-500/20 bg-cyan-500/5">
            <CardTitle>{TYPE_META[tab].heading} — fully loaded</CardTitle>
            <div className="mt-2">
              <BuildUpTable tiers={tiers} results={tierResults} />
            </div>
          </Card>

          {monthlyNetCents != null && (
            <Card>
              <CardTitle>Affordability (vs. trailing 30-day net flow)</CardTitle>
              <p className="mt-2 text-sm text-slate-300">Trailing 30-day net flow: <span className="font-semibold text-slate-100">{usd(monthlyNetCents)}</span>/mo. After each hire:</p>
              <div className="mt-2 space-y-1 text-sm">
                {tierResults.map((r, i) => {
                  const after = monthlyNetCents - r.totalMonthlyCents
                  return (
                    <div key={i} className="flex justify-between">
                      <span className="text-slate-400">{r.label} <span className="text-slate-500">(−{usd(r.totalMonthlyCents)}/mo)</span></span>
                      <span className={`font-semibold ${after >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{usd(after)}/mo</span>
                    </div>
                  )
                })}
              </div>
              <p className="mt-2 text-xs text-slate-500">Green = covered by current run rate; red = needs the “required monthly revenue” above (at your target margin) to be self-funding.</p>
            </Card>
          )}
        </div>
      </div>

      {/* Shared cost detail — the audit trail behind tooling/equipment/onboarding */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Cost breakdown detail <span className="font-normal normal-case text-slate-500">— feeds the calculator above</span></h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ItemsEditor
            title="Per-seat tooling (monthly)"
            subtitle="Applies to every hire type."
            items={a.shared.toolingItems}
            onChange={(items) => setShared({ toolingItems: items })}
            totalSuffix="/mo"
          />
          <ItemsEditor
            title="Equipment (one-time)"
            subtitle="US W-2 only — contractors bring their own."
            items={a.shared.equipmentItems}
            onChange={(items) => setShared({ equipmentItems: items })}
            totalSuffix="one-time"
            footer={
              <div className="mt-2 border-t border-white/10 pt-1">
                <Field label="Useful life" hint="(years, straight-line)" value={a.shared.equipmentLifeYears} onChange={(v) => setShared({ equipmentLifeYears: v })} />
              </div>
            }
          />
          <ItemsEditor
            title="Recruiting & onboarding (one-time)"
            subtitle="US W-2 only — added to month 1 and year 1."
            items={a.shared.onboardingItems}
            onChange={(items) => setShared({ onboardingItems: items })}
            totalSuffix="one-time"
          />
        </div>
      </div>

      {/* Side-by-side, all hire types */}
      <Card>
        <CardTitle>Side-by-side — all hire types</CardTitle>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="py-1 pr-2 text-left font-medium">Hire</th>
                <th className="px-2 py-1 text-right font-medium">Rate/hr</th>
                <th className="px-2 py-1 text-right font-medium">Loaded/mo</th>
                <th className="px-2 py-1 text-right font-medium">Cost/billable hr</th>
                <th className="px-2 py-1 text-right font-medium">Required rate/hr</th>
                <th className="px-2 py-1 text-right font-medium">Required rev/mo</th>
                <th className="px-2 py-1 text-right font-medium">Year 1 total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {TYPES.flatMap((type) =>
                results[type].map((r, i) => (
                  <tr key={`${type}-${i}`} className={tab === type ? 'bg-cyan-500/5' : ''}>
                    <td className="py-1 pr-2 text-slate-300"><span className="text-slate-500">{TYPE_META[type].tab} · </span>{r.label}</td>
                    <td className="px-2 py-1 text-right text-slate-300">{usd2(r.hourlyRateCents)}</td>
                    <td className="px-2 py-1 text-right font-semibold text-slate-100">{usd(r.totalMonthlyCents)}</td>
                    <td className="px-2 py-1 text-right text-slate-300">{usd2(r.costPerBillableHourCents)}</td>
                    <td className="px-2 py-1 text-right text-cyan-300">{usd2(r.requiredBillingRateCents)}</td>
                    <td className="px-2 py-1 text-right text-cyan-300">{usd(r.requiredMonthlyRevenueCents)}</td>
                    <td className="px-2 py-1 text-right text-slate-300">{usd(r.year1TotalCents)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
