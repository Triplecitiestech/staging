'use client'

import { useCallback, useEffect, useState } from 'react'

interface ProbeResult {
  endpoint: string
  status: 'success' | 'failed' | 'skipped'
  authMethod?: string
  error?: string
  dataPreview?: string
}

interface HealthResponse {
  checkedAt: string
  connectionTest: {
    configured: boolean
    hasApiKey: boolean
    hasRefreshToken: boolean
    hasStaticIdToken: boolean
    hasPartnerId: boolean
    authMode: 'refresh' | 'static' | 'unconfigured'
    baseUrl: string
    missingCredentials: string[]
    tokenRefresh?: {
      attempted: boolean
      success: boolean
      expiresInSec?: number
      error?: string
    }
    results: ProbeResult[]
  }
  webhookHealth: {
    totalEventsAllTime: number
    eventsLast24h: number
    lastEventAt: string | null
    minutesSinceLastEvent: number | null
    status: 'healthy' | 'stale' | 'never_received' | 'unknown'
    tokenConfigured: boolean
    error?: string
  }
}

function describeWebhook(status: HealthResponse['webhookHealth']['status']): {
  label: string
  tone: 'green' | 'amber' | 'red' | 'slate'
} {
  switch (status) {
    case 'healthy':
      return { label: 'Healthy', tone: 'green' }
    case 'stale':
      return { label: 'Stale (>24h since last event)', tone: 'amber' }
    case 'never_received':
      return { label: 'Never received', tone: 'red' }
    default:
      return { label: 'Unknown', tone: 'slate' }
  }
}

