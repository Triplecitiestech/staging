'use client'

import { useState, useEffect, useCallback } from 'react'

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
}

export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reports/analytics?preset=last_30_days')
      if (res.ok) setData(await res.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
      </div>
    )
  }

  if (!data) return <p className="text-slate-500">Failed to load analytics</p>

  return (
    <div className="space-y-8">
      {/* Anomaly Alerts */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Anomaly Alerts</h2>
        {data.anomalies.length === 0 ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5">
            <p className="text-emerald-400">No anomalies detected — all metrics within normal range.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.anomalies.map((alert, i) => (
              <div
                key={i}
                className={`rounded-xl p-4 border ${
                  alert.severity === 'critical'
                    ? 'bg-rose-500/10 border-rose-500/30'
                    : alert.severity === 'warning'
                      ? 'bg-orange-500/10 border-orange-500/30'
                      : 'bg-cyan-500/10 border-cyan-500/30'
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
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Operational Insights */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Operational Insights</h2>
        {data.insights.length === 0 ? (
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <p className="text-slate-500">No actionable insights at this time.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.insights.map((insight) => (
              <div
                key={insight.id}
                className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50"
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
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Predictive Trends */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Predictive Trends (30-Day Forecast)</h2>
        {data.predictions.length === 0 ? (
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <p className="text-slate-500">Insufficient data for predictions (need 14+ days of history).</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.predictions.map((pred) => (
              <div
                key={pred.metric}
                className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50"
              >
                <p className="text-sm text-slate-400 mb-2">{pred.label}</p>
                <div className="flex items-end gap-3">
                  <div>
                    <p className="text-xs text-slate-500">Current</p>
                    <p className="text-xl font-bold text-white">{pred.currentValue}</p>
                  </div>
                  <div className="text-slate-600 text-xl pb-0.5">
                    {pred.direction === 'up' ? '\u2192' : pred.direction === 'down' ? '\u2192' : '\u2192'}
                  </div>
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
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function SeverityBadge({ severity }: { severity: 'info' | 'warning' | 'critical' }) {
  const colors = {
    critical: 'bg-rose-400/20 text-rose-400',
    warning: 'bg-orange-400/20 text-orange-400',
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
