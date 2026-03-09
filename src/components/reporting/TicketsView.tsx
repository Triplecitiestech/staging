'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import ReportFilterBar from './ReportFilters'
import StatCard from './StatCard'
import { TicketTable, TicketDetail } from '@/components/tickets'
import type { UnifiedTicketRow, UnifiedTicketNote, NoteVisibilityFilters, TicketListResponse } from '@/types/tickets'
import { DEFAULT_STAFF_VISIBILITY } from '@/types/tickets'

export default function TicketsView() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [data, setData] = useState<TicketListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedTicket, setSelectedTicket] = useState<UnifiedTicketRow | null>(null)
  const [ticketNotes, setTicketNotes] = useState<UnifiedTicketNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [noteVisibility, setNoteVisibility] = useState<NoteVisibilityFilters>(DEFAULT_STAFF_VISIBILITY)

  const companyId = searchParams.get('companyId')
  const resourceId = searchParams.get('resourceId')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams(searchParams.toString())
      if (!params.has('preset')) params.set('preset', 'last_30_days')
      params.set('perspective', 'staff')
      const res = await fetch(`/api/tickets?${params.toString()}`)
      if (res.ok) setData(await res.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [searchParams])

  useEffect(() => { fetchData() }, [fetchData])

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
    const ticket = data?.tickets.find(t => t.ticketId === ticketId)
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

  // If a ticket is selected, show the detail view
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="text-sm text-slate-400 hover:text-white transition-colors"
        >
          {'\u2190'} Back
        </button>
        <h1 className="text-2xl font-bold text-white">
          {loading ? 'Loading...' : data?.companyName || 'Tickets'}
        </h1>
      </div>

      {/* Filter bar */}
      <ReportFilterBar
        basePath="/admin/reporting/companies/tickets"
        showTrend={false}
        showComparison={false}
        showBreakdown={false}
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
        </div>
      ) : data ? (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard label="Total Tickets" value={data.totalTickets} />
            <StatCard label="Open" value={data.openCount} />
            <StatCard label="Resolved" value={data.resolvedCount} />
            <StatCard
              label="SLA Response"
              value={data.sla?.responseCompliance !== null && data.sla?.responseCompliance !== undefined ? `${data.sla.responseCompliance}%` : 'N/A'}
            />
            <StatCard
              label="SLA Resolution"
              value={data.sla?.resolutionCompliance !== null && data.sla?.resolutionCompliance !== undefined ? `${data.sla.resolutionCompliance}%` : 'N/A'}
            />
          </div>

          {/* Ticket table */}
          <TicketTable
            tickets={data.tickets}
            perspective="staff"
            onTicketClick={handleTicketClick}
            autotaskWebUrl={data.autotaskWebUrl}
          />

          {/* Date range footer */}
          {data.meta && (
            <div className="bg-slate-800/30 rounded-lg px-4 py-3 border border-slate-700/30">
              <div className="text-xs text-slate-500 flex flex-wrap gap-4">
                <span>Data range: {data.meta.period.from} to {data.meta.period.to}</span>
                {companyId && <span>Company: {data.companyName}</span>}
                {resourceId && <span>Technician: {data.companyName}</span>}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-slate-500">Failed to load ticket data</p>
      )}
    </div>
  )
}
