'use client'

// Shared cross-stack SOC assessment view. Rendered by both the incident detail
// page and the dashboard ticket drill-down so the redesigned layout is
// identical wherever you look.

export type SocClassification =
  | 'confirmed_malicious'
  | 'suspicious_review'
  | 'likely_false_positive'
  | 'confirmed_false_positive'
  | 'insufficient_data'

export interface EvidenceItem {
  label: string
  value: string
  type: 'neutral' | 'positive' | 'negative' | 'info'
}

export interface DataSourceStatus {
  source: string
  status: 'used' | 'no_data' | 'not_configured' | 'error'
  detail: string
}

export interface SocAssessment {
  executiveSummary: string
  finalRecommendation: string
  classification: SocClassification
  confidence: number
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical'
  evidence: EvidenceItem[]
  correlatedSources: DataSourceStatus[]
  knownBenignMatch: { matched: boolean; reason: string } | null
  customerImpact: string
  recommendedTechnicianActions: string[]
  dataGaps: string[]
  internalNote: string
  customerMessageRequired: boolean
  customerMessageDraft: string | null
}

export interface RocketCyberDetail {
  incidentId: string
  accountId: string | null
  threatName: string | null
  threatType: string | null
  severity: string | null
  actionTaken: string | null
  eventTime: string | null
  process: string | null
  path: string | null
  targetCommandLine: string | null
  parentCommandLine: string | null
  hash: string | null
  userContext: string | null
  device: string | null
  organization: string | null
  detectionMessage: string | null
  rawIncident?: unknown
  rawEvents?: unknown[]
}

export interface DeviceHealth {
  hostname: string
  online: boolean | null
  operatingSystem: string | null
  lastUser: string | null
  lastSeen: string | null
  rebootRequired: boolean | null
  patchStatus: string | null
  patchesApprovedPending: number | null
  antivirusProduct: string | null
  antivirusStatus: string | null
  siteName: string | null
  recentSoftware: Array<{ name: string; version: string; installDate: string | null }>
}

export interface KnownBenignMatch {
  id: string
  vendor: string
  product: string
  executablePath: string | null
  detectionType: string | null
  recommendedHandling: string | null
  scope: string
  matchedOn: string
}

export interface EnrichmentBundle {
  sourceSystem: string
  externalIncidentId: string | null
  externalAccountId: string | null
  rocketCyber: RocketCyberDetail | null
  deviceHealth: DeviceHealth | null
  edr: { detectionCount: number; detections: Array<{ type: string; severity: string; description: string; timestamp: string; status: string }> } | null
  dns: { blockedQueries: number; totalQueries: number; topBlockedDomains: Array<{ domain: string; count: number }>; orgLevelOnly: boolean } | null
  saasAlerts: { eventCount: number; events: Array<{ type: string; severity: string; description: string; time: string; user: string | null }> } | null
  knownBenignMatches: KnownBenignMatch[]
  dataSources: DataSourceStatus[]
  dataGaps: string[]
}

/** True when a parsed reasoning blob is the new cross-stack assessment shape. */
export function isCrossStackAssessment(r: unknown): r is SocAssessment {
  return !!r && typeof r === 'object' && 'executiveSummary' in (r as Record<string, unknown>) && 'classification' in (r as Record<string, unknown>)
}

