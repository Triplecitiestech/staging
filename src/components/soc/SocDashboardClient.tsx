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
  companyName: string | null
  deviceHostname: string | null
  alertSource: string | null
  correlationReason: string | null
  proposedActions: { merge: { shouldMerge: boolean; survivingTicketNumber: string } | null; escalation: { recommended: boolean; urgency: string } | null } | null
  humanGuidance: { riskLevel: string } | null
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

interface TicketDetail {
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
  ticketDetails?: TicketDetail[]
}

export default function SocDashboardClient() {
  const [status, setStatus] = useState<StatusData | null>(null)
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [activeTab, setActiveTab] = useState<'activity' | 'incidents'>('activity')
  const [runError, setRunError] = useState<string | null>(null)
  const [lastRunResult, setLastRunResult] = useState<RunResultData | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, activityRes] = await Promise.all([
        fetch('/api/soc/status'),
        fetch('/api/soc/activity?limit=20'),
      ])
      if (statusRes.ok) setStatus(await statusRes.json())
      if (activityRes.ok) {
        const data = await activityRes.json()
        setActivity(data.entries || [])
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
    setLastRunResult(null)
    try {
      const res = await fetch('/api/soc/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json()
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

      {/* Run Result Banner — persistent until dismissed */}
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
              {/* Per-ticket detail table */}
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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Analyzed Today" value={status?.today?.analyzed || 0} color="cyan" />
        <StatCard label="False Positives" value={status?.today?.falsePositives || 0} color="green" subtitle={status?.today?.analyzed ? `${Math.round((status.today.falsePositives / status.today.analyzed) * 100)}%` : undefined} />
        <StatCard label="Suspicious" value={status?.today?.suspicious || 0} color="rose" />
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
            activity.map(entry => {
              const meta = entry.metadata || {}
              return (
                <div key={entry.id} className="p-4 hover:bg-white/5 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${actionIcon(entry.action).replace('text-', 'bg-')}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-white capitalize">{entry.action.replace('_', ' ')}</span>
                          {entry.confidenceScore != null && verdictBadge(
                            meta.verdict as string || (entry.confidenceScore > 0.7 ? 'false_positive' : 'suspicious')
                          )}
                          {Boolean(meta.mergeRecommended) && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-cyan-500/20 text-cyan-400 rounded">
                              MERGE → #{String(meta.mergeSurvivingTicket || '')}
                            </span>
                          )}
                          {Boolean(meta.escalationRecommended) && (
                            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                              String(meta.escalationUrgency) === 'critical' ? 'bg-red-500/20 text-red-400'
                              : String(meta.escalationUrgency) === 'urgent' ? 'bg-rose-500/20 text-rose-400'
                              : 'bg-slate-500/20 text-slate-400'
                            }`}>ESCALATE</span>
                          )}
                        </div>
                        {/* Rich context line */}
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                          {Boolean(meta.companyName) && (
                            <span className="text-cyan-400/80">{String(meta.companyName)}</span>
                          )}
                          {Boolean(meta.deviceHostname) && <span>Device: {String(meta.deviceHostname)}</span>}
                          {Number(meta.ticketCount) > 1 && (
                            <span>{Number(meta.ticketCount)} tickets</span>
                          )}
                          {Array.isArray(meta.ticketNumbers) && meta.ticketNumbers.length > 0 && (
                            <span className="font-mono">
                              {(meta.ticketNumbers as string[]).map((tn: string) => `#${tn}`).join(', ')}
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
                    <span className="text-xs text-slate-500 flex-shrink-0">{timeAgo(entry.createdAt)}</span>
                  </div>
                </div>
              )
            })
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
            status.recentIncidents.map(incident => {
              const merge = incident.proposedActions?.merge
              const escalation = incident.proposedActions?.escalation
              return (
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
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                      {incident.companyName && <span className="text-cyan-400/80">{incident.companyName}</span>}
                      <span>{incident.ticketCount} tickets</span>
                      {incident.confidenceScore != null && (
                        <span>{Math.round(incident.confidenceScore * 100)}% confidence</span>
                      )}
                      {incident.correlationReason && (
                        <span className="capitalize">{incident.correlationReason.replace(/_/g, ' ')}</span>
                      )}
                      <span className="capitalize">{incident.status}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {merge?.shouldMerge && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-cyan-500/20 text-cyan-400 rounded">
                          MERGE → #{merge.survivingTicketNumber}
                        </span>
                      )}
                      {escalation?.recommended && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-rose-500/20 text-rose-400 rounded">ESCALATE</span>
                      )}
                      {incident.humanGuidance?.riskLevel && incident.humanGuidance.riskLevel !== 'none' && (
                        <span className={`text-[10px] font-medium ${
                          incident.humanGuidance.riskLevel === 'critical' ? 'text-red-400'
                          : incident.humanGuidance.riskLevel === 'high' ? 'text-rose-400'
                          : 'text-cyan-400'
                        }`}>{incident.humanGuidance.riskLevel} risk</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 flex-shrink-0">{timeAgo(incident.createdAt)}</span>
                </div>
              </Link>
              )
            })
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
    rose: 'from-rose-500/10 to-rose-500/5 border-rose-500/20',
    red: 'from-red-500/10 to-red-500/5 border-red-500/20',
  }
  const textColor: Record<string, string> = {
    cyan: 'text-cyan-400',
    green: 'text-green-400',
    rose: 'text-rose-400',
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
