'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import ReportFilterBar from './ReportFilters'
import HealthDistribution from './HealthDistribution'
import ReportAIAssistant from './ReportAIAssistant'

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

const FACTOR_TOOLTIPS: Record<string, string> = {
  ticketVolumeTrend: 'Compares ticket count in current 30-day period vs prior 30 days. Score 100 = volume decreased 20%+, 50 = stable, 0 = increased 50%+. Lower ticket volume indicates healthier IT environment.',
  reopenRate: 'Percentage of resolved tickets that were reopened (moved from Complete back to an active status, or assigned a Reopen status). Score 100 = 0% reopens, 70 = 5% reopens, 0 = 20%+ reopens. Shows neutral (50) when insufficient status history data exists.',
  priorityMix: 'Percentage of tickets classified as Urgent or High priority. Score 100 = less than 10% urgent/high, 0 = over 60% urgent/high. A healthy mix has mostly medium/low priority tickets.',
  supportHoursTrend: 'Compares total support hours consumed in current 30-day period vs prior 30 days. Score 100 = hours decreased 20%+, 50 = stable, 0 = increased 50%+. Decreasing hours suggests stabilizing environment.',
  avgResolutionTime: 'Average time from ticket creation to resolution compared to target. Score 100 = at or below target, 0 = 3x above target. Uses business-hours calculation and configured SLA targets.',
  agingTickets: 'Count of open tickets that exceed 2x the resolution time target for their priority level. Score 100 = no aging tickets, decreases proportionally. More aging tickets indicate growing backlog risk.',
  slaCompliance: 'Percentage of resolved tickets that met their SLA targets (response time, resolution plan, and resolution time combined). Directly maps to score (e.g., 95% compliance = score of 95). Shows neutral (50) when no SLA data is available.',
}

export default function HealthReport() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [data, setData] = useState<HealthReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams(searchParams.toString())
      if (!params.has('preset')) params.set('preset', 'last_30_days')
      const res = await fetch(`/api/reports/customer-health?${params.toString()}`)
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Failed to load health data (HTTP ${res.status})`)
      }
      setData(await res.json())
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('[HealthReport] Failed to load:', msg)
      setError(msg)
    }
    setLoading(false)
  }, [searchParams])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="space-y-6">
        <ReportFilterBar basePath="/admin/reporting/health" showCompanySelector showTrend={false} showComparison={false} showBreakdown={false} />
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <ReportFilterBar basePath="/admin/reporting/health" showCompanySelector showTrend={false} showComparison={false} showBreakdown={false} />
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-4">
          <h3 className="text-sm font-medium text-rose-400 mb-1">Customer health data failed to load</h3>
          <p className="text-sm text-rose-300/80">{error}</p>
          <button onClick={fetchData} className="text-sm text-cyan-400 mt-2 hover:underline">Retry</button>
        </div>
      </div>
    )
  }

  if (!data) return <p className="text-slate-500">No data available</p>

  return (
    <div className="space-y-6">
      {/* Filters */}
      <ReportFilterBar basePath="/admin/reporting/health" showCompanySelector showTrend={false} showComparison={false} showBreakdown={false} />

      {/* Distribution */}
      <HealthDistribution distribution={data.distribution} />

      {/* Scores table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50">
          <input
            type="text"
            placeholder="Search companies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 px-3 py-1.5 text-sm bg-slate-900/50 border border-slate-600/50 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Company</th>
                <th className="text-center text-xs text-slate-400 font-medium px-4 py-3" title="Weighted overall health score (0-100). Combines 7 factors: Ticket Volume (20%), Reopen Rate (15%), Priority Mix (15%), Support Hours (15%), Resolution Time (15%), Aging Tickets (10%), SLA Compliance (10%).">Score</th>
                <th className="text-center text-xs text-slate-400 font-medium px-4 py-3" title="Health tier based on overall score. Healthy (80+), Needs Attention (60-79), At Risk (40-59), Critical (below 40).">Tier</th>
                <th className="text-center text-xs text-slate-400 font-medium px-4 py-3 hidden md:table-cell" title="Score trend compared to previous computation. Improving = score increased by 5+, Declining = decreased by 5+, Stable = within 5 points.">Trend</th>
                <th className="text-center text-xs text-slate-400 font-medium px-4 py-3 hidden lg:table-cell" title="Previous overall health score for comparison.">Previous</th>
                <th className="text-center text-xs text-slate-400 font-medium px-4 py-3 hidden lg:table-cell" title="Date when this health score was last computed.">Computed</th>
                <th className="text-center text-xs text-slate-400 font-medium px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {data.scores.filter((score) => {
                if (!search) return true
                return score.displayName.toLowerCase().includes(search.toLowerCase())
              }).map((score) => {
                const isExpanded = expanded === score.companyId
                return (
                  <>
                    <tr
                      key={score.companyId}
                      onClick={() => router.push(`/admin/reporting/companies/${score.companyId}`)}
                      className="border-b border-slate-700/30 hover:bg-slate-700/20 cursor-pointer"
                    >
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
                          onClick={(e) => { e.stopPropagation(); setExpanded(isExpanded ? null : score.companyId) }}
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
                              <div key={key} className="text-center group relative">
                                <p className="text-xs text-slate-500 mb-1 flex items-center justify-center gap-1">
                                  {FACTOR_LABELS[key] || key}
                                  {FACTOR_TOOLTIPS[key] && (
                                    <span className="inline-block cursor-help" title={FACTOR_TOOLTIPS[key]}>
                                      <svg className="w-3 h-3 text-slate-600 hover:text-slate-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                    </span>
                                  )}
                                </p>
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

      {/* AI Report Assistant */}
      <ReportAIAssistant context="health" data={data} />

      {/* Date range */}
      <div className="bg-slate-800/30 rounded-lg px-4 py-3 border border-slate-700/30">
        <div className="text-xs text-slate-500 flex flex-wrap gap-4">
          <span>Data range: {data.meta.period.from} to {data.meta.period.to}</span>
          {data.meta.dataFreshness && (
            <span>Last sync: {new Date(data.meta.dataFreshness).toLocaleString()}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const color =
    score >= 80 ? 'text-emerald-400' :
    score >= 60 ? 'text-cyan-400' :
    score >= 40 ? 'text-violet-400' :
    'text-rose-400'

  const sizeClass = size === 'sm' ? 'text-sm' : 'text-base font-bold'

  return <span className={`${color} ${sizeClass}`}>{Math.round(score)}</span>
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    Healthy: 'text-emerald-400 bg-emerald-400/10',
    'Needs Attention': 'text-cyan-400 bg-cyan-400/10',
    'At Risk': 'text-violet-400 bg-violet-400/10',
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
