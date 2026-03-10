'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

// ── Interfaces ──

interface ProposedMerge {
  shouldMerge: boolean
  survivingTicketId: string
  survivingTicketNumber: string
  mergeTicketIds: string[]
  mergeTicketNumbers: string[]
  proposedTitle: string
  mergeReasoning: string
}

interface ProposedActions {
  merge: ProposedMerge | null
  internalNote: string
  statusChange: { from: string; to: string } | null
  priorityChange: { from: string; to: string } | null
  queueChange: { from: string; to: string } | null
  escalation: {
    recommended: boolean
    targetQueue: string | null
    targetResource: string | null
    urgency: 'routine' | 'urgent' | 'critical'
    reason: string
  } | null
}

interface HumanGuidance {
  summary: string
  steps: string[]
  draftCustomerMessage: string | null
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical'
}

interface Analysis {
  id: string
  autotaskTicketId: string
  ticketNumber: string | null
  verdict: string | null
  confidenceScore: number | null
  alertSource: string | null
  alertCategory: string | null
  aiReasoning: string | null
  recommendedAction: string | null
  deviceVerified: boolean
  technicianVerified: string | null
  processedAt: string | null
  // Rich ticket context from JOIN
  ticketTitle: string | null
  ticketDescription: string | null
  ticketStatus: number | null
  ticketStatusLabel: string | null
  ticketPriority: number | null
  ticketPriorityLabel: string | null
  ticketQueueId: number | null
  ticketQueueLabel: string | null
  ticketSource: number | null
  ticketSourceLabel: string | null
  ticketCreateDate: string | null
  companyName: string | null
  companySlug: string | null
}

