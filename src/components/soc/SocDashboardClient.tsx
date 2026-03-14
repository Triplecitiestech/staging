'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { TicketTable, TicketDetail } from '@/components/tickets'
import type { UnifiedTicketRow, UnifiedTicketNote, NoteVisibilityFilters } from '@/types/tickets'
import { DEFAULT_STAFF_VISIBILITY } from '@/types/tickets'
import StatCard from '@/components/reporting/StatCard'

interface JobStatus {
  jobName: string
  lastRunAt: string | null
  lastRunStatus: string | null
  lastRunDurationMs: number | null
  lastRunError: string | null
  lastRunMeta: Record<string, unknown> | null
}

interface TodayStats {
  analyzed: number
  falsePositives: number
  escalated: number
  suspicious: number
}

interface StatusData {
  jobs: JobStatus[]
  config: Record<string, string>
  today: TodayStats
  pending: number
  autotaskWebUrl: string | null
}

interface SocTicketRow extends UnifiedTicketRow {
  companyName: string | null
  socVerdict: string | null
  socConfidence: number | null
}

interface TicketsData {
  tickets: SocTicketRow[]
  totalTickets: number
  openCount: number
  resolvedCount: number
  suspiciousCount: number
  autotaskWebUrl: string | null
}

interface ActivityEntry {
  id: string
  action: string
  detail: string | null
  incidentId: string | null
  autotaskTicketId: string | null
  confidenceScore: number | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

interface TicketDetailData {
  autotaskTicketId: string
  ticketNumber: string
  title: string
  status: 'processed' | 'skipped' | 'error'
  verdict?: string
  confidence?: number
  reason?: string
}

interface RunResultData {
  ticketsFound: number
  ticketsProcessed: number
  falsePositives: number
  escalated: number
  skipped: number
  dryRun: boolean
  errors?: string[]
  durationMs?: number
  ticketDetails?: TicketDetailData[]
}

export default function SocDashboardClient() {
  const [status, setStatus] = useState<StatusData | null>(null)
  const [ticketsData, setTicketsData] = useState<TicketsData | null>(null)
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [activeTab, setActiveTab] = useState<'open' | 'all' | 'activity'>('open')
  const [ticketFilter, setTicketFilter] = useState<'actionable' | 'all'>('actionable')
  const [runError, setRunError] = useState<string | null>(null)
  const [lastRunResult, setLastRunResult] = useState<RunResultData | null>(null)

  // Ticket detail view state
  const [selectedTicket, setSelectedTicket] = useState<UnifiedTicketRow | null>(null)
  const [ticketNotes, setTicketNotes] = useState<UnifiedTicketNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [noteVisibility, setNoteVisibility] = useState<NoteVisibilityFilters>(DEFAULT_STAFF_VISIBILITY)

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, ticketsRes, activityRes] = await Promise.all([
        fetch('/api/soc/status'),
        fetch(`/api/soc/tickets?days=30&filter=${ticketFilter}`),
        fetch('/api/soc/activity?limit=20'),
      ])
      if (statusRes.ok) setStatus(await statusRes.json())
      if (ticketsRes.ok) setTicketsData(await ticketsRes.json())
      if (activityRes.ok) {
        const data = await activityRes.json()
        setActivity(data.entries || [])
      }
    } catch {
      // Silently handle — tables may not exist yet
    } finally {
      setLoading(false)
    }
  }, [ticketFilter])

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
    const ticket = ticketsData?.tickets.find(t => t.ticketId === ticketId)
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

  const handleRunNow = async (reprocess = false) => {
    setRunning(true)
    setRunError(null)
    setLastRunResult(null)
    try {
      const res = await fetch('/api/soc/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reprocess }) })
      const text = await res.text()
      let data
      try {
        data = JSON.parse(text)
      } catch {
        setRunError(`Server returned invalid response (${res.status}): ${text.slice(0, 200) || 'empty'}`)
        return
      }
      if (!res.ok || data.status === 'error') {
        setRunError(data.message || `Error ${res.status}`)
      } else if (data.ticketsFound === 0) {
        setRunError(data.message || 'No tickets to process')
      } else {
        setLastRunResult({
          ticketsFound: data.ticketsFound || 0,
          ticketsProcessed: data.ticketsProcessed || 0,
          falsePositives: data.falsePositives || 0,
          escalated: data.escalated || 0,
          skipped: data.skipped || 0,
          dryRun: data.dryRun || false,
          errors: data.errors,
          durationMs: data.durationMs,
          ticketDetails: data.ticketDetails,
        })
        await fetchData()
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setRunning(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500" />
      </div>
    )
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
          onBack={() => { setSelectedTicket(null); setTicketNotes([]) }}
          loading={notesLoading}
        />
      </div>
    )
  }

  const triageJob = status?.jobs?.find(j => j.jobName === 'soc-triage')
  const isDryRun = status?.config?.dry_run === 'true'
  const isEnabled = status?.config?.agent_enabled !== 'false'

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  // Filter tickets based on active tab
  const openTickets = ticketsData?.tickets.filter(t => !t.isResolved) || []
  const allTickets = ticketsData?.tickets || []

  const actionIcon = (action: string) => {
    const icons: Record<string, string> = {
      analyzed: 'text-cyan-400',
      note_added: 'text-green-400',
      error: 'text-red-400',
      skipped: 'text-slate-500',
      correlated: 'text-violet-400',
      escalated: 'text-rose-400',
      override: 'text-rose-400',
    }
    return icons[action] || 'text-slate-400'
  }

  const verdictBadge = (verdict: string | null) => {
    const colors: Record<string, string> = {
      false_positive: 'bg-green-500/20 text-green-400 border-green-500/30',
      suspicious: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      escalate: 'bg-red-500/20 text-red-400 border-red-500/30',
      informational: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    }
    const label = verdict?.replace('_', ' ') || 'pending'
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${colors[verdict || ''] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}>
        {label}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* SOC Agent Status Bar */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${isEnabled ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`} />
              <span className="text-sm font-medium text-white">
                SOC Agent: {isEnabled ? 'Running' : 'Disabled'}
              </span>
            </div>
            {isDryRun && (
              <span className="px-2 py-0.5 text-xs font-medium bg-violet-500/20 text-violet-400 border border-violet-500/30 rounded-full">
                Dry Run
              </span>
            )}
            <span className="text-sm text-slate-400">
              Last run: {timeAgo(triageJob?.lastRunAt || null)}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">
              Queue: <span className="text-white font-medium">{status?.pending || 0}</span> pending
            </span>
            <span className="text-sm text-slate-400 hidden sm:inline">
              Today: <span className="text-white">{status?.today?.analyzed || 0}</span> analyzed
              {' · '}<span className="text-green-400">{status?.today?.falsePositives || 0}</span> FP
              {' · '}<span className="text-red-400">{status?.today?.escalated || 0}</span> escalated
            </span>
            <button
              onClick={() => handleRunNow(false)}
              disabled={running}
              className="px-3 py-1.5 text-sm font-medium bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {running ? 'Running...' : 'Run Now'}
            </button>
            <button
              onClick={() => handleRunNow(true)}
              disabled={running}
              className="px-3 py-1.5 text-sm font-medium bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors disabled:opacity-50"
              title="Clear previous analyses and re-run the full pipeline on all recent tickets"
            >
              Reprocess
            </button>
          </div>
        </div>
      </div>

      {/* Run Result Banner */}
      {runError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-red-400">Run Issue</p>
              <p className="text-sm text-slate-300 mt-1">{runError}</p>
            </div>
            <button onClick={() => setRunError(null)} className="text-slate-500 hover:text-white text-lg leading-none">&times;</button>
          </div>
        </div>
      )}
      {lastRunResult && (
        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-cyan-400">
                Run Complete{lastRunResult.dryRun ? ' (Dry Run)' : ''}
                {lastRunResult.durationMs ? ` — ${(lastRunResult.durationMs / 1000).toFixed(1)}s` : ''}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm">
                <span className="text-slate-300"><span className="text-white font-medium">{lastRunResult.ticketsFound}</span> tickets found</span>
                <span className="text-slate-300"><span className="text-white font-medium">{lastRunResult.ticketsProcessed}</span> processed</span>
                <span className="text-slate-300"><span className="text-green-400 font-medium">{lastRunResult.falsePositives}</span> false positives</span>
                <span className="text-slate-300"><span className="text-red-400 font-medium">{lastRunResult.escalated}</span> escalated</span>
                {lastRunResult.skipped > 0 && (
                  <span className="text-slate-300"><span className="text-slate-400 font-medium">{lastRunResult.skipped}</span> skipped (non-security)</span>
                )}
              </div>
              {lastRunResult.errors && lastRunResult.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  {lastRunResult.errors.map((e, i) => <p key={i} className="text-xs text-rose-400">{e}</p>)}
                </div>
              )}
              {lastRunResult.ticketDetails && lastRunResult.ticketDetails.length > 0 && (
                <div className="mt-3 border-t border-cyan-500/20 pt-3">
                  <p className="text-xs font-medium text-slate-400 mb-2">Ticket Breakdown</p>
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    {lastRunResult.ticketDetails.map(t => (
                      <div key={t.autotaskTicketId} className="flex items-center gap-3 text-xs">
                        <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                          t.status === 'processed' ? 'bg-green-500'
                          : t.status === 'error' ? 'bg-red-500'
                          : 'bg-slate-500'
                        }`} />
                        <span className="text-slate-500 font-mono w-16 flex-shrink-0">{t.ticketNumber}</span>
                        <span className="text-white truncate flex-1 min-w-0">{t.title}</span>
                        {t.verdict && (
                          <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            t.verdict === 'false_positive' ? 'bg-green-500/20 text-green-400'
                            : t.verdict === 'escalate' ? 'bg-red-500/20 text-red-400'
                            : t.verdict === 'suspicious' ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-blue-500/20 text-blue-400'
                          }`}>
                            {t.verdict.replace('_', ' ')}
                          </span>
                        )}
                        {t.confidence != null && (
                          <span className="text-slate-500 flex-shrink-0 w-10 text-right">{Math.round(t.confidence * 100)}%</span>
                        )}
                        {t.status === 'skipped' && (
                          <span className="text-slate-500 flex-shrink-0 italic">skipped</span>
                        )}
                        {t.status === 'error' && (
                          <span className="text-red-400 flex-shrink-0 italic truncate max-w-[200px]" title={t.reason}>
                            {t.reason || 'error'}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => setLastRunResult(null)} className="text-slate-500 hover:text-white text-lg leading-none flex-shrink-0">&times;</button>
          </div>
        </div>
      )}

      {/* Stats Cards — clickable to filter */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button onClick={() => setActiveTab('all')} className="text-left">
          <StatCard label="Total Tickets" value={ticketsData?.totalTickets || 0} />
        </button>
        <button onClick={() => setActiveTab('open')} className="text-left">
          <StatCard label="Open" value={ticketsData?.openCount || 0} />
        </button>
        <button onClick={() => setActiveTab('all')} className="text-left">
          <StatCard label="Resolved" value={ticketsData?.resolvedCount || 0} />
        </button>
        <button onClick={() => setActiveTab('all')} className="text-left">
          <StatCard label="Suspicious" value={ticketsData?.suspiciousCount || 0} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/10 pb-px">
        {/* Ticket scope filter */}
        <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-0.5 mr-2">
          <button
            onClick={() => setTicketFilter('actionable')}
            className={`px-2 py-1 text-xs rounded-md transition-colors ${
              ticketFilter === 'actionable' ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            SOC Only
          </button>
          <button
            onClick={() => setTicketFilter('all')}
            className={`px-2 py-1 text-xs rounded-md transition-colors ${
              ticketFilter === 'all' ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            All
          </button>
        </div>
        {[
          { key: 'open' as const, label: 'Open Tickets', count: ticketsData?.openCount },
          { key: 'all' as const, label: 'All Tickets', count: ticketsData?.totalTickets },
          { key: 'activity' as const, label: 'Activity Feed' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.key
                ? 'bg-slate-800/50 text-white border-b-2 border-cyan-500'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.label}
            {tab.count != null && (
              <span className="ml-1.5 text-xs text-slate-500">({tab.count})</span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex gap-2">
          <Link href="/admin/soc/incidents" className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors">
            Incidents
          </Link>
          <Link href="/admin/soc/rules" className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors">
            Rules
          </Link>
          <Link href="/admin/soc/config" className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors">
            Config
          </Link>
        </div>
      </div>

      {/* Tab Content */}
      {(activeTab === 'open' || activeTab === 'all') && (
        <TicketTable
          tickets={activeTab === 'open' ? openTickets : allTickets}
          perspective="staff"
          onTicketClick={handleTicketClick}
          autotaskWebUrl={ticketsData?.autotaskWebUrl}
        />
      )}

      {activeTab === 'activity' && (
        <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg divide-y divide-white/5">
          {activity.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              No activity yet. Run the SOC agent or wait for the next cron cycle.
            </div>
          ) : (
            activity.map(entry => {
              const meta = entry.metadata || {}
              const hasIncident = Boolean(entry.incidentId)
              const content = (
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${actionIcon(entry.action).replace('text-', 'bg-')}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white capitalize">{entry.action.replace(/_/g, ' ')}</span>
                        {entry.confidenceScore != null && verdictBadge(
                          meta.verdict as string || (entry.confidenceScore > 0.7 ? 'false_positive' : 'suspicious')
                        )}
                        {Boolean(meta.mergeRecommended) && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-cyan-500/20 text-cyan-400 rounded">
                            MERGE &rarr; #{String(meta.mergeSurvivingTicket || '')}
                          </span>
                        )}
                        {Boolean(meta.escalationRecommended) && (
                          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                            String(meta.escalationUrgency) === 'critical' ? 'bg-red-500/20 text-red-400'
                            : String(meta.escalationUrgency) === 'urgent' ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-slate-500/20 text-slate-400'
                          }`}>ESCALATE</span>
                        )}
                        {Number(meta.ticketCount) > 1 && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-violet-500/20 text-violet-400 rounded">
                            {Number(meta.ticketCount)} CORRELATED
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                        {Boolean(meta.companyName) && (
                          <span className="text-cyan-400/80">{String(meta.companyName)}</span>
                        )}
                        {Boolean(meta.deviceHostname) && <span>Device: {String(meta.deviceHostname)}</span>}
                        {Array.isArray(meta.ticketNumbers) && meta.ticketNumbers.length > 0 && (
                          <span className="font-mono">
                            {(meta.ticketNumbers as string[]).map((tn: string, i: number) => (
                              <span key={tn}>{i > 0 && ', '}#{tn}</span>
                            ))}
                          </span>
                        )}
                        {!meta.ticketNumbers && entry.autotaskTicketId && (
                          <span className="font-mono">Ticket #{entry.autotaskTicketId}</span>
                        )}
                        {Boolean(meta.riskLevel) && String(meta.riskLevel) !== 'none' && (
                          <span className={`font-medium ${
                            String(meta.riskLevel) === 'critical' ? 'text-red-400'
                            : String(meta.riskLevel) === 'high' ? 'text-rose-400'
                            : String(meta.riskLevel) === 'medium' ? 'text-cyan-400'
                            : 'text-green-400'
                          }`}>{String(meta.riskLevel)} risk</span>
                        )}
                      </div>
                      {entry.detail && (
                        <p className="text-sm text-slate-400 mt-1 truncate">{entry.detail}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-slate-500">{timeAgo(entry.createdAt)}</span>
                    {hasIncident && (
                      <span className="text-slate-600">&rsaquo;</span>
                    )}
                  </div>
                </div>
              )
              return hasIncident ? (
                <Link key={entry.id} href={`/admin/soc/incidents/${entry.incidentId}`} className="block p-4 hover:bg-white/5 transition-colors">
                  {content}
                </Link>
              ) : (
                <div key={entry.id} className="p-4 hover:bg-white/5 transition-colors">
                  {content}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
