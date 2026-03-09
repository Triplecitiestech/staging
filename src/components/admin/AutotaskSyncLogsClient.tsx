'use client'

import { useState, useEffect, useCallback } from 'react'

interface SyncLog {
  id: string
  syncType: string
  status: string
  startedAt: string
  completedAt: string | null
  durationMs: number | null
  companiesCreated: number
  companiesUpdated: number
  projectsCreated: number
  projectsUpdated: number
  contactsCreated: number
  contactsUpdated: number
  tasksCreated: number
  tasksUpdated: number
  errors: string[]
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

interface Stats {
  total30d: number
  avgDurationMs: number
  statusCounts: Record<string, number>
}

export default function AutotaskSyncLogsClient() {
  const [logs, setLogs] = useState<SyncLog[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 25, total: 0, totalPages: 0 })
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('startedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [expandedLog, setExpandedLog] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      page: pagination.page.toString(),
      pageSize: '25',
      sortBy,
      sortDir,
    })
    if (statusFilter) params.set('status', statusFilter)
    if (search) params.set('search', search)

    try {
      const res = await fetch(`/api/admin/sync-logs?${params}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs)
        setPagination(data.pagination)
        setStats(data.stats)
      }
    } catch { /* handled by empty state */ }
    setLoading(false)
  }, [pagination.page, sortBy, sortDir, statusFilter, search])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir(prev => prev === 'desc' ? 'asc' : 'desc')
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
  }

  const handleSearch = () => {
    setSearch(searchInput)
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      success: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      partial: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      failed: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    }
    return colors[status] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'
  }

  const formatDuration = (ms: number | null) => {
    if (!ms) return '-'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <span className="text-slate-600 ml-1">↕</span>
    return <span className="text-cyan-400 ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
            <p className="text-xs text-slate-500">Total (30 days)</p>
            <p className="text-2xl font-bold text-white">{stats.total30d}</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
            <p className="text-xs text-slate-500">Avg Duration</p>
            <p className="text-2xl font-bold text-white">{formatDuration(stats.avgDurationMs)}</p>
          </div>
          <div className="bg-slate-800/50 border border-emerald-500/20 rounded-lg p-4">
            <p className="text-xs text-slate-500">Successful</p>
            <p className="text-2xl font-bold text-emerald-400">{stats.statusCounts?.success ?? 0}</p>
          </div>
          <div className="bg-slate-800/50 border border-rose-500/20 rounded-lg p-4">
            <p className="text-xs text-slate-500">Failed</p>
            <p className="text-2xl font-bold text-rose-400">{stats.statusCounts?.failed ?? 0}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search sync type, errors..."
            className="flex-1 bg-slate-800/50 text-white text-sm rounded-lg px-3 py-2 border border-slate-600/50 focus:border-cyan-500/50 focus:outline-none placeholder-slate-500"
          />
          <button onClick={handleSearch} className="px-4 py-2 bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 rounded-lg hover:bg-cyan-600/30 text-sm">
            Search
          </button>
        </div>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPagination(prev => ({ ...prev, page: 1 })) }}
          className="bg-slate-800/50 text-white text-sm rounded-lg px-3 py-2 border border-slate-600/50 focus:border-cyan-500/50 focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="success">Success</option>
          <option value="partial">Partial</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
            <span className="ml-3 text-slate-400">Loading sync logs...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-500">No sync logs found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-900/30">
                  <th className="text-left text-slate-400 font-medium py-3 px-4 cursor-pointer hover:text-white" onClick={() => handleSort('startedAt')}>
                    Date <SortIcon col="startedAt" />
                  </th>
                  <th className="text-left text-slate-400 font-medium py-3 px-4 cursor-pointer hover:text-white" onClick={() => handleSort('syncType')}>
                    Type <SortIcon col="syncType" />
                  </th>
                  <th className="text-left text-slate-400 font-medium py-3 px-4 cursor-pointer hover:text-white" onClick={() => handleSort('status')}>
                    Status <SortIcon col="status" />
                  </th>
                  <th className="text-left text-slate-400 font-medium py-3 px-4 cursor-pointer hover:text-white" onClick={() => handleSort('durationMs')}>
                    Duration <SortIcon col="durationMs" />
                  </th>
                  <th className="text-left text-slate-400 font-medium py-3 px-4">Synced</th>
                  <th className="text-left text-slate-400 font-medium py-3 px-4">Errors</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <>
                    <tr
                      key={log.id}
                      className="border-b border-slate-700/20 hover:bg-slate-700/20 cursor-pointer transition-colors"
                      onClick={() => setExpandedLog(prev => prev === log.id ? null : log.id)}
                    >
                      <td className="py-3 px-4 text-slate-300">{formatDate(log.startedAt)}</td>
                      <td className="py-3 px-4 text-white">{log.syncType}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${statusBadge(log.status)}`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400">{formatDuration(log.durationMs)}</td>
                      <td className="py-3 px-4 text-slate-400 text-xs">
                        {log.companiesCreated + log.companiesUpdated > 0 && <span className="mr-2">Co:{log.companiesCreated + log.companiesUpdated}</span>}
                        {log.projectsCreated + log.projectsUpdated > 0 && <span className="mr-2">Pr:{log.projectsCreated + log.projectsUpdated}</span>}
                        {log.tasksCreated + log.tasksUpdated > 0 && <span className="mr-2">Tk:{log.tasksCreated + log.tasksUpdated}</span>}
                        {log.contactsCreated + log.contactsUpdated > 0 && <span>Ct:{log.contactsCreated + log.contactsUpdated}</span>}
                      </td>
                      <td className="py-3 px-4">
                        {log.errors?.length > 0 ? (
                          <span className="text-xs text-rose-400">{log.errors.length} error{log.errors.length !== 1 ? 's' : ''}</span>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                    {expandedLog === log.id && (
                      <tr key={`${log.id}-detail`} className="border-b border-slate-700/20">
                        <td colSpan={6} className="px-4 py-4 bg-slate-900/30">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-3">
                            <div>
                              <p className="text-slate-500">Companies</p>
                              <p className="text-white">+{log.companiesCreated} created, {log.companiesUpdated} updated</p>
                            </div>
                            <div>
                              <p className="text-slate-500">Projects</p>
                              <p className="text-white">+{log.projectsCreated} created, {log.projectsUpdated} updated</p>
                            </div>
                            <div>
                              <p className="text-slate-500">Tasks</p>
                              <p className="text-white">+{log.tasksCreated} created, {log.tasksUpdated} updated</p>
                            </div>
                            <div>
                              <p className="text-slate-500">Contacts</p>
                              <p className="text-white">+{log.contactsCreated} created, {log.contactsUpdated} updated</p>
                            </div>
                          </div>
                          {log.errors?.length > 0 && (
                            <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
                              <p className="text-xs text-rose-400 font-medium mb-1">Errors:</p>
                              {log.errors.map((err, i) => (
                                <p key={i} className="text-xs text-rose-300/70 truncate">{err}</p>
                              ))}
                            </div>
                          )}
                          {log.completedAt && (
                            <p className="text-xs text-slate-600 mt-2">Completed: {formatDate(log.completedAt)}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <p className="text-xs text-slate-500">
              Showing {(pagination.page - 1) * pagination.pageSize + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                disabled={pagination.page <= 1}
                className="px-3 py-1 bg-slate-700/50 text-slate-300 rounded text-xs hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-xs text-slate-400">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: Math.min(prev.totalPages, prev.page + 1) }))}
                disabled={pagination.page >= pagination.totalPages}
                className="px-3 py-1 bg-slate-700/50 text-slate-300 rounded text-xs hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
