'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import ReportFilterBar from './ReportFilters'
import StatCard from './StatCard'
import TrendChart from './TrendChart'
import ComparisonBarChart from './ComparisonBarChart'
import type { ComparisonMetric } from './ComparisonBarChart'
import { useDemoMode } from '@/components/admin/DemoModeProvider'
import ReportAIAssistant from './ReportAIAssistant'
import DataSyncStatus from './DataSyncStatus'

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

interface ComparisonData {
  current: number
  previous: number
  changePercent: number | null
  direction: string
}

interface TechComparisonDetail {
  resourceId: number
  name: string
  ticketsClosed: ComparisonData
  hoursLogged: ComparisonData
  avgResolution: ComparisonData
  firstTouchResolutionRate: ComparisonData
  avgFirstResponse: ComparisonData
}

interface TechReport {
  summary: TechnicianSummary[]
  trend?: Array<{ date: string; label: string; value: number }>
  comparison?: {
    ticketsClosed: ComparisonData
    hoursLogged: ComparisonData
    avgResolution: ComparisonData
  }
  techComparison?: TechComparisonDetail[]
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
  const demo = useDemoMode()
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

  const totalClosed = demo.num(data.summary.reduce((s, t) => s + t.ticketsClosed, 0), 'tr-closed')
  const totalHours = demo.num(data.summary.reduce((s, t) => s + t.hoursLogged, 0), 'tr-hours')
  const totalBillable = demo.num(data.summary.reduce((s, t) => s + t.billableHoursLogged, 0), 'tr-billable')
  const totalOpen = demo.num(data.summary.reduce((s, t) => s + t.openTicketCount, 0), 'tr-open')

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
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString())
              if (!params.has('preset')) params.set('preset', 'last_30_days')
              window.open(`/api/reports/technicians/pdf?${params.toString()}`, '_blank')
            }}
            className="px-4 py-2 text-sm bg-cyan-600 text-white rounded-lg hover:bg-cyan-500 transition-colors whitespace-nowrap"
            title="Download technician performance report as PDF"
          >
            Download PDF
          </button>
          <button
            onClick={() => setShowAtSearch(!showAtSearch)}
            className="px-4 py-2 text-sm bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors whitespace-nowrap"
          >
            {showAtSearch ? 'Hide Autotask Search' : 'Browse Autotask Users'}
          </button>
        </div>
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
                    <span className="text-sm text-white">{demo.person(r.name)}</span>
                    <span className="text-xs text-slate-500 ml-2">{demo.email(r.email)}</span>
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
          tooltip="Count of tickets moved to a resolved status (Complete, Approved, etc.) within the selected date range. Source: Autotask tickets synced to local DB, filtered by completedDate or status history."
          trend={data.comparison?.ticketsClosed ? {
            direction: data.comparison.ticketsClosed.direction as 'up' | 'down' | 'flat',
            percent: data.comparison.ticketsClosed.changePercent,
            previous: data.comparison.ticketsClosed.previous,
          } : undefined}
        />
        <StatCard
          label="Total Hours Logged"
          value={`${Math.round(totalHours * 10) / 10}h`}
          tooltip="Sum of all time entries logged during the selected period. Includes both billable and non-billable hours. Source: Autotask time entries (TicketTimeEntry table), filtered by dateWorked."
          trend={data.comparison?.hoursLogged ? {
            direction: data.comparison.hoursLogged.direction as 'up' | 'down' | 'flat',
            percent: data.comparison.hoursLogged.changePercent,
            previous: `${data.comparison.hoursLogged.previous}h`,
          } : undefined}
        />
        <StatCard
          label="Active Technicians"
          value={data.summary.length}
          tooltip="Number of technicians who have at least one ticket assigned or time entry logged during this period. Excludes API/system users."
        />
        <StatCard
          label="Avg Resolution Time"
          value={data.comparison?.avgResolution ? formatMinutes(data.comparison.avgResolution.current) : 'N/A'}
          tooltip="Average time from ticket creation to completion, across all resolved tickets in this period. Lower is better. Source: completedDate minus createDate on resolved Autotask tickets."
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
        <StatCard
          label="First Touch Resolution Rate"
          value={teamFTR !== null ? `${teamFTR}%` : 'N/A'}
          subValue="Tickets resolved with 1 technician interaction"
          tooltip="Percentage of closed tickets that were resolved with exactly 1 total technician interaction (notes + time entries combined). A high rate means more issues are solved on first contact. Source: TicketNote and TicketTimeEntry counts per closed ticket."
        />
        <StatCard
          label="Avg First Response Time"
          value={teamFRT !== null ? formatMinutes(teamFRT) : 'N/A'}
          subValue="Time from ticket creation to first tech response"
          tooltip="Average time between ticket creation and the first technician note. Measures how quickly techs start working on new tickets. Source: earliest TicketNote.createDateTime minus Ticket.createDate."
        />
        <StatCard
          label="Billable Utilization"
          value={`${utilizationRate}%`}
          subValue={`${totalBillable.toFixed(1)}h billable of ${totalHours.toFixed(1)}h total`}
          tooltip="Percentage of total logged hours that are billable. Calculated as billableHours / totalHours. Source: TicketTimeEntry.isNonBillable flag from Autotask."
        />
        <StatCard
          label="Open Backlog"
          value={totalOpen}
          subValue="Tickets currently assigned and unresolved"
          tooltip="Count of tickets assigned to technicians that are not yet in a resolved status. Includes tickets created before the selected period. Source: Autotask tickets with non-resolved status."
        />
      </div>

      {/* Trend */}
      {data.trend && data.trend.length > 0 && (
        <TrendChart data={data.trend} title="Tickets Closed Over Time" />
      )}

      {/* Per-technician comparison chart (current vs previous period) */}
      {data.techComparison && data.techComparison.length > 0 && (() => {
        // When a specific tech is selected (1 tech), show detailed metrics
        // When showing all techs, show tickets closed comparison for top techs
        const isSingleTech = data.techComparison!.length === 1
        const chartData: ComparisonMetric[] = isSingleTech
          ? (() => {
              const tc = data.techComparison![0]
              return [
                { label: 'Tickets Closed', current: tc.ticketsClosed.current, previous: tc.ticketsClosed.previous },
                { label: 'Hours Logged', current: tc.hoursLogged.current, previous: tc.hoursLogged.previous, unit: 'h' },
                { label: 'Avg Resolution (min)', current: tc.avgResolution.current, previous: tc.avgResolution.previous, unit: 'm', invertColor: true },
                { label: 'FTR Rate', current: tc.firstTouchResolutionRate.current, previous: tc.firstTouchResolutionRate.previous, unit: '%' },
                { label: 'Avg First Response (min)', current: tc.avgFirstResponse.current, previous: tc.avgFirstResponse.previous, unit: 'm', invertColor: true },
              ]
            })()
          : data.techComparison!
              .filter(tc => tc.ticketsClosed.current > 0 || tc.ticketsClosed.previous > 0)
              .slice(0, 10)
              .map(tc => ({
                label: tc.name.split(' ')[0],
                current: tc.ticketsClosed.current,
                previous: tc.ticketsClosed.previous,
              }))

        const chartTitle = isSingleTech
          ? `${demo.person(data.techComparison![0].name)} — Current vs Previous Period`
          : 'Tickets Closed — Current vs Previous Period (Top Techs)'

        return <ComparisonBarChart data={chartData} title={chartTitle} />
      })()}

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
                    <div className="text-sm text-white">{demo.person(`${tech.firstName} ${tech.lastName}`)}</div>
                    <div className="text-xs text-slate-500 hidden sm:block">{demo.email(tech.email)}</div>
                  </td>
                  <td className="text-right px-4 py-3 text-sm text-white">{demo.num(tech.ticketsClosed, `tr-${tech.resourceId}-tc`)}</td>
                  <td className="text-right px-4 py-3 text-sm text-white">{demo.num(tech.hoursLogged, `tr-${tech.resourceId}-hrs`)}h</td>
                  <td className="text-right px-4 py-3 text-sm text-white hidden md:table-cell">{demo.num(tech.billableHoursLogged, `tr-${tech.resourceId}-bhr`)}h</td>
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

      {/* Data source + sync status */}
      <DataSyncStatus
        source="Autotask PSA"
        syncFrequency="every 2 hours"
        lastSyncAt={data.meta.dataFreshness}
        dataRange={data.meta.period}
      />
    </div>
  )
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`
  return `${(minutes / 1440).toFixed(1)}d`
}
