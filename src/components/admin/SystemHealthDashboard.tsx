'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface ServiceStatus {
  name: string
  status: 'healthy' | 'degraded' | 'down' | 'unconfigured'
  latencyMs?: number
  details?: string
  lastChecked: string
}

interface CronJob {
  name: string
  lastRun: string | null
  status: string
  durationMs: number | null
  schedule: string
}

interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'down'
  services: ServiceStatus[]
  database: {
    status: string
    latencyMs: number
    tables: { name: string; rowCount: number }[]
    connectionPool?: string
  }
  cronJobs: CronJob[]
  errors: {
    last24h: number
    unresolved: number
    recentErrors: { message: string; source: string; count: number; lastSeen: string }[]
  }
  environment: {
    configured: string[]
    missing: string[]
    nodeEnv: string
    region: string
  }
  metrics: {
    totalProjects: number
    activeProjects: number
    totalCompanies: number
    totalBlogPosts: number
    totalStaffUsers: number
  }
}

const STATUS_COLORS = {
  healthy: 'bg-emerald-500',
  degraded: 'bg-orange-500',
  down: 'bg-rose-500',
  unconfigured: 'bg-slate-500',
  unknown: 'bg-slate-500',
} as const

const STATUS_TEXT = {
  healthy: 'text-emerald-400',
  degraded: 'text-orange-400',
  down: 'text-rose-400',
  unconfigured: 'text-slate-400',
} as const

