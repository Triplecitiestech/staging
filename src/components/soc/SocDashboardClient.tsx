'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { UnifiedTicketRow } from '@/types/tickets'
import StatCard from '@/components/reporting/StatCard'
import SocTicketDetail from './SocTicketDetail'
import { useDemoMode } from '@/components/admin/DemoModeProvider'
import {
  filterSocTickets,
  sortSocTickets,
  SOC_VERDICTS,
  VERDICT_LABELS,
  type VerdictFilter,
  type StatusFilter,
} from '@/lib/soc/ticket-filter'

// ── Interfaces ──

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
  socProcessedAt: string | null
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

interface RunResultData {
  ticketsFound: number
  ticketsProcessed: number
  falsePositives: number
  escalated: number
  skipped: number
  dryRun: boolean
  errors?: string[]
  durationMs?: number
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// ── Verdict styling (covers every Verdict value in src/lib/soc/types.ts) ──

const VERDICT_DOT: Record<string, string> = {
  false_positive: 'bg-green-500',
  expected_activity: 'bg-blue-500',
  informational: 'bg-cyan-500',
  suspicious: 'bg-rose-500',
  escalate: 'bg-red-500',
  confirmed_threat: 'bg-red-600',
}

const VERDICT_BADGE: Record<string, string> = {
  false_positive: 'bg-green-500/20 text-green-400 border-green-500/30',
  expected_activity: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  informational: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  suspicious: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  escalate: 'bg-red-500/20 text-red-400 border-red-500/30',
  confirmed_threat: 'bg-red-500/30 text-red-300 border-red-500/40',
}

const verdictDot = (v: string | null) => (v && VERDICT_DOT[v]) || 'bg-slate-600'
const verdictBadge = (v: string | null) =>
  (v && VERDICT_BADGE[v]) || 'bg-slate-500/20 text-slate-400 border-slate-500/30'

const RANGE_OPTIONS = [7, 30, 90, 180, 365]
const PAGE_SIZE = 50

// ── Component ──

export default function SocDashboardClient() {
  const demo = useDemoMode()
  const [status, setStatus] = useState<StatusData | null>(null)
  const [ticketsData, setTicketsData] = useState<TicketsData | null>(null)
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [activeTab, setActiveTab] = useState<'tickets' | 'activity' | 'analyst'>('tickets')
  const [runError, setRunError] = useState<string | null>(null)
  const [lastRunResult, setLastRunResult] = useState<RunResultData | null>(null)

  // Alert search / filter / history range
  const [rangeDays, setRangeDays] = useState(30)
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // SOC ticket detail view
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)

