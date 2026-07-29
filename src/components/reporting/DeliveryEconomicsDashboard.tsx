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

interface UnitEconomicsRow {
  unitType: string
  unitsBilled: number
  companies: number
  monthlyRevenue: number
  monthlyToolingCost: number
  monthlyLaborCost: number | null
  laborHoursPerUnit: number | null
  revenuePerUnit: number | null
  toolingCostPerUnit: number | null
  laborCostPerUnit: number | null
  contributionPerUnit: number | null
  monthlyContribution: number | null
  contributionMarginPct: number | null
}
interface TierUnitMixRow {
  tier: string
  companies: number
  units: Record<string, number>
  revenue: Record<string, number>
  managedRevenue: number
  passthroughRevenue: number
}
interface LaborFitInfo {
  method: 'regression' | 'unit-share'
  perUserHours: number | null
  perDeviceHours: number | null
  perServerHours: number | null
  fixedHoursPerCompany: number | null
  r2: number | null
  adjustedR2: number | null
  observations: number
  warnings: string[]
}
interface RateVarianceRow {
  companyId: number
  tier: string
  serviceName: string
  unitType: string
  units: number
  contractedUnitPrice: number
  catalogUnitPrice: number
  gapPct: number
  monthlyGap: number
}

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
  // Optional: snapshots captured before the billed-unit model shipped do not
  // carry these, and the picker can reopen any of them.
  unitEconomics?: UnitEconomicsRow[]
  tierUnitMix?: TierUnitMixRow[]
  laborFit?: LaborFitInfo | null
  rateVariance?: RateVarianceRow[]
  unclassifiedServices?: string[]
  managedRevenuePerMonth?: number
  passthroughRevenuePerMonth?: number
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
  managedRevenuePerMonth: number | null
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

const UNIT_LABEL: Record<string, string> = {
  user: 'Per user',
  device: 'Per device',
  server: 'Per server',
  site: 'Per site / network',
  business: 'Per company (business line)',
  license: 'Resold licences',
  backup: 'Backups',
  addon: 'Add-ons',
  labor: 'Labour lines',
  other: 'Other',
}
const HOURLY_RATE = 150

