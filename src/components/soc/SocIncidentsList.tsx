'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface ProposedActions {
  merge: { shouldMerge: boolean; survivingTicketNumber: string } | null
  escalation: { recommended: boolean; urgency: string } | null
}

interface HumanGuidance {
  riskLevel: string
}

interface Incident {
  id: string
  title: string
  companyId: string | null
  companyName: string | null
  deviceHostname: string | null
  alertSource: string | null
  ticketCount: number
  verdict: string | null
  confidenceScore: number | null
  correlationReason: string | null
  primaryTicketId: string | null
  status: string
  createdAt: string
  resolvedAt: string | null
  proposedActions: ProposedActions | null
  humanGuidance: HumanGuidance | null
}

export default function SocIncidentsList() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const fetchIncidents = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' })
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/soc/incidents?${params}`)
      if (res.ok) {
        const data = await res.json()
        setIncidents(data.incidents || [])
        setTotalPages(data.pagination?.pages || 1)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter])

  useEffect(() => { fetchIncidents() }, [fetchIncidents])

  const verdictBadge = (verdict: string | null) => {
    const colors: Record<string, string> = {
      false_positive: 'bg-green-500/20 text-green-400 border-green-500/30',
      suspicious: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      escalate: 'bg-red-500/20 text-red-400 border-red-500/30',
    }
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${colors[verdict || ''] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}>
        {verdict?.replace('_', ' ') || 'pending'}
      </span>
    )
  }

  const statusBadge = (s: string) => {
    const colors: Record<string, string> = {
      open: 'bg-cyan-500/20 text-cyan-400',
      resolved: 'bg-green-500/20 text-green-400',
      escalated: 'bg-red-500/20 text-red-400',
    }
    return <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors[s] || 'bg-slate-500/20 text-slate-400'}`}>{s}</span>
  }

  const riskBadge = (level: string | undefined) => {
    if (!level || level === 'none') return null
    const colors: Record<string, string> = {
      low: 'text-green-400',
      medium: 'text-cyan-400',
      high: 'text-rose-400',
      critical: 'text-red-400',
    }
    return <span className={`text-xs font-medium ${colors[level] || 'text-slate-400'}`}>{level} risk</span>
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          className="bg-slate-800 border border-white/10 text-white text-sm rounded-lg px-3 py-2"
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="escalated">Escalated</option>
        </select>
      </div>

      {/* List */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-cyan-500" />
          </div>
        ) : incidents.length === 0 ? (
          <div className="p-8 text-center text-slate-400">No incidents found.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {incidents.map(inc => {
              const merge = inc.proposedActions?.merge
              const escalation = inc.proposedActions?.escalation
              return (
                <Link
                  key={inc.id}
                  href={`/admin/soc/incidents/${inc.id}`}
                  className="block p-4 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white truncate">{inc.title}</span>
                        {verdictBadge(inc.verdict)}
                        {statusBadge(inc.status)}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
                        {inc.companyName && (
                          <span className="text-cyan-400">{inc.companyName}</span>
                        )}
                        {inc.deviceHostname && (
                          <span>Device: {inc.deviceHostname}</span>
                        )}
                        <span>{inc.ticketCount} {inc.ticketCount === 1 ? 'ticket' : 'tickets'}</span>
                        {inc.correlationReason && inc.correlationReason !== 'single_alert' && (
                          <span className="capitalize">{inc.correlationReason.replace(/_/g, ' ')}</span>
                        )}
                        {inc.alertSource && inc.alertSource !== 'unknown' && (
                          <span>Source: {inc.alertSource.replace(/_/g, ' ')}</span>
                        )}
                        {inc.confidenceScore != null && (
                          <span>{Math.round(inc.confidenceScore * 100)}% confidence</span>
                        )}
                      </div>
                      {/* Action indicators */}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {merge?.shouldMerge && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-cyan-500/20 text-cyan-400 rounded">
                            MERGE &rarr; #{merge.survivingTicketNumber}
                          </span>
                        )}
                        {escalation?.recommended && (
                          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                            escalation.urgency === 'critical' ? 'bg-red-500/20 text-red-400'
                            : escalation.urgency === 'urgent' ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-slate-500/20 text-slate-400'
                          }`}>
                            ESCALATE {escalation.urgency.toUpperCase()}
                          </span>
                        )}
                        {riskBadge(inc.humanGuidance?.riskLevel)}
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 flex-shrink-0">
                      {new Date(inc.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm bg-slate-800 text-slate-300 rounded-lg disabled:opacity-50 hover:bg-slate-700"
          >
            Previous
          </button>
          <span className="text-sm text-slate-400">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm bg-slate-800 text-slate-300 rounded-lg disabled:opacity-50 hover:bg-slate-700"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
