'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import ReportFilterBar from './ReportFilters'
import StatCard from './StatCard'
import { TicketTable, TicketDetail } from '@/components/tickets'
import type { UnifiedTicketRow, UnifiedTicketNote, NoteVisibilityFilters, TicketListResponse } from '@/types/tickets'
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

export default function TechnicianDetail({ resourceId }: TechnicianDetailProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [techData, setTechData] = useState<TechSummary | null>(null)
  const [ticketData, setTicketData] = useState<TicketListResponse | null>(null)
  const [loadingTech, setLoadingTech] = useState(true)
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [selectedTicket, setSelectedTicket] = useState<UnifiedTicketRow | null>(null)
  const [ticketNotes, setTicketNotes] = useState<UnifiedTicketNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [noteVisibility, setNoteVisibility] = useState<NoteVisibilityFilters>(DEFAULT_STAFF_VISIBILITY)

  const fetchTechData = useCallback(async () => {
    setLoadingTech(true)
    try {
      const params = new URLSearchParams(searchParams.toString())
      if (!params.has('preset')) params.set('preset', 'last_30_days')
      const res = await fetch(`/api/reports/technicians?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        const tech = json.summary?.find((t: TechSummary) => String(t.resourceId) === resourceId)
        setTechData(tech || null)
      }
    } catch { /* ignore */ }
    setLoadingTech(false)
  }, [searchParams, resourceId])

  const fetchTickets = useCallback(async () => {
    setLoadingTickets(true)
    try {
      const params = new URLSearchParams(searchParams.toString())
      if (!params.has('preset')) params.set('preset', 'last_30_days')
      params.set('resourceId', resourceId)
      params.set('perspective', 'staff')
      const res = await fetch(`/api/tickets?${params.toString()}`)
      if (res.ok) setTicketData(await res.json())
    } catch { /* ignore */ }
    setLoadingTickets(false)
  }, [searchParams, resourceId])

  useEffect(() => { fetchTechData() }, [fetchTechData])
  useEffect(() => { fetchTickets() }, [fetchTickets])

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
  const techName = techData ? `${techData.firstName} ${techData.lastName}` : 'Technician'

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
              <StatCard label="Tickets Closed" value={techData.ticketsClosed} />
              <StatCard label="Hours Logged" value={`${techData.hoursLogged}h`} />
              <StatCard label="Billable Hours" value={`${techData.billableHoursLogged}h`} />
              <StatCard label="Open Tickets" value={techData.openTicketCount} />
            </div>
          )}

          {techData && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                label="Avg First Response"
                value={techData.avgFirstResponseMinutes !== null ? formatMinutes(techData.avgFirstResponseMinutes) : 'N/A'}
              />
              <StatCard
                label="Avg Resolution Time"
                value={techData.avgResolutionMinutes !== null ? formatMinutes(techData.avgResolutionMinutes) : 'N/A'}
              />
              <StatCard
                label="First Touch Resolution"
                value={techData.firstTouchResolutionRate !== null ? `${techData.firstTouchResolutionRate}%` : 'N/A'}
              />
            </div>
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
                <StatCard label="Total Tickets" value={ticketData.totalTickets} />
                <StatCard label="Open" value={ticketData.openCount} />
                <StatCard label="Resolved" value={ticketData.resolvedCount} />
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
