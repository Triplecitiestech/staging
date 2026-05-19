'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface ReactiveOtRatioRow {
  employeeStaffId: string
  employeeName: string
  totalOtHours: number
  reactiveOtHours: number
  reactiveRatioPct: number
  flagged: boolean
}

interface SickDayUsageRow {
  employeeStaffId: string
  employeeName: string
  sickDaysLast90: number
  hoursLast90: number
  in30DayPatternAlert: boolean
}

interface FlaggedItem {
  kind: 'PTO' | 'OT'
  id: string
  employeeName: string
  flagReason: string
  flaggedAt: string
  url: string
}

interface LateSubmissionRow {
  id: string
  employeeName: string
  workDate: string
  actualHours: number
  reactiveReason: string | null
  lateReason: string | null
  submittedAt: string
}

interface ShortNoticeRow {
  id: string
  employeeName: string
  startDate: string
  endDate: string
  kind: string
  overrideReason: string | null
  submittedAt: string
  status: string
}

interface TrendsData {
  generatedAt: string
  windowDays: number
  reactiveOtRatios: ReactiveOtRatioRow[]
  sickDayUsage: SickDayUsageRow[]
  openFlags: FlaggedItem[]
  lateSubmissions: LateSubmissionRow[]
  shortNoticePto: ShortNoticeRow[]
}