const n1 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(1))
const n3 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(3))
const money = (v: number | null | undefined, dp = 0) =>
  v === null || v === undefined
    ? '—'
    : `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`

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
  const unitRows = report?.unitEconomics ?? []
  // Null when labour could not be attributed at all — summing the measured rows
  // would present a partial total as a complete one.
  const totalContribution = unitRows.some((u) => u.monthlyContribution !== null)
    ? unitRows.reduce((s, u) => s + (u.monthlyContribution ?? 0), 0)
    : null

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
                {new Date(h.capturedAt).toLocaleDateString()} — internal {n1(h.internalSharePct)}%, idle{' '}
                {n1(h.idleHoursPerMonth)}h
                {h.managedRevenuePerMonth !== null ? `, managed ${money(h.managedRevenuePerMonth)}/mo` : ''}
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

          {unitRows.length > 0 && (
            <Section
              title="Cost to serve, by billed unit"
              hint={
                'Measured on the units we actually bill — a Complete Care invoice carries separate per-user, per-device and ' +
                'per-company lines, each with its own quantity. Revenue and tooling cost come from the contracts themselves, ' +
                'at the rate each customer is really charged. Contribution is revenue less tooling less delivery labour; the ' +
                'fixed overhead pool is deliberately NOT spread across units.'
              }
            >
              <table className="min-w-full divide-y divide-slate-800">
                <thead>
                  <tr>
                    <th className={TH}>Billed unit</th>
                    <th className={TH}>Units</th>
                    <th className={TH}>Revenue / mo</th>
                    <th className={TH}>Revenue / unit</th>
                    <th className={TH}>Tooling / unit</th>
                    <th className={TH}>Labour h / unit</th>
                    <th className={TH}>Labour $ / unit</th>
                    <th className={TH}>Contribution / unit</th>
                    <th className={TH}>Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {unitRows.map((u) => (
                    <tr key={u.unitType}>
                      <td className={TD}>{UNIT_LABEL[u.unitType] ?? u.unitType}</td>
                      <td className={TD}>{u.unitsBilled.toLocaleString()}</td>
                      <td className={TD}>{money(u.monthlyRevenue)}</td>
                      <td className={TD}>{money(u.revenuePerUnit, 2)}</td>
                      <td className={TD}>{money(u.toolingCostPerUnit, 2)}</td>
                      <td className={TD}>{n3(u.laborHoursPerUnit)}</td>
                      <td className={TD}>{money(u.laborCostPerUnit, 2)}</td>
                      <td
                        className={`${TD} ${
                          u.contributionPerUnit === null
                            ? ''
                            : u.contributionPerUnit < 0
                              ? 'text-rose-400'
                              : 'text-emerald-400'
                        }`}
                      >
                        {money(u.contributionPerUnit, 2)}
                      </td>
                      <td
                        className={`${TD} ${
                          u.contributionMarginPct === null
                            ? ''
                            : u.contributionMarginPct < 0
                              ? 'text-rose-400'
                              : 'text-emerald-400'
                        }`}
                      >
                        {u.contributionMarginPct === null ? '—' : `${u.contributionMarginPct}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card
                  label="Managed recurring revenue"
                  value={`${money(report.managedRevenuePerMonth)} /mo`}
                  sub="Per user / device / server / site / company"
                />
                <Card
                  label="Billed through, not delivered"
                  value={`${money(report.passthroughRevenuePerMonth)} /mo`}
                  sub="Resold licences, backups, add-ons"
                />
                <Card
                  label="Total contribution"
                  value={`${money(totalContribution)} /mo`}
                  tone={totalContribution !== null && totalContribution < 0 ? 'warn' : 'good'}
                  sub="Before the fixed overhead pool"
                />
              </div>
              {report.laborFit?.method === 'unit-share' && (
                <p className="text-xs text-rose-300 mt-3 max-w-3xl">
                  Labour per unit here is an <span className="font-semibold">allocation, not a measurement</span> — see the
                  labour-attribution section below. Revenue and tooling cost per unit are measured from the contracts either way.
                </p>
              )}
            </Section>
          )}

          {(report.tierUnitMix?.length ?? 0) > 0 && (
            <Section
              title="What we sell, by tier"
              hint="Billed unit counts and where the money comes from. The per-user and per-device lines together are the bulk of managed recurring revenue — which is why cost has to be attributed to both."
            >
              <table className="min-w-full divide-y divide-slate-800">
                <thead>
                  <tr>
                    <th className={TH}>Tier</th>
                    <th className={TH}>Companies</th>
                    <th className={TH}>Users</th>
                    <th className={TH}>Devices</th>
                    <th className={TH}>Servers</th>
                    <th className={TH}>Sites</th>
                    <th className={TH}>Managed MRR</th>
                    <th className={TH}>User + device share</th>
                    <th className={TH}>Pass-through</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {report.tierUnitMix!.map((t) => {
                    const perUnit = (t.revenue.user ?? 0) + (t.revenue.device ?? 0)
                    const share = t.managedRevenue > 0 ? Math.round((perUnit / t.managedRevenue) * 100) : null
                    return (
                      <tr key={t.tier}>
                        <td className={TD}>{TIER_LABEL[t.tier] ?? t.tier}</td>
                        <td className={TD}>{t.companies}</td>
                        <td className={TD}>{(t.units.user ?? 0).toLocaleString()}</td>
                        <td className={TD}>{(t.units.device ?? 0).toLocaleString()}</td>
                        <td className={TD}>{(t.units.server ?? 0).toLocaleString()}</td>
                        <td className={TD}>{(t.units.site ?? 0).toLocaleString()}</td>
                        <td className={TD}>{money(t.managedRevenue)}</td>
                        <td className={TD}>{share === null ? '—' : `${share}%`}</td>
                        <td className={`${TD} text-slate-400`}>{money(t.passthroughRevenue)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Section>
          )}

          {report.laborFit && (
            <Section
              title="How delivery labour was attributed"
              hint="Hours are logged against a customer, not against a unit type, so the split between per-user and per-device work has to be derived. This states which way it was derived and how much to trust it."
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card
                  label="Method"
                  value={report.laborFit.method === 'regression' ? 'Measured' : 'Allocated'}
                  tone={report.laborFit.method === 'regression' ? 'good' : 'warn'}
                  sub={
                    report.laborFit.method === 'regression'
                      ? `Fitted across ${report.laborFit.observations} customers`
                      : `Even split across billed units (n=${report.laborFit.observations})`
                  }
                />
                <Card label="Hours / user / mo" value={n3(report.laborFit.perUserHours)} />
                <Card label="Hours / device / mo" value={n3(report.laborFit.perDeviceHours)} />
                <Card
                  label="Fixed hours / company / mo"
                  value={n3(report.laborFit.fixedHoursPerCompany)}
                  sub="Charged to the business line"
                />
              </div>
              {report.laborFit.method === 'regression' && (
                <p className="text-xs text-slate-400 mt-3 max-w-3xl">
                  Explanatory power: <span className="text-slate-200 tabular-nums">{n1((report.laborFit.adjustedR2 ?? 0) * 100)}%</span>{' '}
                  adjusted for the fitted parameters ({n1((report.laborFit.r2 ?? 0) * 100)}% unadjusted). The adjusted figure is
                  the one that matters at this sample size — with this few customers, raw fit flatters coincidence.
                </p>
              )}
              {report.laborFit.warnings.length > 0 && (
                <ul className="mt-3 space-y-2 text-xs text-slate-400 list-disc pl-5 max-w-3xl">
                  {report.laborFit.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {(report.rateVariance?.length ?? 0) > 0 && (
            <Section
              title="Contracted rates vs the current catalogue"
              hint="A discount ledger, not a defect list. Older contracts were signed against older list prices, so a gap is expected — the point is seeing its size, which no single invoice shows. Nothing here changes what is billed."
            >
              <table className="min-w-full divide-y divide-slate-800">
                <thead>
                  <tr>
                    <th className={TH}>Company</th>
                    <th className={TH}>Tier</th>
                    <th className={TH}>Service</th>
                    <th className={TH}>Units</th>
                    <th className={TH}>Contracted</th>
                    <th className={TH}>Catalogue</th>
                    <th className={TH}>Gap</th>
                    <th className={TH}>Per month</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {report.rateVariance!.slice(0, 25).map((r, i) => (
                    <tr key={`${r.companyId}-${r.serviceName}-${i}`}>
                      <td className={TD}>#{r.companyId}</td>
                      <td className={`${TD} text-slate-400`}>{TIER_LABEL[r.tier] ?? r.tier}</td>
                      <td className={`${TD} whitespace-normal`}>{r.serviceName}</td>
                      <td className={TD}>{r.units}</td>
                      <td className={TD}>{money(r.contractedUnitPrice, 2)}</td>
                      <td className={`${TD} text-slate-400`}>{money(r.catalogUnitPrice, 2)}</td>
                      <td className={`${TD} ${r.gapPct < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{r.gapPct}%</td>
                      <td className={`${TD} ${r.monthlyGap < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {money(r.monthlyGap)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.rateVariance!.length > 25 && (
                <p className="text-xs text-slate-500 mt-2">
                  Showing the 25 largest gaps of {report.rateVariance!.length}. Sorted most-below-list first.
                </p>
              )}
            </Section>
          )}

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
            title="Hours per RMM endpoint, by tier"
            hint="A coverage measure, not cost to serve: hours logged against each customer divided by their Datto RMM device count. Endpoints under management are not the same population as billed device units, so use the billed-unit table above for economics. Kept because it is the figure the sales calculator's tier proxies were derived from. A tier with no customers shows — rather than a fabricated zero."
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