  // AI Analyst state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('soc-analyst-messages')
      if (saved) try { return JSON.parse(saved) } catch { /* ignore */ }
    }
    return []
  })
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  // Persist chat messages
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('soc-analyst-messages', JSON.stringify(chatMessages))
    }
  }, [chatMessages])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setTicketsLoading(true)
    try {
      const [statusRes, ticketsRes, activityRes] = await Promise.all([
        fetch('/api/soc/status', { signal }),
        fetch(`/api/soc/tickets?days=${rangeDays}&filter=actionable`, { signal }),
        fetch('/api/soc/activity?limit=50', { signal }),
      ])
      if (statusRes.ok) setStatus(await statusRes.json())
      if (ticketsRes.ok) setTicketsData(await ticketsRes.json())
      if (activityRes.ok) {
        const data = await activityRes.json()
        setActivity(data.entries || [])
      }
      // Never render an empty "all clear" when the data simply failed to load
      const failed: Array<[string, Response]> = (
        [['agent status', statusRes], ['alerts', ticketsRes], ['activity feed', activityRes]] as Array<[string, Response]>
      ).filter(([, res]) => !res.ok)
      if (failed.length > 0) {
        const detail = failed.map(([name, res]) => `${name} (HTTP ${res.status})`).join(', ')
        setLoadError(
          failed.some(([, res]) => res.status === 401)
            ? `${detail} — your session may have expired. Refresh the page or sign in again, then Retry.`
            : `${detail} — the data shown may be incomplete.`,
        )
      } else {
        setLoadError(null)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setLoadError('Could not reach the server — check your connection, then Retry.')
    } finally {
      setLoading(false)
      setTicketsLoading(false)
    }
  }, [rangeDays])

  useEffect(() => {
    const controller = new AbortController()
    fetchData(controller.signal)
    return () => controller.abort()
  }, [fetchData])

  // New search/filter/range = back to the first page of results
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [searchQuery, verdictFilter, statusFilter, rangeDays])

  const handleRunNow = async (reprocess = false) => {
    setRunning(true)
    setRunError(null)
    setLastRunResult(null)
    try {
      const res = await fetch('/api/soc/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reprocess }),
      })
      const text = await res.text()
      let data
      try { data = JSON.parse(text) } catch {
        setRunError(`Server returned invalid response (${res.status})`)
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
        })
        await fetchData()
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setRunning(false)
    }
  }

  // ── AI Analyst Chat ──

  const sendChatMessage = async (text: string) => {
    if (!text.trim() || chatLoading) return
    const userMsg: ChatMessage = { role: 'user', content: text.trim() }
    const updatedMessages = [...chatMessages, userMsg]
    setChatMessages(updatedMessages)
    setChatInput('')
    setChatLoading(true)

    try {
      const res = await fetch('/api/soc/analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages }),
      })
      const data = await res.json()
      if (data.success && data.message) {
        setChatMessages([...updatedMessages, { role: 'assistant', content: data.message }])
      } else {
        setChatMessages([...updatedMessages, {
          role: 'assistant',
          content: `Error: ${data.error || 'Failed to get response'}`,
        }])
      }
    } catch {
      setChatMessages([...updatedMessages, {
        role: 'assistant',
        content: 'Error: Network error. Please try again.',
      }])
    } finally {
      setChatLoading(false)
    }
  }

  const handleCreateRule = async (ruleJson: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/soc/analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createRule: ruleJson }),
      })
      const data = await res.json()
      if (data.success) {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: `Rule "${ruleJson.name}" created successfully (ID: ${data.ruleId}). It is now active and will be applied in the next SOC triage run.`,
        }])
      } else {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: `Failed to create rule: ${data.error}`,
        }])
      }
    } catch {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Error: Failed to create rule. Network error.',
      }])
    }
  }

  // ── Dictate (Speech-to-Text) ──

  const toggleDictation = () => {
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SpeechRecognitionAPI = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SpeechRecognitionAPI) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Speech recognition is not supported in this browser. Please use Chrome or Edge.',
      }])
      return
    }

    const recognition = new SpeechRecognitionAPI()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    let finalTranscript = ''

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' '
        } else {
          interim += event.results[i][0].transcript
        }
      }
      setChatInput(finalTranscript + interim)
    }

    recognition.onerror = () => {
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
      if (finalTranscript.trim()) {
        setChatInput(finalTranscript.trim())
      }
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }

  // ── Render ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500" />
      </div>
    )
  }

  // Ticket detail view
  if (selectedTicketId) {
    return (
      <SocTicketDetail
        ticketId={selectedTicketId}
        onBack={() => setSelectedTicketId(null)}
      />
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

  const allTickets = ticketsData?.tickets || []
  const openSecurityTickets = allTickets.filter(t => !t.isResolved)

  // Search + filters over the whole fetched range (open alerts pinned on top,
  // then resolved/analyzed history) — paged client-side via "Show more"
  const filteredTickets = sortSocTickets(
    filterSocTickets(allTickets, { query: searchQuery, verdict: verdictFilter, status: statusFilter }),
  )
  const shownTickets = filteredTickets.slice(0, visibleCount)
  const hasActiveFilters = searchQuery.trim() !== '' || verdictFilter !== 'all' || statusFilter !== 'all'

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
              title="Analyze new unprocessed security tickets using the AI pipeline (skips already-analyzed tickets)"
            >
              {running ? 'Running...' : 'Run Now'}
            </button>
            <button
              onClick={() => handleRunNow(true)}
              disabled={running}
              className="px-3 py-1.5 text-sm font-medium bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors disabled:opacity-50"
              title="Clear the last 7 days of AI analyses and re-run the full pipeline from scratch on all recent tickets"
            >
              Reprocess
            </button>
          </div>
        </div>
      </div>

      {/* Data load failure — never silently show an empty dashboard */}
      {loadError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-red-400">SOC data failed to load</p>
              <p className="text-sm text-slate-300 mt-1">{loadError}</p>
            </div>
            <button
              onClick={() => fetchData()}
              disabled={ticketsLoading}
              className="px-3 py-1.5 text-sm font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 rounded-lg transition-colors flex-shrink-0 disabled:opacity-50"
            >
              {ticketsLoading ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        </div>
      )}

      {/* Run Result / Error Banners */}
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
                <span className="text-slate-300"><span className="text-white font-medium">{lastRunResult.ticketsFound}</span> found</span>
                <span className="text-slate-300"><span className="text-white font-medium">{lastRunResult.ticketsProcessed}</span> processed</span>
                <span className="text-slate-300"><span className="text-green-400 font-medium">{lastRunResult.falsePositives}</span> FP</span>
                <span className="text-slate-300"><span className="text-red-400 font-medium">{lastRunResult.escalated}</span> escalated</span>
              </div>
            </div>
            <button onClick={() => setLastRunResult(null)} className="text-slate-500 hover:text-white text-lg leading-none flex-shrink-0">&times;</button>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Open Alerts" value={openSecurityTickets.length} />
        <StatCard label={`Total (${rangeDays}d)`} value={ticketsData?.totalTickets || 0} />
        <StatCard label="Suspicious" value={ticketsData?.suspiciousCount || 0} />
        <StatCard label={`Resolved (${rangeDays}d)`} value={ticketsData?.resolvedCount || 0} />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/10 pb-px overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 sm:overflow-x-visible">
        {[
          { key: 'tickets' as const, label: 'Security Alerts', count: openSecurityTickets.length },
          { key: 'activity' as const, label: 'Activity Feed' },
          { key: 'analyst' as const, label: 'AI Analyst' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-slate-800/50 text-white border-b-2 border-cyan-500'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.label}
            {tab.count != null && (
              <span className="ml-1 sm:ml-1.5 text-xs text-slate-500">({tab.count})</span>
            )}
          </button>
        ))}
        <div className="flex-1 min-w-[8px]" />
        <div className="flex gap-1.5 sm:gap-2 flex-shrink-0">
          <Link href="/admin/soc/rules" className="px-2.5 sm:px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors whitespace-nowrap">
            Rules
          </Link>
          <Link href="/admin/soc/config" className="px-2.5 sm:px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors whitespace-nowrap">
            Config
          </Link>
        </div>
      </div>

      {/* ── Tab: Security Alerts ── */}
      {activeTab === 'tickets' && (
        <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
          {/* Search + filter toolbar */}
          <div className="px-4 py-3 border-b border-white/5 space-y-2">
            <div className="flex flex-col lg:flex-row gap-2">
              <div className="relative flex-1">
                <svg className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
                </svg>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by title, ticket #, company, or verdict..."
                  aria-label="Search security alerts"
                  className="w-full bg-slate-900/50 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                />
              </div>
              <div className="flex flex-wrap gap-2 lg:flex-nowrap lg:flex-shrink-0">
                <select
                  value={verdictFilter}
                  onChange={e => setVerdictFilter(e.target.value as VerdictFilter)}
                  aria-label="Filter by AI verdict"
                  className="flex-1 min-w-[140px] bg-slate-900/50 border border-white/10 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50"
                >
                  <option value="all">All verdicts</option>
                  {SOC_VERDICTS.map(v => (
                    <option key={v} value={v}>{VERDICT_LABELS[v]}</option>
                  ))}
                  <option value="not_analyzed">Not analyzed</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                  aria-label="Filter by ticket status"
                  className="flex-1 min-w-[130px] bg-slate-900/50 border border-white/10 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50"
                >
                  <option value="all">Open + resolved</option>
                  <option value="open">Open only</option>
                  <option value="resolved">Resolved only</option>
                </select>
                <select
                  value={rangeDays}
                  onChange={e => setRangeDays(Number(e.target.value))}
                  aria-label="History range"
                  className="flex-1 min-w-[120px] bg-slate-900/50 border border-white/10 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50"
                >
                  {RANGE_OPTIONS.map(d => (
                    <option key={d} value={d}>Last {d} days</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              {ticketsLoading
                ? 'Loading alerts...'
                : !ticketsData && loadError
                  ? 'Alerts unavailable — use Retry above.'
                  : `Showing ${shownTickets.length} of ${filteredTickets.length} alerts from the last ${rangeDays} days — Security Monitoring queue + keyword matches, open alerts first, then analyzed history`}
            </p>
          </div>
          {filteredTickets.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              {ticketsLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-cyan-500" />
                  <span className="text-sm">Loading alerts...</span>
                </div>
              ) : !ticketsData && loadError ? (
                'Security alerts could not be loaded — use Retry above.'
              ) : hasActiveFilters ? (
                <>
                  <p>No alerts match your search or filters.</p>
                  <button
                    onClick={() => { setSearchQuery(''); setVerdictFilter('all'); setStatusFilter('all') }}
                    className="mt-3 px-3 py-1.5 text-xs font-medium text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg transition-colors"
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                `No security alerts in the last ${rangeDays} days.`
              )}
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {shownTickets.map(ticket => (
                <button
                  key={ticket.ticketId}
                  onClick={() => setSelectedTicketId(ticket.ticketId)}
                  className="w-full text-left px-3 sm:px-4 py-3 hover:bg-white/5 transition-colors"
                >
                  {/* Desktop: single row layout */}
                  <div className="hidden sm:flex items-center gap-3">
                    {/* Verdict indicator */}
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${verdictDot(ticket.socVerdict)}`} />

                    {/* Ticket info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-500">#{ticket.ticketNumber}</span>
                        <span className="text-sm text-white truncate">{demo.title(ticket.title)}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                          ticket.isResolved ? 'bg-emerald-400/20 text-emerald-400' : 'bg-cyan-400/20 text-cyan-400'
                        }`}>
                          {ticket.isResolved ? 'Resolved' : 'Open'}
                        </span>
                        <span>{new Date(ticket.createDate).toLocaleDateString()}</span>
                        {ticket.companyName && <span className="text-cyan-400/70">{demo.company(ticket.companyName)}</span>}
                        <span>{ticket.priorityLabel}</span>
                        <span>{demo.person(ticket.assignedTo)}</span>
                      </div>
                    </div>

                    {/* SOC verdict badge */}
                    {ticket.socVerdict && (
                      <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full border flex-shrink-0 ${verdictBadge(ticket.socVerdict)}`}>
                        {ticket.socVerdict.replace(/_/g, ' ')}
                      </span>
                    )}

                    {/* AI Analyzed indicator */}
                    <div className="flex-shrink-0 text-right min-w-[80px]">
                      {ticket.socProcessedAt ? (
                        <div>
                          <span className="text-[10px] text-cyan-400 block">AI Analyzed</span>
                          <span className="text-[10px] text-slate-500">
                            {timeAgo(ticket.socProcessedAt)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-600 italic">Not analyzed</span>
                      )}
                    </div>

                    {/* Arrow */}
                    <svg className="w-4 h-4 text-slate-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>

                  {/* Mobile: stacked layout */}
                  <div className="sm:hidden">
                    <div className="flex items-start gap-2">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${verdictDot(ticket.socVerdict)}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-500 flex-shrink-0">#{ticket.ticketNumber}</span>
                          <span className="text-sm text-white line-clamp-2">{demo.title(ticket.title)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                            ticket.isResolved ? 'bg-emerald-400/20 text-emerald-400' : 'bg-cyan-400/20 text-cyan-400'
                          }`}>
                            {ticket.isResolved ? 'Resolved' : 'Open'}
                          </span>
                          <span>{new Date(ticket.createDate).toLocaleDateString()}</span>
                          {ticket.companyName && <span className="text-cyan-400/70">{demo.company(ticket.companyName)}</span>}
                          <span>{ticket.priorityLabel}</span>
                          <span>{demo.person(ticket.assignedTo)}</span>
                          {ticket.socVerdict && (
                            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full border ${verdictBadge(ticket.socVerdict)}`}>
                              {ticket.socVerdict.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                      </div>
                      <svg className="w-4 h-4 text-slate-600 flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {filteredTickets.length > visibleCount && (
            <div className="px-4 py-3 border-t border-white/5 text-center">
              <button
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                className="px-4 py-2 text-sm font-medium text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg transition-colors"
              >
                Show more ({filteredTickets.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Activity Feed ── */}
      {activeTab === 'activity' && (
        <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg divide-y divide-white/5">
          {activity.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              No SOC activity yet. Run the agent to start analyzing tickets.
            </div>
          ) : (
            activity.map(entry => {
              const meta = entry.metadata || {}
              return (
                <div key={entry.id} className="p-4 hover:bg-white/5 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                        entry.action === 'analyzed' ? 'bg-cyan-500'
                        : entry.action === 'note_added' || entry.action === 'action_approved' ? 'bg-green-500'
                        : entry.action === 'error' ? 'bg-red-500'
                        : entry.action === 'correlated' ? 'bg-violet-500'
                        : entry.action === 'escalated' ? 'bg-rose-500'
                        : entry.action === 'action_rejected' ? 'bg-red-400'
                        : 'bg-slate-500'
                      }`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-white capitalize">
                            {entry.action.replace(/_/g, ' ')}
                          </span>
                          {entry.confidenceScore != null && (
                            <span className="text-xs text-slate-500">
                              {Math.round(Number(entry.confidenceScore) * 100)}% conf
                            </span>
                          )}
                          {Boolean(meta.verdict) && (
                            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${verdictBadge(String(meta.verdict))}`}>
                              {String(meta.verdict).replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                        {entry.detail && (
                          <p className="text-sm text-slate-400 mt-0.5 line-clamp-2">{entry.detail}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-600">
                          {Boolean(meta.companyName) && <span>{String(meta.companyName)}</span>}
                          {Array.isArray(meta.ticketNumbers) && (
                            <span className="font-mono">
                              {(meta.ticketNumbers as string[]).map(tn => `#${tn}`).join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-slate-600 flex-shrink-0">{timeAgo(entry.createdAt)}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── Tab: AI Analyst ── */}
      {activeTab === 'analyst' && (
        <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg flex flex-col" style={{ height: '600px' }}>
          {/* Chat header */}
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">SOC AI Analyst</h3>
              <p className="text-xs text-slate-500">Analyzes 6 months of security alerts. Suggest patterns, rules, and refinements.</p>
            </div>
            {chatMessages.length > 0 && (
              <button
                onClick={() => { setChatMessages([]); localStorage.removeItem('soc-analyst-messages') }}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Clear history
              </button>
            )}
          </div>

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.length === 0 && !chatLoading && (
              <div className="text-center py-12">
                <p className="text-slate-400 text-sm mb-4">Ask the AI analyst to review your security alerts and suggest rules.</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    'What are the most common false positive patterns?',
                    'Suggest suppression rules for recurring alerts',
                    'Which companies have the most security alerts?',
                    'Are there any concerning trends I should know about?',
                  ].map(suggestion => (
                    <button
                      key={suggestion}
                      onClick={() => sendChatMessage(suggestion)}
                      className="px-3 py-2 text-xs text-slate-300 bg-slate-700/50 hover:bg-slate-700 border border-white/10 rounded-lg transition-colors text-left"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-cyan-500/20 border border-cyan-500/30 text-white'
                    : 'bg-slate-700/50 border border-white/10 text-slate-300'
                }`}>
                  <AnalystMessage content={msg.content} onCreateRule={handleCreateRule} />
                </div>
              </div>
            ))}

            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-700/50 border border-white/10 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-cyan-500" />
                    <span className="text-sm text-slate-400">Analyzing security data...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          <div className="border-t border-white/10 p-4">
            <div className="flex items-center gap-2">
              <button
                onClick={toggleDictation}
                className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                  isListening
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
                    : 'bg-slate-700/50 text-slate-400 hover:text-white border border-white/10'
                }`}
                title={isListening ? 'Stop dictation' : 'Start dictation'}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(chatInput) } }}
                placeholder={isListening ? 'Listening...' : 'Ask about patterns, suggest rules, refine analysis...'}
                className="flex-1 bg-slate-900/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                disabled={chatLoading}
              />
              <button
                onClick={() => sendChatMessage(chatInput)}
                disabled={chatLoading || !chatInput.trim()}
                className="px-4 py-2.5 text-sm font-medium bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
              >
                Send
              </button>
            </div>
            {isListening && (
              <p className="text-xs text-red-400 mt-1 animate-pulse">Recording... click mic to stop</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Analyst Message Renderer ──
// Parses AI responses for rule JSON blocks and renders "Create Rule" buttons

function AnalystMessage({ content, onCreateRule }: { content: string; onCreateRule: (rule: Record<string, unknown>) => void }) {
  // Split content into text segments and rule blocks
  const parts: Array<{ type: 'text' | 'rule'; content: string; rule?: Record<string, unknown> }> = []
  const ruleRegex = /```json:rule\s*\n([\s\S]*?)```/g
  let lastIndex = 0
  let match

  while ((match = ruleRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) })
    }
    try {
      const rule = JSON.parse(match[1])
      parts.push({ type: 'rule', content: match[1], rule })
    } catch {
      parts.push({ type: 'text', content: match[0] })
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) })
  }

  // If no rule blocks found, check for regular ```json blocks that look like rules
  if (parts.length === 1 && parts[0].type === 'text') {
    const jsonRegex = /```json\s*\n([\s\S]*?)```/g
    const newParts: typeof parts = []
    lastIndex = 0
    while ((match = jsonRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        newParts.push({ type: 'text', content: content.slice(lastIndex, match.index) })
      }
      try {
        const parsed = JSON.parse(match[1])
        if (parsed.name && parsed.ruleType && parsed.pattern && parsed.action) {
          newParts.push({ type: 'rule', content: match[1], rule: parsed })
        } else {
          newParts.push({ type: 'text', content: match[0] })
        }
      } catch {
        newParts.push({ type: 'text', content: match[0] })
      }
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < content.length) {
      newParts.push({ type: 'text', content: content.slice(lastIndex) })
    }
    if (newParts.length > 1) {
      parts.splice(0, parts.length, ...newParts)
    }
  }

  return (
    <div className="space-y-3">
      {parts.map((part, i) => {
        if (part.type === 'rule' && part.rule) {
          return (
            <div key={i} className="bg-slate-800/80 border border-cyan-500/20 rounded-lg p-3 my-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-cyan-400">{String(part.rule.name)}</p>
                  {Boolean(part.rule.description) && (
                    <p className="text-xs text-slate-400 mt-0.5">{String(part.rule.description)}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                    <span>Type: {String(part.rule.ruleType)}</span>
                    <span>Action: {String(part.rule.action)}</span>
                  </div>
                </div>
                <button
                  onClick={() => onCreateRule(part.rule!)}
                  className="px-3 py-1.5 text-xs font-medium bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 border border-cyan-500/30 rounded-lg transition-colors flex-shrink-0"
                >
                  Create Rule
                </button>
              </div>
            </div>
          )
        }
        return (
          <div key={i} className="text-sm whitespace-pre-wrap break-words">{part.content}</div>
        )
      })}
    </div>
  )
}
