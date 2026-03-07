'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import ReportFilterBar from './ReportFilters'
import StatCard from './StatCard'
import TrendChart from './TrendChart'

interface TechnicianSummary {
  resourceId: number
  firstName: string
  lastName: string
  email: string
  ticketsClosed: number
  ticketsAssigned: number
  hoursLogged: number
  billableHoursLogged: number
  avgFirstResponseMinutes: number | null
  avgResolutionMinutes: number | null
  firstTouchResolutionRate: number | null
  openTicketCount: number
}

interface TechReport {
  summary: TechnicianSummary[]
  trend?: Array<{ date: string; label: string; value: number }>
  comparison?: {
    ticketsClosed: { current: number; previous: number; changePercent: number | null; direction: string }
    hoursLogged: { current: number; previous: number; changePercent: number | null; direction: string }
    avgResolution: { current: number; previous: number; changePercent: number | null; direction: string }
  }
  meta: { period: { from: string; to: string }; dataFreshness: string | null }
}

export default function TechnicianReport() {
  const searchParams = useSearchParams()
  const [data, setData] = useState<TechReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams(searchParams.toString())
      if (!params.has('preset')) params.set('preset', 'last_30_days')
      if (!params.has('trend')) params.set('trend', 'true')
      if (!params.has('compare')) params.set('compare', 'true')
      const res = await fetch(`/api/reports/technicians?${params.toString()}`)
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Failed to load technician data (HTTP ${res.status})`)
      }
      setData(await res.json())
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('[TechnicianReport] Failed to load:', msg)
      setError(msg)
    }
    setLoading(false)
  }, [searchParams])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="space-y-6">
        <ReportFilterBar basePath="/admin/reporting/technicians" showTechnicianSelector />
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <ReportFilterBar basePath="/admin/reporting/technicians" showTechnicianSelector />
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-4">
          <h3 className="text-sm font-medium text-rose-400 mb-1">Technician report data failed to load</h3>
          <p className="text-sm text-rose-300/80">{error}</p>
          <button onClick={fetchData} className="text-sm text-cyan-400 mt-2 hover:underline">Retry</button>
        </div>
      </div>
    )
  }

  if (!data) return <p className="text-slate-500">No data available</p>

  const totalClosed = data.summary.reduce((s, t) => s + t.ticketsClosed, 0)
  const totalHours = data.summary.reduce((s, t) => s + t.hoursLogged, 0)

  return (
    <div className="space-y-6">
      <ReportFilterBar basePath="/admin/reporting/technicians" showTechnicianSelector />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Tickets Closed"
          value={totalClosed}
          trend={data.comparison?.ticketsClosed ? {
            direction: data.comparison.ticketsClosed.direction as 'up' | 'down' | 'flat',
            percent: data.comparison.ticketsClosed.changePercent,
          } : undefined}
        />
        <StatCard
          label="Total Hours Logged"
          value={`${Math.round(totalHours * 10) / 10}h`}
          trend={data.comparison?.hoursLogged ? {
            direction: data.comparison.hoursLogged.direction as 'up' | 'down' | 'flat',
            percent: data.comparison.hoursLogged.changePercent,
          } : undefined}
        />
        <StatCard label="Active Technicians" value={data.summary.length} />
        <StatCard
          label="Avg Resolution"
          value={data.comparison?.avgResolution ? formatMinutes(data.comparison.avgResolution.current) : 'N/A'}
          trend={data.comparison?.avgResolution ? {
            direction: data.comparison.avgResolution.direction as 'up' | 'down' | 'flat',
            percent: data.comparison.avgResolution.changePercent,
          } : undefined}
        />
      </div>

      {/* Trend */}
      {data.trend && data.trend.length > 0 && (
        <TrendChart data={data.trend} title="Tickets Closed Over Time" />
      )}

      {/* Technician table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Technician</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Closed</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Hours</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3 hidden md:table-cell">Billable</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3 hidden lg:table-cell">Avg FRT</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3 hidden lg:table-cell">Avg Resolution</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3 hidden md:table-cell">FTR Rate</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Open</th>
              </tr>
            </thead>
            <tbody>
              {data.summary.map((tech) => (
                <tr key={tech.resourceId} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                  <td className="px-4 py-3">
                    <div className="text-sm text-white">{tech.firstName} {tech.lastName}</div>
                    <div className="text-xs text-slate-500 hidden sm:block">{tech.email}</div>
                  </td>
                  <td className="text-right px-4 py-3 text-sm text-white">{tech.ticketsClosed}</td>
                  <td className="text-right px-4 py-3 text-sm text-white">{tech.hoursLogged}h</td>
                  <td className="text-right px-4 py-3 text-sm text-white hidden md:table-cell">{tech.billableHoursLogged}h</td>
                  <td className="text-right px-4 py-3 text-sm text-slate-300 hidden lg:table-cell">
                    {tech.avgFirstResponseMinutes !== null ? formatMinutes(tech.avgFirstResponseMinutes) : '-'}
                  </td>
                  <td className="text-right px-4 py-3 text-sm text-slate-300 hidden lg:table-cell">
                    {tech.avgResolutionMinutes !== null ? formatMinutes(tech.avgResolutionMinutes) : '-'}
                  </td>
                  <td className="text-right px-4 py-3 text-sm text-slate-300 hidden md:table-cell">
                    {tech.firstTouchResolutionRate !== null ? `${tech.firstTouchResolutionRate}%` : '-'}
                  </td>
                  <td className="text-right px-4 py-3 text-sm text-white">{tech.openTicketCount}</td>
                </tr>
              ))}
              {data.summary.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-500">
                    No technician data for this period
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

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`
  return `${(minutes / 1440).toFixed(1)}d`
}
