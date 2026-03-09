'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

interface LatencyPoint {
  latencyMs: number
  status: string
  overall: string
  time: string
}

interface LatencyResponse {
  range: string
  count: number
  snapshots: LatencyPoint[]
  warning?: string
}

const RANGES = [
  { key: '1h', label: '1 Hour' },
  { key: '1d', label: '1 Day' },
  { key: '1w', label: '1 Week' },
  { key: '1m', label: '1 Month' },
] as const

const DEGRADED_THRESHOLD = 2000

function formatTime(time: string, range: string): string {
  const d = new Date(time)
  if (range === '1h') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (range === '1d') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (range === '1w') return d.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function DbLatencyGraph() {
  const [range, setRange] = useState('1d')
  const [data, setData] = useState<LatencyResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/platform-monitor/db-latency?range=${range}`)
      if (res.ok) {
        setData(await res.json())
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const chartData = data?.snapshots.map(s => ({
    time: formatTime(s.time, range),
    rawTime: s.time,
    latencyMs: s.latencyMs,
    status: s.status,
  })) ?? []

  const maxLatency = Math.max(...chartData.map(d => d.latencyMs), 100)
  const avgLatency = chartData.length > 0
    ? Math.round(chartData.reduce((sum, d) => sum + d.latencyMs, 0) / chartData.length)
    : 0
  const highCount = chartData.filter(d => d.latencyMs >= DEGRADED_THRESHOLD).length

  return (
    <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-semibold text-white">Database Response Time</h3>
          <p className="text-sm text-slate-400 mt-1">
            {chartData.length > 0
              ? `${chartData.length} samples · Avg ${avgLatency}ms${highCount > 0 ? ` · ${highCount} high latency events` : ''}`
              : 'No data yet — snapshots are recorded on each health check'
            }
          </p>
        </div>
        <div className="flex gap-1 bg-slate-900/50 rounded-lg p-1">
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                range === r.key
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-cyan-500 border-t-transparent" />
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
          No snapshots in this time range. The system health dashboard records a snapshot each time it loads.
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="dangerGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="time"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                domain={[0, Math.max(maxLatency * 1.2, DEGRADED_THRESHOLD * 1.1)]}
                tickFormatter={(v) => `${v}ms`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#e2e8f0',
                  fontSize: '12px',
                }}
                formatter={(value) => [`${Number(value)}ms`, 'Latency']}
                labelFormatter={(label) => `Time: ${label}`}
              />
              <ReferenceLine
                y={DEGRADED_THRESHOLD}
                stroke="#ef4444"
                strokeDasharray="6 4"
                strokeOpacity={0.7}
                label={{
                  value: `${DEGRADED_THRESHOLD}ms threshold`,
                  position: 'right',
                  fill: '#ef4444',
                  fontSize: 11,
                }}
              />
              <Area
                type="monotone"
                dataKey="latencyMs"
                stroke="#06b6d4"
                strokeWidth={2}
                fill="url(#latencyGradient)"
                dot={/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                (props: any) => {
                  const { cx, cy, payload } = props
                  if (payload?.latencyMs >= DEGRADED_THRESHOLD) {
                    return (
                      <circle
                        key={`dot-${cx}-${cy}`}
                        cx={cx ?? 0}
                        cy={cy ?? 0}
                        r={4}
                        fill="#ef4444"
                        stroke="#fff"
                        strokeWidth={1}
                      />
                    )
                  }
                  return <circle key={`dot-${cx}-${cy}`} cx={cx ?? 0} cy={cy ?? 0} r={0} />
                }}
                activeDot={{ r: 5, fill: '#06b6d4', stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {data?.warning && (
        <p className="text-xs text-slate-500 mt-3 italic">{data.warning}</p>
      )}
    </div>
  )
}
