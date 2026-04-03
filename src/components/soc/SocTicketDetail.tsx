'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDemoMode } from '@/components/admin/DemoModeProvider';

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
  decidedBy: string | null;
  decidedAt: string | null;
  executionResult: Record<string, unknown> | null;
  createdAt: string | null;
}

interface EvidenceItem {
  label: string;
  value: string;
  type: 'neutral' | 'positive' | 'negative' | 'info';
}

interface SocReasoningData {
  incidentSummary: string;
  classification: string;
  riskLevel: string;
  confidence: number;
  assessmentRationale: string;
  evidence: EvidenceItem[];
  recommendedAction: string;
  customerMessageRequired: boolean;
  customerMessageDraft: string | null;
  internalNote: string;
}

interface AnalysisData {
  ticket: TicketInfo;
  analysis: SocAnalysis | null;
  reasoning: SocReasoningData | null;
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

function classificationColor(classification: string | null): string {
  switch (classification) {
    case 'false_positive': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'expected_activity': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    case 'informational': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'suspicious': return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    case 'confirmed_threat': return 'bg-red-500/20 text-red-400 border-red-500/30';
    default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  }
}

function classificationLabel(classification: string): string {
  switch (classification) {
    case 'false_positive': return 'False Positive';
    case 'expected_activity': return 'Expected Activity';
    case 'informational': return 'Informational';
    case 'suspicious': return 'Suspicious';
    case 'confirmed_threat': return 'Confirmed Threat';
    default: return classification.replace(/_/g, ' ');
  }
}

function riskBadgeColor(risk: string): string {
  switch (risk) {
    case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'high': return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    case 'medium': return 'bg-violet-500/20 text-violet-400 border-violet-500/30';
    case 'low': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'none': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  }
}

function evidenceTypeColor(type: string): string {
  switch (type) {
    case 'positive': return 'text-green-400';
    case 'negative': return 'text-rose-400';
    case 'info': return 'text-cyan-400';
    default: return 'text-slate-400';
  }
}

function evidenceDotColor(type: string): string {
  switch (type) {
    case 'positive': return 'bg-green-400';
    case 'negative': return 'bg-rose-400';
    case 'info': return 'bg-cyan-400';
    default: return 'bg-slate-500';
  }
}

function verdictColor(verdict: string | null): string {
  switch (verdict) {
    case 'false_positive': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'expected_activity': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    case 'suspicious': return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    case 'escalate': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'confirmed_threat': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'informational': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  }
}

function riskColor(risk: string | undefined): string {
  switch (risk) {
    case 'critical': return 'text-red-400';
    case 'high': return 'text-rose-400';
    case 'medium': return 'text-violet-400';
    case 'low': return 'text-green-400';
    default: return 'text-slate-400';
  }
}

// ── Component ──

export default function SocTicketDetail({ ticketId, onBack }: SocTicketDetailProps) {
  const demo = useDemoMode();
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [showOriginalAlert, setShowOriginalAlert] = useState(false);
  const [decidingAction, setDecidingAction] = useState<string | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  const fetchAnalysis = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/soc/tickets/${ticketId}/analysis`, { signal });
      if (!res.ok) {
        setError(`Failed to load analysis (${res.status})`);
        return;
      }
      setData(await res.json());
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError('Network error loading analysis');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    const c = new AbortController();
    fetchAnalysis(c.signal);
    return () => c.abort();
  }, [fetchAnalysis]);

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

  const { ticket, analysis, reasoning, incidentActionPlan } = data;
  const autotaskUrl = data.autotaskWebUrl ? `${data.autotaskWebUrl}?ticketId=${ticket.autotaskTicketId}` : null;
  // All actions sorted chronologically (oldest first)
  const allActions = [...data.pendingActions].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  });
  const pendingCount = allActions.filter(a => a.status === 'pending').length;
  const isResolved = ticket.completedDate !== null;

  // Parse reasoning from API
  const parsedReasoning = parseJsonField<SocReasoningData>(reasoning);

  // Legacy fields
  const proposedActions = parseJsonField<ProposedActions>(incidentActionPlan?.proposedActions);
  const humanGuidance = parseJsonField<HumanGuidance>(incidentActionPlan?.humanGuidance);
  const customerComm = parseJsonField<CustomerCommunication>(incidentActionPlan?.customerCommunication);
  const nextChecks = parseJsonField<string[]>(incidentActionPlan?.nextCycleChecks);

  // Determine state
  const hasAnalysis = analysis !== null;
  const useReasoningLayout = hasAnalysis && parsedReasoning !== null;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 text-sm">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to SOC Dashboard
      </button>

      {/* ═══════════════════════════════════════════
           STEP 1: TICKET HEADER
         ═══════════════════════════════════════════ */}
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
            <h2 className="text-lg font-semibold text-white mb-2">{demo.title(ticket.title)}</h2>
            <div className="flex items-center gap-4 text-sm text-slate-400 flex-wrap">
              {ticket.companyName && <span className="text-cyan-400">{demo.company(ticket.companyName)}</span>}
              <span>Assigned: <span className="text-white">{demo.person(ticket.assignedTo)}</span></span>
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
      </div>

      {/* ═══════════════════════════════════════════
           NOT ANALYZED STATE
         ═══════════════════════════════════════════ */}
      {!hasAnalysis && (
        <>
          {/* Show original alert when no analysis */}
          {ticket.description && (
            <div className="bg-slate-800/50 border border-white/10 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">Original Alert</h3>
              <pre className="text-sm text-slate-300 whitespace-pre-wrap break-words font-sans leading-relaxed">
                {ticket.description}
              </pre>
            </div>
          )}
          <div className="bg-slate-800/50 border border-slate-600/30 rounded-lg p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-slate-300 text-sm font-medium mb-1">
              SOC analysis has not run yet
            </p>
            <p className="text-slate-500 text-xs">
              Run analysis from the SOC Dashboard or wait for the scheduled triage cycle to process this ticket.
            </p>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════
           ANALYZED STATE — SOC Assessment first, then actions, then alert
         ═══════════════════════════════════════════ */}
      {hasAnalysis && (
        <>
          {/* ═══════════════════════════════════════════
               SOC ASSESSMENT (the key decision — always first)
             ═══════════════════════════════════════════ */}
          {useReasoningLayout && parsedReasoning ? (
            <>
              {/* New reasoning layout */}
              <div className="bg-slate-800/50 border border-white/10 rounded-lg p-6">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h3 className="text-sm font-semibold text-white uppercase tracking-wider">SOC Assessment</h3>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 text-sm font-medium rounded-full border ${classificationColor(parsedReasoning.classification)}`}>
                      {classificationLabel(parsedReasoning.classification)}
                    </span>
                    <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${riskBadgeColor(parsedReasoning.riskLevel)}`}>
                      {parsedReasoning.riskLevel === 'none' ? 'No Risk' : `${parsedReasoning.riskLevel.charAt(0).toUpperCase() + parsedReasoning.riskLevel.slice(1)} Risk`}
                    </span>
                    <span className="text-xs text-slate-500">
                      {Math.round(parsedReasoning.confidence * 100)}%
                    </span>
                  </div>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{parsedReasoning.incidentSummary}</p>
                {parsedReasoning.assessmentRationale && (
                  <p className="text-sm text-slate-400 leading-relaxed mt-2">{parsedReasoning.assessmentRationale}</p>
                )}
                {/* Recommended action inline */}
                <div className="mt-4 pt-3 border-t border-white/5">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Recommended Action</p>
                  <p className="text-sm text-slate-300">{parsedReasoning.recommendedAction}</p>
                </div>
                {/* Quick facts */}
                <div className="flex items-center gap-4 text-xs text-slate-500 mt-3 flex-wrap">
                  {analysis && analysis.alertSource && analysis.alertSource !== 'unknown' && (
                    <span>Source: <span className="text-slate-300">{analysis.alertSource.replace(/_/g, ' ')}</span></span>
                  )}
                  {analysis && analysis.alertCategory && analysis.alertCategory !== 'unknown' && (
                    <span>Category: <span className="text-slate-300">{analysis.alertCategory.replace(/_/g, ' ')}</span></span>
                  )}
                  {analysis?.ipExtracted && (
                    <span>IP: <span className="text-slate-300 font-mono">{analysis.ipExtracted}</span></span>
                  )}
                  {analysis?.deviceVerified && <span className="text-green-400">Device verified</span>}
                  {analysis?.technicianVerified && <span className="text-green-400">Tech: {analysis.technicianVerified}</span>}
                  {analysis?.processedAt && (
                    <span>Analyzed: <span className="text-slate-400">{new Date(analysis.processedAt).toLocaleString()}</span></span>
                  )}
                </div>
              </div>

              {/* Investigation Evidence */}
              {parsedReasoning.evidence && parsedReasoning.evidence.length > 0 && (
                <div className="bg-slate-800/50 border border-white/10 rounded-lg p-6">
                  <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Investigation Evidence</h3>
                  <div className="space-y-2">
                    {parsedReasoning.evidence.map((item, i) => (
                      <div key={i} className="flex items-start gap-3 py-1.5">
                        <span className={`flex-shrink-0 w-2 h-2 rounded-full mt-1.5 ${evidenceDotColor(item.type)}`} />
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{item.label}</span>
                          <p className={`text-sm ${evidenceTypeColor(item.type)}`}>{item.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Legacy SOC Assessment */}
              <div className="bg-slate-800/50 border border-white/10 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
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

                {humanGuidance?.summary ? (
                  <p className="text-sm text-slate-300 leading-relaxed mb-4">{humanGuidance.summary}</p>
                ) : incidentActionPlan?.aiSummary ? (
                  <p className="text-sm text-slate-300 leading-relaxed mb-4">{incidentActionPlan.aiSummary}</p>
                ) : analysis.aiReasoning ? (
                  <p className="text-sm text-slate-300 leading-relaxed mb-4">{analysis.aiReasoning}</p>
                ) : (
                  <p className="text-sm text-slate-500 italic mb-4">No AI summary available for this ticket.</p>
                )}

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
                  {analysis.deviceVerified && <span className="text-green-400">Device verified</span>}
                  {analysis.technicianVerified && <span className="text-green-400">Tech: {analysis.technicianVerified}</span>}
                  {humanGuidance?.riskLevel && humanGuidance.riskLevel !== 'none' && (
                    <span className={riskColor(humanGuidance.riskLevel)}>{humanGuidance.riskLevel} risk</span>
                  )}
                  {analysis.processedAt && (
                    <span>Analyzed: <span className="text-slate-400">{new Date(analysis.processedAt).toLocaleString()}</span></span>
                  )}
                </div>
              </div>

              {/* Legacy Remediation Plan */}
              {(proposedActions || humanGuidance?.steps) && (
                <div className="bg-slate-800/50 border border-white/10 rounded-lg p-6">
                  <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Remediation Plan</h3>
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
                  {proposedActions && (
                    <div className="space-y-2 mt-4 pt-4 border-t border-white/5">
                      <p className="text-xs font-semibold text-slate-500 uppercase">Autotask Changes</p>
                      <div className="space-y-1.5">
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

              {/* Legacy Customer Communication */}
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

              {/* Legacy Next Cycle Checks */}
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
            </>
          )}

          {/* ═══════════════════════════════════════════
               ACTIONS LOG (chronological — pending, approved, rejected)
             ═══════════════════════════════════════════ */}
          {allActions.length > 0 && (
            <div className="bg-slate-800/50 border border-cyan-500/20 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
                Actions
                {pendingCount > 0 && (
                  <span className="ml-2 text-xs font-normal text-cyan-400">({pendingCount} awaiting review)</span>
                )}
              </h3>
              <div className="space-y-4">
                {allActions.map(action => {
                  const payload = action.actionPayload || {};
                  const isCustomerMessage = action.actionType === 'send_customer_message';
                  const isNote = action.actionType === 'add_note';
                  const fullNoteBody = (payload.noteBody as string) || '';
                  const isExpanded = expandedNotes.has(action.id);
                  const recipient = (payload.recipient as string) || '';
                  const isPending = action.status === 'pending';
                  const isApproved = action.status === 'approved';
                  const isRejected = action.status === 'rejected';
                  const executionResult = action.executionResult;
                  const executionSuccess = executionResult && typeof executionResult === 'object' && 'success' in executionResult
                    ? (executionResult as { success?: boolean }).success
                    : null;

                  return (
                    <div key={action.id} className={`bg-slate-700/30 border rounded-lg px-4 py-4 ${
                      isPending ? 'border-cyan-500/20' : isApproved ? 'border-green-500/10' : 'border-white/5'
                    }`}>
                      {/* Action header with status */}
                      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-xs font-medium uppercase rounded ${
                            isCustomerMessage
                              ? 'bg-cyan-500/20 text-cyan-400'
                              : isNote
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-slate-500/20 text-slate-400'
                          }`}>
                            {action.actionType.replace(/_/g, ' ')}
                          </span>
                          {action.ticketNumber && (
                            <span className="text-xs text-slate-500 font-mono">#{action.ticketNumber}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Status badge */}
                          {isApproved && (
                            <span className="px-2 py-0.5 text-[10px] font-medium uppercase rounded bg-green-500/20 text-green-400 border border-green-500/20">
                              Approved{executionSuccess === true ? ' & Sent' : executionSuccess === false ? ' (failed to send)' : ''}
                            </span>
                          )}
                          {isRejected && (
                            <span className="px-2 py-0.5 text-[10px] font-medium uppercase rounded bg-red-500/20 text-red-400 border border-red-500/20">
                              Rejected
                            </span>
                          )}
                          {isPending && (
                            <span className="px-2 py-0.5 text-[10px] font-medium uppercase rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/20">
                              Pending
                            </span>
                          )}
                          {/* Timestamp */}
                          {action.decidedAt ? (
                            <span className="text-[10px] text-slate-600">
                              {new Date(action.decidedAt).toLocaleString()}
                            </span>
                          ) : action.createdAt ? (
                            <span className="text-[10px] text-slate-600">
                              {new Date(action.createdAt).toLocaleString()}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Customer message: show explicit recipient */}
                      {isCustomerMessage && (
                        <div className="mb-3">
                          <div className="flex items-center gap-2 mb-2">
                            <svg className="w-4 h-4 text-cyan-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                            </svg>
                            <span className="text-sm text-slate-300">
                              Send to: <span className="text-white font-medium">{recipient || 'Primary Contact'}</span>
                              {typeof payload.companyName === 'string' && payload.companyName && (
                                <span className="text-slate-500"> at {payload.companyName}</span>
                              )}
                            </span>
                          </div>
                          <div className="bg-slate-900/50 border border-white/5 rounded-lg px-4 py-3">
                            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Message Preview</p>
                            <p className="text-sm text-slate-300 whitespace-pre-wrap">{fullNoteBody}</p>
                          </div>
                        </div>
                      )}

                      {/* Internal note: show full text, expandable */}
                      {isNote && fullNoteBody && (
                        <div className="mb-3">
                          <div className="bg-slate-900/50 border border-white/5 rounded-lg px-4 py-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold text-slate-500 uppercase">Internal Note Preview</p>
                              {fullNoteBody.length > 500 && (
                                <button
                                  onClick={() => {
                                    const next = new Set(expandedNotes);
                                    if (isExpanded) next.delete(action.id);
                                    else next.add(action.id);
                                    setExpandedNotes(next);
                                  }}
                                  className="text-xs text-cyan-400 hover:text-cyan-300"
                                >
                                  {isExpanded ? 'Collapse' : 'Show full note'}
                                </button>
                              )}
                            </div>
                            <pre className={`text-sm text-slate-300 whitespace-pre-wrap font-sans leading-relaxed ${
                              !isExpanded && fullNoteBody.length > 500 ? 'max-h-48 overflow-y-auto' : ''
                            }`}>
                              {fullNoteBody}
                            </pre>
                          </div>
                        </div>
                      )}

                      {/* Generic fallback for other action types */}
                      {!isCustomerMessage && !isNote && (
                        <p className="text-sm text-slate-300 mb-3">{action.previewSummary}</p>
                      )}

                      {/* Decision info for completed actions */}
                      {(isApproved || isRejected) && action.decidedBy && (
                        <p className="text-xs text-slate-600 mt-1">
                          {isApproved ? 'Approved' : 'Rejected'} by {action.decidedBy}
                        </p>
                      )}

                      {/* Approve / Reject buttons — only for pending */}
                      {isPending && (
                        <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                          <button
                            onClick={() => handleActionDecision(action.id, 'approve')}
                            disabled={decidingAction === action.id}
                            className="px-4 py-1.5 text-xs font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {decidingAction === action.id ? 'Processing...' : 'Approve'}
                          </button>
                          <button
                            onClick={() => handleActionDecision(action.id, 'reject')}
                            disabled={decidingAction === action.id}
                            className="px-4 py-1.5 text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 rounded-lg transition-colors disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════
               ORIGINAL ALERT (collapsible — reference material)
             ═══════════════════════════════════════════ */}
          {ticket.description && (
            <div className="bg-slate-800/30 border border-white/5 rounded-lg">
              <button
                onClick={() => setShowOriginalAlert(!showOriginalAlert)}
                className="w-full px-6 py-3 flex items-center justify-between text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                <span>Original Alert</span>
                <svg className={`w-4 h-4 transition-transform ${showOriginalAlert ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showOriginalAlert && (
                <div className="px-6 pb-4">
                  <pre className="text-sm text-slate-300 whitespace-pre-wrap break-words font-sans leading-relaxed">
                    {ticket.description}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════
               TECHNICAL DETAILS (collapsed — metadata only, no redundant content)
             ═══════════════════════════════════════════ */}
          <div className="bg-slate-800/30 border border-white/5 rounded-lg">
            <button
              onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
              className="w-full px-6 py-3 flex items-center justify-between text-sm text-slate-500 hover:text-slate-300 transition-colors"
            >
              <span>Technical Details</span>
              <svg className={`w-4 h-4 transition-transform ${showTechnicalDetails ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showTechnicalDetails && (
              <div className="px-6 pb-4 space-y-4">
                {/* Full internal note from reasoning (unique to Technical Details) */}
                {parsedReasoning?.internalNote && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Internal Investigation Note</p>
                    <pre className="text-xs text-slate-400 whitespace-pre-wrap bg-slate-900/50 rounded p-3 max-h-60 overflow-y-auto">
                      {parsedReasoning.internalNote}
                    </pre>
                  </div>
                )}
                {/* Supporting Reasoning from legacy incident */}
                {!parsedReasoning && incidentActionPlan?.supportingReasoning && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Supporting Analysis</p>
                    <p className="text-sm text-slate-400 whitespace-pre-wrap">
                      {typeof incidentActionPlan.supportingReasoning === 'string'
                        ? incidentActionPlan.supportingReasoning
                        : JSON.stringify(incidentActionPlan.supportingReasoning, null, 2)}
                    </p>
                  </div>
                )}
                {/* Full internal note from legacy (only if not already shown in assessment) */}
                {!parsedReasoning && proposedActions?.internalNote && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Full Internal Note</p>
                    <pre className="text-xs text-slate-400 whitespace-pre-wrap bg-slate-900/50 rounded p-3 max-h-60 overflow-y-auto">
                      {proposedActions.internalNote}
                    </pre>
                  </div>
                )}
                {/* Metadata */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {analysis.recommendedAction && (
                    <div>
                      <span className="text-slate-600">Engine Action:</span>{' '}
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
                  {analysis.incidentId && (
                    <div>
                      <span className="text-slate-600">Incident:</span>{' '}
                      <span className="text-slate-400 font-mono text-[10px]">{analysis.incidentId}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
