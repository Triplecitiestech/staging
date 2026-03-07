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
}

const JOB_LABELS: Record<string, string> = {
  sync_tickets: 'Sync Tickets',
  sync_time_entries: 'Sync Time Entries',
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
  const [running, setRunning] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reports/status')
      if (res.ok) setData(await res.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const triggerJob = async (jobName: string) => {
    setRunning(jobName)
    try {
      const endpoint = jobName.replace(/_/g, '-')
      const res = await fetch(`/api/reports/jobs/${endpoint}?secret=CRON_SECRET`)
      if (!res.ok) {
        const err = await res.json()
        alert(`Job failed: ${err.error || 'Unknown error'}`)
      }
      await fetchData()
    } catch {
      alert('Failed to trigger job')
    }
    setRunning(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
      </div>
    )
  }

  if (!data) return <p className="text-slate-500">Failed to load status</p>

  return (
    <div className="space-y-6">
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
            onClick={() => triggerJob('run')}
            disabled={running !== null}
            className="px-3 py-1.5 text-xs bg-cyan-500 text-white rounded-md hover:bg-cyan-600 disabled:opacity-50 transition-colors"
          >
            {running ? 'Running...' : 'Run All'}
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
              {data.jobs.map((job) => (
                <tr key={job.jobName} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                  <td className="px-4 py-3 text-sm text-white">
                    {JOB_LABELS[job.jobName] || job.jobName}
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
              {data.jobs.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-500">
                    No jobs have run yet. Click &quot;Run All&quot; to start the pipeline.
                  </td>
                </tr>
              )}
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
