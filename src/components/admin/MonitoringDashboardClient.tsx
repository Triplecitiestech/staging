'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  AreaChart, Area,
} from 'recharts'

// ---- Types ----

interface AISummary {
  provider: string
  totalCalls: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalCostCents: number
  avgDurationMs: number
  errorCount: number
}

interface DayUsage {
  date: string
  calls: number
  tokens: number
  costCents: number
}

interface FeatureUsage {
  feature: string
  calls: number
  tokens: number
  costCents: number
  avgMs: number
}

interface TableInfo {
  tableName: string
  rowCount: number
  sizeBytes: number
}

interface Threshold {
  id: string
  metricKey: string
  displayName: string
  currentValue: number
  limitValue: number
  unit: string
  provider: string
  lastCheckedAt: string
  lastAlertedAt: string | null
}

interface ErrorDay {
  date: string
  count: number
  totalOccurrences: number
}

interface MonitorData {
  aiUsage: {
    summary: AISummary[]
    byDay: DayUsage[]
    byFeature: FeatureUsage[]
  }
  database: {
    tables: TableInfo[]
    totalRows: number
    totalSizeBytes: number
    totalSizeMB: number
  }
  thresholds: Threshold[]
  errorTrend: ErrorDay[]
}

// ---- Constants ----

const PIE_COLORS = ['#06b6d4', '#8b5cf6', '#f43f5e', '#f97316', '#10b981', '#ec4899']

// ---- Component ----

