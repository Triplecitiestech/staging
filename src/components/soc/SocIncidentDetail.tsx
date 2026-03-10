'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Analysis {
  id: string
  autotaskTicketId: string
  ticketNumber: string | null
  verdict: string | null
  confidenceScore: number | null
  alertSource: string | null
  alertCategory: string | null
  aiReasoning: string | null
  recommendedAction: string | null
  deviceVerified: boolean
  technicianVerified: string | null
  processedAt: string | null
}

interface ActivityLog {
  id: string
  action: string
  detail: string | null
  createdAt: string
}

interface Incident {
  id: string
  title: string
  companyId: string | null
  alertSource: string | null
  ticketCount: number
  verdict: string | null
  confidenceScore: number | null
  aiSummary: string | null
  correlationReason: string | null
  status: string
  createdAt: string
  resolvedAt: string | null
}

export default function SocIncidentDetail({ incidentId }: { incidentId: string }) {
  const [incident, setIncident] = useState<Incident | null>(null)
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [overrideVerdict, setOverrideVerdict] = useState('')
  const [overrideStatus, setOverrideStatus] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/soc/incidents/${incidentId}`)
        if (res.ok) {
          const data = await res.json()
          setIncident(data.incident)
          setAnalyses(data.analyses || [])
          setActivityLog(data.activityLog || [])
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [incidentId])

  const handleOverride = async () => {
    if (!overrideVerdict && !overrideStatus) return
    setSaving(true)
    try {
      const res = await fetch(`/api/soc/incidents/${incidentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict: overrideVerdict || undefined, status: overrideStatus || undefined }),
      })
      if (res.ok) {
        window.location.reload()
      }
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500" />
      </div>
    )
  }

  if (!incident) {
    return <div className="p-8 text-center text-slate-400">Incident not found.</div>
  }

  const verdictColors: Record<string, string> = {
    false_positive: 'text-green-400',
    suspicious: 'text-rose-400',
    escalate: 'text-red-400',
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/admin/soc/incidents" className="text-sm text-slate-400 hover:text-white transition-colors">
        ← Back to Incidents
      </Link>

      {/* Header */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">{incident.title}</h2>
            <div className="flex items-center gap-3 mt-2 text-sm text-slate-400">
              <span>{incident.ticketCount} correlated tickets</span>
              <span className="capitalize">{incident.correlationReason?.replace('_', ' ') || 'N/A'}</span>
              <span>{new Date(incident.createdAt).toLocaleString()}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-lg font-bold ${verdictColors[incident.verdict || ''] || 'text-slate-400'}`}>
              {incident.verdict?.replace('_', ' ').toUpperCase() || 'PENDING'}
            </span>
            {incident.confidenceScore != null && (
              <span className="text-sm text-slate-400">
                {Math.round(incident.confidenceScore * 100)}% confidence
              </span>
            )}
          </div>
        </div>

        {incident.aiSummary && (
          <div className="mt-4 p-4 bg-black/30 rounded-lg">
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{incident.aiSummary}</p>
          </div>
        )}
      </div>

      {/* Override Controls */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
        <h3 className="text-sm font-medium text-white mb-4">Admin Override</h3>
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Override Verdict</label>
            <select
              value={overrideVerdict}
              onChange={e => setOverrideVerdict(e.target.value)}
              className="bg-slate-900 border border-white/10 text-white text-sm rounded-lg px-3 py-2"
            >
              <option value="">No change</option>
              <option value="false_positive">False Positive</option>
              <option value="suspicious">Suspicious</option>
              <option value="escalate">Escalate</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Override Status</label>
            <select
              value={overrideStatus}
              onChange={e => setOverrideStatus(e.target.value)}
              className="bg-slate-900 border border-white/10 text-white text-sm rounded-lg px-3 py-2"
            >
              <option value="">No change</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="escalated">Escalated</option>
            </select>
          </div>
          <button
            onClick={handleOverride}
            disabled={saving || (!overrideVerdict && !overrideStatus)}
            className="px-4 py-2 text-sm font-medium bg-rose-500 hover:bg-rose-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Apply Override'}
          </button>
        </div>
      </div>

      {/* Related Analyses */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium text-white">Ticket Analyses ({analyses.length})</h3>
        </div>
        {analyses.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-sm">No analyses recorded.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {analyses.map(a => (
              <div key={a.id} className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-white font-medium">
                      Ticket #{a.ticketNumber || a.autotaskTicketId}
                    </span>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${
                      a.verdict === 'false_positive' ? 'bg-green-500/20 text-green-400 border-green-500/30'
                      : a.verdict === 'escalate' ? 'bg-red-500/20 text-red-400 border-red-500/30'
                      : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                    }`}>
                      {a.verdict?.replace('_', ' ') || 'pending'}
                    </span>
                    {a.deviceVerified && (
                      <span className="text-xs text-green-400">Device Verified</span>
                    )}
                    {a.technicianVerified && (
                      <span className="text-xs text-cyan-400">Tech: {a.technicianVerified}</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500">
                    {a.confidenceScore != null ? `${Math.round(a.confidenceScore * 100)}%` : ''}
                  </span>
                </div>
                {a.aiReasoning && (
                  <details className="mt-2">
                    <summary className="text-xs text-slate-400 cursor-pointer hover:text-white">AI Reasoning</summary>
                    <p className="text-xs text-slate-300 mt-1 whitespace-pre-wrap bg-black/20 p-3 rounded">{a.aiReasoning}</p>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity Log */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium text-white">Activity Log</h3>
        </div>
        {activityLog.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-sm">No activity recorded.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {activityLog.map(log => (
              <div key={log.id} className="px-4 py-3 flex items-start justify-between">
                <div>
                  <span className="text-sm text-white capitalize">{log.action.replace('_', ' ')}</span>
                  {log.detail && <p className="text-xs text-slate-400 mt-0.5">{log.detail}</p>}
                </div>
                <span className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
