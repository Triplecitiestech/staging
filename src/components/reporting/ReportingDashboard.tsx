'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ReportFilterBar from './ReportFilters'
import StatCard from './StatCard'
import TrendChart from './TrendChart'
import PriorityBreakdownChart from './PriorityBreakdownChart'
import ReportAIAssistant from './ReportAIAssistant'

interface DashboardData {
  summary: {
    totalTicketsCreated: number
    totalTicketsClosed: number
    overallSlaCompliance: number | null
    totalBacklog: number
    avgResolutionMinutes: number | null
    topCompanies: Array<{ companyId: string; displayName: string; ticketCount: number }>
    topTechnicians: Array<{ resourceId: number; name: string; hoursLogged: number }>
    trendVsPrevious: {
      ticketsCreatedChange: number | null
      ticketsClosedChange: number | null
      resolutionTimeChange: number | null
    }
  }
  ticketTrend?: Array<{ date: string; label: string; value: number }>
  resolutionTrend?: Array<{ date: string; label: string; value: number }>
  priorityBreakdown?: Array<{
    priority: string
    count: number
    percentage: number
    avgResolutionMinutes: number | null
  }>
  meta: {
    period: { from: string; to: string }
    generatedAt: string
    dataFreshness: string | null
    ticketCount: number
  }
  _warning?: string
}

// Pipeline job labels for progress display
const JOB_LABELS: Record<string, string> = {
  sync_tickets: 'Sync Tickets',
  sync_time_entries: 'Sync Time Entries',
  sync_ticket_notes: 'Sync Ticket Notes',
  sync_resources: 'Sync Resources',
  compute_lifecycle: 'Compute Lifecycle',
  aggregate_technician: 'Aggregate Technician',
  aggregate_company: 'Aggregate Company',
  compute_health: 'Compute Health Scores',
}

const PIPELINE_JOBS = [
  'sync_tickets',
  'sync_time_entries',
  'sync_ticket_notes',
  'sync_resources',
  'compute_lifecycle',
  'aggregate_technician',
  'aggregate_company',
  'compute_health',
]

