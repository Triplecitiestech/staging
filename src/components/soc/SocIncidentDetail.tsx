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

interface TicketNote {
  id: string
  ticketId: string
  title: string | null
  description: string | null
  noteType: number | null
  publish: number | null
  createDateTime: string | null
  creatorResourceId: string | null
}

interface Analysis {
  id: string
  autotaskTicketId: string
  ticketNumber: string | null
  ticketNumberFromTicket: string | null
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

interface PendingAction {
  id: string
  incidentId: string
  autotaskTicketId: string
  ticketNumber: string | null
  companyName: string | null
  actionType: string
  actionPayload: {
    noteTitle?: string
    noteBody?: string
    notePublish?: number
    from?: string
    to?: string
    targetQueue?: string
    targetResource?: string
    urgency?: string
    reason?: string
    recipient?: string
    setStatusWaitingCustomer?: boolean
    followUpDays?: number
    followUpMessage?: string
  }
  previewSummary: string
  status: string
  decidedBy: string | null
  decidedAt: string | null
  executionResult: Record<string, unknown> | null
  createdAt: string
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
  customerCommunication: {
    required: boolean
    recipient: string | null
    method: string
    message: string | null
    setStatusWaitingCustomer: boolean
    followUpDays: number | null
    followUpMessage: string | null
    approvalAction: string | null
    denialAction: string | null
    escalationTrigger: string | null
  } | null
  nextCycleChecks: string[] | null
}

export default function SocIncidentDetail({ incidentId }: { incidentId: string }) {
  const [incident, setIncident] = useState<Incident | null>(null)
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [ticketNotes, setTicketNotes] = useState<TicketNote[]>([])
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([])
  const [autotaskWebUrl, setAutotaskWebUrl] = useState<string | null>(null)
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([])
  const [autotaskApiUser, setAutotaskApiUser] = useState<string>('')
  const [decidingAction, setDecidingAction] = useState<string | null>(null)
  const [approvingAll, setApprovingAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [overrideVerdict, setOverrideVerdict] = useState('')
  const [overrideStatus, setOverrideStatus] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [incidentRes, actionsRes] = await Promise.all([
          fetch(`/api/soc/incidents/${incidentId}`),
          fetch(`/api/soc/pending-actions?incidentId=${incidentId}&status=all`),
        ])
        if (incidentRes.ok) {
          const data = await incidentRes.json()
          setIncident(data.incident)
          setAnalyses(data.analyses || [])
          setTicketNotes(data.ticketNotes || [])
          setActivityLog(data.activityLog || [])
          setAutotaskWebUrl(data.autotaskWebUrl || null)
        }
        if (actionsRes.ok) {
          const data = await actionsRes.json()
          setPendingActions(data.actions || [])
          setAutotaskApiUser(data.autotaskApiUser || '')
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [incidentId])

  const handleActionDecision = async (actionId: string, decision: 'approve' | 'reject') => {
    setDecidingAction(actionId)
    try {
      const res = await fetch('/api/soc/pending-actions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId, decision }),
      })
      if (res.ok) {
        // Update local state
        setPendingActions(prev => prev.map(a =>
          a.id === actionId
            ? { ...a, status: decision === 'approve' ? 'executed' : 'rejected' }
            : a
        ))
      }
    } catch {
      // ignore
    } finally {
      setDecidingAction(null)
    }
  }

  const handleApproveAll = async () => {
    const pending = pendingActions.filter(a => a.status === 'pending')
    if (pending.length === 0) return
    setApprovingAll(true)
    try {
      for (const action of pending) {
        const res = await fetch('/api/soc/pending-actions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actionId: action.id, decision: 'approve' }),
        })
        if (res.ok) {
          setPendingActions(prev => prev.map(a =>
            a.id === action.id ? { ...a, status: 'executed' } : a
          ))
        }
      }
    } catch {
      // ignore
    } finally {
      setApprovingAll(false)
    }
  }

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

  const getAutotaskLink = (ticketId: string) => {
    if (!autotaskWebUrl) return null
    return `${autotaskWebUrl}?ticketId=${ticketId}`
  }