export const CLASSIFICATION_META: Record<SocClassification, { label: string; text: string; bg: string }> = {
  confirmed_malicious: { label: 'Confirmed Malicious', text: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
  suspicious_review: { label: 'Suspicious — Needs Review', text: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/30' },
  likely_false_positive: { label: 'Likely False Positive', text: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30' },
  confirmed_false_positive: { label: 'Confirmed False Positive (Known Benign)', text: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30' },
  insufficient_data: { label: 'Insufficient Data', text: 'text-slate-300', bg: 'bg-slate-500/10 border-slate-500/30' },
}

const RISK_COLORS: Record<string, string> = {
  none: 'text-slate-400', low: 'text-green-400', medium: 'text-cyan-400', high: 'text-rose-400', critical: 'text-red-400',
}
const EVIDENCE_COLORS: Record<string, string> = {
  positive: 'text-green-400', negative: 'text-rose-400', neutral: 'text-slate-300', info: 'text-cyan-400',
}
const SOURCE_DOT: Record<string, string> = {
  used: 'bg-green-400', no_data: 'bg-slate-500', not_configured: 'bg-slate-600', error: 'bg-red-400',
}

export default function CrossStackAssessment({ assessment, enrichment }: { assessment: SocAssessment; enrichment: EnrichmentBundle | null }) {
  const meta = CLASSIFICATION_META[assessment.classification] || { label: assessment.classification, text: 'text-slate-300', bg: 'bg-slate-500/10 border-slate-500/30' }
  const isFalsePositive = assessment.classification === 'likely_false_positive' || assessment.classification === 'confirmed_false_positive'

  return (
    <div className="space-y-6">
      {/* Executive Summary */}
      <Section title="Executive Summary">
        <div className="p-4 space-y-3">
          <p className="text-sm text-slate-200 whitespace-pre-wrap">{assessment.executiveSummary}</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${meta.bg} ${meta.text}`}>{meta.label}</span>
            {typeof assessment.confidence === 'number' && (
              <span className="text-xs text-slate-400">{Math.round(assessment.confidence * 100)}% confidence</span>
            )}
            {assessment.riskLevel && (
              <span className={`text-xs font-medium ${RISK_COLORS[assessment.riskLevel] || 'text-slate-400'}`}>Risk: {assessment.riskLevel.toUpperCase()}</span>
            )}
          </div>
        </div>
      </Section>

      {/* Final Recommendation */}
      <div className={`border rounded-lg p-5 ${meta.bg}`}>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Final Recommendation</h3>
        <p className="text-base text-white font-medium whitespace-pre-wrap">{assessment.finalRecommendation}</p>
        {isFalsePositive && (
          <p className="text-sm text-green-300 mt-2">No customer notification recommended. Add internal note and close after technician review.</p>
        )}
      </div>

      {/* Known Benign Match */}
      {(assessment.knownBenignMatch?.matched || (enrichment?.knownBenignMatches?.length ?? 0) > 0) && (
        <Section title="Known Benign Match">
          <div className="p-4 space-y-2">
            {assessment.knownBenignMatch?.reason && <p className="text-sm text-green-300">{assessment.knownBenignMatch.reason}</p>}
            {(enrichment?.knownBenignMatches || []).map(m => (
              <div key={m.id} className="bg-black/30 rounded-lg p-3 text-sm">
                <span className="text-white font-medium">{m.vendor} {m.product}</span>
                {m.executablePath && <span className="text-slate-400 font-mono"> · {m.executablePath}</span>}
                <div className="text-xs text-slate-500 mt-1">Matched on {m.matchedOn} · scope {m.scope}{m.recommendedHandling ? ` · recommended: ${m.recommendedHandling}` : ''}</div>
              </div>
            ))}
            <p className="text-[11px] text-slate-600">Informational only — known-benign matches inform the recommendation; nothing is auto-suppressed or auto-closed.</p>
          </div>
        </Section>
      )}

      {/* Evidence Collected */}
      {assessment.evidence?.length > 0 && (
        <Section title="Evidence Collected" count={assessment.evidence.length}>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {assessment.evidence.map((e, i) => (
              <div key={i} className="bg-black/30 rounded-lg p-3">
                <p className="text-xs text-slate-500">{e.label}</p>
                <p className={`text-sm break-words ${EVIDENCE_COLORS[e.type] || 'text-slate-300'}`}>{e.value}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* RocketCyber Detection Detail */}
      {enrichment?.rocketCyber && (
        <Section title="RocketCyber Detection Detail" subtitle="Pulled directly from the RocketCyber API — the data behind the portal's Details button">
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <DetailField label="Threat" value={enrichment.rocketCyber.threatName} />
            <DetailField label="Threat Type" value={enrichment.rocketCyber.threatType} />
            <DetailField label="Severity" value={enrichment.rocketCyber.severity} />
            <DetailField label="Action Taken" value={enrichment.rocketCyber.actionTaken} />
            <DetailField label="Device" value={enrichment.rocketCyber.device} />
            <DetailField label="User Context" value={enrichment.rocketCyber.userContext} />
            <DetailField label="Process" value={enrichment.rocketCyber.process} mono />
            <DetailField label="Path" value={enrichment.rocketCyber.path} mono />
            <DetailField label="Hash" value={enrichment.rocketCyber.hash} mono />
            <DetailField label="Event Time" value={enrichment.rocketCyber.eventTime} />
            <DetailField label="Target Command Line" value={enrichment.rocketCyber.targetCommandLine} mono wide />
            <DetailField label="Parent Command Line" value={enrichment.rocketCyber.parentCommandLine} mono wide />
            <DetailField label="Detection Message" value={enrichment.rocketCyber.detectionMessage} wide />
          </div>
          {/* Raw payload — what our API call actually received. Expand and share
              this if fields above are empty so we can map the real structure. */}
          {(enrichment.rocketCyber.rawIncident != null || (enrichment.rocketCyber.rawEvents?.length ?? 0) > 0) && (
            <details className="px-4 pb-4">
              <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300">Raw RocketCyber API payload (debug)</summary>
              <pre className="text-[11px] text-slate-400 whitespace-pre-wrap font-mono bg-black/40 p-3 rounded mt-2 max-h-[360px] overflow-y-auto">
{JSON.stringify({ incident: enrichment.rocketCyber.rawIncident, events: enrichment.rocketCyber.rawEvents }, null, 2)}
              </pre>
            </details>
          )}
        </Section>
      )}

      {/* Device Health */}
      {enrichment?.deviceHealth && (
        <Section title="Device Health (Datto RMM)">
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <DetailField label="Device" value={enrichment.deviceHealth.hostname} />
            <DetailField label="Online" value={enrichment.deviceHealth.online === null ? null : (enrichment.deviceHealth.online ? 'Yes' : 'No')} />
            <DetailField label="Operating System" value={enrichment.deviceHealth.operatingSystem} />
            <DetailField label="Last User" value={enrichment.deviceHealth.lastUser} />
            <DetailField label="Reboot Required" value={enrichment.deviceHealth.rebootRequired === null ? null : (enrichment.deviceHealth.rebootRequired ? 'Yes' : 'No')} />
            <DetailField label="Patch Status" value={enrichment.deviceHealth.patchStatus} />
            <DetailField label="Pending Patches" value={enrichment.deviceHealth.patchesApprovedPending != null ? String(enrichment.deviceHealth.patchesApprovedPending) : null} />
            <DetailField label="Antivirus" value={[enrichment.deviceHealth.antivirusProduct, enrichment.deviceHealth.antivirusStatus].filter(Boolean).join(' · ') || null} />
            <DetailField label="Site" value={enrichment.deviceHealth.siteName} />
            <DetailField label="Last Seen" value={enrichment.deviceHealth.lastSeen ? new Date(enrichment.deviceHealth.lastSeen).toLocaleString() : null} />
            {enrichment.deviceHealth.recentSoftware.length > 0 && (
              <DetailField label="Recent Software" value={enrichment.deviceHealth.recentSoftware.map(s => `${s.name} ${s.version}`.trim()).join('; ')} wide />
            )}
          </div>
        </Section>
      )}

      {/* Correlated Data Sources */}
      <Section title="Correlated Data Sources" count={(assessment.correlatedSources || []).length}>
        <div className="p-4 space-y-2">
          {(assessment.correlatedSources || []).map((s, i) => (
            <div key={i} className="flex items-start gap-3 text-sm">
              <span className={`mt-1.5 inline-block w-2 h-2 rounded-full flex-shrink-0 ${SOURCE_DOT[s.status] || 'bg-slate-500'}`} />
              <div className="min-w-0">
                <span className="text-white font-medium">{s.source}</span>
                <span className="text-xs text-slate-500 ml-2 uppercase">{s.status.replace(/_/g, ' ')}</span>
                <p className="text-xs text-slate-400">{s.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Customer Impact */}
      {assessment.customerImpact && (
        <Section title="Customer Impact">
          <div className="p-4"><p className="text-sm text-slate-300 whitespace-pre-wrap">{assessment.customerImpact}</p></div>
        </Section>
      )}

      {/* Recommended Technician Actions */}
      {assessment.recommendedTechnicianActions?.length > 0 && (
        <Section title="Recommended Technician Actions">
          <ol className="p-4 space-y-2">
            {assessment.recommendedTechnicianActions.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-medium flex items-center justify-center mt-0.5">{i + 1}</span>
                <span className="text-sm text-slate-300">{step}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Data Gaps */}
      {assessment.dataGaps?.length > 0 && (
        <Section title="Data Gaps" subtitle="What the analyst could not determine, and why">
          <ul className="p-4 space-y-1.5">
            {assessment.dataGaps.map((g, i) => (
              <li key={i} className="text-sm text-slate-400 flex items-start gap-2"><span className="text-slate-600 mt-0.5">•</span><span>{g}</span></li>
            ))}
          </ul>
        </Section>
      )}

      {/* Internal Note Preview */}
      <Section title="Internal Note Preview" subtitle="Self-contained note for technicians — auto-posted to Autotask as Internal Only">
        <div className="p-4">
          <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono bg-black/30 p-4 rounded-lg max-h-[420px] overflow-y-auto">{assessment.internalNote}</pre>
        </div>
      </Section>

      {/* Customer Message Preview */}
      {assessment.customerMessageRequired && assessment.customerMessageDraft ? (
        <Section title="Customer Message Preview" subtitle="Copy/paste to inform the customer — sending stays technician-approved">
          <div className="p-4">
            <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono bg-black/30 p-4 rounded-lg border border-violet-500/20">{assessment.customerMessageDraft}</pre>
          </div>
        </Section>
      ) : (
        <Section title="Customer Message Preview">
          <div className="p-4 text-sm text-slate-400">No customer message recommended for this incident.</div>
        </Section>
      )}
    </div>
  )
}

function Section({ title, subtitle, count, children }: { title: string; subtitle?: string; count?: number; children: React.ReactNode }) {
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

function DetailField({ label, value, mono, wide }: { label: string; value: string | null; mono?: boolean; wide?: boolean }) {
  if (!value) return null
  return (
    <div className={`bg-black/30 rounded-lg p-3 ${wide ? 'sm:col-span-2' : ''}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-sm text-slate-200 break-words ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
    </div>
  )
}
