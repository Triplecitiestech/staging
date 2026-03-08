'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import ReportFilterBar from './ReportFilters'
import StatCard from './StatCard'

interface TicketRow {
  ticketId: string
  ticketNumber: string
  title: string
  status: number
  isResolved: boolean
  priority: number
  priorityLabel: string
  assignedTo: string
  createDate: string
  completedDate: string | null
  firstResponseMinutes: number | null
  resolutionMinutes: number | null
  hoursLogged: number
  slaResponseMet: boolean | null
  slaResolutionMet: boolean | null
}

interface TicketsData {
  companyName: string
  companyId: string
  totalTickets: number
  resolvedCount: number
  openCount: number
  sla: {
    responseCompliance: number | null
    resolutionCompliance: number | null
    responseSampleSize: number
    resolutionSampleSize: number
  }
  tickets: TicketRow[]
  autotaskWebUrl: string | null
  meta: { period: { from: string; to: string }; generatedAt: string }
}

type SortField = 'ticketNumber' | 'priority' | 'status' | 'assignedTo' | 'createDate' | 'hoursLogged' | 'resolutionMinutes'
type SortDir = 'asc' | 'desc'

interface TicketNote {
  id: string
  title: string | null
  description: string | null
  author: string
  authorType: 'technician' | 'customer'
  timestamp: string
}

export default function TicketsView() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [data, setData] = useState<TicketsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all')
  const [sortField, setSortField] = useState<SortField>('createDate')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null)
  const [ticketNotes, setTicketNotes] = useState<Record<string, TicketNote[]>>({})
  const [notesLoading, setNotesLoading] = useState<string | null>(null)

  const companyId = searchParams.get('companyId')
  const resourceId = searchParams.get('resourceId')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams(searchParams.toString())
      if (!params.has('preset')) params.set('preset', 'last_30_days')
      const res = await fetch(`/api/reports/companies/tickets?${params.toString()}`)
      if (res.ok) setData(await res.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [searchParams])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir(field === 'createDate' ? 'desc' : 'asc')
    }
  }

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return ''
    return sortDir === 'asc' ? ' \u2191' : ' \u2193'
  }

  const toggleTicket = async (ticketId: string) => {
    if (expandedTicket === ticketId) {
      setExpandedTicket(null)
      return
    }
    setExpandedTicket(ticketId)
    if (!ticketNotes[ticketId]) {
      setNotesLoading(ticketId)
      try {
        const res = await fetch(`/api/reports/tickets/notes?ticketId=${ticketId}`)
        if (res.ok) {
          const json = await res.json()
          setTicketNotes(prev => ({ ...prev, [ticketId]: json.notes || [] }))
        } else {
          setTicketNotes(prev => ({ ...prev, [ticketId]: [] }))
        }
      } catch {
        setTicketNotes(prev => ({ ...prev, [ticketId]: [] }))
      }
      setNotesLoading(null)
    }
  }

  const filteredTickets = (data?.tickets || [])
    .filter(t => {
      if (statusFilter === 'open' && t.isResolved) return false
      if (statusFilter === 'resolved' && !t.isResolved) return false
      if (search) {
        const q = search.toLowerCase()
        return t.title.toLowerCase().includes(q)
          || t.ticketNumber.toLowerCase().includes(q)
          || t.assignedTo.toLowerCase().includes(q)
      }
      return true
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortField) {
        case 'ticketNumber': return a.ticketNumber.localeCompare(b.ticketNumber) * dir
        case 'priority': return (a.priority - b.priority) * dir
        case 'status': return (Number(a.isResolved) - Number(b.isResolved)) * dir
        case 'assignedTo': return a.assignedTo.localeCompare(b.assignedTo) * dir
        case 'createDate': return (new Date(a.createDate).getTime() - new Date(b.createDate).getTime()) * dir
        case 'hoursLogged': return (a.hoursLogged - b.hoursLogged) * dir
        case 'resolutionMinutes': return ((a.resolutionMinutes || 0) - (b.resolutionMinutes || 0)) * dir
        default: return 0
      }
    })

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
              value={data.sla.responseCompliance !== null ? `${data.sla.responseCompliance}%` : 'N/A'}
            />
            <StatCard
              label="SLA Resolution"
              value={data.sla.resolutionCompliance !== null ? `${data.sla.resolutionCompliance}%` : 'N/A'}
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Search tickets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64 px-3 py-1.5 text-sm bg-slate-900/50 border border-slate-600/50 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
            <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1">
              {(['all', 'open', 'resolved'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    statusFilter === s ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-500">{filteredTickets.length} tickets</span>
          </div>

          {/* Tickets table with sortable headers */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <SortableHeader label="Ticket" field="ticketNumber" current={sortField} dir={sortDir} onSort={handleSort} sortIndicator={sortIndicator} />
                    <th className="text-left text-xs text-slate-400 font-medium px-4 py-3 hidden md:table-cell">Title</th>
                    <SortableHeader label="Priority" field="priority" current={sortField} dir={sortDir} onSort={handleSort} sortIndicator={sortIndicator} className="text-center" />
                    <SortableHeader label="Status" field="status" current={sortField} dir={sortDir} onSort={handleSort} sortIndicator={sortIndicator} className="text-center" />
                    <SortableHeader label="Assigned" field="assignedTo" current={sortField} dir={sortDir} onSort={handleSort} sortIndicator={sortIndicator} className="hidden lg:table-cell" />
                    <SortableHeader label="Resolution" field="resolutionMinutes" current={sortField} dir={sortDir} onSort={handleSort} sortIndicator={sortIndicator} className="text-right hidden lg:table-cell" />
                    <SortableHeader label="Hours" field="hoursLogged" current={sortField} dir={sortDir} onSort={handleSort} sortIndicator={sortIndicator} className="text-right hidden md:table-cell" />
                    <th className="text-center text-xs text-slate-400 font-medium px-4 py-3 hidden lg:table-cell">SLA</th>
                    <SortableHeader label="Created" field="createDate" current={sortField} dir={sortDir} onSort={handleSort} sortIndicator={sortIndicator} className="text-right" />
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((ticket) => (
                    <TicketRowWithExpand
                      key={ticket.ticketId}
                      ticket={ticket}
                      isExpanded={expandedTicket === ticket.ticketId}
                      onToggle={() => toggleTicket(ticket.ticketId)}
                      notes={ticketNotes[ticket.ticketId]}
                      notesLoading={notesLoading === ticket.ticketId}
                      autotaskWebUrl={data?.autotaskWebUrl || null}
                    />
                  ))}
                  {filteredTickets.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-slate-500">
                        No tickets found for this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Date range footer */}
          <div className="bg-slate-800/30 rounded-lg px-4 py-3 border border-slate-700/30">
            <div className="text-xs text-slate-500 flex flex-wrap gap-4">
              <span>Data range: {data.meta.period.from} to {data.meta.period.to}</span>
              {companyId && <span>Company: {data.companyName}</span>}
              {resourceId && <span>Technician: {data.companyName}</span>}{/* companyName holds tech name when resourceId is set */}
            </div>
          </div>
        </>
      ) : (
        <p className="text-slate-500">Failed to load ticket data</p>
      )}
    </div>
  )
}