  const getDisplayTicketNumber = (a: Analysis) => {
    return a.ticketNumberFromTicket || a.ticketNumber || a.autotaskTicketId
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
  const cc = incident.customerCommunication
  const ncc = incident.nextCycleChecks

  // Group ticket notes by ticketId for display
  const notesByTicket: Record<string, TicketNote[]> = {}
  for (const note of ticketNotes) {
    if (!notesByTicket[note.ticketId]) notesByTicket[note.ticketId] = []
    notesByTicket[note.ticketId].push(note)
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/admin/soc/incidents" className="text-sm text-slate-400 hover:text-white transition-colors">
        &larr; Back to Incidents
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
              <span>{incident.ticketCount} {incident.ticketCount === 1 ? 'ticket' : 'correlated tickets'}</span>
              {incident.correlationReason && incident.correlationReason !== 'single_alert' && (
                <span className="capitalize">{incident.correlationReason.replace(/_/g, ' ')}</span>
              )}
              {incident.deviceHostname && <span>Device: {incident.deviceHostname}</span>}
              <span>{new Date(incident.createdAt).toLocaleString()}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <span className={`text-lg font-bold ${verdictColors[incident.verdict || ''] || 'text-slate-400'}`}>
                {incident.verdict ? incident.verdict.replace('_', ' ').toUpperCase() : 'PENDING'}
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

      {/* ═══ Section 2: Tickets ═══ */}
      <Section title="Tickets" count={analyses.length}>
        {analyses.length === 0 ? (
          <EmptyState>No ticket analyses recorded.</EmptyState>
        ) : (
          <div className="divide-y divide-white/5">
            {analyses.map(a => {
              const atLink = getAutotaskLink(a.autotaskTicketId)
              const displayNum = getDisplayTicketNumber(a)
              const notes = notesByTicket[a.autotaskTicketId] || []
              return (
                <div key={a.id} className="p-4">
                  {/* Ticket header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {atLink ? (
                          <a href={atLink} target="_blank" rel="noopener noreferrer"
                            className="text-sm font-medium text-cyan-400 hover:underline font-mono">
                            #{displayNum}
                          </a>
                        ) : (
                          <span className="text-sm font-medium text-white font-mono">#{displayNum}</span>
                        )}
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
                        {a.recommendedAction && (
                          <span className="text-xs text-slate-500">Action: {a.recommendedAction}</span>
                        )}
                      </div>

                      {/* Ticket title */}
                      <p className="text-sm text-white mt-1">
                        {a.ticketTitle || '(no title)'}
                      </p>

                      {/* Ticket context row */}
                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 flex-wrap">
                        {a.companyName && <span className="text-cyan-400/80">{a.companyName}</span>}
                        {a.ticketStatusLabel && <span>Status: <span className="text-slate-400">{a.ticketStatusLabel}</span></span>}
                        {a.ticketPriorityLabel && <span>Priority: <span className="text-slate-400">{a.ticketPriorityLabel}</span></span>}
                        {a.ticketQueueLabel && <span>Queue: <span className="text-slate-400">{a.ticketQueueLabel}</span></span>}
                        {a.ticketSourceLabel && <span>Source: <span className="text-slate-400">{a.ticketSourceLabel}</span></span>}
                        {a.ticketCreateDate && <span>Created: <span className="text-slate-400">{new Date(a.ticketCreateDate).toLocaleString()}</span></span>}
                      </div>

                      {/* Device / tech info */}
                      <div className="flex items-center gap-2 mt-2 text-xs">
                        {a.deviceVerified && <span className="text-green-400">Device Verified</span>}
                        {a.technicianVerified && <span className="text-cyan-400">Tech: {a.technicianVerified}</span>}
                        {a.alertCategory && <span className="text-slate-500 capitalize">{a.alertCategory.replace(/_/g, ' ')}</span>}
                        {atLink && (
                          <a href={atLink} target="_blank" rel="noopener noreferrer"
                            className="text-cyan-400/60 hover:text-cyan-400 hover:underline ml-auto">
                            Open in Autotask &rarr;
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* AI Reasoning */}
                  {a.aiReasoning && (
                    <details className="mt-3">
                      <summary className="text-xs text-slate-400 cursor-pointer hover:text-white">AI Reasoning</summary>
                      <p className="text-xs text-slate-300 mt-1 whitespace-pre-wrap bg-black/20 p-3 rounded">{a.aiReasoning}</p>
                    </details>
                  )}

                  {/* Ticket Description */}
                  {a.ticketDescription && (
                    <details className="mt-1">
                      <summary className="text-xs text-slate-400 cursor-pointer hover:text-white">Ticket Description</summary>
                      <p className="text-xs text-slate-300 mt-1 whitespace-pre-wrap bg-black/20 p-3 rounded max-h-[200px] overflow-y-auto">{a.ticketDescription}</p>
                    </details>
                  )}

                  {/* Ticket Notes */}
                  {notes.length > 0 && (
                    <details className="mt-1">
                      <summary className="text-xs text-slate-400 cursor-pointer hover:text-white">
                        Ticket Notes ({notes.length})
                      </summary>
                      <div className="mt-1 space-y-2 bg-black/20 p-3 rounded max-h-[300px] overflow-y-auto">
                        {notes.map(note => (
                          <div key={note.id} className="border-b border-white/5 pb-2 last:border-0 last:pb-0">
                            {note.title && <p className="text-xs font-medium text-slate-300">{note.title}</p>}
                            {note.description && (
                              <p className="text-xs text-slate-400 mt-0.5 whitespace-pre-wrap">{note.description}</p>
                            )}
                            {note.createDateTime && (
                              <p className="text-[10px] text-slate-600 mt-0.5">{new Date(note.createDateTime).toLocaleString()}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* ═══ Section 3: Proposed Autotask Actions (Dry Run Preview) ═══ */}
      <Section title="Proposed Autotask Actions" subtitle="Dry Run Preview — these actions will execute when automation is enabled">
        <div className="p-4 space-y-4">
          {!pa ? (
            <EmptyState>No action plan was generated for this incident. Re-process to generate one.</EmptyState>
          ) : (
            <>
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
                  <h4 className="text-sm font-medium text-white">Internal Note (to be added to Autotask)</h4>
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
              {!pa.statusChange && !pa.priorityChange && !pa.queueChange && !pa.merge?.shouldMerge && !pa.internalNote && !pa.escalation?.recommended && (
                <p className="text-sm text-slate-500 italic">No specific Autotask changes proposed for this incident.</p>
              )}

              {/* Escalation */}
              {pa.escalation && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-white">Internal Escalation</h4>
                    {pa.escalation.recommended ? (
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${urgencyColors[pa.escalation.urgency] || urgencyColors.routine}`}>
                        {(pa.escalation?.urgency || 'routine').toUpperCase()}
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
            </>
          )}
        </div>
      </Section>

      {/* ═══ Section 3b: Pending Actions (Human Approval Queue) ═══ */}
      {pendingActions.length > 0 && (
        <Section title="Action Approval Queue" count={pendingActions.filter(a => a.status === 'pending').length} subtitle="Review and approve/reject AI-proposed actions before they execute">
          <div className="p-4 space-y-4">
            {/* Approve All button */}
            {pendingActions.filter(a => a.status === 'pending').length > 1 && (
              <button
                onClick={handleApproveAll}
                disabled={approvingAll}
                className="w-full px-4 py-3 text-sm font-medium bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {approvingAll ? (
                  <>
                    <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white" />
                    Approving All Actions...
                  </>
                ) : (
                  <>Approve All ({pendingActions.filter(a => a.status === 'pending').length} actions)</>
                )}
              </button>
            )}

            {/* Autotask API identity notice */}
            {autotaskApiUser && (
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-black/20 rounded-lg px-3 py-2">
                <span>Autotask API User (note sender):</span>
                <span className="text-cyan-400 font-medium font-mono">{autotaskApiUser}</span>
                <span className="text-slate-600">|</span>
                <span>Notes are posted as <span className="text-violet-400">Internal Only</span> (not visible to customers)</span>
              </div>
            )}

            {pendingActions.map(action => {
              const isPending = action.status === 'pending'
              const isDeciding = decidingAction === action.id
              const statusColors: Record<string, string> = {
                pending: 'border-cyan-500/30 bg-cyan-500/5',
                executed: 'border-green-500/30 bg-green-500/5',
                rejected: 'border-slate-500/30 bg-slate-500/5',
                failed: 'border-red-500/30 bg-red-500/5',
              }
              const statusBadgeColors: Record<string, string> = {
                pending: 'bg-cyan-500/20 text-cyan-400',
                executed: 'bg-green-500/20 text-green-400',
                rejected: 'bg-slate-500/20 text-slate-400',
                failed: 'bg-red-500/20 text-red-400',
              }

              return (
                <div key={action.id} className={`border rounded-lg p-4 space-y-3 ${statusColors[action.status] || 'border-white/10'}`}>
                  {/* Action header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white capitalize">{action.actionType.replace(/_/g, ' ')}</span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusBadgeColors[action.status] || 'bg-slate-500/20 text-slate-400'}`}>
                          {action.status}
                        </span>
                        {action.ticketNumber && (
                          <span className="text-xs text-slate-500 font-mono">Ticket #{action.ticketNumber}</span>
                        )}
                      </div>
                      {action.companyName && (
                        <p className="text-xs text-cyan-400 mt-1">{action.companyName}</p>
                      )}
                    </div>
                    <span className="text-xs text-slate-500 flex-shrink-0">
                      {new Date(action.createdAt).toLocaleString()}
                    </span>
                  </div>

                  {/* What will happen */}
                  <div className="space-y-2">
                    <h5 className="text-xs font-medium text-slate-400 uppercase tracking-wide">What will happen</h5>
                    <div className="bg-black/30 rounded-lg p-3 space-y-2">
                      {action.actionType === 'add_note' && (
                        <>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500">Action:</span>
                            <span className="text-white">Post internal note to Autotask ticket #{action.ticketNumber}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500">Sent via:</span>
                            <span className="text-cyan-400 font-mono">{autotaskApiUser || 'Autotask API'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500">Visibility:</span>
                            <span className="text-violet-400">Internal Only (not visible to customers)</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500">Note Title:</span>
                            <span className="text-white">{action.actionPayload.noteTitle || 'SOC AI Triage Analysis'}</span>
                          </div>
                          <div className="mt-2">
                            <span className="text-xs text-slate-500">Note Content:</span>
                            <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono mt-1 bg-black/40 p-3 rounded max-h-[200px] overflow-y-auto">
                              {action.actionPayload.noteBody}
                            </pre>
                          </div>
                        </>
                      )}
                      {action.actionType === 'send_customer_message' && (
                        <>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500">Action:</span>
                            <span className="text-white">Send customer-visible note to ticket #{action.ticketNumber}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500">Recipient:</span>
                            <span className="text-violet-400">{action.actionPayload.recipient || 'Primary IT Contact'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500">Sent via:</span>
                            <span className="text-cyan-400 font-mono">{autotaskApiUser || 'Autotask API'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500">Visibility:</span>
                            <span className="text-violet-400">Customer-Visible (All Autotask Users)</span>
                          </div>
                          {action.actionPayload.setStatusWaitingCustomer && (
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-slate-500">Status Change:</span>
                              <span className="text-violet-400">Will set to Waiting Customer</span>
                            </div>
                          )}
                          <div className="mt-2">
                            <span className="text-xs text-slate-500">Customer Message:</span>
                            <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono mt-1 bg-black/40 p-3 rounded max-h-[200px] overflow-y-auto border border-violet-500/20">
                              {action.actionPayload.noteBody}
                            </pre>
                          </div>
                          {action.actionPayload.followUpMessage && (
                            <div className="mt-2">
                              <span className="text-xs text-slate-500">Follow-up ({action.actionPayload.followUpDays || 5} days):</span>
                              <pre className="text-xs text-slate-400 whitespace-pre-wrap font-mono mt-1 bg-black/20 p-2 rounded">
                                {action.actionPayload.followUpMessage}
                              </pre>
                            </div>
                          )}
                        </>
                      )}
                      {action.actionType === 'status_change' && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-500">Change ticket status:</span>
                          <span className="text-slate-400">{action.actionPayload.from}</span>
                          <span className="text-slate-600">&rarr;</span>
                          <span className="text-white">{action.actionPayload.to}</span>
                        </div>
                      )}
                      {action.actionType === 'escalation' && (
                        <div className="space-y-1 text-xs">
                          <div><span className="text-slate-500">Escalate to:</span> <span className="text-white">{action.actionPayload.targetQueue || action.actionPayload.targetResource}</span></div>
                          <div><span className="text-slate-500">Urgency:</span> <span className="text-rose-400">{action.actionPayload.urgency}</span></div>
                          {action.actionPayload.reason && <div><span className="text-slate-500">Reason:</span> <span className="text-slate-300">{action.actionPayload.reason}</span></div>}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Decided info */}
                  {action.decidedBy && (
                    <p className="text-xs text-slate-500">
                      {action.status === 'executed' ? 'Approved' : action.status === 'rejected' ? 'Rejected' : 'Decided'} by{' '}
                      <span className="text-slate-400">{action.decidedBy}</span>{' '}
                      {action.decidedAt && <>on {new Date(action.decidedAt).toLocaleString()}</>}
                    </p>
                  )}

                  {/* Approve / Reject buttons */}
                  {isPending && (
                    <div className="flex items-center gap-3 pt-2 border-t border-white/5">
                      <button
                        onClick={() => handleActionDecision(action.id, 'approve')}
                        disabled={isDeciding}
                        className="px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isDeciding ? 'Processing...' : 'Approve & Execute'}
                      </button>
                      <button
                        onClick={() => handleActionDecision(action.id, 'reject')}
                        disabled={isDeciding}
                        className="px-4 py-2 text-sm font-medium bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  {/* Execution failure details */}
                  {action.status === 'failed' && action.executionResult && (
                    <div className="text-xs text-red-400 bg-red-500/10 p-2 rounded">
                      Error: {String((action.executionResult as Record<string, unknown>).error || 'Unknown error')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* ═══ Section 4: Recommended Human Actions ═══ */}
      <Section title="Recommended Human Actions">
        <div className="p-4 space-y-4">
          {!hg ? (
            <EmptyState>No human guidance generated. Re-process to generate recommendations.</EmptyState>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-400">Risk Level:</span>
                <span className={`text-sm font-medium ${riskColors[hg.riskLevel] || 'text-slate-400'}`}>
                  {(hg?.riskLevel || 'none').toUpperCase()}
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
            </>
          )}
        </div>
      </Section>

      {/* ═══ Section 4b: Customer Communication Plan ═══ */}
      {cc && cc.required && (
        <Section title="Customer Communication" subtitle="AI-drafted customer outreach — sent via Autotask ticket note">
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-black/30 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">Recipient</p>
                <p className="text-sm text-white">{cc.recipient || 'Primary IT Contact'}</p>
              </div>
              <div className="bg-black/30 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">Method</p>
                <p className="text-sm text-white">Autotask Ticket Note (Customer-Visible)</p>
              </div>
              {cc.setStatusWaitingCustomer && (
                <div className="bg-black/30 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Status Change</p>
                  <p className="text-sm text-violet-400">Set to Waiting Customer</p>
                </div>
              )}
              {cc.followUpDays && (
                <div className="bg-black/30 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Follow-Up</p>
                  <p className="text-sm text-white">{cc.followUpDays} business days if no response</p>
                </div>
              )}
            </div>

            {/* Customer message preview */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-white">Customer Message (Exact Text)</h4>
              <div className="bg-black/30 rounded-lg p-4 border border-violet-500/20">
                <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono">{cc.message}</pre>
              </div>
            </div>

            {/* Follow-up message */}
            {cc.followUpMessage && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-slate-400">Follow-Up Message (if no response)</h4>
                <div className="bg-black/20 rounded-lg p-3">
                  <pre className="text-xs text-slate-400 whitespace-pre-wrap font-mono">{cc.followUpMessage}</pre>
                </div>
              </div>
            )}

            {/* Response handling */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {cc.approvalAction && (
                <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                  <p className="text-xs text-green-400 font-medium mb-1">If Customer Approves</p>
                  <p className="text-xs text-slate-300">{cc.approvalAction}</p>
                </div>
              )}
              {cc.denialAction && (
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                  <p className="text-xs text-blue-400 font-medium mb-1">If Customer Denies</p>
                  <p className="text-xs text-slate-300">{cc.denialAction}</p>
                </div>
              )}
              {cc.escalationTrigger && (
                <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-3">
                  <p className="text-xs text-rose-400 font-medium mb-1">Escalation Trigger</p>
                  <p className="text-xs text-slate-300">{cc.escalationTrigger}</p>
                </div>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* ═══ Section 4c: Next Cycle Checks ═══ */}
      {ncc && ncc.length > 0 && (
        <Section title="Next Cycle Automation" subtitle="What the AI will check on subsequent monitoring cycles">
          <div className="p-4">
            <ol className="space-y-2">
              {ncc.map((check, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 text-xs font-medium flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-sm text-slate-300">{check}</span>
                </li>
              ))}
            </ol>
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
    <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg">
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
        <span className="text-slate-600">&rarr;</span>
        <span className="text-white font-medium">{to}</span>
      </div>
    </div>
  )
}
