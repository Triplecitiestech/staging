'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Types ──

interface TicketInfo {
  autotaskTicketId: string;
  ticketNumber: string;
  title: string;
  description: string | null;
  status: number;
  statusLabel: string | null;
  priority: number;
  priorityLabel: string | null;
  assignedTo: string;
  createDate: string;
  completedDate: string | null;
  queueLabel: string | null;
  sourceLabel: string | null;
  companyName: string | null;
  companySlug: string | null;
}

interface SocAnalysis {
  verdict: string | null;
  confidenceScore: number | null;
  alertSource: string | null;
  alertCategory: string | null;
  aiReasoning: string | null;
  recommendedAction: string | null;
  deviceVerified: boolean;
  technicianVerified: string | null;
  ipExtracted: string | null;
  processedAt: string | null;
  incidentId: string | null;
}

interface IncidentPlan {
  id: string;
  title: string;
  verdict: string | null;
  confidenceScore: number | null;
  aiSummary: string | null;
  proposedActions: string | null;
  humanGuidance: string | null;
  customerCommunication: string | null;
  nextCycleChecks: string | null;
  supportingReasoning: string | null;
  status: string;
  correlationReason: string | null;
  ticketCount: number;
}

interface PendingAction {
  id: string;
  actionType: string;
  actionPayload: Record<string, unknown>;
  previewSummary: string;
  status: string;
  ticketNumber: string | null;
}

interface AnalysisData {
  ticket: TicketInfo;
  analysis: SocAnalysis | null;
  incidentActionPlan: IncidentPlan | null;
  pendingActions: PendingAction[];
  autotaskWebUrl: string | null;
}

interface SocTicketDetailProps {
  ticketId: string;
  onBack: () => void;
}

// ── Helpers ──

function parseJsonField<T>(val: unknown): T | null {
  if (!val) return null;
  if (typeof val === 'object') return val as T;
  if (typeof val === 'string') {
    try { return JSON.parse(val) as T; } catch { return null; }
  }
  return null;
}

interface ProposedActions {
  merge?: { shouldMerge: boolean; mergeReasoning?: string; proposedTitle?: string } | null;
  internalNote?: string;
  statusChange?: { from: string; to: string } | null;
  priorityChange?: { from: string; to: string } | null;
  queueChange?: { from: string; to: string } | null;
  escalation?: { recommended: boolean; targetQueue?: string; urgency?: string; reason?: string } | null;
}

interface HumanGuidance {
  summary?: string;
  steps?: string[];
  draftCustomerMessage?: string | null;
  riskLevel?: string;
}

interface CustomerCommunication {
  required?: boolean;
  message?: string | null;
  followUpMessage?: string | null;
  followUpDays?: number | null;
  method?: string;
}

function verdictColor(verdict: string | null): string {
  switch (verdict) {
    case 'false_positive': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'suspicious': return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    case 'escalate': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'informational': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  }
}

function riskColor(risk: string | undefined): string {
  switch (risk) {
    case 'critical': return 'text-red-400';
    case 'high': return 'text-rose-400';
    case 'medium': return 'text-cyan-400';
    case 'low': return 'text-green-400';
    default: return 'text-slate-400';
  }
}

// ── Component ──

