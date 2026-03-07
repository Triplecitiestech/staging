'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import ReportFilterBar from './ReportFilters'
import StatCard from './StatCard'
import TrendChart from './TrendChart'
import PriorityBreakdownChart from './PriorityBreakdownChart'

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
}

export default function ReportingDashboard() {
  const searchParams = useSearchParams()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams(searchParams.toString())
      if (!params.has('preset')) params.set('preset', 'last_30_days')
      if (!params.has('trend')) params.set('trend', 'true')
      if (!params.has('breakdown')) params.set('breakdown', 'true')

      const res = await fetch(`/api/reports/dashboard?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load dashboard data')
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [searchParams])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <ReportFilterBar basePath="/admin/reporting" />

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-4">
          <p className="text-rose-400">{error}</p>
          <button onClick={fetchData} className="text-sm text-cyan-400 mt-2 hover:underline">
            Retry
          </button>
        </div>
      )}

      {data && !loading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard
              label="Tickets Created"
              value={data.summary.totalTicketsCreated}
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
            />
            <StatCard
              label="Open Backlog"
              value={data.summary.totalBacklog}
            />
            <StatCard
              label="Avg Resolution"
              value={
                data.summary.avgResolutionMinutes !== null
                  ? formatMinutes(data.summary.avgResolutionMinutes)
                  : 'N/A'
              }
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
                <TrendChart data={data.resolutionTrend} title="Avg Resolution Time (min)" color="#8b5cf6" />
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
                <div className="space-y-3">
                  {data.summary.topCompanies.map((c, i) => (
                    <div key={c.companyId} className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs text-slate-500 w-5">{i + 1}.</span>
                        <span className="text-sm text-white truncate">{c.displayName}</span>
                      </div>
                      <span className="text-sm text-cyan-400 flex-shrink-0">{c.ticketCount} tickets</span>
                    </div>
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
                <div className="space-y-3">
                  {data.summary.topTechnicians.map((t, i) => (
                    <div key={t.resourceId} className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs text-slate-500 w-5">{i + 1}.</span>
                        <span className="text-sm text-white truncate">{t.name}</span>
                      </div>
                      <span className="text-sm text-cyan-400 flex-shrink-0">{t.hoursLogged}h</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick links to sub-reports */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

          {/* Meta info */}
          <div className="text-xs text-slate-600 flex flex-wrap gap-4">
            <span>Period: {data.meta.period.from} to {data.meta.period.to}</span>
            {data.meta.dataFreshness && (
              <span>Last sync: {new Date(data.meta.dataFreshness).toLocaleString()}</span>
            )}
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