export default function ReportingDashboard() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams(searchParams.toString())
      if (!params.has('preset')) params.set('preset', 'last_30_days')
      if (!params.has('trend')) params.set('trend', 'true')
      if (!params.has('breakdown')) params.set('breakdown', 'true')

      const res = await fetch(`/api/reports/dashboard?${params.toString()}`)
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Reporting dashboard failed to load (HTTP ${res.status})`)
      }
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error loading reporting dashboard')
    } finally {
      setLoading(false)
    }
  }, [searchParams])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const runSync = async () => {
    setSyncing(true)
    setSyncStatus('Starting pipeline...')
    setSyncError(null)

    const results: Array<{ job: string; success: boolean; error?: string }> = []

    for (const jobName of PIPELINE_JOBS) {
      setSyncStatus(`Running: ${JOB_LABELS[jobName] || jobName}...`)
      try {
        const res = await fetch('/api/reports/jobs/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job: jobName }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          results.push({ job: jobName, success: false, error: body.error || `HTTP ${res.status}` })
        } else {
          results.push({ job: jobName, success: true })
        }
      } catch {
        results.push({ job: jobName, success: false, error: 'Network error or timeout' })
      }
    }

    const ok = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success)
    if (failed.length > 0) {
      setSyncError(`${ok}/${PIPELINE_JOBS.length} succeeded. Failed: ${failed.map(f => JOB_LABELS[f.job] || f.job).join(', ')}`)
    } else {
      setSyncStatus(`Sync complete: ${ok}/${PIPELINE_JOBS.length} jobs succeeded`)
    }

    setSyncing(false)
    // Refresh dashboard data
    fetchData()
  }

  const hasData = data && (
    data.summary.totalTicketsCreated > 0 ||
    data.summary.totalTicketsClosed > 0 ||
    data.summary.topCompanies.length > 0
  )

  return (
    <div className="space-y-6 overflow-x-hidden">
      {/* Filter bar + Sync button */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1">
          <ReportFilterBar basePath="/admin/reporting" />
        </div>
        <button
          onClick={runSync}
          disabled={syncing}
          className="px-4 py-2 text-sm bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 disabled:opacity-50 transition-colors whitespace-nowrap flex items-center gap-2 shrink-0"
        >
          {syncing ? (
            <>
              <span className="animate-spin inline-block h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
              Syncing...
            </>
          ) : (
            'Sync with Autotask'
          )}
        </button>
      </div>

      {/* Sync status banner */}
      {(syncStatus || syncError) && !syncing && (
        <div className={`rounded-lg p-3 border flex items-center justify-between ${
          syncError
            ? 'bg-rose-500/10 border-rose-500/30'
            : 'bg-emerald-500/10 border-emerald-500/30'
        }`}>
          <p className={`text-sm ${syncError ? 'text-rose-300' : 'text-emerald-300'}`}>
            {syncError || syncStatus}
          </p>
          <button
            onClick={() => { setSyncStatus(null); setSyncError(null) }}
            className="text-xs text-slate-400 hover:text-white ml-4"
          >
            Dismiss
          </button>
        </div>
      )}
      {syncing && syncStatus && (
        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3">
          <p className="text-sm text-cyan-300">{syncStatus}</p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-4">
          <h3 className="text-sm font-medium text-rose-400 mb-1">Reporting dashboard data failed to load</h3>
          <p className="text-sm text-rose-300/80">{error}</p>
          <button onClick={fetchData} className="text-sm text-cyan-400 mt-2 hover:underline">
            Retry
          </button>
        </div>
      )}

      {/* Pipeline not run warning */}
      {data && !loading && data._warning && (
        <div className="bg-violet-500/10 border border-violet-500/30 rounded-lg p-4">
          <h3 className="text-sm font-medium text-violet-400 mb-1">Reporting data pipeline not yet configured</h3>
          <p className="text-sm text-violet-300/80">
            {data._warning}
          </p>
          <Link href="/admin/reporting/status" className="text-sm text-cyan-400 mt-2 inline-block hover:underline">
            View Pipeline Status
          </Link>
        </div>
      )}

      {/* Empty data state (pipeline ran but returned nothing) */}
      {data && !loading && !error && !hasData && !data._warning && (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-8 text-center">
          <p className="text-slate-400 text-sm">No reporting data found for the selected period.</p>
          <p className="text-slate-500 text-xs mt-1">Try changing the date range or verify that the reporting data pipeline has been run.</p>
        </div>
      )}

      {data && !loading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard
              label="Tickets Created"
              value={data.summary.totalTicketsCreated}
              href="/admin/reporting/companies"
              invertTrend
              trend={
                data.summary.trendVsPrevious.ticketsCreatedChange !== null
                  ? {
                      direction: data.summary.trendVsPrevious.ticketsCreatedChange > 0 ? 'up' : data.summary.trendVsPrevious.ticketsCreatedChange < 0 ? 'down' : 'flat',
                      percent: data.summary.trendVsPrevious.ticketsCreatedChange,
                    }
                  : undefined
              }
            />
            <StatCard
              label="Tickets Closed"
              value={data.summary.totalTicketsClosed}
              href="/admin/reporting/technicians"
              trend={
                data.summary.trendVsPrevious.ticketsClosedChange !== null
                  ? {
                      direction: data.summary.trendVsPrevious.ticketsClosedChange > 0 ? 'up' : data.summary.trendVsPrevious.ticketsClosedChange < 0 ? 'down' : 'flat',
                      percent: data.summary.trendVsPrevious.ticketsClosedChange,
                    }
                  : undefined
              }
            />
            <StatCard
              label="SLA Compliance"
              value={data.summary.overallSlaCompliance !== null ? `${data.summary.overallSlaCompliance}%` : 'N/A'}
              href="/admin/reporting/companies"
            />
            <StatCard
              label="Open Backlog"
              value={data.summary.totalBacklog}
              href="/admin/reporting/companies"
            />
            <StatCard
              label="Avg Resolution"
              value={
                data.summary.avgResolutionMinutes !== null
                  ? formatMinutes(data.summary.avgResolutionMinutes)
                  : 'N/A'
              }
              href="/admin/reporting/analytics"
              invertTrend
              trend={
                data.summary.trendVsPrevious.resolutionTimeChange !== null
                  ? {
                      direction: data.summary.trendVsPrevious.resolutionTimeChange > 0 ? 'up' : data.summary.trendVsPrevious.resolutionTimeChange < 0 ? 'down' : 'flat',
                      percent: data.summary.trendVsPrevious.resolutionTimeChange,
                    }
                  : undefined
              }
            />
          </div>

          {/* Trend Charts */}
          {data.ticketTrend && data.ticketTrend.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TrendChart data={data.ticketTrend} title="Ticket Volume" color="#06b6d4" />
              {data.resolutionTrend && (
                <TrendChart data={data.resolutionTrend} title="Avg Resolution Time" color="#8b5cf6" aggregate="avg" formatValue={formatMinutes} />
              )}
            </div>
          )}

          {/* Priority Breakdown */}
          {data.priorityBreakdown && data.priorityBreakdown.length > 0 && (
            <PriorityBreakdownChart data={data.priorityBreakdown} />
          )}

          {/* Top Companies & Technicians */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Companies */}
            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-slate-300">Top Companies by Volume</h3>
                <Link href="/admin/reporting/companies" className="text-xs text-cyan-400 hover:underline">
                  View all
                </Link>
              </div>
              {data.summary.topCompanies.length === 0 ? (
                <p className="text-slate-500 text-sm">No data yet</p>
              ) : (
                <div className="space-y-1">
                  {data.summary.topCompanies.map((c, i) => (
                    <button
                      key={c.companyId}
                      onClick={() => router.push(`/admin/reporting/companies/${c.companyId}`)}
                      className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-slate-700/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs text-slate-500 w-5">{i + 1}.</span>
                        <span className="text-sm text-white truncate">{c.displayName}</span>
                      </div>
                      <span className="text-sm text-cyan-400 flex-shrink-0">{c.ticketCount} tickets</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Top Technicians */}
            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-slate-300">Top Technicians by Hours</h3>
                <Link href="/admin/reporting/technicians" className="text-xs text-cyan-400 hover:underline">
                  View all
                </Link>
              </div>
              {data.summary.topTechnicians.length === 0 ? (
                <p className="text-slate-500 text-sm">No data yet</p>
              ) : (
                <div className="space-y-1">
                  {data.summary.topTechnicians.map((t, i) => (
                    <button
                      key={t.resourceId}
                      onClick={() => router.push(`/admin/reporting/technicians/${t.resourceId}`)}
                      className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-slate-700/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs text-slate-500 w-5">{i + 1}.</span>
                        <span className="text-sm text-white truncate">{t.name}</span>
                      </div>
                      <span className="text-sm text-cyan-400 flex-shrink-0">{t.hoursLogged}h</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick links to sub-reports */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { href: '/admin/reporting/technicians', label: 'Technician Performance', desc: 'Individual tech metrics' },
              { href: '/admin/reporting/companies', label: 'Service Desk by Company', desc: 'Per-company ticket analysis' },
              { href: '/admin/reporting/health', label: 'Customer Health', desc: 'Health scores & trends' },
              { href: '/admin/reporting/analytics', label: 'Advanced Analytics', desc: 'Anomalies & predictions' },
              { href: '/admin/reporting/business-review', label: 'Business Reviews', desc: 'Monthly & quarterly QBRs' },
              { href: '/admin/reporting/status', label: 'Pipeline Status', desc: 'Data pipeline & jobs' },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50 hover:border-cyan-500/30 transition-colors group"
              >
                <h4 className="text-sm font-medium text-white group-hover:text-cyan-400 transition-colors">
                  {link.label}
                </h4>
                <p className="text-xs text-slate-500 mt-1">{link.desc}</p>
              </Link>
            ))}
          </div>

          {/* AI Report Assistant */}
          <ReportAIAssistant context="dashboard" data={data} />

          {/* Meta info */}
          <div className="bg-slate-800/30 rounded-lg px-4 py-3 border border-slate-700/30">
            <div className="text-xs text-slate-500 flex flex-wrap gap-4">
              <span>Data range: {data.meta.period.from} to {data.meta.period.to}</span>
              <span>Tickets in period: {data.meta.ticketCount}</span>
              {data.meta.dataFreshness && (
                <span>Last sync: {new Date(data.meta.dataFreshness).toLocaleString()}</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`
  return `${(minutes / 1440).toFixed(1)}d`
}
