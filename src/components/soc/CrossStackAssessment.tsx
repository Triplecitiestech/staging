'use client'

import { useState } from 'react'

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
  tenantRootCause?: string | null
  internalNote: string
  closureNote?: string
  customerMessageRequired: boolean
  customerMessageDraft: string | null
}

export interface AssessmentSignals {
  timing: { eventTimeUtc: string | null; eventTimeLocal: string | null; timezone: string; afterHours: boolean | null; weekend: boolean | null }
  geo: {
    ipReputationChecked: boolean; reputationVerdict: string | null
    alertIp: string | null; alertLocation: string | null
    onKnownCompanyNetwork: boolean; locationsSeenNearby: string[]
    baseline: 'matched_known_network' | 'no_baseline_match' | 'unknown'
  }
  recurrence: { similarAlertCount: number; windowDays: number; priorBenignCount: number; recurringPattern: boolean }
  corroboration: { sourcesUsed: string[]; contextSources?: string[]; corroboratingTelemetry: boolean; confidenceCeiling: number | null }
  identityChange: boolean
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
  companyNetworkMatch: { ip: string; deviceCount: number; hostnames: string[] } | null
  edr: {
    detectionCount: number; suspiciousCount: number; unclassifiedCount: number; deviceScoped: boolean
    byDevice: Array<{ hostname: string; total: number; suspicious: number }>
    detections: Array<{ name: string; path: string | null; hash: string | null; threatName: string; threatScore: number | null; timestamp: string; hostname: string | null; status: string; commandLine?: string | null; parentProcessName?: string | null; owner?: string | null; ruleName?: string | null; mitreId?: string | null; severity?: string | null }>
    rawDetections?: unknown[]
  } | null
  dns: {
    orgName: string | null; totalBlocked: number; totalThreats: number; deviceScoped: boolean
    topBlockedDomains: Array<{ domain: string; count: number }>
    samples: Array<{ time: string; fqdn: string; result: string; threat: boolean; categories: string; device: string | null; requesterIp: string | null }>
  } | null
  saasAlerts: { eventCount: number; events: Array<{ type: string; severity: string; description: string; time: string; user: string | null; ip?: string | null; location?: string | null }> } | null
  m365Identity?: M365IdentityCorrelation | null
  knownBenignMatches: KnownBenignMatch[]
  dataSources: DataSourceStatus[]
  dataGaps: string[]
  signals?: AssessmentSignals | null
  visibility?: VisibilityEntry[]
  events?: AttributedEvent[]
  changeWindows?: Array<{ id: string; label: string; what: string; startUtc: string; endUtc: string; deviceCount: number; alertCount: number; verification: string }>
  changeContext?: Array<{ label: string }>
  ipClassifications?: Array<{ ip: string; class: string; label: string }>
  profile?: { coManaged: boolean; coManagedBasis: string; itLeadContactId: number | null; securityContactId: number | null; timezone: string; timezoneBasis: string }
  contextSummaries?: string[]
}

export interface VisibilityEntry {
  source: string
  state: 'connected' | 'unverified_mapping' | 'not_connected' | 'permission_blocked' | 'unreachable' | 'not_configured' | 'not_queried'
  mappedTo: string | null
  detail: string
}

export interface AttributedEvent {
  key: string
  source: string
  sourceRecordId: string | null
  deviceHostname: string | null
  user: string | null
  ioc: string | null
  timestampUtc: string | null
  siteLocalTime: string | null
  summary: string
  disposition: 'alert' | 'corroboration' | 'context' | 'tct_change' | 'data_gap'
  reason: string
  verification: string | null
}

export interface M365IdentityCorrelation {
  userPrincipalName: string | null
  auditEvents: Array<{ activity: string; time: string; initiatedBy: string; result: string; targetUser: string | null }>
  removeThenReregister: boolean
  signIns: Array<{ time: string; ip: string | null; location: string | null; device: string | null; status: string; conditionalAccess: string | null }>
  remainingMethods: Array<{ type: string; detail: string | null }>
  hasStrongMethodRemaining: boolean
  permissionGaps: string[]
}