export default function OtPtoTrendsClient() {
  const [data, setData] = useState<TrendsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/ot-pto-trends', { signal })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        setError(e.error ?? `Failed to load (${res.status})`)
        setData(null)
        return
      }
      setData(await res.json())
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const acknowledge = async (kind: 'PTO' | 'OT', id: string) => {
    const path = kind === 'PTO' ? `/api/pto/requests/${id}/acknowledge` : `/api/overtime/requests/${id}/acknowledge`
    const res = await fetch(path, { method: 'POST' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error ?? 'Could not acknowledge')
      return
    }
    load()
  }

  if (loading) {
    return <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-slate-400 text-sm">Loading trends…</div>
  }
  if (error) {
    return (
      <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-6 text-rose-200 text-sm">{error}</div>
    )
  }
  if (!data) return null

  return (
    <div className="space-y-8">
      {/* Open flagged items */}
      <Section title="Open flagged items" subtitle="HR-flagged notifications awaiting acknowledgement">
        {data.openFlags.length === 0 ? (
          <EmptyRow text="Nothing flagged. Inbox zero." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-white/5">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-white/5 text-left">
                <Th>Kind</Th>
                <Th>Employee</Th>
                <Th>Reason</Th>
                <Th>Flagged</Th>
                <Th className="text-right">Action</Th>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.openFlags.map((f) => (
                  <tr key={`${f.kind}-${f.id}`}>
                    <Td>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${f.kind === 'PTO' ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' : 'border-violet-500/30 bg-violet-500/10 text-violet-300'}`}>
                        {f.kind}
                      </span>
                    </Td>
                    <Td className="text-white">{f.employeeName}</Td>
                    <Td className="text-slate-300">{f.flagReason}</Td>
                    <Td className="text-slate-400 whitespace-nowrap">{new Date(f.flaggedAt).toLocaleDateString()}</Td>
                    <Td className="text-right">
                      <Link href={f.url} className="text-cyan-400 hover:text-cyan-300 text-xs mr-3">
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => acknowledge(f.kind, f.id)}
                        className="text-emerald-400 hover:text-emerald-300 text-xs font-medium"
                      >
                        Acknowledge
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Reactive OT ratio */}
      <Section title="Reactive OT ratio" subtitle="% of total OT hours this month coming in reactively. Target: under 25%. Two consecutive months >50% flags.">
        {data.reactiveOtRatios.length === 0 ? (
          <EmptyRow text="No OT activity yet this month." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-white/5">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-white/5 text-left">
                <Th>Employee</Th>
                <Th>Total OT</Th>
                <Th>Reactive OT</Th>
                <Th>Ratio</Th>
                <Th>Flag</Th>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.reactiveOtRatios.map((r) => (
                  <tr key={r.employeeStaffId}>
                    <Td className="text-white">{r.employeeName}</Td>
                    <Td className="text-slate-300">{r.totalOtHours.toFixed(2)}</Td>
                    <Td className="text-slate-300">{r.reactiveOtHours.toFixed(2)}</Td>
                    <Td>
                      <RatioBar pct={r.reactiveRatioPct} />
                    </Td>
                    <Td>
                      {r.flagged ? (
                        <span className="text-rose-400 text-xs font-medium">2-month flag</span>
                      ) : (
                        <span className="text-slate-500 text-xs">—</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Sick day usage */}
      <Section
        title="Sick day usage (last 90 days)"
        subtitle="Counts SICK / Family Emergency / Same-day Medical. Pattern alert: >3 sick days in any 30-day window."
      >
        {data.sickDayUsage.length === 0 ? (
          <EmptyRow text="No sick-day records in the last 90 days." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-white/5">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-white/5 text-left">
                <Th>Employee</Th>
                <Th>Sick days</Th>
                <Th>Hours</Th>
                <Th>Pattern alert</Th>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.sickDayUsage.map((s) => (
                  <tr key={s.employeeStaffId}>
                    <Td className="text-white">{s.employeeName}</Td>
                    <Td className="text-slate-300">{s.sickDaysLast90}</Td>
                    <Td className="text-slate-300">{s.hoursLast90.toFixed(2)}</Td>
                    <Td>
                      {s.in30DayPatternAlert ? (
                        <span className="text-rose-400 text-xs font-medium">3+ in 30 days</span>
                      ) : (
                        <span className="text-slate-500 text-xs">—</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Late submissions */}
      <Section title="Late reactive OT submissions (last 30 days)" subtitle="Logged outside the 24-hour window after the work ended.">
        {data.lateSubmissions.length === 0 ? (
          <EmptyRow text="No late submissions in the last 30 days." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-white/5">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-white/5 text-left">
                <Th>Employee</Th>
                <Th>Work date</Th>
                <Th>Hours</Th>
                <Th>Late reason</Th>
                <Th className="text-right">View</Th>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.lateSubmissions.map((r) => (
                  <tr key={r.id}>
                    <Td className="text-white">{r.employeeName}</Td>
                    <Td className="text-slate-300 whitespace-nowrap">{r.workDate}</Td>
                    <Td className="text-slate-300">{r.actualHours.toFixed(2)}</Td>
                    <Td className="text-slate-300">{r.lateReason ?? '(none given)'}</Td>
                    <Td className="text-right">
                      <Link href={`/admin/overtime/${r.id}`} className="text-cyan-400 hover:text-cyan-300 text-xs">
                        View
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Short-notice PTO */}
      <Section title="Short-notice PTO (last 30 days)" subtitle="Approval-flow PTO submitted under the 2-week minimum.">
        {data.shortNoticePto.length === 0 ? (
          <EmptyRow text="No short-notice PTO in the last 30 days." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-white/5">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-white/5 text-left">
                <Th>Employee</Th>
                <Th>Dates</Th>
                <Th>Type</Th>
                <Th>Override reason</Th>
                <Th>Status</Th>
                <Th className="text-right">View</Th>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.shortNoticePto.map((r) => (
                  <tr key={r.id}>
                    <Td className="text-white">{r.employeeName}</Td>
                    <Td className="text-slate-300 whitespace-nowrap">
                      {r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`}
                    </Td>
                    <Td className="text-slate-300">{r.kind}</Td>
                    <Td className="text-slate-300">{r.overrideReason ?? '—'}</Td>
                    <Td className="text-slate-400 text-xs">{r.status}</Td>
                    <Td className="text-right">
                      <Link href={`/admin/pto/${r.id}`} className="text-cyan-400 hover:text-cyan-300 text-xs">View</Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <p className="text-xs text-slate-500 text-right">
        Refreshed {new Date(data.generatedAt).toLocaleString()}
      </p>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="text-sm text-slate-400 mb-3">{subtitle}</p>
      {children}
    </section>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide ${className}`}>
      {children}
    </th>
  )
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>
}

function EmptyRow({ text }: { text: string }) {
  return <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-slate-400 text-sm">{text}</div>
}

function RatioBar({ pct }: { pct: number }) {
  // Target <25%, alert >50%, otherwise neutral
  const color =
    pct >= 50 ? 'bg-rose-500' : pct >= 25 ? 'bg-cyan-500' : 'bg-emerald-500'
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 rounded bg-white/10 overflow-hidden">
        <div className={`${color} h-full`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-xs text-slate-300 tabular-nums">{pct}%</span>
    </div>
  )
}
