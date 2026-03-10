'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Incident {
  id: string
  title: string
  companyId: string | null
  alertSource: string | null
  ticketCount: number
  verdict: string | null
  confidenceScore: number | null
  status: string
  createdAt: string
  resolvedAt: string | null
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
      suspicious: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
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

      {/* Table */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-cyan-500" />
          </div>
        ) : incidents.length === 0 ? (
          <div className="p-8 text-center text-slate-400">No incidents found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Incident</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase hidden md:table-cell">Source</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Tickets</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Verdict</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase hidden sm:table-cell">Confidence</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {incidents.map(inc => (
                  <tr key={inc.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/admin/soc/incidents/${inc.id}`} className="text-white hover:text-cyan-400 font-medium truncate block max-w-xs">
                        {inc.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-400 hidden md:table-cell">{inc.alertSource || '-'}</td>
                    <td className="px-4 py-3 text-center text-white">{inc.ticketCount}</td>
                    <td className="px-4 py-3 text-center">{verdictBadge(inc.verdict)}</td>
                    <td className="px-4 py-3 text-center text-slate-400 hidden sm:table-cell">
                      {inc.confidenceScore != null ? `${Math.round(inc.confidenceScore * 100)}%` : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">{statusBadge(inc.status)}</td>
                    <td className="px-4 py-3 text-right text-slate-500 text-xs">
                      {new Date(inc.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
