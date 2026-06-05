'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Calculator } from 'lucide-react'
import CopyButton from '@/components/admin/documents/CopyButton'

interface Fields {
  employees: string
  hoursPerWeek: string
  hourlyWage: string
  monthlyRevenue: string
  annualToolCost: string
  setupCost: string
  trainingCost: string
}

const BLANK: Fields = {
  employees: '',
  hoursPerWeek: '',
  hourlyWage: '',
  monthlyRevenue: '',
  annualToolCost: '',
  setupCost: '',
  trainingCost: '',
}

const num = (v: string) => {
  const n = parseFloat((v || '').replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : n
}
const money = (n: number) => '$' + Math.round(n).toLocaleString()
const pct = (n: number) => `${Math.round(n).toLocaleString()}%`

const INPUTS: { key: keyof Fields; label: string; placeholder: string; hint?: string }[] = [
  { key: 'employees', label: 'Number of employees using the tool(s)', placeholder: 'e.g. 25' },
  { key: 'hoursPerWeek', label: 'Average hours saved per employee / week', placeholder: 'e.g. 5' },
  { key: 'hourlyWage', label: 'Average hourly wage ($)', placeholder: 'e.g. 50' },
  { key: 'monthlyRevenue', label: 'Estimated monthly revenue increase ($)', placeholder: 'e.g. 2000', hint: 'optional' },
  { key: 'annualToolCost', label: 'Annual cost of the tool + services ($)', placeholder: 'e.g. 18000', hint: 'platform + TCT managed fee' },
  { key: 'setupCost', label: 'One-time setup / onboarding cost ($)', placeholder: 'e.g. 3000' },
  { key: 'trainingCost', label: 'One-time training cost ($)', placeholder: 'e.g. 2000' },
]

export default function RoiCalculator() {
  const [f, setF] = useState<Fields>(BLANK)

  const employees = num(f.employees)
  const hoursPerWeek = num(f.hoursPerWeek)
  const wage = num(f.hourlyWage)

  const ready = employees > 0 && hoursPerWeek > 0 && wage > 0

  const annualHours = employees * hoursPerWeek * 52
  const laborSaved = annualHours * wage
  const revenueGain = num(f.monthlyRevenue) * 12
  const annualBenefit = laborSaved + revenueGain
  const firstYearCost = num(f.annualToolCost) + num(f.setupCost) + num(f.trainingCost)
  const netFirstYear = annualBenefit - firstYearCost
  const roiPct = firstYearCost > 0 ? (netFirstYear / firstYearCost) * 100 : null
  const monthlyBenefit = annualBenefit / 12
  const paybackMonths = monthlyBenefit > 0 ? firstYearCost / monthlyBenefit : null
  const ongoingRoi = num(f.annualToolCost) > 0 ? ((annualBenefit - num(f.annualToolCost)) / num(f.annualToolCost)) * 100 : null

  const summary = ready
    ? `AI ROI — Triple Cities Tech
Employees: ${employees}  ·  Hours saved/employee/week: ${hoursPerWeek}  ·  Avg wage: ${money(wage)}/hr

Annual time saved: ${Math.round(annualHours).toLocaleString()} hours
Labor value saved/yr: ${money(laborSaved)}
Revenue gain/yr: ${money(revenueGain)}
Total annual benefit: ${money(annualBenefit)}

First-year cost: ${money(firstYearCost)}
Net first-year benefit: ${money(netFirstYear)}
First-year ROI: ${roiPct != null ? pct(roiPct) : 'n/a'}
Payback period: ${paybackMonths != null ? `${paybackMonths.toFixed(1)} months` : 'n/a'}
Ongoing annual ROI: ${ongoingRoi != null ? pct(ongoingRoi) : 'n/a'}`
    : ''

  return (
    <>
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        aria-hidden
        style={{ background: 'radial-gradient(125% 90% at 50% -8%, #0b121c 0%, #07090e 55%, #050609 100%)' }}
      />

      <div className="max-w-[980px] mx-auto px-5 sm:px-8 pb-32">
        <div className="pt-6 pb-2">
          <Link href="/admin/documents/ai-playbook" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-cyan-400 transition-colors">
            <ArrowLeft size={14} /> AI Managed Services Playbook
          </Link>
        </div>

        <header className="pt-8 pb-7 border-b border-white/10 mb-8">
          <div className="text-[12.5px] font-bold uppercase tracking-[0.22em] text-cyan-400 mb-2">Sales Tool</div>
          <h1 className="text-[clamp(2rem,4.5vw,3rem)] font-black leading-[1.04] tracking-tight text-white">
            AI ROI <span className="text-cyan-400">Calculator</span>
          </h1>
          <p className="text-[16px] leading-relaxed text-slate-300 mt-3 max-w-[640px]">
            Run this on the review call to put a number on the opportunity. Time saved becomes labor dollars; add any revenue lift and net it against the cost.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Inputs */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-cyan-300 mb-4">Inputs</h2>
            <div className="flex flex-col gap-4">
              {INPUTS.map((inp) => (
                <div key={inp.key}>
                  <label className="block text-[13px] font-semibold text-slate-300 mb-1.5">
                    {inp.label}{inp.hint && <span className="text-slate-500 font-normal"> · {inp.hint}</span>}
                  </label>
                  <input
                    inputMode="decimal"
                    value={f[inp.key]}
                    onChange={(e) => setF({ ...f, [inp.key]: e.target.value })}
                    placeholder={inp.placeholder}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3.5 py-2.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-400/50"
                  />
                </div>
              ))}
              <button
                onClick={() => setF(BLANK)}
                className="self-start text-[12px] font-semibold text-slate-400 hover:text-slate-200 mt-1"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Results */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-cyan-300">ROI analysis</h2>
              {ready && <CopyButton text={summary} label="Copy summary" variant="dark" />}
            </div>

            {!ready ? (
              <div className="flex flex-col items-center justify-center text-center py-16 text-slate-500">
                <Calculator size={32} className="mb-3 opacity-50" />
                <p className="text-sm">Enter at least employees, hours saved, and wage to see the analysis.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-white/[0.04] border border-white/10 p-4">
                    <div className="text-2xl font-black text-cyan-400 leading-none tabular-nums">{money(annualBenefit)}</div>
                    <div className="text-[12.5px] text-slate-400 mt-1.5">Total annual benefit</div>
                  </div>
                  <div className="rounded-lg bg-white/[0.04] border border-white/10 p-4">
                    <div className="text-2xl font-black text-white leading-none tabular-nums">{money(firstYearCost)}</div>
                    <div className="text-[12.5px] text-slate-400 mt-1.5">First-year cost</div>
                  </div>
                  <div className="rounded-lg p-4 border border-emerald-400/30 bg-emerald-400/[0.07]">
                    <div className={`text-2xl font-black leading-none tabular-nums ${netFirstYear >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{money(netFirstYear)}</div>
                    <div className="text-[12.5px] text-slate-400 mt-1.5">Net first-year benefit</div>
                  </div>
                  <div className="rounded-lg p-4 border border-cyan-400/30 bg-cyan-400/[0.07]">
                    <div className="text-2xl font-black text-cyan-300 leading-none tabular-nums">{roiPct != null ? pct(roiPct) : '—'}</div>
                    <div className="text-[12.5px] text-slate-400 mt-1.5">First-year ROI</div>
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 divide-y divide-white/5">
                  {[
                    ['Annual time saved', `${Math.round(annualHours).toLocaleString()} hours`],
                    ['Labor value saved / yr', money(laborSaved)],
                    ['Revenue gain / yr', money(revenueGain)],
                    ['Payback period', paybackMonths != null ? `${paybackMonths.toFixed(1)} months` : '—'],
                    ['Ongoing annual ROI (after yr 1)', ongoingRoi != null ? pct(ongoingRoi) : '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-[14px] text-slate-400">{k}</span>
                      <span className="text-[14px] font-semibold text-white tabular-nums">{v}</span>
                    </div>
                  ))}
                </div>

                <p className="text-[12px] text-slate-500">
                  Labor value = employees × hours/week × 52 × wage. Estimates for discussion, not a guarantee.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