interface ActivityLog {
  id: string
  action: string
  detail: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

interface Incident {
  id: string
  title: string
  companyId: string | null
  companyName: string | null
  deviceHostname: string | null
  alertSource: string | null
  ticketCount: number
  verdict: string | null
  confidenceScore: number | null
  aiSummary: string | null
  correlationReason: string | null
  primaryTicketId: string | null
  status: string
  createdAt: string
  resolvedAt: string | null
  proposedActions: ProposedActions | null
  humanGuidance: HumanGuidance | null
}

export default function SocIncidentDetail({ incidentId }: { incidentId: string }) {
  const [incident, setIncident] = useState<Incident | null>(null)
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [overrideVerdict, setOverrideVerdict] = useState('')
  const [overrideStatus, setOverrideStatus] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/soc/incidents/${incidentId}`)
        if (res.ok) {
          const data = await res.json()
          setIncident(data.incident)
          setAnalyses(data.analyses || [])
          setActivityLog(data.activityLog || [])
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [incidentId])

  const handleOverride = async () => {
    if (!overrideVerdict && !overrideStatus) return
    setSaving(true)
    try {
      const res = await fetch(`/api/soc/incidents/${incidentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict: overrideVerdict || undefined, status: overrideStatus || undefined }),
      })
      if (res.ok) window.location.reload()
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500" />
      </div>
    )
  }

  if (!incident) {
    return <div className="p-8 text-center text-slate-400">Incident not found.</div>
  }

  const verdictColors: Record<string, string> = {
    false_positive: 'text-green-400',
    suspicious: 'text-rose-400',
    escalate: 'text-red-400',
    informational: 'text-blue-400',
  }
  const verdictBg: Record<string, string> = {
    false_positive: 'bg-green-500/10 border-green-500/20',
    suspicious: 'bg-rose-500/10 border-rose-500/20',
    escalate: 'bg-red-500/10 border-red-500/20',
    informational: 'bg-blue-500/10 border-blue-500/20',
  }

  const riskColors: Record<string, string> = {
    none: 'text-slate-400',
    low: 'text-green-400',
    medium: 'text-cyan-400',
    high: 'text-rose-400',
    critical: 'text-red-400',
  }

  const urgencyColors: Record<string, string> = {
    routine: 'bg-slate-500/20 text-slate-400',
    urgent: 'bg-rose-500/20 text-rose-400',
    critical: 'bg-red-500/20 text-red-400',
  }

  const pa = incident.proposedActions
  const hg = incident.humanGuidance

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/admin/soc/incidents" className="text-sm text-slate-400 hover:text-white transition-colors">
        ← Back to Incidents
      </Link>

      {/* ═══ Section 1: Incident Summary ═══ */}
      <div className={`border rounded-lg p-6 ${verdictBg[incident.verdict || ''] || 'bg-slate-800/50 border-white/10'}`}>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-white">{incident.title}</h2>
            <div className="flex items-center gap-3 mt-2 text-sm text-slate-400 flex-wrap">
              {incident.companyName && (
                <span className="text-cyan-400 font-medium">{incident.companyName}</span>
              )}
              <span>{incident.ticketCount} correlated tickets</span>
              <span className="capitalize">{incident.correlationReason?.replace(/_/g, ' ') || 'N/A'}</span>
              {incident.deviceHostname && <span>Device: {incident.deviceHostname}</span>}
              <span>{new Date(incident.createdAt).toLocaleString()}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <span className={`text-lg font-bold ${verdictColors[incident.verdict || ''] || 'text-slate-400'}`}>
                {incident.verdict?.replace('_', ' ').toUpperCase() || 'PENDING'}
              </span>
              {incident.confidenceScore != null && (
                <p className="text-sm text-slate-400">
                  {Math.round(incident.confidenceScore * 100)}% confidence
                </p>
              )}
            </div>
          </div>
        </div>

        {incident.aiSummary && (
          <div className="mt-4 p-4 bg-black/30 rounded-lg">
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{incident.aiSummary}</p>
          </div>
        )}
      </div>

      {/* ═══ Section 2: Correlated Tickets ═══ */}
      <Section title="Correlated Tickets" count={analyses.length}>
        {analyses.length === 0 ? (
          <EmptyState>No ticket analyses recorded.</EmptyState>
        ) : (
          <div className="divide-y divide-white/5">
            {analyses.map(a => (
              <div key={a.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white font-mono">
                        #{a.ticketNumber || a.autotaskTicketId}
                      </span>
                      <VerdictBadge verdict={a.verdict} />
                      {a.confidenceScore != null && (
                        <span className="text-xs text-slate-500">{Math.round(a.confidenceScore * 100)}%</span>
                      )}
                      {pa?.merge?.survivingTicketId === a.autotaskTicketId && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-cyan-500/20 text-cyan-400 rounded">
                          SURVIVING
                        </span>
                      )}
                      {pa?.merge?.shouldMerge && pa.merge.mergeTicketIds.includes(a.autotaskTicketId) && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-500/20 text-slate-400 rounded">
                          MERGE INTO PARENT
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-300 mt-1 truncate">
                      {a.ticketTitle || '(no title)'}
                    </p>
                    {/* Rich ticket context */}
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 flex-wrap">
                      {a.companyName && <span>Company: <span className="text-slate-400">{a.companyName}</span></span>}
                      {a.ticketStatusLabel && <span>Status: <span className="text-slate-400">{a.ticketStatusLabel}</span></span>}
                      {a.ticketPriorityLabel && <span>Priority: <span className="text-slate-400">{a.ticketPriorityLabel}</span></span>}
                      {a.ticketQueueLabel && <span>Queue: <span className="text-slate-400">{a.ticketQueueLabel}</span></span>}
                      {a.ticketSourceLabel && <span>Source: <span className="text-slate-400">{a.ticketSourceLabel}</span></span>}
                      {a.ticketCreateDate && <span>Created: <span className="text-slate-400">{new Date(a.ticketCreateDate).toLocaleString()}</span></span>}
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-xs">
                      {a.deviceVerified && <span className="text-green-400">Device Verified</span>}
                      {a.technicianVerified && <span className="text-cyan-400">Tech: {a.technicianVerified}</span>}
                      {a.alertCategory && <span className="text-slate-500 capitalize">{a.alertCategory.replace(/_/g, ' ')}</span>}
                    </div>
                  </div>
                </div>
                {a.aiReasoning && (
                  <details className="mt-2">
                    <summary className="text-xs text-slate-400 cursor-pointer hover:text-white">AI Reasoning</summary>
                    <p className="text-xs text-slate-300 mt-1 whitespace-pre-wrap bg-black/20 p-3 rounded">{a.aiReasoning}</p>
                  </details>
                )}
                {a.ticketDescription && (
                  <details className="mt-1">
                    <summary className="text-xs text-slate-400 cursor-pointer hover:text-white">Ticket Description</summary>
                    <p className="text-xs text-slate-300 mt-1 whitespace-pre-wrap bg-black/20 p-3 rounded max-h-[200px] overflow-y-auto">{a.ticketDescription}</p>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ═══ Section 3: Proposed Autotask Actions (Dry Run Preview) ═══ */}
      {pa && (
        <Section title="Proposed Autotask Actions" subtitle="Dry Run Preview — these actions will be taken when automation is enabled">
          <div className="p-4 space-y-4">
            {/* Merge Recommendation */}
            {pa.merge && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium text-white">Ticket Merge</h4>
                  {pa.merge.shouldMerge ? (
                    <span className="px-2 py-0.5 text-xs font-medium bg-cyan-500/20 text-cyan-400 rounded-full">Merge Recommended</span>
                  ) : (
                    <span className="px-2 py-0.5 text-xs font-medium bg-slate-500/20 text-slate-400 rounded-full">No Merge</span>
                  )}
                </div>
                {pa.merge.shouldMerge && (
                  <div className="bg-black/30 rounded-lg p-4 space-y-3 text-sm">
                    <div>
                      <span className="text-slate-500">Surviving Ticket:</span>{' '}
                      <span className="text-cyan-400 font-mono">#{pa.merge.survivingTicketNumber}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Merge Into It:</span>{' '}
                      {pa.merge.mergeTicketNumbers.map((tn, i) => (
                        <span key={tn}>
                          {i > 0 && ', '}
                          <span className="text-slate-300 font-mono">#{tn}</span>
                        </span>
                      ))}
                    </div>
                    <div>
                      <span className="text-slate-500">Proposed Title:</span>{' '}
                      <span className="text-white">{pa.merge.proposedTitle}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Reasoning:</span>{' '}
                      <span className="text-slate-300">{pa.merge.mergeReasoning}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Internal Note */}
            {pa.internalNote && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-white">Internal Note</h4>
                <div className="bg-black/30 rounded-lg p-4">
                  <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">{pa.internalNote}</pre>
                </div>
              </div>
            )}

            {/* Status / Priority / Queue Changes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {pa.statusChange && (
                <ChangeCard label="Status Change" from={pa.statusChange.from} to={pa.statusChange.to} />
              )}
              {pa.priorityChange && (
                <ChangeCard label="Priority Change" from={pa.priorityChange.from} to={pa.priorityChange.to} />
              )}
              {pa.queueChange && (
                <ChangeCard label="Queue Change" from={pa.queueChange.from} to={pa.queueChange.to} />
              )}
            </div>

            {/* Escalation */}
            {pa.escalation && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium text-white">Internal Escalation</h4>
                  {pa.escalation.recommended ? (
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${urgencyColors[pa.escalation.urgency] || urgencyColors.routine}`}>
                      {pa.escalation.urgency.toUpperCase()}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-xs font-medium bg-green-500/20 text-green-400 rounded-full">Not Needed</span>
                  )}
                </div>
                {pa.escalation.recommended && (
                  <div className="bg-black/30 rounded-lg p-4 space-y-1 text-sm">
                    {pa.escalation.targetQueue && (
                      <div><span className="text-slate-500">Target Queue:</span> <span className="text-slate-300">{pa.escalation.targetQueue}</span></div>
                    )}
                    {pa.escalation.targetResource && (
                      <div><span className="text-slate-500">Assign To:</span> <span className="text-slate-300">{pa.escalation.targetResource}</span></div>
                    )}
                    <div><span className="text-slate-500">Reason:</span> <span className="text-slate-300">{pa.escalation.reason}</span></div>
                  </div>
                )}
                {!pa.escalation.recommended && pa.escalation.reason && (
                  <p className="text-xs text-slate-400">{pa.escalation.reason}</p>
                )}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ═══ Section 4: Recommended Human Actions ═══ */}
      {hg && (
        <Section title="Recommended Human Actions">
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">Risk Level:</span>
              <span className={`text-sm font-medium ${riskColors[hg.riskLevel] || 'text-slate-400'}`}>
                {hg.riskLevel.toUpperCase()}
              </span>
            </div>
            <p className="text-sm text-slate-300">{hg.summary}</p>
            <ol className="space-y-2">
              {hg.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-medium flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-sm text-slate-300">{step}</span>
                </li>
              ))}
            </ol>
            {hg.draftCustomerMessage && (
              <div className="space-y-2 mt-4">
                <h4 className="text-sm font-medium text-white">Draft Customer Message</h4>
                <div className="bg-black/30 rounded-lg p-4">
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{hg.draftCustomerMessage}</p>
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ═══ Section 5: Supporting Reasoning ═══ */}
      {incident.aiSummary && (
        <Section title="Supporting Reasoning">
          <div className="p-4">
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{incident.aiSummary}</p>
          </div>
        </Section>
      )}

      {/* ═══ Section 6: Activity Log ═══ */}
      <Section title="Activity Log">
        {activityLog.length === 0 ? (
          <EmptyState>No activity recorded.</EmptyState>
        ) : (
          <div className="divide-y divide-white/5">
            {activityLog.map(log => (
              <div key={log.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-white capitalize font-medium">{log.action.replace(/_/g, ' ')}</span>
                      {Boolean(log.metadata?.verdict) && (
                        <VerdictBadge verdict={String(log.metadata?.verdict)} />
                      )}
                      {Boolean(log.metadata?.mergeRecommended) && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-cyan-500/20 text-cyan-400 rounded">MERGE</span>
                      )}
                      {Boolean(log.metadata?.escalationRecommended) && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-rose-500/20 text-rose-400 rounded">ESCALATE</span>
                      )}
                    </div>
                    {log.detail && <p className="text-xs text-slate-400 mt-0.5">{log.detail}</p>}
                    {Boolean(log.metadata?.companyName) && (
                      <span className="text-xs text-slate-500">{String(log.metadata?.companyName)}</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500 flex-shrink-0">{new Date(log.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ═══ Section 7: Override / Admin Decision ═══ */}
      <Section title="Override / Admin Decision">
        <div className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Override Verdict</label>
              <select
                value={overrideVerdict}
                onChange={e => setOverrideVerdict(e.target.value)}
                className="bg-slate-900 border border-white/10 text-white text-sm rounded-lg px-3 py-2"
              >
                <option value="">No change</option>
                <option value="false_positive">False Positive</option>
                <option value="suspicious">Suspicious</option>
                <option value="escalate">Escalate</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Override Status</label>
              <select
                value={overrideStatus}
                onChange={e => setOverrideStatus(e.target.value)}
                className="bg-slate-900 border border-white/10 text-white text-sm rounded-lg px-3 py-2"
              >
                <option value="">No change</option>
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
                <option value="escalated">Escalated</option>
              </select>
            </div>
            <button
              onClick={handleOverride}
              disabled={saving || (!overrideVerdict && !overrideStatus)}
              className="px-4 py-2 text-sm font-medium bg-rose-500 hover:bg-rose-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Apply Override'}
            </button>
          </div>
        </div>
      </Section>
    </div>
  )
}

// ── Reusable sub-components ──

function Section({ title, subtitle, count, children }: {
  title: string; subtitle?: string; count?: number; children: React.ReactNode
}) {
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-white">{title}</h3>
          {count != null && <span className="text-xs text-slate-500">({count})</span>}
        </div>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="p-6 text-center text-slate-400 text-sm">{children}</div>
}

function VerdictBadge({ verdict }: { verdict: string | null }) {
  const colors: Record<string, string> = {
    false_positive: 'bg-green-500/20 text-green-400 border-green-500/30',
    suspicious: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    escalate: 'bg-red-500/20 text-red-400 border-red-500/30',
    informational: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  }
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${colors[verdict || ''] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}>
      {verdict?.replace('_', ' ') || 'pending'}
    </span>
  )
}

function ChangeCard({ label, from, to }: { label: string; from: string; to: string }) {
  return (
    <div className="bg-black/30 rounded-lg p-3">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-400">{from}</span>
        <span className="text-slate-600">→</span>
        <span className="text-white font-medium">{to}</span>
      </div>
    </div>
  )
}
