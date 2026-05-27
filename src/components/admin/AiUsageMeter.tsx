'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

type WindowKey = '1h' | '24h' | '7d' | '30d' | '60d'

interface WindowMetrics {
  window: WindowKey
  calls: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
  errorCount: number
  avgDurationMs: number
}

interface FeatureBreakdown {
  feature: string
  calls: number
  totalTokens: number
  costUsd: number
}

interface ModelBreakdown {
  model: string | null
  calls: number
  totalTokens: number
  costUsd: number
}

interface DailyPoint {
  date: string
  calls: number
  totalTokens: number
  costUsd: number
}

interface MeterPayload {
  windows: WindowMetrics[]
  byFeature: FeatureBreakdown[]
  byModel: ModelBreakdown[]
  daily: DailyPoint[]
  generatedAt: string
}

const WINDOW_LABELS: Record<WindowKey, string> = {
  '1h': 'Current',
  '24h': 'Last 24h',
  '7d': 'Last 7d',
  '30d': 'Last 30d',
  '60d': 'Last 60d',
}

const WINDOW_ORDER: WindowKey[] = ['1h', '24h', '7d', '30d', '60d']

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function fmtUsd(n: number): string {
  if (n >= 100) return `$${n.toFixed(0)}`
  return `$${n.toFixed(2)}`
}

interface Props {
  variant?: 'compact' | 'full'
}

export default function AiUsageMeter({ variant = 'compact' }: Props) {
  const [data, setData] = useState<MeterPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/admin/ai-usage/meter', { signal })
      if (!res.ok) {
        setError('Failed to load AI usage')
        setLoading(false)
        return
      }
      const result = (await res.json()) as MeterPayload & { success?: boolean }
      setData(result)
      setError(null)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError('Failed to load AI usage')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchData(controller.signal)
    return () => controller.abort()
  }, [fetchData])

  const windowsByKey = useMemo(() => {
    const map: Partial<Record<WindowKey, WindowMetrics>> = {}
    data?.windows.forEach(w => { map[w.window] = w })
    return map
  }, [data])

  const sparkline = useMemo(() => {
    if (!data) return []
    return data.daily.map(d => ({
      date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      cost: d.costUsd,
      tokens: d.totalTokens,
    }))
  }, [data])

  if (loading) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 animate-pulse">
        <div className="h-4 w-32 bg-slate-700/50 rounded mb-3" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {WINDOW_ORDER.map(k => (
            <div key={k} className="h-20 bg-slate-700/30 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <p className="text-sm text-slate-400">AI usage meter unavailable. {error}</p>
      </div>
    )
  }

  const current = windowsByKey['1h']
  const isLive = current && current.calls > 0

  return (
    <div className="space-y-4">
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">AI Spend Meter</h3>
              <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${
                isLive
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-700/40 text-slate-400 border border-slate-600/30'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                {isLive ? 'Active' : 'Idle'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Anthropic token spend across all features</p>
          </div>
          {variant === 'compact' && (
            <Link
              href="/admin/monitoring"
              className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              Full breakdown →
            </Link>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {WINDOW_ORDER.map(key => {
            const w = windowsByKey[key]
            const cost = w?.costUsd ?? 0
            const tokens = w?.totalTokens ?? 0
            const calls = w?.calls ?? 0
            const errors = w?.errorCount ?? 0
            const accent =
              key === '1h' ? (isLive ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-700/50 bg-slate-900/30')
              : 'border-slate-700/50 bg-slate-900/30'
            return (
              <div key={key} className={`rounded-lg border ${accent} px-3 py-3`}>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{WINDOW_LABELS[key]}</p>
                <p className="text-xl font-bold text-white leading-tight">{fmtUsd(cost)}</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {compact(tokens)} tok · {calls} call{calls === 1 ? '' : 's'}
                </p>
                {errors > 0 && (
                  <p className="text-[10px] text-rose-400 mt-0.5">{errors} error{errors === 1 ? '' : 's'}</p>
                )}
              </div>
            )
          })}
        </div>

        {variant === 'compact' && data.byFeature.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-700/30">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Top features (30d)</p>
            <div className="flex flex-wrap gap-2">
              {data.byFeature.slice(0, 5).map(f => (
                <span
                  key={f.feature}
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-slate-900/50 border border-slate-700/50 text-slate-300"
                >
                  <span className="font-medium">{f.feature}</span>
                  <span className="text-cyan-400">{fmtUsd(f.costUsd)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {variant === 'full' && (
        <>
          {sparkline.length > 0 && (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Daily spend (60 days)</h3>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparkline}>
                    <defs>
                      <linearGradient id="aiCostGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      tickFormatter={v => `$${v}`}
                    />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: '#94a3b8' }}
                      formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Cost']}
                    />
                    <Area type="monotone" dataKey="cost" stroke="#06b6d4" fill="url(#aiCostGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Cost by feature (30d)</h3>
              {data.byFeature.length === 0 ? (
                <p className="text-xs text-slate-500">No tracked usage yet.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-700/30">
                      <th className="text-left font-medium pb-2">Feature</th>
                      <th className="text-right font-medium pb-2">Calls</th>
                      <th className="text-right font-medium pb-2">Tokens</th>
                      <th className="text-right font-medium pb-2">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byFeature.map(f => (
                      <tr key={f.feature} className="border-b border-slate-800/40">
                        <td className="py-1.5 text-slate-300 font-medium">{f.feature}</td>
                        <td className="py-1.5 text-right text-slate-400">{f.calls.toLocaleString()}</td>
                        <td className="py-1.5 text-right text-slate-400">{compact(f.totalTokens)}</td>
                        <td className="py-1.5 text-right text-cyan-300 font-semibold">{fmtUsd(f.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Cost by model (30d)</h3>
              {data.byModel.length === 0 ? (
                <p className="text-xs text-slate-500">No tracked usage yet.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-700/30">
                      <th className="text-left font-medium pb-2">Model</th>
                      <th className="text-right font-medium pb-2">Calls</th>
                      <th className="text-right font-medium pb-2">Tokens</th>
                      <th className="text-right font-medium pb-2">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byModel.map(m => (
                      <tr key={m.model ?? '(unknown)'} className="border-b border-slate-800/40">
                        <td className="py-1.5 text-slate-300 font-mono text-[11px]">{m.model ?? '(unknown)'}</td>
                        <td className="py-1.5 text-right text-slate-400">{m.calls.toLocaleString()}</td>
                        <td className="py-1.5 text-right text-slate-400">{compact(m.totalTokens)}</td>
                        <td className="py-1.5 text-right text-cyan-300 font-semibold">{fmtUsd(m.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
