'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface ReviewData {
  id: string
  companyId: string
  reportType: string
  variant: string
  periodStart: string
  periodEnd: string
  status: string
  createdBy: string
  reviewedBy: string | null
  sentAt: string | null
  sentTo: string[]
  company: { displayName: string }
  reportData: {
    company: { name: string }
    period: { label: string; start: string; end: string; type: string }
    supportActivity: {
      ticketsCreated: number
      ticketsClosed: number
      ticketsReopened: number
      supportHoursConsumed: number
      billableHoursConsumed: number
      netTicketChange: number
    }
    servicePerformance: {
      avgFirstResponseMinutes: number | null
      avgResolutionMinutes: number | null
      firstTouchResolutionRate: number | null
      reopenRate: number | null
      slaResponseCompliance: number | null
      slaResolutionCompliance: number | null
    }
    priorityBreakdown: Array<{
      priority: string
      count: number
      percentage: number
      avgResolutionMinutes: number | null
    }>
    healthSnapshot: {
      overallScore: number
      tier: string
      trend: string | null
    } | null
    comparison: {
      previousPeriod: { label: string }
      ticketsCreatedChange: number | null
      ticketsClosedChange: number | null
      supportHoursChange: number | null
      avgResolutionChange: number | null
    }
    backlog: { total: number; urgent: number; high: number; agingOver7Days: number; agingOver30Days: number }
  }
  recommendations: Array<{
    id: string
    category: string
    priority: string
    title: string
    description: string
    evidence: string
    internalOnly: boolean
  }>
  narrative: {
    executiveSummary: string
    supportActivityNarrative: string
    performanceNarrative: string
    themesNarrative: string
    healthNarrative: string
    recommendationsNarrative: string
    internalNotes?: string
  }
}

interface Props {
  reviewId: string
}

