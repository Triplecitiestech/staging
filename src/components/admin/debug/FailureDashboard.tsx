'use client'

import { useState, useEffect, useCallback } from 'react'

interface TestFailure {
  id: string
  testName: string
  testFile: string
  url?: string | null
  environment: string
  errorMessage: string
  errorStack?: string | null
  consoleErrors?: string[] | null
  networkErrors?: string[] | null
  screenshotPath?: string | null
  tracePath?: string | null
  commitSha?: string | null
  branchName?: string | null
  summary?: string | null
  rootCauseHypothesis?: string | null
  suggestedFix?: string | null
  impactedFiles?: string[] | null
  confidence?: string | null
  status: string
  resolvedAt?: string | null
  resolvedBy?: string | null
  createdAt: string
  updatedAt: string
}

interface Stats {
  totalByStatus: Record<string, number>
  total: number
  unresolved: number
  last24h: number
}

const STATUS_OPTIONS = ['open', 'investigating', 'fixed', 'wont_fix', 'duplicate']

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  investigating: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  fixed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  wont_fix: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  duplicate: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'text-emerald-400',
  medium: 'text-cyan-400',
  low: 'text-slate-400',
}

export default function FailureDashboard() {
  const [failures, setFailures] = useState<TestFailure[]>([])
  const [stats, setStats] = useState<Stats>({ totalByStatus: {}, total: 0, unresolved: 0, last24h: 0 })
  const [loading, setLoading] = useState(true)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [selectedFailure, setSelectedFailure] = useState<TestFailure | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const fetchFailures = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filterStatus) params.set('status', filterStatus)
      const res = await fetch(`/api/test-failures?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setFailures(data.failures)
      setStats(data.stats)
      setNeedsMigration(!!data.needsMigration)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load failures')
    } finally {
      setLoading(false)
    }
  }, [filterStatus])

  useEffect(() => {
    fetchFailures()
  }, [fetchFailures])

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch('/api/test-failures', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      })
      if (!res.ok) throw new Error('Failed to update')
      const updated = await res.json()
      setFailures(prev => prev.map(f => f.id === id ? updated : f))
      if (selectedFailure?.id === id) setSelectedFailure(updated)
      fetchFailures() // Refresh stats
    } catch {
      setError('Failed to update status')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
      </div>
    )
  }

  if (needsMigration) {
    return (
      <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-6">
        <h2 className="text-lg font-semibold text-violet-300">Migration Required</h2>
        <p className="text-slate-300 mt-2">
          The <code className="text-cyan-400">test_failures</code> table does not exist yet.
          Run the migration endpoint or apply the Prisma migration to enable this dashboard.
        </p>
        <pre className="mt-3 bg-slate-950 rounded-lg p-3 text-sm text-slate-400 overflow-x-auto">
          npx prisma migrate deploy
        </pre>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-rose-300 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Failures" value={stats.total} color="text-white" />
        <StatCard label="Unresolved" value={stats.unresolved} color="text-rose-400" />
        <StatCard label="Last 24h" value={stats.last24h} color="text-violet-400" />
        <StatCard label="Fixed" value={stats.totalByStatus['fixed'] || 0} color="text-emerald-400" />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-400">Filter:</span>
        <button
          onClick={() => setFilterStatus('')}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            !filterStatus ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'
          }`}
        >
          All
        </button>
        {STATUS_OPTIONS.map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filterStatus === s ? STATUS_COLORS[s] : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'
            }`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
        <button
          onClick={() => fetchFailures()}
          className="ml-auto px-3 py-1 rounded-lg text-xs bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Main Content — List + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Failure List */}
        <div className="lg:col-span-2 space-y-2">
          {failures.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <p className="text-lg">No failures found</p>
              <p className="text-sm mt-1">Test failures captured by Playwright will appear here</p>
            </div>
          ) : (
            failures.map(f => (
              <button
                key={f.id}
                onClick={() => setSelectedFailure(f)}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  selectedFailure?.id === f.id
                    ? 'bg-slate-800/80 border-cyan-500/40 ring-1 ring-cyan-500/20'
                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium text-white truncate">{f.testName}</h3>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_COLORS[f.status] || STATUS_COLORS.open}`}>
                    {f.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 truncate">{f.testFile}</p>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{f.errorMessage}</p>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                  <span>{f.environment}</span>
                  {f.confidence && (
                    <span className={CONFIDENCE_COLORS[f.confidence] || ''}>
                      {f.confidence} confidence
                    </span>
                  )}
                  <span>{new Date(f.createdAt).toLocaleDateString()}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-3">
          {selectedFailure ? (
            <FailureDetail
              failure={selectedFailure}
              onStatusChange={(status) => updateStatus(selectedFailure.id, status)}
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-slate-500 border border-dashed border-slate-800 rounded-xl">
              Select a failure to view details
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-4">
      <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  )
}

function FailureDetail({
  failure,
  onStatusChange,
}: {
  failure: TestFailure
  onStatusChange: (status: string) => void
}) {
  const consoleErrors = Array.isArray(failure.consoleErrors) ? failure.consoleErrors : []
  const networkErrors = Array.isArray(failure.networkErrors) ? failure.networkErrors : []
  const impactedFiles = Array.isArray(failure.impactedFiles) ? failure.impactedFiles : []

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-6 space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">{failure.testName}</h2>
          <select
            value={failure.status}
            onChange={(e) => onStatusChange(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1 focus:border-cyan-500 focus:outline-none"
          >
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
        <p className="text-sm text-slate-400 mt-1">{failure.testFile}</p>
        <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
          <span>Env: <span className="text-slate-300">{failure.environment}</span></span>
          {failure.branchName && <span>Branch: <span className="text-slate-300">{failure.branchName}</span></span>}
          {failure.commitSha && <span>Commit: <code className="text-cyan-400">{failure.commitSha}</code></span>}
          {failure.confidence && (
            <span>Confidence: <span className={CONFIDENCE_COLORS[failure.confidence] || ''}>{failure.confidence}</span></span>
          )}
          <span>At: {new Date(failure.createdAt).toLocaleString()}</span>
        </div>
      </div>

      {/* Error */}
      <Section title="Error Message">
        <pre className="text-sm text-rose-300 whitespace-pre-wrap break-words">{failure.errorMessage}</pre>
      </Section>

      {failure.errorStack && (
        <Section title="Stack Trace" collapsible>
          <pre className="text-xs text-slate-400 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">{failure.errorStack}</pre>
        </Section>
      )}

      {/* AI Summary */}
      {failure.summary && (
        <Section title="AI Debug Summary">
          <p className="text-sm text-slate-300 whitespace-pre-wrap">{failure.summary}</p>
        </Section>
      )}

      {failure.rootCauseHypothesis && (
        <Section title="Root Cause Hypothesis">
          <p className="text-sm text-cyan-300">{failure.rootCauseHypothesis}</p>
        </Section>
      )}

      {failure.suggestedFix && (
        <Section title="Suggested Fix">
          <p className="text-sm text-emerald-300 whitespace-pre-wrap">{failure.suggestedFix}</p>
        </Section>
      )}

      {/* Console Errors */}
      {consoleErrors.length > 0 && (
        <Section title={`Console Errors (${consoleErrors.length})`}>
          <ul className="space-y-1">
            {consoleErrors.map((e, i) => (
              <li key={i} className="text-xs text-rose-300 font-mono bg-slate-950 rounded px-2 py-1">{e}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Network Errors */}
      {networkErrors.length > 0 && (
        <Section title={`Network Errors (${networkErrors.length})`}>
          <ul className="space-y-1">
            {networkErrors.map((e, i) => (
              <li key={i} className="text-xs text-violet-300 font-mono bg-slate-950 rounded px-2 py-1">{e}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Impacted Files */}
      {impactedFiles.length > 0 && (
        <Section title="Impacted Files">
          <ul className="space-y-1">
            {impactedFiles.map((f, i) => (
              <li key={i} className="text-xs text-cyan-400 font-mono">{f}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Artifacts */}
      {(failure.screenshotPath || failure.tracePath || failure.url) && (
        <Section title="Artifacts">
          <div className="space-y-1 text-xs">
            {failure.url && <p>URL: <span className="text-slate-300">{failure.url}</span></p>}
            {failure.screenshotPath && <p>Screenshot: <code className="text-slate-300">{failure.screenshotPath}</code></p>}
            {failure.tracePath && <p>Trace: <code className="text-slate-300">{failure.tracePath}</code></p>}
          </div>
        </Section>
      )}

      {/* Resolution info */}
      {failure.resolvedAt && (
        <div className="text-xs text-emerald-400 border-t border-slate-800 pt-3">
          Resolved {new Date(failure.resolvedAt).toLocaleString()} by {failure.resolvedBy || 'unknown'}
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  children,
  collapsible = false,
}: {
  title: string
  children: React.ReactNode
  collapsible?: boolean
}) {
  const [open, setOpen] = useState(!collapsible)

  return (
    <div className="border-t border-slate-800 pt-3">
      {collapsible ? (
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-300 transition-colors"
        >
          <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>&#9654;</span>
          {title}
        </button>
      ) : (
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{title}</h3>
      )}
      {open && <div className="mt-2">{children}</div>}
    </div>
  )
}
