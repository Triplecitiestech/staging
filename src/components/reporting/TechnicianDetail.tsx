'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import ReportFilterBar from './ReportFilters'
import StatCard from './StatCard'
import ComparisonBarChart from './ComparisonBarChart'
import type { ComparisonMetric } from './ComparisonBarChart'
import { TicketTable, TicketDetail } from '@/components/tickets'
import type { UnifiedTicketRow, UnifiedTicketNote, NoteVisibilityFilters, TicketListResponse } from '@/types/tickets'
import { useDemoMode } from '@/components/admin/DemoModeProvider'
import { DEFAULT_STAFF_VISIBILITY } from '@/types/tickets'

interface TechnicianDetailProps {
  resourceId: string
}

interface TechSummary {
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

export default function TechnicianDetail({ resourceId }: TechnicianDetailProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const demo = useDemoMode()
  const [techData, setTechData] = useState<TechSummary | null>(null)
  const [techComparison, setTechComparison] = useState<TechComparisonDetail | null>(null)
  const [ticketData, setTicketData] = useState<TicketListResponse | null>(null)
  const [loadingTech, setLoadingTech] = useState(true)
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [selectedTicket, setSelectedTicket] = useState<UnifiedTicketRow | null>(null)
  const [ticketNotes, setTicketNotes] = useState<UnifiedTicketNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [noteVisibility, setNoteVisibility] = useState<NoteVisibilityFilters>(DEFAULT_STAFF_VISIBILITY)

  const fetchTechData = useCallback(async (signal?: AbortSignal) => {
    setLoadingTech(true)
    try {
      const params = new URLSearchParams(searchParams.toString())
      if (!params.has('preset')) params.set('preset', 'last_30_days')
      params.set('compare', 'true')
      params.set('resourceId', resourceId)
      const res = await fetch(`/api/reports/technicians?${params.toString()}`, { signal })
      if (res.ok) {
        const json = await res.json()
        const tech = json.summary?.find((t: TechSummary) => String(t.resourceId) === resourceId)
        setTechData(tech || null)
        const tc = json.techComparison?.find((t: TechComparisonDetail) => String(t.resourceId) === resourceId)
        setTechComparison(tc || null)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
    }
    setLoadingTech(false)
  }, [searchParams, resourceId])

  const fetchTickets = useCallback(async (signal?: AbortSignal) => {
    setLoadingTickets(true)
    try {
      const params = new URLSearchParams(searchParams.toString())
      if (!params.has('preset')) params.set('preset', 'last_30_days')
      params.set('resourceId', resourceId)
      params.set('perspective', 'staff')
      const res = await fetch(`/api/tickets?${params.toString()}`, { signal })
      if (res.ok) setTicketData(await res.json())
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
    }
    setLoadingTickets(false)
  }, [searchParams, resourceId])

  useEffect(() => {
    const c = new AbortController()
    fetchTechData(c.signal)
    return () => c.abort()
  }, [fetchTechData])

  useEffect(() => {
    const c = new AbortController()
    fetchTickets(c.signal)
    return () => c.abort()
  }, [fetchTickets])

  const fetchNotes = useCallback(async (ticketId: string, vis: NoteVisibilityFilters) => {
    setNotesLoading(true)
    try {
      const params = new URLSearchParams({
        perspective: 'staff',
        showExternal: String(vis.showExternal),
        showInternal: String(vis.showInternal),
        showSystem: String(vis.showSystem),
      })
      const res = await fetch(`/api/tickets/${ticketId}/notes?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setTicketNotes(json.notes || [])
      } else {
        setTicketNotes([])
      }
    } catch {
      setTicketNotes([])
    }
    setNotesLoading(false)
  }, [])

  const handleTicketClick = (ticketId: string) => {
    const ticket = ticketData?.tickets.find(t => t.ticketId === ticketId)
    if (ticket) {
      setSelectedTicket(ticket)
      fetchNotes(ticketId, noteVisibility)
    }
  }

  const handleNoteVisibilityChange = (newVis: NoteVisibilityFilters) => {
    setNoteVisibility(newVis)
    if (selectedTicket) {
      fetchNotes(selectedTicket.ticketId, newVis)
    }
  }

  if (selectedTicket) {
    return (
      <div className="space-y-6">
        <TicketDetail
          ticket={selectedTicket}
          notes={ticketNotes}
          perspective="staff"
          noteVisibility={noteVisibility}
          onNoteVisibilityChange={handleNoteVisibilityChange}
          onBack={() => setSelectedTicket(null)}
          loading={notesLoading}
        />
      </div>
    )
  }

  const loading = loadingTech || loadingTickets
  const techName = techData ? demo.person(`${techData.firstName} ${techData.lastName}`) : 'Technician'

  // Build comparison chart data
  const comparisonChartData: ComparisonMetric[] = techComparison ? [
    { label: 'Tickets Closed', current: techComparison.ticketsClosed.current, previous: techComparison.ticketsClosed.previous },
    { label: 'Hours Logged', current: techComparison.hoursLogged.current, previous: techComparison.hoursLogged.previous, unit: 'h' },
    { label: 'Avg Resolution (min)', current: techComparison.avgResolution.current, previous: techComparison.avgResolution.previous, unit: 'm', invertColor: true },
    { label: 'FTR Rate', current: techComparison.firstTouchResolutionRate.current, previous: techComparison.firstTouchResolutionRate.previous, unit: '%' },
    { label: 'Avg First Response (min)', current: techComparison.avgFirstResponse.current, previous: techComparison.avgFirstResponse.previous, unit: 'm', invertColor: true },
  ] : []

  return (
    <div className="space-y-6">
      {/* Back button + title */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/admin/reporting/technicians')}
          className="text-sm text-slate-400 hover:text-white transition-colors"
        >
          {'\u2190'} Back to Technicians
        </button>
        <h1 className="text-2xl font-bold text-white">
          {loading ? 'Loading...' : techName}
        </h1>
      </div>

      {/* Filter bar */}
      <ReportFilterBar
        basePath={`/admin/reporting/technicians/${resourceId}`}
        showTrend={false}
        showComparison={false}
        showBreakdown={false}
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
        </div>
      ) : (
        <>
          {/* Technician stats */}
          {techData && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Tickets Closed"
                value={techData.ticketsClosed}
                tooltip="Count of tickets resolved during the selected period, assigned to this technician. Source: Autotask tickets filtered by completedDate and assignedResourceId."
                trend={techComparison ? {
                  direction: techComparison.ticketsClosed.direction as 'up' | 'down' | 'flat',
                  percent: techComparison.ticketsClosed.changePercent,
                  previous: techComparison.ticketsClosed.previous,
                } : undefined}
              />
              <StatCard
                label="Hours Logged"
                value={`${techData.hoursLogged}h`}
                tooltip="Total hours logged by this technician during the period. Source: TicketTimeEntry table filtered by resourceId and dateWorked."
                trend={techComparison ? {
                  direction: techComparison.hoursLogged.direction as 'up' | 'down' | 'flat',
                  percent: techComparison.hoursLogged.changePercent,
                  previous: `${techComparison.hoursLogged.previous}h`,
                } : undefined}
              />
              <StatCard
                label="Billable Hours"
                value={`${techData.billableHoursLogged}h`}
                tooltip="Hours logged that are marked as billable. Source: TicketTimeEntry where isNonBillable = false."
              />
              <StatCard
                label="Open Tickets"
                value={techData.openTicketCount}
                tooltip="Tickets currently assigned to this tech that have not reached a resolved status. Source: Autotask tickets with non-resolved status."
              />
            </div>
          )}

          {techData && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                label="Avg First Response"
                value={techData.avgFirstResponseMinutes !== null ? formatMinutes(techData.avgFirstResponseMinutes) : 'N/A'}
                tooltip="Average time between ticket creation and the first technician note on this tech's tickets. Source: earliest TicketNote minus Ticket.createDate."
                invertTrend
                trend={techComparison ? {
                  direction: techComparison.avgFirstResponse.direction as 'up' | 'down' | 'flat',
                  percent: techComparison.avgFirstResponse.changePercent,
                  previous: techComparison.avgFirstResponse.previous > 0 ? formatMinutes(techComparison.avgFirstResponse.previous) : '0',
                } : undefined}
              />
              <StatCard
                label="Avg Resolution Time"
                value={techData.avgResolutionMinutes !== null ? formatMinutes(techData.avgResolutionMinutes) : 'N/A'}
                tooltip="Average time from ticket creation to completion for this tech's resolved tickets. Source: completedDate minus createDate."
                invertTrend
                trend={techComparison ? {
                  direction: techComparison.avgResolution.direction as 'up' | 'down' | 'flat',
                  percent: techComparison.avgResolution.changePercent,
                  previous: techComparison.avgResolution.previous > 0 ? formatMinutes(techComparison.avgResolution.previous) : '0',
                } : undefined}
              />
              <StatCard
                label="First Touch Resolution"
                value={techData.firstTouchResolutionRate !== null ? `${techData.firstTouchResolutionRate}%` : 'N/A'}
                tooltip="Percentage of closed tickets resolved with exactly 1 technician interaction (note + time entry). Source: TicketNote and TicketTimeEntry counts per closed ticket."
                trend={techComparison ? {
                  direction: techComparison.firstTouchResolutionRate.direction as 'up' | 'down' | 'flat',
                  percent: techComparison.firstTouchResolutionRate.changePercent,
                  previous: `${techComparison.firstTouchResolutionRate.previous}%`,
                } : undefined}
              />
            </div>
          )}

          {/* Comparison chart — current vs previous period */}
          {comparisonChartData.length > 0 && (
            <ComparisonBarChart
              data={comparisonChartData}
              title={`${techName} — Current vs Previous Period`}
            />
          )}

          {!techData && (
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-6 text-center">
              <p className="text-slate-400 text-sm">No performance data found for this technician in the selected period.</p>
            </div>
          )}

          {/* Tickets section */}
          <h2 className="text-lg font-semibold text-white">Assigned Tickets</h2>

          {ticketData ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  label="Total Tickets"
                  value={ticketData.totalTickets}
                  tooltip="All tickets created during the selected period that are assigned to this technician."
                />
                <StatCard
                  label="Open"
                  value={ticketData.openCount}
                  tooltip="Tickets in this period that are not yet resolved."
                />
                <StatCard
                  label="Resolved"
                  value={ticketData.resolvedCount}
                  tooltip="Tickets in this period that have been moved to a resolved status."
                />
              </div>

              <TicketTable
                tickets={ticketData.tickets}
                perspective="staff"
                onTicketClick={handleTicketClick}
                autotaskWebUrl={ticketData.autotaskWebUrl}
              />
            </>
          ) : (
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-6 text-center">
              <p className="text-slate-400 text-sm">No ticket data available.</p>
            </div>
          )}
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
