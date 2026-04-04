'use client'

import { useState, useEffect, useCallback } from 'react'

interface JobStatus {
  jobName: string
  lastRunAt: string | null
  lastRunStatus: string | null
  lastRunDurationMs: number | null
  lastRunError: string | null
  lastRunMeta: Record<string, unknown> | null
}

interface DataCoverage {
  tickets: number
  earliestTicket: string | null
  latestTicket: string | null
  lifecycleRecords: number
  timeEntries: number
  notes: number
  resources: number
  technicianMetricDays: number
  companyMetricDays: number
  healthScores: number
  activeTargets: number
}

interface StatusData {
  jobs: JobStatus[]
  dataCoverage: DataCoverage
  _warning?: string
}

interface RunResult {
  job: string
  success: boolean
  error?: string
}

// All pipeline jobs in execution order (scheduled crons only)
const ALL_JOBS = [
  'sync_tickets',
  'sync_time_entries',
  'sync_ticket_notes',
  'sync_resources',
  'compute_lifecycle',
  'aggregate_technician',
  'aggregate_company',
  'compute_health',
]

const JOB_LABELS: Record<string, string> = {
  sync_tickets: 'Sync Tickets',
  sync_time_entries: 'Sync Time Entries',
  sync_time_entries_bulk: 'Bulk Time Entry Sync (manual)',
  sync_ticket_notes: 'Sync Ticket Notes',
  sync_resources: 'Sync Resources',
  compute_lifecycle: 'Compute Lifecycle',
  aggregate_technician: 'Aggregate Technician',
  aggregate_company: 'Aggregate Company',
  compute_health: 'Compute Health Scores',
}

