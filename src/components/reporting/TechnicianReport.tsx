'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import ReportFilterBar from './ReportFilters'
import StatCard from './StatCard'
import TrendChart from './TrendChart'
import ReportAIAssistant from './ReportAIAssistant'

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
  benchmarks?: Array<{
    metricKey: string
    actual: number
    target: number
    unit: string
    meetingTarget: boolean
    percentOfTarget: number
  }>
  meta: { period: { from: string; to: string }; dataFreshness: string | null }
}

export default function TechnicianReport() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const highlightedResourceId = searchParams.get('resource') ? Number(searchParams.get('resource')) : null
  const [data, setData] = useState<TechReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showAtSearch, setShowAtSearch] = useState(false)
  const [atSearch, setAtSearch] = useState('')
  const [atResults, setAtResults] = useState<Array<{ autotaskId: number; name: string; email: string; isImported: boolean }>>([])
  const [atSearching, setAtSearching] = useState(false)
  const [importing, setImporting] = useState<number | null>(null)
  const [importMsg, setImportMsg] = useState<string | null>(null)

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

  // Auto-scroll to highlighted technician
  useEffect(() => {
    if (highlightedResourceId && data) {
      setTimeout(() => {
        const row = document.getElementById(`tech-row-${highlightedResourceId}`)
        if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 300)
    }
  }, [highlightedResourceId, data])

  const searchAutotask = async () => {
    setAtSearching(true)
    try {
      const res = await fetch(`/api/reports/autotask-search?type=resources&q=${encodeURIComponent(atSearch)}`)
      const json = await res.json()
      setAtResults(json.results || [])
    } catch {
      setAtResults([])
    }
    setAtSearching(false)
  }

  const importResource = async (autotaskId: number) => {
    setImporting(autotaskId)
    setImportMsg(null)
    try {
      const res = await fetch('/api/reports/autotask-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'resource', autotaskId }),
      })
      const json = await res.json()
      if (json.success) {
        setImportMsg(`Imported "${json.name}" successfully`)
        setAtResults(prev => prev.map(r =>
          r.autotaskId === autotaskId ? { ...r, isImported: true } : r
        ))
      } else {
        setImportMsg(`Error: ${json.error}`)
      }
    } catch {
      setImportMsg('Import failed')
    }
    setImporting(null)
  }

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
  const totalBillable = data.summary.reduce((s, t) => s + t.billableHoursLogged, 0)
  const totalOpen = data.summary.reduce((s, t) => s + t.openTicketCount, 0)

  // Team-level FTR and FRT averages
  const techsWithFTR = data.summary.filter(t => t.firstTouchResolutionRate !== null)
  const teamFTR = techsWithFTR.length > 0
    ? Math.round(techsWithFTR.reduce((s, t) => s + (t.firstTouchResolutionRate ?? 0), 0) / techsWithFTR.length * 10) / 10
    : null
  const techsWithFRT = data.summary.filter(t => t.avgFirstResponseMinutes !== null)
  const teamFRT = techsWithFRT.length > 0
    ? Math.round(techsWithFRT.reduce((s, t) => s + (t.avgFirstResponseMinutes ?? 0), 0) / techsWithFRT.length)
    : null
  const utilizationRate = totalHours > 0 ? Math.round((totalBillable / totalHours) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1">
          <ReportFilterBar basePath="/admin/reporting/technicians" showTechnicianSelector />
        </div>
        <button
          onClick={() => setShowAtSearch(!showAtSearch)}
          className="px-4 py-2 text-sm bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors whitespace-nowrap shrink-0"
        >
          {showAtSearch ? 'Hide Autotask Search' : 'Browse Autotask Users'}
        </button>
      </div>

      {/* Autotask resource search panel */}
      {showAtSearch && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Search Autotask Resources</h3>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={atSearch}
              onChange={(e) => setAtSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchAutotask()}
              className="flex-1 px-3 py-1.5 text-sm bg-slate-900/50 border border-slate-600/50 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
            <button
              onClick={searchAutotask}
              disabled={atSearching || atSearch.length < 1}
              className="px-4 py-1.5 text-sm bg-cyan-500 text-white rounded-md hover:bg-cyan-600 disabled:opacity-50 transition-colors"
            >
              {atSearching ? 'Searching...' : 'Search'}
            </button>
          </div>
          {importMsg && (
            <div className={`text-sm mb-2 ${importMsg.startsWith('Error') || importMsg === 'Import failed' ? 'text-rose-400' : 'text-emerald-400'}`}>
              {importMsg}
            </div>
          )}
          {atResults.length > 0 && (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {atResults.map((r) => (
                <div key={r.autotaskId} className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-slate-700/30">
                  <div>
                    <span className="text-sm text-white">{r.name}</span>
                    <span className="text-xs text-slate-500 ml-2">{r.email}</span>
                  </div>
                  {r.isImported ? (
                    <span className="text-xs text-emerald-400 px-2 py-0.5 bg-emerald-400/10 rounded-full">Imported</span>
                  ) : (
                    <button
                      onClick={() => importResource(r.autotaskId)}
                      disabled={importing === r.autotaskId}
                      className="text-xs text-cyan-400 hover:text-cyan-300 disabled:opacity-50"
                    >
                      {importing === r.autotaskId ? 'Importing...' : 'Import'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {atResults.length === 0 && atSearch.length >= 1 && !atSearching && (
            <p className="text-sm text-slate-500">No results. Try a different search term.</p>
          )}
        </div>
      )}

      {/* Summary cards — row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Tickets Closed"
          value={totalClosed}
          trend={data.comparison?.ticketsClosed ? {
            direction: data.comparison.ticketsClosed.direction as 'up' | 'down' | 'flat',
            percent: data.comparison.ticketsClosed.changePercent,
            previous: data.comparison.ticketsClosed.previous,
          } : undefined}
        />
        <StatCard
          label="Total Hours Logged"
          value={`${Math.round(totalHours * 10) / 10}h`}
          trend={data.comparison?.hoursLogged ? {
            direction: data.comparison.hoursLogged.direction as 'up' | 'down' | 'flat',
            percent: data.comparison.hoursLogged.changePercent,
            previous: `${data.comparison.hoursLogged.previous}h`,
          } : undefined}
        />
        <StatCard label="Active Technicians" value={data.summary.length} />
        <StatCard
          label="Avg Resolution Time"
          value={data.comparison?.avgResolution ? formatMinutes(data.comparison.avgResolution.current) : 'N/A'}
          invertTrend
          trend={data.comparison?.avgResolution ? {
            direction: data.comparison.avgResolution.direction as 'up' | 'down' | 'flat',
            percent: data.comparison.avgResolution.changePercent,
            previous: data.comparison.avgResolution.previous > 0 ? formatMinutes(data.comparison.avgResolution.previous) : '0',
          } : undefined}
        />
      </div>

      {/* Summary cards — row 2: key performance indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">First Touch Resolution Rate</p>
          <p className="text-xl font-bold text-white">{teamFTR !== null ? `${teamFTR}%` : 'N/A'}</p>
          <p className="text-[10px] text-slate-600 mt-1">Tickets resolved with 1 technician interaction</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Avg First Response Time</p>
          <p className="text-xl font-bold text-white">{teamFRT !== null ? formatMinutes(teamFRT) : 'N/A'}</p>
          <p className="text-[10px] text-slate-600 mt-1">Time from ticket creation to first tech response</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Billable Utilization</p>
          <p className="text-xl font-bold text-white">{utilizationRate}%</p>
          <p className="text-[10px] text-slate-600 mt-1">{totalBillable.toFixed(1)}h billable of {totalHours.toFixed(1)}h total</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Open Backlog</p>
          <p className="text-xl font-bold text-white">{totalOpen}</p>
          <p className="text-[10px] text-slate-600 mt-1">Tickets currently assigned and unresolved</p>
        </div>
      </div>

      {/* Trend */}
      {data.trend && data.trend.length > 0 && (
        <TrendChart data={data.trend} title="Tickets Closed Over Time" />
      )}

      {/* Benchmarks (shown when Details toggle is active) */}
      {data.benchmarks && data.benchmarks.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Performance Benchmarks</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.benchmarks.map((b) => {
              const pct = b.percentOfTarget
              const barColor = b.meetingTarget ? 'bg-emerald-500' : pct >= 75 ? 'bg-cyan-500' : 'bg-rose-500'
              return (
                <div key={b.metricKey} className="bg-slate-900/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-400">{b.metricKey.replace(/_/g, ' ')}</span>
                    <span className={`text-xs font-medium ${b.meetingTarget ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {b.meetingTarget ? 'On Target' : 'Below Target'}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-lg font-bold text-white">{b.actual}{b.unit}</span>
                    <span className="text-xs text-slate-500">/ {b.target}{b.unit} target</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{pct}% of target</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Technician table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50">
          <input
            type="text"
            placeholder="Search technicians..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 px-3 py-1.5 text-sm bg-slate-900/50 border border-slate-600/50 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Technician</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Closed</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Hours</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3 hidden md:table-cell">Billable</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3 hidden lg:table-cell" title="Average First Response Time — minutes from ticket creation to first technician note">Avg First Response</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3 hidden lg:table-cell" title="Average time from ticket creation to completion">Avg Resolution</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3 hidden md:table-cell" title="First Touch Resolution — % of tickets resolved with only 1 technician interaction (note or time entry)">FTR Rate</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Open</th>
              </tr>
            </thead>
            <tbody>
              {data.summary.filter((tech) => {
                if (!search) return true
                const q = search.toLowerCase()
                return `${tech.firstName} ${tech.lastName}`.toLowerCase().includes(q)
                  || tech.email.toLowerCase().includes(q)
              }).map((tech) => (
                <tr
                  key={tech.resourceId}
                  id={`tech-row-${tech.resourceId}`}
                  onClick={() => router.push(`/admin/reporting/technicians/${tech.resourceId}`)}
                  className={`border-b border-slate-700/30 hover:bg-slate-700/20 cursor-pointer transition-colors ${
                    highlightedResourceId === tech.resourceId ? 'bg-cyan-500/10 ring-1 ring-cyan-500/30' : ''
                  }`}
                >
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

      {/* AI Report Assistant */}
      <ReportAIAssistant context="technicians" data={data} />

      {/* Date range */}
      <div className="bg-slate-800/30 rounded-lg px-4 py-3 border border-slate-700/30">
        <div className="text-xs text-slate-500 flex flex-wrap gap-4">
          <span>Data range: {data.meta.period.from} to {data.meta.period.to}</span>
          {data.meta.dataFreshness && (
            <span>Last sync: {new Date(data.meta.dataFreshness).toLocaleString()}</span>
          )}
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