const STATUS_BORDER = {
  healthy: 'border-emerald-500/30',
  degraded: 'border-orange-500/30',
  down: 'border-rose-500/30',
  unconfigured: 'border-slate-500/30',
} as const

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function SystemHealthDashboard() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/system-health')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setHealth(await res.json())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchHealth() }, [fetchHealth])

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(fetchHealth, 60000)
    return () => clearInterval(interval)
  }, [fetchHealth])

  const sendAiMessage = async () => {
    if (!aiInput.trim() || aiLoading) return
    const userMsg = { role: 'user' as const, content: aiInput }
    const newMessages = [...aiMessages, userMsg]
    setAiMessages(newMessages)
    setAiInput('')
    setAiLoading(true)

    try {
      const res = await fetch('/api/admin/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          projectContext: {
            projectName: 'System Health Dashboard',
            companyName: 'Triple Cities Tech',
            description: `System admin troubleshooting assistant. Current system health: ${JSON.stringify(health, null, 2)}`,
          },
        }),
      })
      const data = await res.json()
      if (data.success) {
        setAiMessages([...newMessages, { role: 'assistant', content: data.message }])
      } else {
        setAiMessages([...newMessages, { role: 'assistant', content: `Error: ${data.error || 'Unknown error'}` }])
      }
    } catch {
      setAiMessages([...newMessages, { role: 'assistant', content: 'Failed to reach AI service.' }])
    }
    setAiLoading(false)
  }

  const toggleSection = (section: string) => {
    setExpandedSection(prev => prev === section ? null : section)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
        <span className="ml-3 text-slate-400">Checking system health...</span>
      </div>
    )
  }

  if (error || !health) {
    return (
      <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-6 text-center">
        <p className="text-rose-400 font-medium mb-2">Failed to load system health</p>
        <p className="text-sm text-rose-300/70 mb-4">{error}</p>
        <button onClick={fetchHealth} className="px-4 py-2 bg-rose-500/20 text-rose-300 rounded-lg hover:bg-rose-500/30 transition-colors text-sm">
          Retry
        </button>
      </div>
    )
  }

  const healthyServices = health.services.filter(s => s.status === 'healthy').length
  const totalServices = health.services.length

  return (
    <div className="space-y-6">
      {/* Overall Status Banner */}
      <div className={`rounded-xl p-6 border ${
        health.overall === 'healthy' ? 'bg-emerald-500/5 border-emerald-500/30' :
        health.overall === 'degraded' ? 'bg-orange-500/5 border-orange-500/30' :
        'bg-rose-500/5 border-rose-500/30'
      }`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-4 h-4 rounded-full animate-pulse ${STATUS_COLORS[health.overall]}`} />
            <div>
              <h2 className={`text-xl font-bold ${STATUS_TEXT[health.overall]}`}>
                System {health.overall === 'healthy' ? 'Operational' : health.overall === 'degraded' ? 'Degraded' : 'Down'}
              </h2>
              <p className="text-sm text-slate-400 mt-0.5">
                {healthyServices}/{totalServices} services healthy | DB {health.database.latencyMs}ms | {health.errors.last24h} errors (24h)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAiOpen(!aiOpen)}
              className="px-4 py-2 bg-purple-500/20 border border-purple-500/30 text-purple-300 rounded-lg hover:bg-purple-500/30 transition-colors text-sm font-medium flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              AI Troubleshoot
            </button>
            <button
              onClick={fetchHealth}
              className="px-4 py-2 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors text-sm"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* AI Troubleshooting Panel */}
      {aiOpen && (
        <div className="bg-slate-800/50 border border-purple-500/20 rounded-xl overflow-hidden">
          <div className="bg-purple-600/20 px-4 py-3 border-b border-purple-500/20 flex items-center justify-between">
            <h3 className="text-sm font-medium text-purple-300">AI System Troubleshooter</h3>
            <button onClick={() => setAiOpen(false)} className="text-slate-400 hover:text-white">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto p-4 space-y-3">
            {aiMessages.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-4">
                Ask about system health, errors, performance issues, or get troubleshooting suggestions.
              </p>
            )}
            {aiMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user' ? 'bg-purple-600 text-white' : 'bg-slate-700/50 text-slate-200'
                }`}>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}
            {aiLoading && (
              <div className="flex gap-1 items-center text-purple-400 text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" />
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0.1s' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0.2s' }} />
              </div>
            )}
          </div>
          <div className="p-3 border-t border-purple-500/20 flex gap-2">
            <input
              type="text"
              value={aiInput}
              onChange={e => setAiInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendAiMessage()}
              placeholder="Ask about system health, errors, troubleshooting..."
              className="flex-1 bg-slate-900/50 text-white text-sm rounded-lg px-3 py-2 border border-slate-600/50 focus:border-purple-500/50 focus:outline-none placeholder-slate-500"
            />
            <button
              onClick={sendAiMessage}
              disabled={aiLoading || !aiInput.trim()}
              className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors text-sm"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Service Status Grid */}
      <div>
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">Services & Integrations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {health.services.map(service => (
            <div key={service.name} className={`bg-slate-800/50 border rounded-lg p-4 ${STATUS_BORDER[service.status]}`}>
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[service.status]}`} />
                <span className="text-sm font-medium text-white">{service.name}</span>
              </div>
              <p className="text-xs text-slate-500">{service.details}</p>
              {service.latencyMs !== undefined && (
                <p className="text-xs text-slate-500 mt-1">{service.latencyMs}ms latency</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Database + Errors Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Database Health */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <button onClick={() => toggleSection('db')} className="w-full flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-slate-300">Database Health</h3>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium ${STATUS_TEXT[health.database.status as keyof typeof STATUS_TEXT] || 'text-slate-400'}`}>
                {health.database.latencyMs}ms
              </span>
              <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[health.database.status as keyof typeof STATUS_COLORS] || 'bg-slate-500'}`} />
            </div>
          </button>
          {health.database.tables.length > 0 && (
            <div className="space-y-1.5">
              {health.database.tables.map(t => (
                <div key={t.name} className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">{t.name}</span>
                  <span className="text-white font-medium">{t.rowCount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-600 mt-3">{health.database.connectionPool}</p>
        </div>

        {/* Error Summary */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <button onClick={() => toggleSection('errors')} className="w-full flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-slate-300">Errors (24h)</h3>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium ${health.errors.last24h > 10 ? 'text-rose-400' : health.errors.last24h > 0 ? 'text-orange-400' : 'text-emerald-400'}`}>
                {health.errors.last24h} errors | {health.errors.unresolved} unresolved
              </span>
            </div>
          </button>
          {health.errors.recentErrors.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {health.errors.recentErrors.map((err, i) => (
                <div key={i} className="bg-slate-900/50 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs text-slate-500">{err.source}</span>
                    <span className="text-xs text-slate-600">{timeAgo(err.lastSeen)}{err.count > 1 ? ` (x${err.count})` : ''}</span>
                  </div>
                  <p className="text-xs text-rose-300/80 truncate">{err.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-emerald-400/60 text-center py-4">No errors in the last 24 hours</p>
          )}
        </div>
      </div>

      {/* Cron Jobs */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <button onClick={() => toggleSection('cron')} className="w-full flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-slate-300">Background Jobs & Cron</h3>
          <svg className={`w-4 h-4 text-slate-500 transition-transform ${expandedSection === 'cron' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {health.cronJobs.length > 0 ? (
          <div className={`overflow-x-auto ${expandedSection === 'cron' ? '' : 'max-h-40'} transition-all`}>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left text-slate-500 font-medium py-1.5 pr-4">Job</th>
                  <th className="text-left text-slate-500 font-medium py-1.5 pr-4">Schedule</th>
                  <th className="text-left text-slate-500 font-medium py-1.5 pr-4">Last Run</th>
                  <th className="text-left text-slate-500 font-medium py-1.5 pr-4">Status</th>
                  <th className="text-right text-slate-500 font-medium py-1.5">Duration</th>
                </tr>
              </thead>
              <tbody>
                {health.cronJobs.map(job => (
                  <tr key={job.name} className="border-b border-slate-700/20">
                    <td className="py-1.5 pr-4 text-white">{job.name}</td>
                    <td className="py-1.5 pr-4 text-slate-400">{job.schedule}</td>
                    <td className="py-1.5 pr-4 text-slate-400">{timeAgo(job.lastRun)}</td>
                    <td className="py-1.5 pr-4">
                      <span className={`${job.status === 'success' ? 'text-emerald-400' : job.status === 'error' ? 'text-rose-400' : 'text-slate-400'}`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="py-1.5 text-right text-slate-400">
                      {job.durationMs ? `${(job.durationMs / 1000).toFixed(1)}s` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-slate-500 text-center py-4">No job status data available</p>
        )}
      </div>

      {/* Environment + Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Environment */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Environment</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Node Environment</span>
              <span className="text-white font-medium">{health.environment.nodeEnv}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Region</span>
              <span className="text-white font-medium">{health.environment.region}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Configured Vars</span>
              <span className="text-emerald-400 font-medium">{health.environment.configured.length}</span>
            </div>
            {health.environment.missing.length > 0 && (
              <div className="mt-2 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2">
                <p className="text-xs text-rose-400 font-medium mb-1">Missing Variables:</p>
                <div className="flex flex-wrap gap-1">
                  {health.environment.missing.map(v => (
                    <span key={v} className="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded">{v}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Platform Metrics */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Platform Metrics</h3>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/admin/projects" className="bg-slate-900/50 rounded-lg p-3 hover:bg-slate-900/80 transition-colors">
              <p className="text-lg font-bold text-white">{health.metrics.totalProjects}</p>
              <p className="text-xs text-slate-500">Projects</p>
            </Link>
            <Link href="/admin/projects" className="bg-slate-900/50 rounded-lg p-3 hover:bg-slate-900/80 transition-colors">
              <p className="text-lg font-bold text-cyan-400">{health.metrics.activeProjects}</p>
              <p className="text-xs text-slate-500">Active</p>
            </Link>
            <Link href="/admin/companies" className="bg-slate-900/50 rounded-lg p-3 hover:bg-slate-900/80 transition-colors">
              <p className="text-lg font-bold text-white">{health.metrics.totalCompanies}</p>
              <p className="text-xs text-slate-500">Companies</p>
            </Link>
            <Link href="/admin/blog" className="bg-slate-900/50 rounded-lg p-3 hover:bg-slate-900/80 transition-colors">
              <p className="text-lg font-bold text-white">{health.metrics.totalBlogPosts}</p>
              <p className="text-xs text-slate-500">Blog Posts</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
