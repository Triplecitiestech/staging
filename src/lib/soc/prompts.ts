/**
 * SOC Analyst Agent — AI Prompt Templates
 */

import type { SecurityTicket, DeviceVerification, SocRule } from './types';

/**
 * Build the Tier 1 screening prompt (Haiku — fast, cheap).
 * Classifies the ticket, extracts IPs, determines if deep analysis is needed.
 */
export function buildScreeningPrompt(
  ticket: SecurityTicket,
  recentTickets: SecurityTicket[],
  activeRules: SocRule[],
  deviceVerification: DeviceVerification | null,
): string {
  const recentSummary = recentTickets.length > 0
    ? recentTickets.map(t =>
      `  - [${t.ticketNumber}] ${t.title} (${t.createDate})`
    ).join('\n')
    : '  (none)';

  const rulesSummary = activeRules.length > 0
    ? activeRules.map(r =>
      `  - ${r.name}: ${r.description || 'No description'} [${r.action}]`
    ).join('\n')
    : '  (none configured)';

  const deviceSummary = deviceVerification
    ? deviceVerification.verified
      ? `  VERIFIED: Device "${deviceVerification.device?.hostname}" assigned to technician ${deviceVerification.technician}. Site: ${deviceVerification.device?.siteName}. Last seen: ${deviceVerification.device?.lastSeen}`
      : `  NOT VERIFIED: ${deviceVerification.reason || 'No matching device found'}`
    : '  (no IP extracted — skipped device lookup)';

  return `You are a SOC Analyst for Triple Cities Tech, a managed IT services provider.
Analyze this security alert ticket and classify it.

TICKET:
  Number: ${ticket.ticketNumber}
  Title: ${ticket.title}
  Description: ${ticket.description || '(empty)'}
  Company: ${ticket.companyName || ticket.companyId || 'Unknown'}
  Source: ${ticket.sourceLabel || 'Unknown'}
  Queue: ${ticket.queueLabel || 'Unknown'}
  Created: ${ticket.createDate}
  Priority: ${ticket.priorityLabel}

RECENT TICKETS FROM SAME COMPANY (last 30 min):
${recentSummary}

KNOWN SUPPRESSION RULES:
${rulesSummary}

TECHNICIAN DEVICE DATA:
${deviceSummary}

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "alertSource": "saas_alerts" or "datto_edr" or "rocketcyber" or "other",
  "category": "technician_login" or "onboarding" or "software_install" or "network_anomaly" or "credential_alert" or "malware" or "phishing" or "windows_update" or "unknown",
  "extractedIps": ["x.x.x.x"],
  "isFalsePositive": true or false,
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation in 1-2 sentences",
  "needsDeepAnalysis": true or false,
  "recommendedAction": "close" or "merge" or "investigate" or "escalate",
  "relatedTicketNumbers": []
}`;
}

/**
 * Build the Tier 2 deep analysis prompt (Sonnet — more capable).
 * Used for ambiguous cases or multi-ticket incident correlation.
 */
export function buildDeepAnalysisPrompt(
  tickets: SecurityTicket[],
  correlationReason: string,
  deviceVerification: DeviceVerification | null,
  historicalFpRate: number | null,
  similarFpCount: number,
): string {
  const ticketDetails = tickets.map((t, i) =>
    `  ${i + 1}. [${t.ticketNumber}] "${t.title}" — ${t.description?.slice(0, 200) || '(no description)'} (Priority: ${t.priorityLabel}, Source: ${t.sourceLabel || 'Unknown'}, Created: ${t.createDate})`
  ).join('\n');

  const timeline = tickets
    .sort((a, b) => new Date(a.createDate).getTime() - new Date(b.createDate).getTime())
    .map(t => `  ${t.createDate} — [${t.ticketNumber}] ${t.title}`)
    .join('\n');

  const deviceSummary = deviceVerification
    ? deviceVerification.verified
      ? `VERIFIED TECHNICIAN DEVICE:\n  Device: ${deviceVerification.device?.hostname}\n  Technician: ${deviceVerification.technician}\n  Site: ${deviceVerification.device?.siteName}\n  IP: ${deviceVerification.device?.extIpAddress}\n  Last Seen: ${deviceVerification.device?.lastSeen}`
      : `DEVICE NOT VERIFIED: ${deviceVerification.reason || 'No matching device'}`
    : 'No IP extracted — device lookup skipped';

  return `You are a senior SOC Analyst for Triple Cities Tech MSP.
Perform deep analysis on this security incident group.

INCIDENT GROUP (${tickets.length} related tickets):
${ticketDetails}

TIMELINE:
${timeline}

CORRELATION REASON: ${correlationReason}

DEVICE VERIFICATION:
${deviceSummary}

HISTORICAL PATTERNS:
  This company's false positive rate: ${historicalFpRate !== null ? `${historicalFpRate}%` : 'Unknown'}
  Similar alerts resolved as FP in past 30 days: ${similarFpCount}

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "verdict": "false_positive" or "suspicious" or "escalate",
  "confidence": 0.0 to 1.0,
  "summary": "2-3 sentence incident summary",
  "reasoning": "Detailed step-by-step reasoning",
  "ticketNote": "Formatted note to add to the primary Autotask ticket (will be posted as internal note)",
  "recommendedAction": "close" or "merge_and_close" or "investigate" or "escalate_to_human",
  "mergeInto": null or "ticket number to merge into",
  "riskLevel": "none" or "low" or "medium" or "high" or "critical"
}`;
}

/**
 * Format the internal Autotask ticket note added by the SOC agent.
 */
export function formatTicketNote(
  verdict: string,
  confidence: number,
  category: string,
  action: string,
  reasoning: string,
  relatedTickets: string[],
  deviceInfo?: { hostname: string; technician: string; ip: string; lastSeen: string },
): string {
  const pct = Math.round(confidence * 100);
  const verdictLabel = verdict.toUpperCase().replace('_', ' ');
  const actionLabel = action.toUpperCase().replace('_', ' ');
  const categoryLabel = category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  let note = `═══ SOC AI Triage ═══\nVerdict: ${verdictLabel} (Confidence: ${pct}%)\nCategory: ${categoryLabel}\nRecommended Action: ${actionLabel}\n\nAnalysis:\n${reasoning}`;

  if (deviceInfo) {
    note += `\n\nDevice Verification:\n  Device: ${deviceInfo.hostname}\n  Technician: ${deviceInfo.technician}\n  IP: ${deviceInfo.ip}\n  Last Seen: ${deviceInfo.lastSeen}`;
  }

  if (relatedTickets.length > 0) {
    note += `\n\nRelated Alerts: ${relatedTickets.join(', ')}`;
  }

  note += '\n═══ End SOC Analysis ═══';
  return note;
}
