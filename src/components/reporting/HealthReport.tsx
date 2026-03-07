'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import HealthDistribution from './HealthDistribution'

interface HealthScore {
  companyId: string
  displayName: string
  overallScore: number
  trend: string | null
  previousScore: number | null
  tier: string
  factors: Record<string, number>
  rawValues: Record<string, number | null>
  computedAt: string
  periodStart: string
  periodEnd: string
}

interface HealthReportData {
  scores: HealthScore[]
  distribution: {
    healthy: number
    needsAttention: number
    atRisk: number
    critical: number
  }
  meta: { period: { from: string; to: string }; dataFreshness: string | null }
}

const FACTOR_LABELS: Record<string, string> = {
  ticketVolumeTrend: 'Ticket Volume',
  reopenRate: 'Reopen Rate',
  priorityMix: 'Priority Mix',
  supportHoursTrend: 'Support Hours',
  avgResolutionTime: 'Resolution Time',
  agingTickets: 'Aging Tickets',
  slaCompliance: 'SLA Compliance',
}

export default function HealthReport() {
  const searchParams = useSearchParams()
  const [data, setData] = useState<HealthReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams(searchParams.toString())
      if (!params.has('preset')) params.set('preset', 'last_30_days')
      const res = await fetch(`/api/reports/customer-health?${params.toString()}`)
      if (res.ok) setData(await res.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [searchParams])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
      </div>
    )
  }

  if (!data) return <p className="text-slate-500">Failed to load data</p>

  return (
    <div className="space-y-6">
      {/* Distribution */}
      <HealthDistribution distribution={data.distribution} />

      {/* Scores table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Company</th>
                <th className="text-center text-xs text-slate-400 font-medium px-4 py-3">Score</th>
                <th className="text-center text-xs text-slate-400 font-medium px-4 py-3">Tier</th>
                <th className="text-center text-xs text-slate-400 font-medium px-4 py-3 hidden md:table-cell">Trend</th>
                <th className="text-center text-xs text-slate-400 font-medium px-4 py-3 hidden lg:table-cell">Previous</th>
                <th className="text-center text-xs text-slate-400 font-medium px-4 py-3 hidden lg:table-cell">Computed</th>
                <th className="text-center text-xs text-slate-400 font-medium px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {data.scores.map((score) => {
                const isExpanded = expanded === score.companyId
                return (
                  <>
                    <tr key={score.companyId} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                      <td className="px-4 py-3">
                        <span className="text-sm text-white">{score.displayName}</span>
                      </td>
                      <td className="text-center px-4 py-3">
                        <ScoreBadge score={score.overallScore} />
                      </td>
                      <td className="text-center px-4 py-3">
                        <TierBadge tier={score.tier} />
                      </td>
                      <td className="text-center px-4 py-3 hidden md:table-cell">
                        <TrendIndicator trend={score.trend} />
                      </td>
                      <td className="text-center px-4 py-3 text-sm text-slate-400 hidden lg:table-cell">
                        {score.previousScore !== null ? Math.round(score.previousScore) : '-'}
                      </td>
                      <td className="text-center px-4 py-3 text-xs text-slate-500 hidden lg:table-cell">
                        {new Date(score.computedAt).toLocaleDateString()}
                      </td>
                      <td className="text-center px-4 py-3">
                        <button
                          onClick={() => setExpanded(isExpanded ? null : score.companyId)}
                          className="text-xs text-cyan-400 hover:underline"
                        >
                          {isExpanded ? 'Hide' : 'Show'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${score.companyId}-details`} className="border-b border-slate-700/30">
                        <td colSpan={7} className="px-4 py-4 bg-slate-900/50">
                          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                            {Object.entries(score.factors).map(([key, value]) => (
                              <div key={key} className="text-center">
                                <p className="text-xs text-slate-500 mb-1">{FACTOR_LABELS[key] || key}</p>
                                <ScoreBadge score={value} size="sm" />
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
              {data.scores.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">
                    No health scores computed yet. Run the health scoring job first.
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

function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const color =
    score >= 80 ? 'text-emerald-400' :
    score >= 60 ? 'text-cyan-400' :
    score >= 40 ? 'text-orange-400' :
    'text-rose-400'

  const sizeClass = size === 'sm' ? 'text-sm' : 'text-base font-bold'

  return <span className={`${color} ${sizeClass}`}>{Math.round(score)}</span>
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    Healthy: 'text-emerald-400 bg-emerald-400/10',
    'Needs Attention': 'text-cyan-400 bg-cyan-400/10',
    'At Risk': 'text-orange-400 bg-orange-400/10',
    Critical: 'text-rose-400 bg-rose-400/10',
  }

  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors[tier] || 'text-slate-400'}`}>
      {tier}
    </span>
  )
}

function TrendIndicator({ trend }: { trend: string | null }) {
  if (!trend) return <span className="text-slate-500 text-sm">-</span>

  const config: Record<string, { icon: string; color: string }> = {
    improving: { icon: '\u2191', color: 'text-emerald-400' },
    declining: { icon: '\u2193', color: 'text-rose-400' },
    stable: { icon: '\u2192', color: 'text-slate-400' },
  }

  const c = config[trend] || config.stable

  return (
    <span className={`text-sm ${c.color}`}>
      {c.icon} {trend}
    </span>
  )
}