/** True when a parsed reasoning blob is the new cross-stack assessment shape. */
export function isCrossStackAssessment(r: unknown): r is SocAssessment {
  if (!r || typeof r !== 'object') return false
  const o = r as Record<string, unknown>
  // Any of the new-shape-only fields is a definitive match.
  if ('executiveSummary' in o || 'finalRecommendation' in o || 'correlatedSources' in o || 'recommendedTechnicianActions' in o) return true
  // Fall back to the classification value: the new buckets are distinct from the legacy ones.
  const NEW_CLASSIFICATIONS = ['confirmed_malicious', 'suspicious_review', 'likely_false_positive', 'confirmed_false_positive', 'insufficient_data']
  return typeof o.classification === 'string' && NEW_CLASSIFICATIONS.includes(o.classification)
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
      {/* Visibility map — what each source could actually see for THIS client. Shown first. */}
      {enrichment?.visibility && enrichment.visibility.length > 0 && <VisibilityMap entries={enrichment.visibility} profile={enrichment.profile} />}

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

      {/* Signal Breakdown — the independent axes, never collapsed into one verdict */}
      {enrichment?.signals && <SignalBreakdown signals={enrichment.signals} />}

      {/* Attributed evidence: the alert, corroboration, context, TCT changes, gaps */}
      {enrichment?.events && enrichment.events.length > 0 && <EvidenceTimeline events={enrichment.events} contextSummaries={enrichment.contextSummaries ?? []} />}

      {/* TCT-initiated change windows */}
      {enrichment?.changeWindows && (enrichment.changeWindows.length > 0 || (enrichment.changeContext?.length ?? 0) > 0) && (
        <Section title="TCT-Initiated Changes" subtitle="Fleet-wide patterns in Datto RMM — events inside these windows are excluded from corroboration">
          <div className="p-4 space-y-2">
            {enrichment.changeWindows.map(w => (
              <div key={w.id} className="bg-black/30 rounded-lg p-3 text-sm">
                <p className="text-cyan-300 break-words">{w.what}</p>
                <p className="text-xs text-slate-400 mt-1">{w.startUtc.replace('.000Z', 'Z')} – {w.endUtc.replace('.000Z', 'Z')} · {w.alertCount} alerts on {w.deviceCount} devices</p>
                <p className="text-xs text-slate-500 mt-1">Verify: {w.verification}</p>
              </div>
            ))}
            {(enrichment.changeContext ?? []).map((c, i) => (
              <p key={i} className="text-xs text-slate-400 break-words">{c.label}</p>
            ))}
          </div>
        </Section>
      )}

      {/* IP addresses in the evidence, classified */}
      {enrichment?.ipClassifications && enrichment.ipClassifications.length > 0 && (
        <Section title="IP Addresses" subtitle="Internal addresses and the client's own egress are not anomalies">
          <div className="p-4 space-y-1.5">
            {enrichment.ipClassifications.map(ip => (
              <div key={ip.ip} className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3 text-sm">
                <span className="font-mono text-slate-200">{ip.ip}</span>
                <span className={`sm:col-span-2 break-words ${ip.class === 'external_unknown' ? 'text-rose-300' : 'text-slate-400'}`}>{ip.label}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

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

      {/* Source Network (Datto RMM IP match) */}
      {enrichment?.companyNetworkMatch && (
        <Section title="Source Network (Datto RMM)" subtitle="The alert's source IP matched to the company's known managed devices">
          <div className="p-4 text-sm text-green-300">
            IP {enrichment.companyNetworkMatch.ip} belongs to this company&apos;s known network — {enrichment.companyNetworkMatch.deviceCount} managed device(s) behind it
            {enrichment.companyNetworkMatch.hostnames.length > 0 && (
              <span className="text-slate-400"> (e.g. {enrichment.companyNetworkMatch.hostnames.slice(0, 6).join(', ')})</span>
            )}. Activity originated from a known company location.
          </div>
        </Section>
      )}

      {/* Datto EDR Detections */}
      {enrichment?.edr && enrichment.edr.detectionCount > 0 && (
        <Section title="Datto EDR Detections" subtitle={enrichment.edr.deviceScoped ? 'Scoped to the affected device' : 'Org-wide — not confirmed related to this alert'}>
          <div className="p-4 space-y-3">
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="text-slate-300">{enrichment.edr.detectionCount} total</span>
              <span className={enrichment.edr.suspiciousCount > 0 ? 'text-rose-400' : 'text-slate-400'}>{enrichment.edr.suspiciousCount} suspicious/bad</span>
              <span className="text-slate-500">{enrichment.edr.unclassifiedCount} unclassified/unknown</span>
            </div>
            {!enrichment.edr.deviceScoped && enrichment.edr.byDevice.length > 0 && (
              <div className="text-xs text-slate-500">
                Per-device: {enrichment.edr.byDevice.map(d => `${d.hostname}: ${d.total} (${d.suspicious} susp)`).join(' · ')}
              </div>
            )}
            <div className="space-y-1.5">
              {enrichment.edr.detections.slice(0, 12).map((d, i) => (
                <div key={i} className="bg-black/30 rounded p-2 text-xs">
                  <span className={d.threatName.toLowerCase() === 'bad' || d.threatName.toLowerCase() === 'suspicious' ? 'text-rose-400 font-medium' : 'text-slate-400'}>[{d.threatName}{d.threatScore != null ? ` ${d.threatScore}` : ''}]</span>
                  <span className="text-white ml-2">{d.name}</span>
                  {d.hostname && <span className="text-slate-500 ml-2">on {d.hostname}</span>}
                  {d.mitreId && <span className="text-slate-500 ml-2">{d.mitreId}</span>}
                  {d.path && <div className="text-slate-500 font-mono break-all mt-0.5">{d.path}</div>}
                  {d.commandLine && <div className="text-slate-500 font-mono break-all mt-0.5">cmd: {d.commandLine}</div>}
                  {(d.parentProcessName || d.owner || d.ruleName) && (
                    <div className="text-slate-500 mt-0.5">
                      {d.parentProcessName && <span className="mr-3">parent: {d.parentProcessName}</span>}
                      {d.owner && <span className="mr-3">owner: {d.owner}</span>}
                      {d.ruleName && <span>rule: {d.ruleName}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {(enrichment.edr.rawDetections?.length ?? 0) > 0 && (
              <details>
                <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300">Raw Datto EDR detection payload (debug)</summary>
                <pre className="text-[11px] text-slate-400 whitespace-pre-wrap font-mono bg-black/40 p-3 rounded mt-2 max-h-[360px] overflow-y-auto">
{JSON.stringify(enrichment.edr.rawDetections, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </Section>
      )}

      {/* DNSFilter blocked/threat queries */}
      {enrichment?.dns && (enrichment.dns.totalBlocked > 0 || enrichment.dns.samples.length > 0) && (
        <Section title="DNSFilter Blocked Queries" subtitle={enrichment.dns.deviceScoped ? 'Some tied to the affected device' : 'Org-level — not tied to the specific device'}>
          <div className="p-4 space-y-3">
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="text-slate-300">{enrichment.dns.totalBlocked} blocked</span>
              <span className={enrichment.dns.totalThreats > 0 ? 'text-rose-400' : 'text-slate-400'}>{enrichment.dns.totalThreats} threats</span>
              {enrichment.dns.orgName && <span className="text-slate-500">org: {enrichment.dns.orgName}</span>}
            </div>
            {enrichment.dns.topBlockedDomains.length > 0 && (
              <div className="text-xs text-slate-500">Top blocked: {enrichment.dns.topBlockedDomains.map(d => `${d.domain} (${d.count})`).join(' · ')}</div>
            )}
            <div className="space-y-1.5">
              {enrichment.dns.samples.slice(0, 10).map((s, i) => (
                <div key={i} className="bg-black/30 rounded p-2 text-xs">
                  <span className={s.threat ? 'text-rose-400 font-medium' : 'text-slate-400'}>{s.threat ? 'THREAT' : 'blocked'}</span>
                  <span className="text-white ml-2 break-all">{s.fqdn}</span>
                  {s.categories && <span className="text-slate-500 ml-2">[{s.categories}]</span>}
                  {s.device && <span className="text-slate-500 ml-2">on {s.device}</span>}
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* M365 Tenant (Entra ID) — authoritative for identity/MFA-change alerts */}
      {enrichment?.m365Identity && (
        <Section title="M365 Tenant (Entra ID)" subtitle={`Authoritative — pulled from the customer's Microsoft 365 tenant${enrichment.m365Identity.userPrincipalName ? ` for ${enrichment.m365Identity.userPrincipalName}` : ''}`}>
          <div className="p-4 space-y-4 text-sm">
            {/* Audit log — confirms the change */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Audit Log</p>
              {enrichment.m365Identity.auditEvents.length > 0 ? (
                <div className="space-y-1.5">
                  {enrichment.m365Identity.auditEvents.slice(0, 8).map((e, i) => (
                    <div key={i} className="bg-black/30 rounded p-2 text-xs">
                      <span className="text-white">{e.activity}</span>
                      <span className="text-slate-500 ml-2">{e.time ? new Date(e.time).toLocaleString() : ''}</span>
                      <div className="text-slate-500 mt-0.5">by {e.initiatedBy} · result {e.result}{e.targetUser ? ` · target ${e.targetUser}` : ''}</div>
                    </div>
                  ))}
                  <p className={`text-xs ${enrichment.m365Identity.removeThenReregister ? 'text-cyan-400' : 'text-rose-400'}`}>
                    {enrichment.m365Identity.removeThenReregister
                      ? 'Remove-then-reregister detected — re-enrollment signature (e.g. new phone / device swap).'
                      : 'A method was removed without a re-registration in the window.'}
                  </p>
                </div>
              ) : (
                <p className="text-slate-400 text-xs">No matching security-info/MFA change found in the tenant audit log for this window.</p>
              )}
            </div>

            {/* Sign-ins */}
            {enrichment.m365Identity.signIns.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Sign-ins around the event</p>
                <div className="space-y-1.5">
                  {enrichment.m365Identity.signIns.slice(0, 6).map((s, i) => (
                    <div key={i} className="bg-black/30 rounded p-2 text-xs">
                      <span className={s.status.startsWith('success') ? 'text-green-400' : 'text-rose-400'}>{s.status}</span>
                      <span className="text-slate-400 ml-2 font-mono break-all">{s.ip || 'no IP'}</span>
                      {s.location && <span className="text-slate-500 ml-2">{s.location}</span>}
                      {s.device && <div className="text-slate-500 mt-0.5">{s.device}</div>}
                      <div className="text-slate-500 mt-0.5">Conditional Access: {s.conditionalAccess || 'n/a'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Remaining MFA methods */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Currently Registered MFA Methods</p>
              {enrichment.m365Identity.remainingMethods.length > 0 ? (
                <>
                  <p className="text-slate-200">{enrichment.m365Identity.remainingMethods.map(m => m.type).join(', ')}</p>
                  <p className={`text-xs mt-1 ${enrichment.m365Identity.hasStrongMethodRemaining ? 'text-green-400' : 'text-rose-400'}`}>
                    {enrichment.m365Identity.hasStrongMethodRemaining
                      ? 'A strong (non-password) factor is still registered.'
                      : 'No strong factor remaining — account may be left weakly protected.'}
                  </p>
                </>
              ) : (
                <p className="text-slate-400 text-xs">Not retrieved.</p>
              )}
            </div>

            {enrichment.m365Identity.permissionGaps.length > 0 && (
              <p className="text-xs text-rose-400">
                Partial read — could not access: {enrichment.m365Identity.permissionGaps.join('; ')}. Grant these Graph permissions in the customer&apos;s app registration.
              </p>
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
                {/* Strip any leading "N." / "N)" the model baked into the text —
                    the circle already numbers the step (was rendering "1. 11."). */}
                <span className="text-sm text-slate-300">{step.replace(/^\s*\d+[.)]\s*/, '')}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Tenant Root Cause — why this keeps recurring, what to check in the tenant */}
      {assessment.tenantRootCause && (
        <Section title="Tenant Root Cause" subtitle="Recurring pattern detected — what to investigate in this tenant">
          <div className="p-4">
            <p className="text-sm text-slate-200 whitespace-pre-wrap">{assessment.tenantRootCause}</p>
          </div>
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

      {/* Ticket Closure Note — short copy/paste resolution */}
      {assessment.closureNote && (
        <Section title="Ticket Closure Note" subtitle="Copy/paste this to resolve/close the ticket">
          <div className="p-4">
            <CopyBlock text={assessment.closureNote} />
          </div>
        </Section>
      )}

      {/* Internal Note Preview */}
      <Section title="Internal Note Preview" subtitle="Self-contained note for technicians — auto-posted to Autotask as Internal Only">
        <div className="p-4">
          <CopyBlock text={assessment.internalNote} mono />
        </div>
      </Section>

      {/* Customer Message Preview */}
      {assessment.customerMessageRequired && assessment.customerMessageDraft ? (
        <Section title="Customer Message" subtitle="Sent automatically through the Autotask ticket, once per incident, when the result is Suspicious or Confirmed Malicious (SOC_AUTO_CUSTOMER_NOTIFY). The internal note records whether it was sent, to whom, and why not if it was not.">
          <div className="p-4">
            <CopyBlock text={assessment.customerMessageDraft} accent />
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

function CopyBlock({ text, mono, accent }: { text: string; mono?: boolean; accent?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }
  return (
    <div className="relative">
      <button
        onClick={copy}
        className="absolute top-2 right-2 px-2 py-1 text-[11px] font-medium bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors z-10">
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className={`text-sm text-slate-300 whitespace-pre-wrap bg-black/30 p-4 pr-16 rounded-lg max-h-[420px] overflow-y-auto ${mono ? 'font-mono text-xs' : ''} ${accent ? 'border border-violet-500/20' : ''}`}>{text}</pre>
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

type SignalTone = 'positive' | 'negative' | 'neutral' | 'info'

/**
 * Renders the independent signal axes so a technician sees reputation,
 * geolocation, timing, recurrence, and corroboration as SEPARATE readings —
 * never collapsed into a single "it's fine". Mirrors the AssessmentSignals the
 * engine computes deterministically.
 */
function SignalBreakdown({ signals }: { signals: AssessmentSignals }) {
  const { timing, geo, recurrence, corroboration, identityChange } = signals

  const reputation: { value: string; tone: SignalTone } = geo.ipReputationChecked
    ? { value: geo.reputationVerdict || 'Checked', tone: 'neutral' }
    : { value: 'Not checked — no reputation provider wired in', tone: 'info' }

  const source = geo.alertLocation || geo.alertIp || 'Source'
  const geoRow: { value: string; tone: SignalTone } = geo.baseline === 'matched_known_network'
    ? { value: `${source} — matches a known company location`, tone: 'positive' }
    : geo.baseline === 'no_baseline_match'
      ? { value: `${source} — not a known company location/network`, tone: 'negative' }
      : { value: geo.alertLocation || geo.alertIp || 'Unknown', tone: 'neutral' }

  const timingRow: { value: string; tone: SignalTone } = timing.afterHours === null
    ? { value: 'Unknown', tone: 'neutral' }
    : timing.afterHours
      ? { value: `${timing.eventTimeLocal} — outside business hours${timing.weekend ? ' (weekend)' : ''}`, tone: 'negative' }
      : { value: `${timing.eventTimeLocal} — within business hours`, tone: 'neutral' }

  const recurrenceRow: { value: string; tone: SignalTone } = recurrence.recurringPattern
    ? { value: `${recurrence.similarAlertCount} similar in ${recurrence.windowDays}d — recurring pattern (reduces novelty only; not a benign signal)`, tone: 'info' }
    : { value: `${recurrence.similarAlertCount} similar in ${recurrence.windowDays}d`, tone: 'neutral' }

  // Corroboration = an independent source reporting its own malicious/suspicious
  // signal about the same device, user or IOC. Device existence or "0 blocked
  // queries" is CONTEXT and is listed as such — never as "Corroborated by".
  const contextOnly = corroboration.contextSources && corroboration.contextSources.length > 0
    ? ` Context only (not corroboration): ${corroboration.contextSources.join(', ')}.`
    : ''
  const corroborationRow: { value: string; tone: SignalTone } = corroboration.corroboratingTelemetry && corroboration.sourcesUsed.length > 0
    ? { value: `Corroborated by: ${corroboration.sourcesUsed.join(', ')}${contextOnly}`, tone: 'negative' }
    : { value: `None — no independent source reported its own signal about this device, user or IOC${corroboration.confidenceCeiling != null ? ` (confidence held at ${Math.round(corroboration.confidenceCeiling * 100)}%)` : ''}.${contextOnly}`, tone: 'neutral' }

  const rows: Array<{ label: string; value: string; tone: SignalTone }> = [
    { label: 'IP Reputation', ...reputation },
    { label: 'Geolocation vs Baseline', ...geoRow },
    { label: 'Event Timing', ...timingRow },
    { label: 'Recurrence / Novelty', ...recurrenceRow },
    { label: 'Corroboration', ...corroborationRow },
  ]

  return (
    <Section title="Signal Breakdown" subtitle="Each axis evaluated independently — reputation, location, timing, recurrence, and corroboration are different questions">
      <div className="p-4 space-y-2">
        {identityChange && (
          <div className="text-xs text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded px-3 py-2 mb-1">
            Identity / MFA change — default is to confirm with the user before closing unless there is positive benign evidence.
          </div>
        )}
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3 bg-black/30 rounded-lg p-3">
            <p className="text-xs text-slate-500 sm:col-span-1">{r.label}</p>
            <p className={`text-sm break-words sm:col-span-2 ${EVIDENCE_COLORS[r.tone] || 'text-slate-300'}`}>{r.value}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

const VIS_TONE: Record<VisibilityEntry['state'], string> = {
  connected: 'text-green-400',
  unverified_mapping: 'text-cyan-300',
  not_connected: 'text-rose-300',
  permission_blocked: 'text-rose-300',
  unreachable: 'text-rose-300',
  not_configured: 'text-rose-300',
  not_queried: 'text-slate-500',
}
const VIS_LABEL: Record<VisibilityEntry['state'], string> = {
  connected: 'Connected',
  unverified_mapping: 'Name match only — unknown',
  not_connected: 'Not connected for this client — unknown',
  permission_blocked: 'Permission-blocked — unknown',
  unreachable: 'Lookup failed — unknown',
  not_configured: 'Not configured — unknown',
  not_queried: 'Not queried for this alert type',
}

/** What each source could see for this client. Anything not connected is unknown — never clean. */
function VisibilityMap({ entries, profile }: { entries: VisibilityEntry[]; profile?: EnrichmentBundle['profile'] }) {
  return (
    <Section title="Visibility for This Client" subtitle="A source that is not connected is UNKNOWN — it never counts as clean and never moves confidence">
      <div className="p-4 space-y-2">
        {entries.map(e => (
          <div key={e.source} className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3 bg-black/30 rounded-lg p-3">
            <p className="text-sm text-white">{e.source}</p>
            <div className="sm:col-span-2 min-w-0">
              <p className={`text-sm ${VIS_TONE[e.state] || 'text-slate-300'}`}>{VIS_LABEL[e.state] || e.state}</p>
              {(e.mappedTo || e.detail) && <p className="text-xs text-slate-500 break-words">{[e.mappedTo, e.detail].filter(Boolean).join(' · ')}</p>}
            </div>
          </div>
        ))}
        {profile && (
          <p className="text-xs text-slate-400 break-words">
            Co-managed: <span className="text-slate-200">{profile.coManaged ? 'yes' : 'no'}</span> ({profile.coManagedBasis})
            {profile.coManaged ? ` · customer updates go to the IT lead${profile.itLeadContactId ? ` (contact ${profile.itLeadContactId})` : ' — not configured'}` : ''}
            {` · time zone ${profile.timezone}`}
          </p>
        )}
      </div>
    </Section>
  )
}

const DISPOSITION_META: Record<AttributedEvent['disposition'], { title: string; tone: string }> = {
  alert: { title: 'The alert', tone: 'text-rose-300' },
  corroboration: { title: 'Corroboration — independent sources, same device/user/IOC', tone: 'text-red-400' },
  tct_change: { title: 'Inside a TCT-initiated change window (excluded)', tone: 'text-cyan-300' },
  context: { title: 'Context — does not raise or lower confidence', tone: 'text-slate-300' },
  data_gap: { title: 'Unattributed — listed, never counted', tone: 'text-slate-500' },
}

function EvidenceTimeline({ events, contextSummaries }: { events: AttributedEvent[]; contextSummaries: string[] }) {
  const order: AttributedEvent['disposition'][] = ['alert', 'corroboration', 'tct_change', 'context', 'data_gap']
  return (
    <Section title="Attributed Evidence" count={events.length} subtitle="Every event carries device, UTC time (site local time), source system and source record id">
      <div className="p-4 space-y-4">
        {order.map(d => {
          const list = events.filter(e => e.disposition === d)
          const extra = d === 'context' ? contextSummaries : []
          if (list.length === 0 && extra.length === 0 && d !== 'corroboration') return null
          return (
            <div key={d}>
              <p className={`text-xs font-medium mb-1.5 ${DISPOSITION_META[d].tone}`}>{DISPOSITION_META[d].title}</p>
              {list.length === 0 && extra.length === 0 && <p className="text-xs text-slate-500">None.</p>}
              <div className="space-y-1.5">
                {list.map(e => (
                  <div key={e.key} className="bg-black/30 rounded p-2 text-xs">
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      <span className="text-white">{e.deviceHostname || e.user || e.ioc || 'no device'}</span>
                      <span className="text-slate-400">{e.timestampUtc ? e.timestampUtc.replace('.000Z', 'Z') : 'time unknown'}</span>
                      {e.siteLocalTime && <span className="text-slate-500">{e.siteLocalTime}</span>}
                      <span className="text-slate-400">{e.source}{e.sourceRecordId ? ` #${e.sourceRecordId}` : ' (no record id)'}</span>
                    </div>
                    <p className="text-slate-300 mt-0.5 break-words">{e.summary}</p>
                    <p className="text-slate-500 mt-0.5 break-words">{e.reason}{e.verification ? ` Verify: ${e.verification}` : ''}</p>
                  </div>
                ))}
                {extra.map((c, i) => <p key={i} className="text-xs text-slate-400 break-words">{c}</p>)}
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}