function toneClasses(tone: 'green' | 'amber' | 'red' | 'slate'): { dot: string; text: string; bg: string } {
  switch (tone) {
    case 'green':
      return { dot: 'bg-emerald-400', text: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/30' }
    case 'amber':
      // No amber/orange palette per UI standards — use violet as the "needs attention but not broken" tone.
      return { dot: 'bg-violet-400', text: 'text-violet-300', bg: 'bg-violet-500/10 border-violet-500/30' }
    case 'red':
      return { dot: 'bg-rose-400', text: 'text-rose-300', bg: 'bg-rose-500/10 border-rose-500/30' }
    default:
      return { dot: 'bg-slate-400', text: 'text-slate-300', bg: 'bg-slate-500/10 border-slate-500/30' }
  }
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`
  return `${Math.round(ms / 86_400_000)}d ago`
}

export default function SaasAlertsHealthCard() {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const fetchHealth = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/compliance/saas-alerts/health', { signal })
      if (!res.ok) throw new Error(`Health check returned ${res.status}`)
      const json = (await res.json()) as HealthResponse
      setData(json)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void fetchHealth(controller.signal)
    return () => controller.abort()
  }, [fetchHealth])

  const restConfigured = data?.connectionTest.configured ?? false
  const restProbesPassed = data?.connectionTest.results.every((r) => r.status === 'success') ?? false
  const tokenRefreshOk =
    !data?.connectionTest.tokenRefresh || data.connectionTest.tokenRefresh.success !== false
  const webhookDesc = data ? describeWebhook(data.webhookHealth.status) : describeWebhook('unknown')

  const overall: 'green' | 'amber' | 'red' | 'slate' = !data
    ? 'slate'
    : restConfigured && restProbesPassed && tokenRefreshOk && data.webhookHealth.status === 'healthy'
      ? 'green'
      : !restConfigured || !restProbesPassed || !tokenRefreshOk
        ? 'red'
        : 'amber'

  const overallTone = toneClasses(overall)
  const webhookTone = toneClasses(webhookDesc.tone)

  return (
    <section className={`rounded-xl border ${overallTone.bg} p-5 space-y-4`}>
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${overallTone.dot}`} aria-hidden />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white">SaaS Alerts Integration Health</h2>
            <p className="text-xs text-slate-400">
              Webhook ingest + Partner REST API status.{' '}
              {data && (
                <span className="text-slate-500">Last checked {formatRelative(data.checkedAt)}.</span>
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => fetchHealth()}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-md bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-white/10 disabled:opacity-50"
        >
          {loading ? 'Checking…' : 'Re-check'}
        </button>
      </header>

      {error && (
        <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md p-2">
          {error}
        </div>
      )}

      {data && (
        <div className="grid sm:grid-cols-2 gap-3">
          {/* Webhook receiver */}
          <div className="rounded-lg bg-slate-900/40 border border-white/5 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">Webhook receiver</span>
              <span className={`text-xs ${webhookTone.text}`}>{webhookDesc.label}</span>
            </div>
            <p className="text-xs text-slate-300">
              <span className="text-white font-medium">{data.webhookHealth.eventsLast24h}</span> events in last 24h ·{' '}
              <span className="text-white font-medium">{data.webhookHealth.totalEventsAllTime}</span> all-time
            </p>
            <p className="text-xs text-slate-400">
              Last event: {formatRelative(data.webhookHealth.lastEventAt)}
              {!data.webhookHealth.tokenConfigured && (
                <span className="ml-1 text-rose-300">· token not configured</span>
              )}
            </p>
          </div>

          {/* REST API */}
          <div className="rounded-lg bg-slate-900/40 border border-white/5 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">Partner REST API</span>
              <span
                className={`text-xs ${
                  restConfigured && restProbesPassed && tokenRefreshOk
                    ? 'text-emerald-300'
                    : restConfigured
                      ? 'text-violet-300'
                      : 'text-rose-300'
                }`}
              >
                {!restConfigured
                  ? 'Not configured'
                  : !tokenRefreshOk
                    ? 'Refresh failed'
                    : restProbesPassed
                      ? 'All endpoints OK'
                      : 'Partial'}
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Auth mode:{' '}
              <span className="text-white font-medium">{data.connectionTest.authMode}</span>
              {data.connectionTest.tokenRefresh?.expiresInSec !== undefined && (
                <span className="text-slate-400">
                  {' '}
                  · token good for {Math.round(data.connectionTest.tokenRefresh.expiresInSec / 60)}m
                </span>
              )}
            </p>
            <p className="text-xs text-slate-400 truncate" title={data.connectionTest.baseUrl}>
              {data.connectionTest.baseUrl.replace(/^https?:\/\//, '')}
            </p>
          </div>
        </div>
      )}

      {data && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-slate-400 hover:text-slate-200 underline-offset-2 hover:underline"
        >
          {expanded ? 'Hide details' : 'Show probe details'}
        </button>
      )}

      {data && expanded && (
        <div className="space-y-2 text-xs">
          {data.connectionTest.missingCredentials.length > 0 && (
            <div className="text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded p-2">
              Missing env vars: {data.connectionTest.missingCredentials.join(', ')}
            </div>
          )}
          {data.connectionTest.tokenRefresh && (
            <div
              className={`rounded p-2 border ${
                data.connectionTest.tokenRefresh.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              Token refresh: {data.connectionTest.tokenRefresh.success ? 'success' : 'failed'}
              {data.connectionTest.tokenRefresh.expiresInSec !== undefined &&
                ` · expires in ${data.connectionTest.tokenRefresh.expiresInSec}s`}
              {data.connectionTest.tokenRefresh.error && (
                <div className="mt-1 text-slate-400 break-all">{data.connectionTest.tokenRefresh.error}</div>
              )}
            </div>
          )}
          <ul className="space-y-1">
            {data.connectionTest.results.map((r) => (
              <li
                key={r.endpoint}
                className={`rounded p-2 border ${
                  r.status === 'success'
                    ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300'
                    : r.status === 'skipped'
                      ? 'bg-slate-500/5 border-slate-500/20 text-slate-300'
                      : 'bg-rose-500/5 border-rose-500/20 text-rose-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono text-[11px] truncate">{r.endpoint}</code>
                  <span className="text-[11px] uppercase tracking-wider">{r.status}</span>
                </div>
                {r.error && <div className="text-slate-400 mt-1 break-words">{r.error}</div>}
                {r.dataPreview && (
                  <div className="text-slate-500 mt-1 font-mono text-[10px] break-all">{r.dataPreview}</div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