export default function PipelineStatus() {
  const [data, setData] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [lastRunResults, setLastRunResults] = useState<RunResult[] | null>(null)
  const [lastRunSummary, setLastRunSummary] = useState<string | null>(null)

  const fetchDataImpl = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/reports/status', { signal })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Failed to load status (HTTP ${res.status})`)
      }
      setData(await res.json())
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('[PipelineStatus] Failed to load:', msg)
      setError(msg)
    }
    setLoading(false)
  }, [])

  const fetchData = useCallback(() => fetchDataImpl(), [fetchDataImpl])

  useEffect(() => {
    const controller = new AbortController()
    fetchDataImpl(controller.signal)
    return () => controller.abort()
  }, [fetchDataImpl])

  const runSingleJob = async (jobName: string): Promise<RunResult> => {
    try {
      const res = await fetch('/api/reports/jobs/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job: jobName }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        return { job: jobName, success: false, error: body.error || `HTTP ${res.status}` }
      }
      return { job: jobName, success: true }
    } catch {
      return { job: jobName, success: false, error: 'Network error or timeout' }
    }
  }

  const triggerJob = async (jobName: string) => {
    setRunning(jobName)
    setLastRunResults(null)
    setLastRunSummary(null)

    if (jobName === 'run_all') {
      // Run each job individually from the client to avoid 60s serverless timeout
      const results: RunResult[] = []
      for (const name of ALL_JOBS) {
        setRunning(name)
        const result = await runSingleJob(name)
        results.push(result)
        // Update results progressively so user sees each job complete
        setLastRunResults([...results])
        const ok = results.filter((r) => r.success).length
        setLastRunSummary(`${ok}/${results.length} of ${ALL_JOBS.length} jobs completed`)
      }
      const ok = results.filter((r) => r.success).length
      setLastRunSummary(`Pipeline finished: ${ok}/${ALL_JOBS.length} jobs succeeded`)
      await fetchData()
      setRunning(null)
      return
    }

    // Single job
    const result = await runSingleJob(jobName)
    if (result.success) {
      setLastRunSummary(`${JOB_LABELS[jobName] || jobName}: completed successfully`)
    } else {
      setLastRunSummary(`${JOB_LABELS[jobName] || jobName} failed: ${result.error}`)
      setLastRunResults([result])
    }
    await fetchData()
    setRunning(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-4">
        <h3 className="text-sm font-medium text-rose-400 mb-1">Pipeline status failed to load</h3>
        <p className="text-sm text-rose-300/80">{error}</p>
        <button onClick={fetchData} className="text-sm text-cyan-400 mt-2 hover:underline">Retry</button>
      </div>
    )
  }

  if (!data) return <p className="text-slate-500">No status data available</p>

  // Always show all 8 jobs — merge DB results with expected job list
  const jobMap = new Map(data.jobs.map((j) => [j.jobName, j]))
  const mergedJobs: JobStatus[] = ALL_JOBS.map((name) =>
    jobMap.get(name) || {
      jobName: name,
      lastRunAt: null,
      lastRunStatus: null,
      lastRunDurationMs: null,
      lastRunError: null,
      lastRunMeta: null,
    }
  )

  return (
    <div className="space-y-6">
      {/* Warning banner (e.g. tables empty) */}
      {data._warning && (
        <div className="bg-violet-500/10 border border-violet-500/30 rounded-lg p-4">
          <p className="text-sm text-violet-300">{data._warning}</p>
        </div>
      )}

      {/* Run results banner */}
      {lastRunSummary && (
        <div className={`rounded-lg p-4 border ${
          lastRunResults?.some((r) => !r.success)
            ? 'bg-rose-500/10 border-rose-500/30'
            : 'bg-emerald-500/10 border-emerald-500/30'
        }`}>
          <div className="flex items-center justify-between">
            <p className={`text-sm font-medium ${
              lastRunResults?.some((r) => !r.success) ? 'text-rose-300' : 'text-emerald-300'
            }`}>
              {lastRunSummary}
            </p>
            <button
              onClick={() => { setLastRunResults(null); setLastRunSummary(null) }}
              className="text-xs text-slate-400 hover:text-white ml-4"
            >
              Dismiss
            </button>
          </div>
          {lastRunResults && (
            <div className="mt-3 space-y-1">
              {lastRunResults.map((r) => (
                <div key={r.job} className="flex items-start gap-2 text-xs">
                  <span className={`shrink-0 ${r.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {r.success ? 'OK' : 'FAIL'}
                  </span>
                  <span className="text-slate-300">{JOB_LABELS[r.job] || r.job}</span>
                  {r.error && (
                    <span className="text-rose-400/80 break-all">
                      — {r.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Data Coverage */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-sm font-medium text-slate-300 mb-4">Data Coverage</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <CoverageStat label="Tickets" value={data.dataCoverage.tickets} />
          <CoverageStat label="Lifecycle Records" value={data.dataCoverage.lifecycleRecords} />
          <CoverageStat label="Time Entries" value={data.dataCoverage.timeEntries} />
          <CoverageStat label="Notes" value={data.dataCoverage.notes} />
          <CoverageStat label="Resources" value={data.dataCoverage.resources} />
          <CoverageStat label="Tech Metric Days" value={data.dataCoverage.technicianMetricDays} />
          <CoverageStat label="Company Metric Days" value={data.dataCoverage.companyMetricDays} />
          <CoverageStat label="Health Scores" value={data.dataCoverage.healthScores} />
          <CoverageStat label="Active Targets" value={data.dataCoverage.activeTargets} />
          {data.dataCoverage.earliestTicket && (
            <div>
              <p className="text-xs text-slate-500">Date Range</p>
              <p className="text-sm text-white">
                {new Date(data.dataCoverage.earliestTicket).toLocaleDateString()} -{' '}
                {data.dataCoverage.latestTicket
                  ? new Date(data.dataCoverage.latestTicket).toLocaleDateString()
                  : 'now'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Job Status Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-300">Pipeline Jobs</h3>
          <button
            onClick={() => triggerJob('run_all')}
            disabled={running !== null}
            className="px-3 py-1.5 text-xs bg-cyan-500 text-white rounded-md hover:bg-cyan-600 disabled:opacity-50 transition-colors"
          >
            {running ? `Running${running !== 'run_all' ? `: ${JOB_LABELS[running] || running}` : '...'}` : 'Run All'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Job</th>
                <th className="text-center text-xs text-slate-400 font-medium px-4 py-3">Status</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3 hidden md:table-cell">Last Run</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3 hidden md:table-cell">Duration</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {mergedJobs.map((job) => (
                <tr key={job.jobName} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                  <td className="px-4 py-3">
                    <div className="text-sm text-white">{JOB_LABELS[job.jobName] || job.jobName}</div>
                    {job.lastRunError && (
                      <div className="text-xs text-rose-400/70 mt-0.5 truncate max-w-xs" title={job.lastRunError}>
                        {job.lastRunError}
                      </div>
                    )}
                  </td>
                  <td className="text-center px-4 py-3">
                    <StatusBadge status={job.lastRunStatus} />
                  </td>
                  <td className="text-right px-4 py-3 text-xs text-slate-400 hidden md:table-cell">
                    {job.lastRunAt ? timeAgo(new Date(job.lastRunAt)) : 'Never'}
                  </td>
                  <td className="text-right px-4 py-3 text-xs text-slate-400 hidden md:table-cell">
                    {job.lastRunDurationMs !== null ? `${(job.lastRunDurationMs / 1000).toFixed(1)}s` : '-'}
                  </td>
                  <td className="text-right px-4 py-3">
                    <button
                      onClick={() => triggerJob(job.jobName)}
                      disabled={running !== null}
                      className="text-xs text-cyan-400 hover:underline disabled:opacity-50"
                    >
                      {running === job.jobName ? 'Running...' : 'Run'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function CoverageStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-white">{value.toLocaleString()}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded-full">Pending</span>
  }

  const colors: Record<string, string> = {
    success: 'text-emerald-400 bg-emerald-400/10',
    failed: 'text-rose-400 bg-rose-400/10',
  }

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] || 'text-slate-400 bg-slate-700/50'}`}>
      {status}
    </span>
  )
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
