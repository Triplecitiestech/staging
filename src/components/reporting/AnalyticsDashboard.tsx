'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import ReportFilterBar from './ReportFilters'
import ReportAIAssistant from './ReportAIAssistant'

interface AnomalyAlert {
  type: string
  severity: 'info' | 'warning' | 'critical'
  metric: string
  message: string
  value: number
  baseline: number
  deviationPercent: number
  detectedAt: string
  context?: string
}

interface OperationalInsight {
  id: string
  category: string
  title: string
  description: string
  severity: 'info' | 'warning' | 'critical'
  recommendation?: string
}

interface PredictiveTrend {
  metric: string
  label: string
  currentValue: number
  projectedValue: number
  projectedChangePercent: number
  confidence: 'low' | 'medium' | 'high'
  direction: 'up' | 'down' | 'flat'
  dataPoints: number
}

interface AnalyticsData {
  anomalies: AnomalyAlert[]
  insights: OperationalInsight[]
  predictions: PredictiveTrend[]
  meta?: {
    generatedAt: string
    period: { from: string; to: string }
  }
}

export default function AnalyticsDashboard() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const params = new URLSearchParams(searchParams.toString())
      if (!params.has('preset')) params.set('preset', 'last_30_days')
      const res = await fetch(`/api/reports/analytics?${params.toString()}`, { signal })
      if (res.ok) setData(await res.json())
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
    }
    setLoading(false)
  }, [searchParams])

  useEffect(() => {
    const controller = new AbortController()
    fetchData(controller.signal)
    return () => controller.abort()
  }, [fetchData])

  if (loading) {
    return (
      <div className="space-y-6">
        <ReportFilterBar basePath="/admin/reporting/analytics" showTrend={false} showComparison={false} showBreakdown={false} />
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
        </div>
      </div>
    )
  }

  if (!data) return <p className="text-slate-500">Failed to load analytics</p>

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <ReportFilterBar basePath="/admin/reporting/analytics" showTrend={false} showComparison={false} showBreakdown={false} />

      {/* AI Report Assistant - prominent at top */}
      <ReportAIAssistant context="analytics" data={data} />

      {/* Anomaly Alerts */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">
          Anomaly Alerts
          <span className="text-sm font-normal text-slate-500 ml-2">({data.anomalies.length})</span>
        </h2>
        {data.anomalies.length === 0 ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5">
            <p className="text-emerald-400">No anomalies detected — all metrics within normal range.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.anomalies.map((alert, i) => (
              <button
                key={i}
                onClick={() => {
                  if (alert.metric.includes('resolution') || alert.metric.includes('response')) {
                    router.push('/admin/reporting/companies')
                  } else if (alert.metric.includes('ticket')) {
                    router.push('/admin/reporting/companies')
                  } else {
                    router.push('/admin/reporting/technicians')
                  }
                }}
                className={`w-full text-left rounded-xl p-4 border transition-colors cursor-pointer ${
                  alert.severity === 'critical'
                    ? 'bg-rose-500/10 border-rose-500/30 hover:border-rose-400/50'
                    : alert.severity === 'warning'
                      ? 'bg-violet-500/10 border-violet-500/30 hover:border-violet-400/50'
                      : 'bg-cyan-500/10 border-cyan-500/30 hover:border-cyan-400/50'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <SeverityBadge severity={alert.severity} />
                      <span className="text-xs text-slate-400 uppercase">{alert.type}</span>
                    </div>
                    <p className="text-sm text-white">{alert.message}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Current: {alert.value} | Baseline: {alert.baseline} | Deviation: {alert.deviationPercent}%
                    </p>
                  </div>
                  <span className="text-xs text-slate-500 shrink-0">{'\u2192'}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Operational Insights */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">
          Operational Insights
          <span className="text-sm font-normal text-slate-500 ml-2">({data.insights.length})</span>
        </h2>
        {data.insights.length === 0 ? (
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <p className="text-slate-500">No actionable insights at this time.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.insights.map((insight) => (
              <button
                key={insight.id}
                onClick={() => {
                  const cat = insight.category.toLowerCase()
                  if (cat === 'workload') router.push('/admin/reporting/technicians')
                  else if (cat === 'quality' || cat === 'sla') router.push('/admin/reporting/companies')
                  else router.push('/admin/reporting/health')
                }}
                className="text-left bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 hover:border-cyan-500/30 transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-3 mb-2">
                  <SeverityBadge severity={insight.severity} />
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-white">{insight.title}</h3>
                    <span className="text-xs text-slate-500 uppercase">{insight.category}</span>
                  </div>
                </div>
                <p className="text-sm text-slate-300 mt-2">{insight.description}</p>
                {insight.recommendation && (
                  <p className="text-xs text-cyan-400 mt-3 bg-cyan-500/5 rounded-lg p-2">
                    {insight.recommendation}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Predictive Trends */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">
          Predictive Trends (30-Day Forecast)
          <span className="text-sm font-normal text-slate-500 ml-2">({data.predictions.length})</span>
        </h2>
        {data.predictions.length === 0 ? (
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <p className="text-slate-500">Insufficient data for predictions (need 14+ days of history).</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.predictions.map((pred) => (
              <button
                key={pred.metric}
                onClick={() => {
                  if (pred.metric.includes('ticket')) router.push('/admin/reporting/companies')
                  else if (pred.metric.includes('resolution')) router.push('/admin/reporting/companies')
                  else router.push('/admin/reporting/technicians')
                }}
                className="text-left bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 hover:border-cyan-500/30 transition-colors cursor-pointer"
              >
                <p className="text-sm text-slate-400 mb-2">{pred.label}</p>
                <div className="flex items-end gap-3">
                  <div>
                    <p className="text-xs text-slate-500">Current</p>
                    <p className="text-xl font-bold text-white">{pred.currentValue}</p>
                  </div>
                  <div className="text-slate-600 text-xl pb-0.5">{'\u2192'}</div>
                  <div>
                    <p className="text-xs text-slate-500">Projected</p>
                    <p className={`text-xl font-bold ${
                      pred.direction === 'up' ? 'text-rose-400' : pred.direction === 'down' ? 'text-emerald-400' : 'text-slate-300'
                    }`}>
                      {pred.projectedValue}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className={`text-xs ${
                    pred.projectedChangePercent > 0 ? 'text-rose-400' : pred.projectedChangePercent < 0 ? 'text-emerald-400' : 'text-slate-400'
                  }`}>
                    {pred.projectedChangePercent > 0 ? '+' : ''}{pred.projectedChangePercent}%
                  </span>
                  <ConfidenceBadge confidence={pred.confidence} />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Date range */}
      {data.meta?.period && (
        <div className="bg-slate-800/30 rounded-lg px-4 py-3 border border-slate-700/30">
          <div className="text-xs text-slate-500 flex flex-wrap gap-4">
            <span>Data range: {data.meta.period.from} to {data.meta.period.to}</span>
            {data.meta.generatedAt && (
              <span>Generated: {new Date(data.meta.generatedAt).toLocaleString()}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SeverityBadge({ severity }: { severity: 'info' | 'warning' | 'critical' }) {
  const colors = {
    critical: 'bg-rose-400/20 text-rose-400',
    warning: 'bg-violet-400/20 text-violet-400',
    info: 'bg-cyan-400/20 text-cyan-400',
  }

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[severity]}`}>
      {severity}
    </span>
  )
}

function ConfidenceBadge({ confidence }: { confidence: 'low' | 'medium' | 'high' }) {
  const colors = {
    high: 'text-emerald-400',
    medium: 'text-cyan-400',
    low: 'text-slate-500',
  }

  return (
    <span className={`text-xs ${colors[confidence]}`}>
      {confidence} confidence ({confidence === 'high' ? 'R\u00B2>0.5' : confidence === 'medium' ? 'R\u00B2>0.2' : 'R\u00B2<0.2'})
    </span>
  )
}