export default function SocTicketDetail({ ticketId, onBack }: SocTicketDetailProps) {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRawDetails, setShowRawDetails] = useState(false);
  const [decidingAction, setDecidingAction] = useState<string | null>(null);

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/soc/tickets/${ticketId}/analysis`);
      if (!res.ok) {
        setError(`Failed to load analysis (${res.status})`);
        return;
      }
      setData(await res.json());
    } catch {
      setError('Network error loading analysis');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { fetchAnalysis(); }, [fetchAnalysis]);

  const handleActionDecision = async (actionId: string, decision: 'approve' | 'reject') => {
    setDecidingAction(actionId);
    try {
      const res = await fetch('/api/soc/pending-actions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId, decision }),
      });
      if (res.ok) {
        await fetchAnalysis();
      }
    } catch {
      // Error handling via re-fetch
    } finally {
      setDecidingAction(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 text-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to SOC Dashboard
        </button>
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-sm text-red-400">{error || 'Failed to load ticket analysis'}</p>
        </div>
      </div>
    );
  }

  const { ticket, analysis, incidentActionPlan } = data;
  const proposedActions = parseJsonField<ProposedActions>(incidentActionPlan?.proposedActions);
  const humanGuidance = parseJsonField<HumanGuidance>(incidentActionPlan?.humanGuidance);
  const customerComm = parseJsonField<CustomerCommunication>(incidentActionPlan?.customerCommunication);
  const nextChecks = parseJsonField<string[]>(incidentActionPlan?.nextCycleChecks);
  const autotaskUrl = data.autotaskWebUrl ? `${data.autotaskWebUrl}?ticketId=${ticket.autotaskTicketId}` : null;
  const pendingActions = data.pendingActions.filter(a => a.status === 'pending');
  const isResolved = ticket.completedDate !== null;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 text-sm">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to SOC Dashboard
      </button>

      {/* ── Section 1: The Ticket ── */}
      <div className="bg-slate-800/50 border border-white/10 rounded-lg p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <span className="text-xs font-mono text-slate-500">#{ticket.ticketNumber}</span>
              <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${
                isResolved ? 'bg-green-500/20 text-green-300 border-green-500/30' : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
              }`}>
                {isResolved ? 'Resolved' : ticket.statusLabel || 'Open'}
              </span>
              {ticket.priorityLabel && (
                <span className="text-xs text-slate-400">{ticket.priorityLabel}</span>
              )}
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">{ticket.title}</h2>
            <div className="flex items-center gap-4 text-sm text-slate-400 flex-wrap">
              {ticket.companyName && <span className="text-cyan-400">{ticket.companyName}</span>}
              <span>Assigned: <span className="text-white">{ticket.assignedTo}</span></span>
              <span>{new Date(ticket.createDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              {ticket.queueLabel && <span className="text-slate-500">Queue: {ticket.queueLabel}</span>}
            </div>
          </div>
          {autotaskUrl && (
            <a href={autotaskUrl} target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-lg transition-colors flex-shrink-0">
              Open in Autotask
            </a>
          )}
        </div>

        {/* Ticket description — collapsed by default if long */}
        {ticket.description && (
          <div className="mt-4 bg-slate-700/30 border border-white/5 rounded-lg px-4 py-3">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Original Alert</p>
            <p className="text-sm text-slate-300 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
              {ticket.description}
            </p>
          </div>
        )}
      </div>

      {/* ── Section 2: Technician Summary (plain-language) ── */}
      {analysis && (
        <div className="bg-slate-800/50 border border-white/10 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">SOC Assessment</h3>
            <div className="flex items-center gap-2">
              {analysis.verdict && (
                <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${verdictColor(analysis.verdict)}`}>
                  {analysis.verdict.replace(/_/g, ' ')}
                </span>
              )}
              {analysis.confidenceScore != null && (
                <span className="text-xs text-slate-500">{Math.round(Number(analysis.confidenceScore) * 100)}% confidence</span>
              )}
            </div>
          </div>

          {/* Plain-language summary from AI */}
          {humanGuidance?.summary ? (
            <p className="text-sm text-slate-300 leading-relaxed mb-4">{humanGuidance.summary}</p>
          ) : incidentActionPlan?.aiSummary ? (
            <p className="text-sm text-slate-300 leading-relaxed mb-4">{incidentActionPlan.aiSummary}</p>
          ) : analysis.aiReasoning ? (
            <p className="text-sm text-slate-300 leading-relaxed mb-4">{analysis.aiReasoning}</p>
          ) : (
            <p className="text-sm text-slate-500 italic mb-4">No AI summary available for this ticket.</p>
          )}

          {/* Quick facts row */}
          <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
            {analysis.alertSource && analysis.alertSource !== 'unknown' && (
              <span>Source: <span className="text-slate-300">{analysis.alertSource.replace(/_/g, ' ')}</span></span>
            )}
            {analysis.alertCategory && analysis.alertCategory !== 'unknown' && (
              <span>Category: <span className="text-slate-300">{analysis.alertCategory.replace(/_/g, ' ')}</span></span>
            )}
            {analysis.ipExtracted && (
              <span>IP: <span className="text-slate-300 font-mono">{analysis.ipExtracted}</span></span>
            )}
            {analysis.deviceVerified && (
              <span className="text-green-400">Device verified</span>
            )}
            {analysis.technicianVerified && (
              <span className="text-green-400">Tech: {analysis.technicianVerified}</span>
            )}
            {humanGuidance?.riskLevel && humanGuidance.riskLevel !== 'none' && (
              <span className={riskColor(humanGuidance.riskLevel)}>
                {humanGuidance.riskLevel} risk
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Section 3: Remediation Plan (what SOC would do) ── */}
      {(proposedActions || humanGuidance?.steps) && (
        <div className="bg-slate-800/50 border border-white/10 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Remediation Plan</h3>

          {/* Step-by-step workflow */}
          {humanGuidance?.steps && humanGuidance.steps.length > 0 && (
            <div className="space-y-2 mb-4">
              {humanGuidance.steps.map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-medium flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-sm text-slate-300">{step}</p>
                </div>
              ))}
            </div>
          )}

          {/* Proposed Autotask changes */}
          {proposedActions && (
            <div className="space-y-2 mt-4 pt-4 border-t border-white/5">
              <p className="text-xs font-semibold text-slate-500 uppercase">Autotask Changes</p>
              <div className="space-y-1.5">
                {proposedActions.internalNote && (
                  <div className="flex items-start gap-2 text-sm">
                    <span className="text-slate-500 flex-shrink-0">Internal Note:</span>
                    <span className="text-slate-300 line-clamp-2">{proposedActions.internalNote}</span>
                  </div>
                )}
                {proposedActions.statusChange && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">Status:</span>
                    <span className="text-slate-400">{proposedActions.statusChange.from}</span>
                    <span className="text-slate-600">&rarr;</span>
                    <span className="text-white">{proposedActions.statusChange.to}</span>
                  </div>
                )}
                {proposedActions.priorityChange && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">Priority:</span>
                    <span className="text-slate-400">{proposedActions.priorityChange.from}</span>
                    <span className="text-slate-600">&rarr;</span>
                    <span className="text-white">{proposedActions.priorityChange.to}</span>
                  </div>
                )}
                {proposedActions.escalation?.recommended && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-rose-400 font-medium">Escalation recommended</span>
                    {proposedActions.escalation.urgency && (
                      <span className={`px-1.5 py-0.5 text-[10px] rounded ${
                        proposedActions.escalation.urgency === 'critical' ? 'bg-red-500/20 text-red-400'
                        : proposedActions.escalation.urgency === 'urgent' ? 'bg-rose-500/20 text-rose-400'
                        : 'bg-slate-500/20 text-slate-400'
                      }`}>{proposedActions.escalation.urgency}</span>
                    )}
                    {proposedActions.escalation.reason && (
                      <span className="text-slate-400">— {proposedActions.escalation.reason}</span>
                    )}
                  </div>
                )}
                {proposedActions.merge?.shouldMerge && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-cyan-400 font-medium">Merge recommended</span>
                    <span className="text-slate-400">— {proposedActions.merge.mergeReasoning}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Section 4: Customer Communication ── */}
      {customerComm?.required && customerComm.message && (
        <div className="bg-slate-800/50 border border-white/10 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Customer Communication</h3>
          <div className="bg-slate-700/30 border border-white/5 rounded-lg px-4 py-3 mb-3">
            <p className="text-xs font-semibold text-cyan-400 uppercase mb-2">Draft Message</p>
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{customerComm.message}</p>
          </div>
          {customerComm.followUpMessage && (
            <div className="bg-slate-700/30 border border-white/5 rounded-lg px-4 py-3 mb-3">
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                Follow-up{customerComm.followUpDays ? ` (${customerComm.followUpDays} days)` : ''}
              </p>
              <p className="text-sm text-slate-400 whitespace-pre-wrap">{customerComm.followUpMessage}</p>
            </div>
          )}
          {customerComm.method && (
            <p className="text-xs text-slate-500">Delivery: {customerComm.method}</p>
          )}
        </div>
      )}

      {/* ── Section 5: Pending Actions (approve/reject) ── */}
      {pendingActions.length > 0 && (
        <div className="bg-slate-800/50 border border-cyan-500/20 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
            Pending Approval
            <span className="ml-2 text-xs font-normal text-cyan-400">({pendingActions.length})</span>
          </h3>
          <div className="space-y-3">
            {pendingActions.map(action => (
              <div key={action.id} className="bg-slate-700/30 border border-white/5 rounded-lg px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-cyan-400 uppercase">
                        {action.actionType.replace(/_/g, ' ')}
                      </span>
                      {action.ticketNumber && (
                        <span className="text-xs text-slate-500 font-mono">#{action.ticketNumber}</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-300">{action.previewSummary}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleActionDecision(action.id, 'approve')}
                      disabled={decidingAction === action.id}
                      className="px-3 py-1 text-xs font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {decidingAction === action.id ? '...' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleActionDecision(action.id, 'reject')}
                      disabled={decidingAction === action.id}
                      className="px-3 py-1 text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section 6: Next Cycle Checks ── */}
      {nextChecks && nextChecks.length > 0 && (
        <div className="bg-slate-800/50 border border-white/10 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">Follow-up Monitoring</h3>
          <ul className="space-y-1.5">
            {nextChecks.map((check, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                <span className="text-slate-600 mt-0.5">&#8226;</span>
                {check}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Section 7: Raw Details (collapsed) ── */}
      {analysis && (
        <div className="bg-slate-800/30 border border-white/5 rounded-lg">
          <button
            onClick={() => setShowRawDetails(!showRawDetails)}
            className="w-full px-6 py-3 flex items-center justify-between text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            <span>Technical Details</span>
            <svg className={`w-4 h-4 transition-transform ${showRawDetails ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showRawDetails && (
            <div className="px-6 pb-4 space-y-4">
              {/* Full AI Reasoning */}
              {analysis.aiReasoning && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">AI Reasoning</p>
                  <p className="text-sm text-slate-400 whitespace-pre-wrap">{analysis.aiReasoning}</p>
                </div>
              )}
              {/* Supporting Reasoning from incident */}
              {incidentActionPlan?.supportingReasoning && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Supporting Analysis</p>
                  <p className="text-sm text-slate-400 whitespace-pre-wrap">
                    {typeof incidentActionPlan.supportingReasoning === 'string'
                      ? incidentActionPlan.supportingReasoning
                      : JSON.stringify(incidentActionPlan.supportingReasoning, null, 2)}
                  </p>
                </div>
              )}
              {/* Full internal note preview */}
              {proposedActions?.internalNote && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Full Internal Note</p>
                  <pre className="text-xs text-slate-400 whitespace-pre-wrap bg-slate-900/50 rounded p-3 max-h-60 overflow-y-auto">
                    {proposedActions.internalNote}
                  </pre>
                </div>
              )}
              {/* Metadata */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {analysis.processedAt && (
                  <div>
                    <span className="text-slate-600">Analyzed:</span>{' '}
                    <span className="text-slate-400">{new Date(analysis.processedAt).toLocaleString()}</span>
                  </div>
                )}
                {analysis.recommendedAction && (
                  <div>
                    <span className="text-slate-600">Action:</span>{' '}
                    <span className="text-slate-400">{analysis.recommendedAction}</span>
                  </div>
                )}
                {incidentActionPlan?.correlationReason && (
                  <div>
                    <span className="text-slate-600">Correlation:</span>{' '}
                    <span className="text-slate-400">{incidentActionPlan.correlationReason.replace(/_/g, ' ')}</span>
                  </div>
                )}
                {incidentActionPlan && (incidentActionPlan.ticketCount ?? 0) > 1 && (
                  <div>
                    <span className="text-slate-600">Related tickets:</span>{' '}
                    <span className="text-slate-400">{incidentActionPlan.ticketCount}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No analysis state */}
      {!analysis && (
        <div className="bg-slate-800/50 border border-white/10 rounded-lg p-6 text-center">
          <p className="text-slate-400 text-sm">
            This ticket has not been analyzed by the SOC agent yet.
          </p>
          <p className="text-slate-500 text-xs mt-1">
            Run the SOC agent or wait for the next scheduled triage cycle to process this ticket.
          </p>
        </div>
      )}
    </div>
  );
}