export default function MonitoringDashboardClient() {
  const [data, setData] = useState<MonitorData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/platform-monitor')
      if (res.ok) setData(await res.json())
    } catch { /* handled by null state */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
        <span className="ml-3 text-slate-400">Loading platform metrics...</span>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-8 text-center">
        <p className="text-slate-400 mb-4">Platform monitoring tables may not be set up yet.</p>
        <p className="text-xs text-slate-500">
          Run the migration: <code className="bg-slate-900 px-2 py-1 rounded">POST /api/admin/platform-monitor/migrate</code> with Bearer MIGRATION_SECRET
        </p>
      </div>
    )
  }

  const anthropicSummary = data.aiUsage.summary.find(s => s.provider === 'anthropic')
  const totalCost = Number(anthropicSummary?.totalCostCents ?? 0) / 100

  // Format day data for charts
  const dayChartData = data.aiUsage.byDay.map(d => ({
    ...d,
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    tokens: Number(d.tokens),
    cost: Number(d.costCents) / 100,
  }))

  const featureData = data.aiUsage.byFeature.map(f => ({
    ...f,
    name: f.feature.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    tokens: Number(f.tokens),
    cost: Number(f.costCents) / 100,
  }))

  // Top tables by row count
  const topTables = data.database.tables.slice(0, 10).map(t => ({
    name: t.tableName.length > 20 ? t.tableName.substring(0, 20) + '…' : t.tableName,
    fullName: t.tableName,
    rows: Number(t.rowCount),
    sizeMB: Math.round(Number(t.sizeBytes) / 1024 / 1024 * 100) / 100,
  }))

  const errorChartData = data.errorTrend.map(d => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    errors: d.count,
    occurrences: d.totalOccurrences,
  }))

  return (
    <div className="space-y-8">
      {/* Threshold Alerts */}
      {data.thresholds.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-white mb-4">Platform Thresholds</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.thresholds.map(t => {
              const pct = t.limitValue > 0 ? (t.currentValue / t.limitValue) * 100 : 0
              const barColor = pct >= 95 ? 'bg-rose-500' : pct >= 80 ? 'bg-violet-500' : pct >= 60 ? 'bg-cyan-500' : 'bg-emerald-500'
              const textColor = pct >= 95 ? 'text-rose-400' : pct >= 80 ? 'text-violet-400' : 'text-emerald-400'

              return (
                <div key={t.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-white">{t.displayName}</h3>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 bg-slate-900/50 px-2 py-0.5 rounded border border-slate-700/50">
                      {t.provider}
                    </span>
                  </div>
                  <div className="bg-slate-900/50 rounded-full h-3 mb-2 overflow-hidden">
                    <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">
                      {t.currentValue.toLocaleString()} / {t.limitValue.toLocaleString()} {t.unit}
                    </span>
                    <span className={`font-medium ${textColor}`}>{Math.round(pct)}%</span>
                  </div>
                  {t.lastAlertedAt && (
                    <p className="text-[10px] text-violet-400/60 mt-1">
                      Last alert: {new Date(t.lastAlertedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* AI Usage Summary */}
      <div>
        <h2 className="text-lg font-bold text-white mb-4">AI Token Usage (Anthropic API)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <MetricCard
            label="Total API Calls"
            value={anthropicSummary?.totalCalls ?? 0}
            suffix="calls"
          />
          <MetricCard
            label="Total Tokens"
            value={Number(anthropicSummary?.totalTokens ?? 0)}
            suffix="tokens"
            format="compact"
          />
          <MetricCard
            label="Estimated Cost"
            value={totalCost}
            prefix="$"
            format="currency"
          />
          <MetricCard
            label="Avg Response Time"
            value={Number(anthropicSummary?.avgDurationMs ?? 0)}
            suffix="ms"
          />
        </div>

        {/* Token Usage Over Time */}
        {dayChartData.length > 0 && (
          <div
            className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 mb-6 cursor-pointer"
            onClick={() => setActiveSection(activeSection === 'tokens-time' ? null : 'tokens-time')}
          >
            <h3 className="text-sm font-medium text-slate-300 mb-4">
              Daily Token Usage (30 days)
              <span className="text-xs text-slate-500 ml-2">Click to {activeSection === 'tokens-time' ? 'collapse' : 'expand'}</span>
            </h3>
            <div style={{ height: activeSection === 'tokens-time' ? 400 : 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dayChartData}>
                  <defs>
                    <linearGradient id="tokenGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#94a3b8' }}
                    formatter={(value) => [Number(value).toLocaleString() + ' tokens', 'Tokens']}
                  />
                  <Area type="monotone" dataKey="tokens" stroke="#06b6d4" fill="url(#tokenGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Usage by Feature */}
        {featureData.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-sm font-medium text-slate-300 mb-4">Token Usage by Feature</h3>
              <div style={{ height: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={featureData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      dataKey="tokens"
                      nameKey="name"
                      label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                      labelLine={{ stroke: '#64748b' }}
                    >
                      {featureData.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                      formatter={(value) => [Number(value).toLocaleString() + ' tokens', 'Tokens']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-sm font-medium text-slate-300 mb-4">Cost by Feature</h3>
              <div style={{ height: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={featureData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `$${v}`} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} width={120} />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                      formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Cost']}
                    />
                    <Bar dataKey="cost" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Database Metrics */}
      <div>
        <h2 className="text-lg font-bold text-white mb-4">Database (Vercel Postgres)</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <MetricCard label="Total Rows" value={data.database.totalRows} format="compact" />
          <MetricCard label="Total Size" value={data.database.totalSizeMB} suffix="MB" />
          <MetricCard label="Tables" value={data.database.tables.length} />
        </div>

        {topTables.length > 0 && (
          <div
            className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 cursor-pointer"
            onClick={() => setActiveSection(activeSection === 'db-tables' ? null : 'db-tables')}
          >
            <h3 className="text-sm font-medium text-slate-300 mb-4">
              Top Tables by Row Count
              <span className="text-xs text-slate-500 ml-2">Click to {activeSection === 'db-tables' ? 'collapse' : 'expand'}</span>
            </h3>
            <div style={{ height: activeSection === 'db-tables' ? 400 : 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topTables} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} width={140} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                    formatter={(value, name) => {
                      if (name === 'rows') return [Number(value).toLocaleString() + ' rows', 'Rows']
                      return [`${Number(value)} MB`, 'Size']
                    }}
                  />
                  <Bar dataKey="rows" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Error Trend */}
      {errorChartData.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-white mb-4">Error Trend (30 days)</h2>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={errorChartData}>
                  <defs>
                    <linearGradient id="errorGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                  <Area type="monotone" dataKey="errors" stroke="#f43f5e" fill="url(#errorGrad)" strokeWidth={2} name="Unique Errors" />
                  <Area type="monotone" dataKey="occurrences" stroke="#f97316" fill="transparent" strokeWidth={1.5} strokeDasharray="4 2" name="Total Occurrences" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Actions</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={async () => {
              const res = await fetch('/api/admin/platform-monitor/check', { method: 'POST' })
              const result = await res.json()
              alert(`Threshold check complete. ${result.alertsTriggered} alert(s) triggered.`)
              fetchData()
            }}
            className="px-4 py-2 bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 rounded-lg hover:bg-cyan-600/30 text-sm"
          >
            Run Threshold Check
          </button>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-700 text-sm"
          >
            Refresh Data
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Sub-components ----

function MetricCard({ label, value, prefix, suffix, format }: {
  label: string
  value: number
  prefix?: string
  suffix?: string
  format?: 'compact' | 'currency'
}) {
  let displayValue: string
  if (format === 'compact') {
    if (value >= 1_000_000) displayValue = `${(value / 1_000_000).toFixed(1)}M`
    else if (value >= 1_000) displayValue = `${(value / 1_000).toFixed(1)}K`
    else displayValue = value.toLocaleString()
  } else if (format === 'currency') {
    displayValue = value.toFixed(2)
  } else {
    displayValue = value.toLocaleString()
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-white">
        {prefix}{displayValue}
        {suffix && <span className="text-xs text-slate-500 ml-1">{suffix}</span>}
      </p>
    </div>
  )
}
