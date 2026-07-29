'use client'

// Delivery Economics dashboard.
//
// Reads stored snapshots (so it loads instantly and shows history) and can
// recompute on demand via the Refresh button. Time travel is a snapshot picker:
// every weekly capture is retained, so any past reading can be reopened.
//
// Forbidden colours (yellow/amber/gold/brown/orange) are not used anywhere —
// see docs/UI_STANDARDS.md. Warnings use rose, good states emerald, accents cyan.

import { useCallback, useEffect, useState } from 'react'

interface MonthlyPoint {
  month: string
  customerHours: number
  internalHours: number
  internalSharePct: number
}
interface TierRow {
  tier: string
  companies: number
  endpoints: number
  hoursPerMonth: number
  hoursPerEndpointPerMonth: number | null
  measured: boolean
}
interface AllocationRow {
  resourceName: string
  totalHours: number
  customerHours: number
  internalHours: number
  internalSharePct: number
  capacityHours: number | null
  utilisationPct: number | null
}
interface CaptureRow {
  tier: string
  invoicedHours: number
  nonBillableHours: number
  unpostedHours: number
  totalHours: number
  invoicedPct: number | null
}
interface NonBillableRow { nature: string; hours: number; entries: number; projectSizedHours: number }
interface SizeBand { band: string; entries: number; hours: number }

interface Report {
  generatedAt: string
  window: { from: string; to: string; months: number }
  timeEntriesAnalysed: number
  excludedResources: string[]
  capacity: {
    scalableHoursPerMonth: number
    customerHoursPerMonth: number
    internalHoursPerMonth: number
    idleHoursPerMonth: number
    redeployableHoursPerMonth: number
    utilisationPct: number
  }
  allocation: AllocationRow[]
  monthly: MonthlyPoint[]
  tiers: TierRow[]
  billingCapture: CaptureRow[]
  nonBillable: NonBillableRow[]
  nonBillableSizeBands: SizeBand[]
  hoursWithNoTicket: number
  suspectedMisfiledCustomerHours: number
  notes: string[]
}
interface SnapshotRow {
  id: string
  capturedAt: string
  windowFrom: string
  windowTo: string
  internalSharePct: number | null
  idleHoursPerMonth: number | null
  timeEntries: number | null
}

const TIER_LABEL: Record<string, string> = {
  basic: 'Basic Care',
  standard: 'Standard Care',
  comprehensive: 'Comprehensive Care',
  complete: 'Complete Care',
  comanaged: 'Ally (Co-Managed)',
  unmanaged: 'No managed contract',
}
const NATURE_LABEL: Record<string, string> = {
  'proactive-notification': 'Proactive notification (we found this, want us to fix it?)',
  'backup-alert': 'Backup alert response',
  'rmm-hardware-alert': 'RMM hardware / disk alert',
  'security-detection': 'Security detection',
  'project-implementation': 'Project / implementation work',
  unclassified: 'Unclassified',
}
const BAND_LABEL: Record<string, string> = {
  'under-30-min': 'Under 30 min (alert-sized)',
  '30-min-to-2-h': '30 min – 2 h',
  'over-2-h': '2 h or more (project-sized)',
}

const HOURLY_RATE = 150

const n1 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(1))
const n3 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(3))

