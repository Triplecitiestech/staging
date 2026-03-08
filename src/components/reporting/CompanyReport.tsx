'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import ReportFilterBar from './ReportFilters'
import StatCard from './StatCard'
import TrendChart from './TrendChart'
import PriorityBreakdownChart from './PriorityBreakdownChart'

interface CompanySummary {
  companyId: string
  displayName: string
  ticketsCreated: number
  ticketsClosed: number
  supportHoursConsumed: number
  avgResolutionMinutes: number | null
  reopenRate: number | null
  firstTouchResolutionRate: number | null
  slaCompliance: number | null
  backlogCount: number
  healthScore: number | null
  healthTrend: string | null
}

interface CompanyReportData {
  summary: CompanySummary[]
  trend?: Array<{ date: string; label: string; value: number }>
  priorityBreakdown?: Array<{
    priority: string
    count: number
    percentage: number
    avgResolutionMinutes: number | null
  }>
  comparison?: {
    ticketsCreated: { current: number; previous: number; changePercent: number | null; direction: string }
    ticketsClosed: { current: number; previous: number; changePercent: number | null; direction: string }
    supportHours: { current: number; previous: number; changePercent: number | null; direction: string }
    avgResolution: { current: number; previous: number; changePercent: number | null; direction: string }
  }
  meta: { period: { from: string; to: string }; dataFreshness: string | null }
}

export default function CompanyReport() {
  const searchParams = useSearchParams()
  const [data, setData] = useState<CompanyReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams(searchParams.toString())
      if (!params.has('preset')) params.set('preset', 'last_30_days')
      if (!params.has('trend')) params.set('trend', 'true')
      if (!params.has('compare')) params.set('compare', 'true')
      if (!params.has('breakdown')) params.set('breakdown', 'true')
      const res = await fetch(`/api/reports/companies?${params.toString()}`)
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Failed to load company data (HTTP ${res.status})`)
      }
      setData(await res.json())
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('[CompanyReport] Failed to load:', msg)
      setError(msg)
    }
    setLoading(false)
  }, [searchParams])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="space-y-6">
        <ReportFilterBar basePath="/admin/reporting/companies" showCompanySelector />
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <ReportFilterBar basePath="/admin/reporting/companies" showCompanySelector />
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-4">
          <h3 className="text-sm font-medium text-rose-400 mb-1">Company report data failed to load</h3>
          <p className="text-sm text-rose-300/80">{error}</p>
          <button onClick={fetchData} className="text-sm text-cyan-400 mt-2 hover:underline">Retry</button>
        </div>
      </div>
    )
  }

  if (!data) return <p className="text-slate-500">No data available</p>

  const totalCreated = data.summary.reduce((s, c) => s + c.ticketsCreated, 0)
  const totalClosed = data.summary.reduce((s, c) => s + c.ticketsClosed, 0)
  const totalHours = data.summary.reduce((s, c) => s + c.supportHoursConsumed, 0)

  return (
    <div className="space-y-6">
      <ReportFilterBar basePath="/admin/reporting/companies" showCompanySelector />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Tickets Created"
          value={totalCreated}
          trend={data.comparison?.ticketsCreated ? {
            direction: data.comparison.ticketsCreated.direction as 'up' | 'down' | 'flat',
            percent: data.comparison.ticketsCreated.changePercent,
          } : undefined}
        />
        <StatCard
          label="Tickets Closed"
          value={totalClosed}
          trend={data.comparison?.ticketsClosed ? {
            direction: data.comparison.ticketsClosed.direction as 'up' | 'down' | 'flat',
            percent: data.comparison.ticketsClosed.changePercent,
          } : undefined}
        />
        <StatCard
          label="Support Hours"
          value={`${Math.round(totalHours * 10) / 10}h`}
          trend={data.comparison?.supportHours ? {
            direction: data.comparison.supportHours.direction as 'up' | 'down' | 'flat',
            percent: data.comparison.supportHours.changePercent,
          } : undefined}
        />
        <StatCard label="Companies" value={data.summary.length} />
      </div>

      {data.trend && data.trend.length > 0 && (
        <TrendChart data={data.trend} title="Ticket Volume by Company" />
      )}

      {data.priorityBreakdown && data.priorityBreakdown.length > 0 && (
        <PriorityBreakdownChart data={data.priorityBreakdown} />
      )}

      {/* Company table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50">
          <input
            type="text"
            placeholder="Search companies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 px-3 py-1.5 text-sm bg-slate-900/50 border border-slate-600/50 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Company</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Created</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Closed</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3 hidden md:table-cell">Hours</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3 hidden lg:table-cell">Avg Resolution</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3 hidden lg:table-cell">SLA %</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3 hidden md:table-cell">Reopen %</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Backlog</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3 hidden md:table-cell">Health</th>
              </tr>
            </thead>
            <tbody>
              {data.summary.filter((company) => {
                if (!search) return true
                return company.displayName.toLowerCase().includes(search.toLowerCase())
              }).map((company) => (
                <tr key={company.companyId} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                  <td className="px-4 py-3">
                    <div className="text-sm text-white truncate max-w-[200px]">{company.displayName}</div>
                  </td>
                  <td className="text-right px-4 py-3 text-sm text-white">{company.ticketsCreated}</td>
                  <td className="text-right px-4 py-3 text-sm text-white">{company.ticketsClosed}</td>
                  <td className="text-right px-4 py-3 text-sm text-white hidden md:table-cell">{company.supportHoursConsumed}h</td>
                  <td className="text-right px-4 py-3 text-sm text-slate-300 hidden lg:table-cell">
                    {company.avgResolutionMinutes !== null ? formatMinutes(company.avgResolutionMinutes) : '-'}
                  </td>
                  <td className="text-right px-4 py-3 text-sm hidden lg:table-cell">
                    {company.slaCompliance !== null ? (
                      <span className={company.slaCompliance >= 90 ? 'text-emerald-400' : company.slaCompliance >= 70 ? 'text-cyan-400' : 'text-rose-400'}>
                        {company.slaCompliance}%
                      </span>
                    ) : '-'}
                  </td>
                  <td className="text-right px-4 py-3 text-sm text-slate-300 hidden md:table-cell">
                    {company.reopenRate !== null ? `${company.reopenRate}%` : '-'}
                  </td>
                  <td className="text-right px-4 py-3 text-sm text-white">{company.backlogCount}</td>
                  <td className="text-right px-4 py-3 hidden md:table-cell">
                    {company.healthScore !== null ? (
                      <HealthBadge score={company.healthScore} trend={company.healthTrend} />
                    ) : (
                      <span className="text-sm text-slate-500">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {data.summary.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-500">
                    No company data for this period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function HealthBadge({ score, trend }: { score: number; trend: string | null }) {
  const color =
    score >= 80 ? 'text-emerald-400 bg-emerald-400/10' :
    score >= 60 ? 'text-cyan-400 bg-cyan-400/10' :
    score >= 40 ? 'text-orange-400 bg-orange-400/10' :
    'text-rose-400 bg-rose-400/10'

  const arrow = trend === 'improving' ? '\u2191' : trend === 'declining' ? '\u2193' : ''

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {Math.round(score)} {arrow}
    </span>
  )
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`
  return `${(minutes / 1440).toFixed(1)}d`
}
