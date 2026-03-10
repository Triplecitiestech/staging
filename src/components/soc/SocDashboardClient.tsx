'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

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

interface RecentIncident {
  id: string
  title: string
  ticketCount: number
  verdict: string | null
  confidenceScore: number | null
  status: string
  createdAt: string
}

interface StatusData {
  jobs: JobStatus[]
  config: Record<string, string>
  today: TodayStats
  pending: number
  recentIncidents: RecentIncident[]
}

interface ActivityEntry {
  id: string
  action: string
  detail: string | null
  autotaskTicketId: string | null
  confidenceScore: number | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export default function SocDashboardClient() {
  const [status, setStatus] = useState<StatusData | null>(null)
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [activeTab, setActiveTab] = useState<'activity' | 'incidents'>('activity')
  const [runError, setRunError] = useState<string | null>(null)
  const [runResult, setRunResult] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, activityRes] = await Promise.all([
        fetch('/api/soc/status'),
        fetch('/api/soc/activity?limit=20'),
      ])
      if (statusRes.ok) setStatus(await statusRes.json())
      if (activityRes.ok) {
        const data = await activityRes.json()
        setActivity(data.activity || [])
      }
    } catch {
      // Silently handle — tables may not exist yet
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleRunNow = async () => {
    setRunning(true)
    setRunError(null)
    setRunResult(null)
    try {
      const res = await fetch('/api/soc/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json()
      if (!res.ok || data.status === 'error') {
        setRunError(data.message || `Error ${res.status}`)
      } else {
        const msg = data.ticketsFound === 0
          ? (data.message || 'No tickets to process')
          : `Processed ${data.ticketsFound} ticket${data.ticketsFound === 1 ? '' : 's'}${data.dryRun ? ' (dry run)' : ''}`
        if (data.ticketsFound === 0 && data.diagnostics?.totalRecentTickets === 0) {
          setRunError(msg)
        } else {
          setRunResult(msg)
        }
        await fetchData()
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setRunning(false)
      setTimeout(() => { setRunError(null); setRunResult(null) }, 8000)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500" />
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

  const verdictBadge = (verdict: string | null) => {
    const colors: Record<string, string> = {
      false_positive: 'bg-green-500/20 text-green-400 border-green-500/30',
      suspicious: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
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

  const actionIcon = (action: string) => {
    const icons: Record<string, string> = {
      analyzed: 'text-cyan-400',
      note_added: 'text-green-400',
      error: 'text-red-400',
      skipped: 'text-slate-500',
      correlated: 'text-violet-400',
      escalated: 'text-orange-400',
      override: 'text-rose-400',
    }
    return icons[action] || 'text-slate-400'
  }

  return (
    <div className="space-y-6">
      {/* Status Bar */}
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
            {runError && (
              <span className="text-xs text-red-400 max-w-[400px] truncate" title={runError}>{runError}</span>
            )}
            {runResult && (
              <span className="text-xs text-green-400">{runResult}</span>
            )}
            <button
              onClick={handleRunNow}
              disabled={running}
              className="px-3 py-1.5 text-sm font-medium bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {running ? 'Running...' : 'Run Now'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Analyzed Today" value={status?.today?.analyzed || 0} color="cyan" />
        <StatCard label="False Positives" value={status?.today?.falsePositives || 0} color="green" subtitle={status?.today?.analyzed ? `${Math.round((status.today.falsePositives / status.today.analyzed) * 100)}%` : undefined} />
        <StatCard label="Suspicious" value={status?.today?.suspicious || 0} color="orange" />
        <StatCard label="Escalated" value={status?.today?.escalated || 0} color="red" />
      </div>

      {/* Sub-navigation */}
      <div className="flex items-center gap-1 border-b border-white/10 pb-px">
        {[
          { key: 'activity', label: 'Activity Feed' },
          { key: 'incidents', label: 'Recent Incidents' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.key
                ? 'bg-slate-800/50 text-white border-b-2 border-cyan-500'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex gap-2">
          <Link href="/admin/soc/incidents" className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors">
            All Incidents
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
      {activeTab === 'activity' && (
        <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg divide-y divide-white/5">
          {activity.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              No activity yet. Run the SOC agent or wait for the next cron cycle.
            </div>
          ) : (
            activity.map(entry => (
              <div key={entry.id} className="p-4 hover:bg-white/5 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${actionIcon(entry.action).replace('text-', 'bg-')}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white capitalize">{entry.action.replace('_', ' ')}</span>
                        {entry.autotaskTicketId && (
                          <span className="text-xs text-slate-500">Ticket #{entry.autotaskTicketId}</span>
                        )}
                        {entry.confidenceScore != null && verdictBadge(
                          entry.metadata?.verdict as string || (entry.confidenceScore > 0.7 ? 'false_positive' : 'suspicious')
                        )}
                      </div>
                      {entry.detail && (
                        <p className="text-sm text-slate-400 mt-1 truncate">{entry.detail}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 flex-shrink-0">{timeAgo(entry.createdAt)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'incidents' && (
        <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg divide-y divide-white/5">
          {(!status?.recentIncidents || status.recentIncidents.length === 0) ? (
            <div className="p-8 text-center text-slate-400">
              No incidents yet. Incidents are created when multiple related alerts are correlated.
            </div>
          ) : (
            status.recentIncidents.map(incident => (
              <Link
                key={incident.id}
                href={`/admin/soc/incidents/${incident.id}`}
                className="block p-4 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white truncate">{incident.title}</span>
                      {verdictBadge(incident.verdict)}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span>{incident.ticketCount} tickets</span>
                      {incident.confidenceScore != null && (
                        <span>{Math.round(incident.confidenceScore * 100)}% confidence</span>
                      )}
                      <span className="capitalize">{incident.status}</span>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 flex-shrink-0">{timeAgo(incident.createdAt)}</span>
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color, subtitle }: { label: string; value: number; color: string; subtitle?: string }) {
  const colorMap: Record<string, string> = {
    cyan: 'from-cyan-500/10 to-cyan-500/5 border-cyan-500/20',
    green: 'from-green-500/10 to-green-500/5 border-green-500/20',
    orange: 'from-orange-500/10 to-orange-500/5 border-orange-500/20',
    red: 'from-red-500/10 to-red-500/5 border-red-500/20',
  }
  const textColor: Record<string, string> = {
    cyan: 'text-cyan-400',
    green: 'text-green-400',
    orange: 'text-orange-400',
    red: 'text-red-400',
  }

  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} border rounded-lg p-4`}>
      <p className="text-xs text-slate-400 font-medium">{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <p className={`text-2xl font-bold ${textColor[color]}`}>{value}</p>
        {subtitle && <span className="text-xs text-slate-500">{subtitle}</span>}
      </div>
    </div>
  )
}