function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' }) {
  const colour = tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-rose-400' : 'text-white'
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4">
      <div className={`text-2xl font-semibold tabular-nums ${colour}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {hint && <p className="text-sm text-slate-400 mt-1 mb-3 max-w-3xl">{hint}</p>}
      <div className="overflow-x-auto">{children}</div>
    </section>
  )
}

const TH = 'px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wide whitespace-nowrap'
const TD = 'px-3 py-2 text-sm text-slate-200 whitespace-nowrap tabular-nums'

export default function DeliveryEconomicsDashboard() {
  const [report, setReport] = useState<Report | null>(null)
  const [history, setHistory] = useState<SnapshotRow[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [migrationHint, setMigrationHint] = useState<string | null>(null)

  const loadHistory = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch('/api/reports/delivery-economics?history=1', { signal })
    const json = await res.json()
    const d = json?.data ?? json
    setHistory(d?.snapshots ?? [])
    if (d?.tableMissing) setMigrationHint(d.hint ?? 'Snapshot table not created yet.')
  }, [])

  const loadSnapshot = useCallback(async (id?: string, signal?: AbortSignal) => {
    const res = await fetch(`/api/reports/delivery-economics${id ? `?id=${encodeURIComponent(id)}` : ''}`, { signal })
    if (!res.ok) throw new Error(`Load failed (${res.status})`)
    const json = await res.json()
    const d = json?.data ?? json
    if (d?.tableMissing) setMigrationHint(d.hint ?? 'Snapshot table not created yet.')
    setReport(d?.snapshot?.report ?? null)
    setSelectedId(d?.snapshot?.id ?? '')
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    ;(async () => {
      try {
        setLoading(true)
        await Promise.all([loadHistory(ac.signal), loadSnapshot(undefined, ac.signal)])
        setError(null)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message)
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()
    return () => ac.abort()
  }, [loadHistory, loadSnapshot])

  const refresh = async () => {
    setRefreshing(true)
    setError(null)
    try {
      const res = await fetch('/api/reports/delivery-economics', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? `Refresh failed (${res.status})`)
      const d = json?.data ?? json
      setReport(d.report)
      setSelectedId('')
      if (d.tableMissing) setMigrationHint(d.hint ?? null)
      await loadHistory()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) return <div className="text-slate-400">Loading delivery economics…</div>

  const cap = report?.capacity
  const maxMonthHours = Math.max(1, ...(report?.monthly ?? []).map((m) => m.customerHours + m.internalHours))
  const projectSized = report?.nonBillableSizeBands.find((b) => b.band === 'over-2-h')

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button
          onClick={refresh}
          disabled={refreshing}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {refreshing ? 'Recomputing…' : 'Refresh from Autotask'}
        </button>
        {history.length > 0 && (
          <select
            value={selectedId}
            onChange={(e) => loadSnapshot(e.target.value || undefined).catch((err) => setError(err.message))}
            className="px-3 py-2 bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg"
            aria-label="Choose a stored snapshot"
          >
            <option value="">Most recent snapshot</option>
            {history.map((h) => (
              <option key={h.id} value={h.id}>
                {new Date(h.capturedAt).toLocaleDateString()} — internal {n1(h.internalSharePct)}%, idle {n1(h.idleHoursPerMonth)}h
              </option>
            ))}
          </select>
        )}
        {report && (
          <span className="text-xs text-slate-500">
            {report.window.from} → {report.window.to} ({report.window.months} months, {report.timeEntriesAnalysed} entries)
          </span>
        )}
      </div>

      {migrationHint && (
        <div className="mb-4 p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-sm text-rose-200">{migrationHint}</div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-sm text-rose-200">{error}</div>
      )}

      {!report ? (
        <div className="text-slate-400">
          No snapshot yet. Press <span className="text-cyan-400">Refresh from Autotask</span> to capture the first one — it
          pulls six months of time entries and takes a minute or two.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card label="Scalable delivery capacity" value={`${n1(cap!.scalableHoursPerMonth)} h/mo`} sub="Offshore delivery roster only" />
            <Card label="Customer-facing" value={`${n1(cap!.customerHoursPerMonth)} h/mo`} tone="good" sub={`${cap!.utilisationPct}% of capacity used`} />
            <Card label="Internal work" value={`${n1(cap!.internalHoursPerMonth)} h/mo`} sub="The growth runway — convert this" />
            <Card
              label="Idle capacity"
              value={`${n1(cap!.idleHoursPerMonth)} h/mo`}
              tone={cap!.idleHoursPerMonth < 40 ? 'warn' : 'good'}
              sub={`${n1(cap!.redeployableHoursPerMonth)} h/mo if internal work is redirected`}
            />
          </div>

          <Section
            title="Internal vs customer work, by month"
            hint="The trend is the point. Internal hours are real capacity — watch the direction, not any single month."
          >
            <div className="space-y-1 min-w-[36rem]">
              {report.monthly.map((m) => {
                const total = m.customerHours + m.internalHours
                return (
                  <div key={m.month} className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 w-20 tabular-nums">{m.month}</span>
                    <div className="flex-1 flex h-5 rounded overflow-hidden bg-slate-800" style={{ maxWidth: `${(total / maxMonthHours) * 100}%` }}>
                      <div className="bg-cyan-600" style={{ flex: Math.max(m.customerHours, 0.01) }} title={`${m.customerHours} h customer`} />
                      <div className="bg-slate-600" style={{ flex: Math.max(m.internalHours, 0.01) }} title={`${m.internalHours} h internal`} />
                    </div>
                    <span className="text-xs text-slate-400 w-32 tabular-nums">
                      {n1(m.customerHours)}c / {n1(m.internalHours)}i
                    </span>
                    <span className={`text-xs w-16 text-right tabular-nums ${m.internalSharePct > 45 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {m.internalSharePct}%
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-slate-500 mt-2">Cyan = customer-facing, grey = internal. Right column is internal share.</p>
          </Section>

          <Section
            title="Hours per endpoint, by tier"
            hint="Measured: hours logged against each customer divided by their Datto endpoint count. A tier with no customers shows — rather than a fabricated zero."
          >
            <table className="min-w-full divide-y divide-slate-800">
              <thead><tr><th className={TH}>Tier</th><th className={TH}>Companies</th><th className={TH}>Endpoints</th><th className={TH}>Hours / mo</th><th className={TH}>Hours / endpoint</th></tr></thead>
              <tbody className="divide-y divide-slate-800">
                {report.tiers.map((t) => (
                  <tr key={t.tier} className={t.measured ? '' : 'opacity-50'}>
                    <td className={TD}>{TIER_LABEL[t.tier] ?? t.tier}</td>
                    <td className={TD}>{t.companies}</td>
                    <td className={TD}>{t.endpoints}</td>
                    <td className={TD}>{n1(t.hoursPerMonth)}</td>
                    <td className={TD}>{t.measured ? n3(t.hoursPerEndpointPerMonth) : <span className="text-slate-500">not measured</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section
            title="Billing capture"
            hint="From invoiced status in BillingItems, not the billable flag. Complete Care absorbs support so a low invoiced share is expected there; on Standard Care and Ally it is not."
          >
            <table className="min-w-full divide-y divide-slate-800">
              <thead><tr><th className={TH}>Tier</th><th className={TH}>Invoiced</th><th className={TH}>Non-billable</th><th className={TH}>Unposted</th><th className={TH}>% invoiced</th></tr></thead>
              <tbody className="divide-y divide-slate-800">
                {report.billingCapture.map((c) => (
                  <tr key={c.tier}>
                    <td className={TD}>{TIER_LABEL[c.tier] ?? c.tier}</td>
                    <td className={`${TD} text-emerald-400`}>{n1(c.invoicedHours)}</td>
                    <td className={TD}>{n1(c.nonBillableHours)}</td>
                    <td className={`${TD} ${c.unpostedHours > 5 ? 'text-rose-400' : ''}`}>{n1(c.unpostedHours)}</td>
                    <td className={TD}>{c.invoicedPct === null ? '—' : `${c.invoicedPct}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-slate-500 mt-2">
              A high <span className="text-slate-300">unposted</span> figure is an invoicing backlog. Non-billable is a decision made
              at entry time — see the breakdown below for what it was.
            </p>
          </Section>

          <Section
            title="What the non-billable work actually is"
            hint="Proactive monitoring and alert response is work we initiated and is correctly unbilled. Project-sized entries are delivery labour that was written off — that is the recoverable end."
          >
            <table className="min-w-full divide-y divide-slate-800">
              <thead><tr><th className={TH}>Nature of work</th><th className={TH}>Hours</th><th className={TH}>Entries</th><th className={TH}>Of which project-sized</th></tr></thead>
              <tbody className="divide-y divide-slate-800">
                {report.nonBillable.map((r) => (
                  <tr key={r.nature}>
                    <td className={`${TD} whitespace-normal`}>{NATURE_LABEL[r.nature] ?? r.nature}</td>
                    <td className={TD}>{n1(r.hours)}</td>
                    <td className={TD}>{r.entries}</td>
                    <td className={`${TD} ${r.projectSizedHours > 0 ? 'text-rose-400' : 'text-slate-500'}`}>{n1(r.projectSizedHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {report.nonBillableSizeBands.map((b) => (
                <div key={b.band} className="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
                  <div className="text-sm text-slate-300 tabular-nums">{n1(b.hours)} h · {b.entries} entries</div>
                  <div className="text-xs text-slate-500 mt-1">{BAND_LABEL[b.band] ?? b.band}</div>
                </div>
              ))}
            </div>
            {projectSized && projectSized.hours > 0 && (
              <p className="text-xs text-slate-400 mt-3">
                Project-sized write-offs across this window: <span className="text-rose-400 tabular-nums">{n1(projectSized.hours)} h</span>
                {' '}≈ <span className="tabular-nums">${(projectSized.hours * HOURLY_RATE).toLocaleString()}</span> at ${HOURLY_RATE}/hr.
                Worth reviewing individually — these are a handful of large entries, not alert noise.
              </p>
            )}
          </Section>

          <Section title="Where the hours go, by person" hint="Hours only. Utilisation shows for the scalable delivery roster; others contribute real work but are not sellable capacity.">
            <table className="min-w-full divide-y divide-slate-800">
              <thead><tr><th className={TH}>Resource</th><th className={TH}>Total</th><th className={TH}>Customer</th><th className={TH}>Internal</th><th className={TH}>Internal %</th><th className={TH}>Utilisation</th></tr></thead>
              <tbody className="divide-y divide-slate-800">
                {report.allocation.map((a) => (
                  <tr key={a.resourceName}>
                    <td className={TD}>{a.resourceName}</td>
                    <td className={TD}>{n1(a.totalHours)}</td>
                    <td className={`${TD} text-emerald-400`}>{n1(a.customerHours)}</td>
                    <td className={TD}>{n1(a.internalHours)}</td>
                    <td className={`${TD} ${a.internalSharePct > 45 ? 'text-rose-400' : ''}`}>{a.internalSharePct}%</td>
                    <td className={TD}>{a.utilisationPct === null ? <span className="text-slate-500">n/a</span> : `${a.utilisationPct}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="Data quality" hint="Filing problems that distort every figure above if left alone.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
              <Card
                label="Hours logged with no ticket"
                value={`${n1(report.hoursWithNoTicket)} h`}
                tone={report.hoursWithNoTicket > 20 ? 'warn' : undefined}
                sub="Invisible to any ticket-based reporting"
              />
              <Card
                label="Customer work filed as internal"
                value={`${n1(report.suspectedMisfiledCustomerHours)} h`}
                tone={report.suspectedMisfiledCustomerHours > 0 ? 'warn' : 'good'}
                sub="Overstates internal, understates customer-facing"
              />
            </div>
          </Section>

          {report.notes.length > 0 && (
            <Section title="Notes and caveats">
              <ul className="space-y-2 text-sm text-slate-400 list-disc pl-5 max-w-3xl">
                {report.notes.map((nt, i) => (
                  <li key={i}>{nt}</li>
                ))}
              </ul>
            </Section>
          )}

          <p className="text-xs text-slate-500 mt-8">
            Generated {new Date(report.generatedAt).toLocaleString()}
            {report.excludedResources.length > 0 && <> · excluding {report.excludedResources.join(', ')} (departed)</>}
            {' '}· snapshots captured weekly; history is never overwritten
          </p>
        </>
      )}
    </div>
  )
}