function TicketRowWithExpand({ ticket, isExpanded, onToggle, notes, notesLoading, autotaskWebUrl }: {
  ticket: TicketRow
  isExpanded: boolean
  onToggle: () => void
  notes?: TicketNote[]
  notesLoading: boolean
  autotaskWebUrl: string | null
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-slate-700/30 hover:bg-slate-700/20 cursor-pointer ${isExpanded ? 'bg-slate-700/20' : ''}`}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{isExpanded ? '\u25BC' : '\u25B6'}</span>
            <div>
              {autotaskWebUrl ? (
                <a
                  href={`${autotaskWebUrl}?ticketId=${ticket.ticketId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm text-cyan-400 font-mono hover:text-cyan-300 hover:underline"
                  title="Open in Autotask"
                >
                  {ticket.ticketNumber}
                </a>
              ) : (
                <span className="text-sm text-cyan-400 font-mono">{ticket.ticketNumber}</span>
              )}
              <div className="text-xs text-slate-400 md:hidden truncate max-w-[200px]">{ticket.title}</div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 hidden md:table-cell">
          <span className="text-sm text-white truncate block max-w-[300px]">{ticket.title}</span>
        </td>
        <td className="text-center px-4 py-3">
          <PriorityBadge priority={ticket.priority} label={ticket.priorityLabel} />
        </td>
        <td className="text-center px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            ticket.isResolved ? 'bg-emerald-400/20 text-emerald-400' : 'bg-cyan-400/20 text-cyan-400'
          }`}>
            {ticket.isResolved ? 'Resolved' : 'Open'}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-slate-300 hidden lg:table-cell">{ticket.assignedTo}</td>
        <td className="text-right px-4 py-3 text-sm text-slate-300 hidden lg:table-cell">
          {ticket.resolutionMinutes !== null ? formatMinutes(ticket.resolutionMinutes) : '-'}
        </td>
        <td className="text-right px-4 py-3 text-sm text-white hidden md:table-cell">
          {ticket.hoursLogged > 0 ? `${Math.round(ticket.hoursLogged * 10) / 10}h` : '-'}
        </td>
        <td className="text-center px-4 py-3 hidden lg:table-cell">
          <SlaIndicator responseMet={ticket.slaResponseMet} resolutionMet={ticket.slaResolutionMet} />
        </td>
        <td className="text-right px-4 py-3 text-xs text-slate-400">
          {new Date(ticket.createDate).toLocaleDateString()}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={9} className="bg-slate-900/50 px-6 py-4 border-b border-slate-700/30">
            <div className="space-y-3">
              {/* Ticket details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-slate-500">Title:</span>{' '}
                  <span className="text-white">{ticket.title}</span>
                </div>
                <div>
                  <span className="text-slate-500">Assigned:</span>{' '}
                  <span className="text-white">{ticket.assignedTo}</span>
                </div>
                {autotaskWebUrl && (
                  <div>
                    <a
                      href={`${autotaskWebUrl}?ticketId=${ticket.ticketId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 hover:underline text-xs"
                    >
                      Open in Autotask &rarr;
                    </a>
                  </div>
                )}
                <div>
                  <span className="text-slate-500">Created:</span>{' '}
                  <span className="text-white">{new Date(ticket.createDate).toLocaleString()}</span>
                </div>
                {ticket.completedDate && (
                  <div>
                    <span className="text-slate-500">Completed:</span>{' '}
                    <span className="text-white">{new Date(ticket.completedDate).toLocaleString()}</span>
                  </div>
                )}
                {ticket.firstResponseMinutes !== null && (
                  <div>
                    <span className="text-slate-500">First Response:</span>{' '}
                    <span className="text-white">{formatMinutes(ticket.firstResponseMinutes)}</span>
                  </div>
                )}
              </div>

              {/* Notes section */}
              <div>
                <h4 className="text-xs font-medium text-slate-400 mb-2">Notes (external only)</h4>
                {notesLoading ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="animate-spin inline-block h-3 w-3 border border-slate-500 border-t-cyan-400 rounded-full" />
                    Loading notes...
                  </div>
                ) : notes && notes.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {notes.map((note) => (
                      <div key={note.id} className="bg-slate-800/60 rounded-lg px-3 py-2 border border-slate-700/30">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-medium ${
                            note.authorType === 'technician' ? 'text-cyan-400' : 'text-emerald-400'
                          }`}>
                            {note.author}
                          </span>
                          <span className="text-xs text-slate-500">
                            {new Date(note.timestamp).toLocaleString()}
                          </span>
                        </div>
                        {note.title && <p className="text-xs text-slate-300 font-medium">{note.title}</p>}
                        {note.description && (
                          <p className="text-xs text-slate-400 whitespace-pre-wrap line-clamp-6">{note.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No external notes found</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function SortableHeader({ label, field, onSort, sortIndicator, className = '' }: {
  label: string
  field: SortField
  current?: SortField
  dir?: SortDir
  onSort: (f: SortField) => void
  sortIndicator: (f: SortField) => string
  className?: string
}) {
  return (
    <th
      onClick={() => onSort(field)}
      className={`text-xs text-slate-400 font-medium px-4 py-3 cursor-pointer hover:text-white transition-colors select-none ${className}`}
    >
      {label}{sortIndicator(field)}
    </th>
  )
}

function PriorityBadge({ priority, label }: { priority: number; label: string }) {
  const colors: Record<number, string> = {
    1: 'bg-rose-400/20 text-rose-400',
    2: 'bg-orange-400/20 text-orange-400',
    3: 'bg-cyan-400/20 text-cyan-400',
    4: 'bg-slate-400/20 text-slate-400',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${colors[priority] || 'bg-slate-400/20 text-slate-400'}`}>
      {label}
    </span>
  )
}

function SlaIndicator({ responseMet, resolutionMet }: { responseMet: boolean | null; resolutionMet: boolean | null }) {
  if (responseMet === null && resolutionMet === null) return <span className="text-xs text-slate-500">-</span>
  const anyFailed = responseMet === false || resolutionMet === false
  const allMet = (responseMet === null || responseMet) && (resolutionMet === null || resolutionMet)
  return (
    <span className={`text-xs ${anyFailed ? 'text-rose-400' : allMet ? 'text-emerald-400' : 'text-slate-400'}`}>
      {anyFailed ? 'Missed' : allMet ? 'Met' : '-'}
    </span>
  )
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`
  return `${(minutes / 1440).toFixed(1)}d`
}