export default function BusinessReviewDetail({ reviewId }: Props) {
  const router = useRouter()
  const [review, setReview] = useState<ReviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  const fetchReview = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports/business-review/${reviewId}`)
      if (res.ok) setReview(await res.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [reviewId])

  useEffect(() => { fetchReview() }, [fetchReview])

  const updateStatus = async (status: string) => {
    setUpdating(true)
    try {
      const res = await fetch(`/api/reports/business-review/${reviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) await fetchReview()
    } catch { /* ignore */ }
    setUpdating(false)
  }

  const deleteReview = async () => {
    if (!confirm('Delete this business review?')) return
    try {
      await fetch(`/api/reports/business-review/${reviewId}`, { method: 'DELETE' })
      router.push('/admin/reporting/business-review')
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
      </div>
    )
  }

  if (!review) return <p className="text-slate-500">Review not found</p>

  const rd = review.reportData
  const isInternal = review.variant === 'internal'
  const visibleRecs = isInternal ? review.recommendations : review.recommendations.filter(r => !r.internalOnly)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <Link href="/admin/reporting/business-review" className="text-xs text-cyan-400 hover:underline mb-2 block">
            &larr; Back to reviews
          </Link>
          <h1 className="text-2xl font-bold text-white">{rd.company.name}</h1>
          <p className="text-slate-400 mt-1">
            {rd.period.type === 'monthly' ? 'Monthly' : 'Quarterly'} Business Review &mdash; {rd.period.label}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <StatusBadge status={review.status} />
            <VariantBadge variant={review.variant} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {review.status === 'draft' && (
            <button onClick={() => updateStatus('review')} disabled={updating}
              className="px-3 py-1.5 text-xs bg-violet-500 text-white rounded-lg hover:bg-violet-600 disabled:opacity-50 transition-colors">
              Mark for Review
            </button>
          )}
          {review.status === 'review' && (
            <button onClick={() => updateStatus('ready')} disabled={updating}
              className="px-3 py-1.5 text-xs bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 disabled:opacity-50 transition-colors">
              Approve &amp; Mark Ready
            </button>
          )}
          <a href={`/api/reports/business-review/${reviewId}/pdf`} target="_blank" rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors">
            View PDF
          </a>
          <button onClick={deleteReview}
            className="px-3 py-1.5 text-xs text-rose-400 border border-rose-400/30 rounded-lg hover:bg-rose-400/10 transition-colors">
            Delete
          </button>
        </div>
      </div>

      {isInternal && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 text-orange-400 text-sm font-medium text-center">
          INTERNAL DOCUMENT — NOT FOR CUSTOMER DISTRIBUTION
        </div>
      )}

      {/* Executive Summary */}
      <Section title="Executive Summary">
        <p className="text-slate-300 leading-relaxed">{review.narrative.executiveSummary}</p>
      </Section>

      {/* Support Activity */}
      <Section title="Support Activity">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <Stat label="Created" value={rd.supportActivity.ticketsCreated} change={rd.comparison.ticketsCreatedChange} />
          <Stat label="Closed" value={rd.supportActivity.ticketsClosed} change={rd.comparison.ticketsClosedChange} />
          <Stat label="Reopened" value={rd.supportActivity.ticketsReopened} />
          <Stat label="Hours" value={`${rd.supportActivity.supportHoursConsumed}h`} change={rd.comparison.supportHoursChange} />
          <Stat label="Billable" value={`${rd.supportActivity.billableHoursConsumed}h`} />
          <Stat label="Net Change" value={rd.supportActivity.netTicketChange > 0 ? `+${rd.supportActivity.netTicketChange}` : `${rd.supportActivity.netTicketChange}`} />
        </div>
        <p className="text-slate-400 text-sm">{review.narrative.supportActivityNarrative}</p>
      </Section>

      {/* Performance */}
      <Section title="Service Performance">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <Stat label="Avg Response" value={rd.servicePerformance.avgFirstResponseMinutes !== null ? fmtMin(rd.servicePerformance.avgFirstResponseMinutes) : 'N/A'} />
          <Stat label="Avg Resolution" value={rd.servicePerformance.avgResolutionMinutes !== null ? fmtMin(rd.servicePerformance.avgResolutionMinutes) : 'N/A'} change={rd.comparison.avgResolutionChange} />
          <Stat label="FTR Rate" value={rd.servicePerformance.firstTouchResolutionRate !== null ? `${rd.servicePerformance.firstTouchResolutionRate}%` : 'N/A'} />
          <Stat label="Resp SLA" value={rd.servicePerformance.slaResponseCompliance !== null ? `${rd.servicePerformance.slaResponseCompliance}%` : 'N/A'} />
          <Stat label="Res SLA" value={rd.servicePerformance.slaResolutionCompliance !== null ? `${rd.servicePerformance.slaResolutionCompliance}%` : 'N/A'} />
          <Stat label="Reopen %" value={rd.servicePerformance.reopenRate !== null ? `${rd.servicePerformance.reopenRate}%` : 'N/A'} />
        </div>
        <p className="text-slate-400 text-sm">{review.narrative.performanceNarrative}</p>
      </Section>

      {/* Priority Breakdown */}
      {rd.priorityBreakdown.length > 0 && (
        <Section title="Priority Breakdown">
          <div className="flex rounded-lg overflow-hidden h-6 mb-4">
            {rd.priorityBreakdown.map(p => {
              const colors: Record<string, string> = { Critical: '#ef4444', High: '#f97316', Medium: '#06b6d4', Low: '#8b5cf6' }
              return <div key={p.priority} style={{ width: `${p.percentage}%`, backgroundColor: colors[p.priority] || '#64748b' }} />
            })}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {rd.priorityBreakdown.map(p => (
              <div key={p.priority} className="text-center">
                <p className="text-xs text-slate-500">{p.priority}</p>
                <p className="text-lg font-bold text-white">{p.count}</p>
                <p className="text-xs text-slate-400">{p.percentage}%</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Health */}
      <Section title="Customer Health">
        {rd.healthSnapshot ? (
          <div className="flex items-center gap-6 mb-4">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white ${
              rd.healthSnapshot.overallScore >= 80 ? 'bg-emerald-500' :
              rd.healthSnapshot.overallScore >= 60 ? 'bg-cyan-500' :
              rd.healthSnapshot.overallScore >= 40 ? 'bg-orange-500' : 'bg-rose-500'
            }`}>
              {Math.round(rd.healthSnapshot.overallScore)}
            </div>
            <div>
              <p className="text-lg font-bold text-white">{rd.healthSnapshot.tier}</p>
              {rd.healthSnapshot.trend && (
                <p className="text-sm text-slate-400">Trend: {rd.healthSnapshot.trend}</p>
              )}
            </div>
          </div>
        ) : null}
        <p className="text-slate-400 text-sm">{review.narrative.healthNarrative}</p>
      </Section>

      {/* Backlog */}
      {rd.backlog.total > 0 && (
        <Section title="Open Backlog">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Stat label="Total" value={rd.backlog.total} />
            <Stat label="Urgent" value={rd.backlog.urgent} />
            <Stat label="High" value={rd.backlog.high} />
            <Stat label=">7d Old" value={rd.backlog.agingOver7Days} />
            <Stat label=">30d Old" value={rd.backlog.agingOver30Days} />
          </div>
        </Section>
      )}

      {/* Recommendations */}
      {visibleRecs.length > 0 && (
        <Section title="Strategic Recommendations">
          <div className="space-y-4">
            {visibleRecs.map(rec => (
              <div key={rec.id} className={`rounded-xl p-4 border ${
                rec.priority === 'high' ? 'bg-rose-500/5 border-rose-500/20' :
                rec.priority === 'medium' ? 'bg-cyan-500/5 border-cyan-500/20' :
                'bg-slate-700/30 border-slate-600/30'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    rec.priority === 'high' ? 'bg-rose-400/20 text-rose-400' :
                    rec.priority === 'medium' ? 'bg-cyan-400/20 text-cyan-400' :
                    'bg-slate-600 text-slate-300'
                  }`}>{rec.priority}</span>
                  <span className="text-xs text-slate-500 uppercase">{rec.category}</span>
                  {rec.internalOnly && <span className="text-xs text-orange-400">(internal)</span>}
                </div>
                <h4 className="text-sm font-bold text-white mb-1">{rec.title}</h4>
                <p className="text-sm text-slate-300 mb-2">{rec.description}</p>
                <p className="text-xs text-slate-500 italic">Evidence: {rec.evidence}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Internal Notes */}
      {isInternal && review.narrative.internalNotes && (
        <Section title="Internal Notes">
          <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-4">
            <p className="text-sm text-slate-300 whitespace-pre-line">{review.narrative.internalNotes}</p>
          </div>
        </Section>
      )}

      {/* Meta */}
      <div className="text-xs text-slate-600 flex flex-wrap gap-4 pt-4 border-t border-slate-800">
        <span>Created by: {review.createdBy}</span>
        {review.reviewedBy && <span>Reviewed by: {review.reviewedBy}</span>}
        {review.sentAt && <span>Sent: {new Date(review.sentAt).toLocaleString()}</span>}
        {review.sentTo.length > 0 && <span>Sent to: {review.sentTo.join(', ')}</span>}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
      <h2 className="text-lg font-semibold text-cyan-400 mb-4 pb-2 border-b border-slate-700/50">{title}</h2>
      {children}
    </div>
  )
}

function Stat({ label, value, change }: { label: string; value: string | number; change?: number | null }) {
  return (
    <div className="text-center">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold text-white">{value}</p>
      {change !== undefined && change !== null && (
        <p className={`text-xs ${change > 0 ? 'text-rose-400' : change < 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
          {change > 0 ? '+' : ''}{change}%
        </p>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'text-slate-400 bg-slate-400/10',
    review: 'text-violet-400 bg-violet-400/10',
    ready: 'text-cyan-400 bg-cyan-400/10',
    sent: 'text-emerald-400 bg-emerald-400/10',
  }
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || ''}`}>{status}</span>
}

function VariantBadge({ variant }: { variant: string }) {
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${variant === 'internal' ? 'text-orange-400 bg-orange-400/10' : 'text-cyan-400 bg-cyan-400/10'}`}>{variant}</span>
}

function fmtMin(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`
  return `${(minutes / 1440).toFixed(1)}d`
}
