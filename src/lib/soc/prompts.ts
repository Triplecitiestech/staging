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
 * Build the incident action plan prompt.
 * Generates a full operational plan: merge recommendation, proposed Autotask actions,
 * human guidance, and supporting reasoning.
 * Used for correlated incident groups and single suspicious tickets.
 */
export function buildActionPlanPrompt(
  tickets: SecurityTicket[],
  correlationReason: string,
  verdict: string,
  confidence: number,
  aiReasoning: string,
  deviceVerification: DeviceVerification | null,
): string {
  const ticketDetails = tickets.map((t, i) =>
    `  ${i + 1}. [${t.ticketNumber}] "${t.title}"
     - Company: ${t.companyName || t.companyId || 'Unknown'}
     - Status: ${t.statusLabel || t.status} | Priority: ${t.priorityLabel || t.priority}
     - Queue: ${t.queueLabel || 'Unknown'} | Source: ${t.sourceLabel || 'Unknown'}
     - Created: ${t.createDate}
     - Description: ${t.description?.slice(0, 300) || '(no description)'}`
  ).join('\n');

  const primaryTicket = tickets[0];
  const isMultiTicket = tickets.length > 1;

  const deviceSummary = deviceVerification
    ? deviceVerification.verified
      ? `VERIFIED TECHNICIAN DEVICE:\n  Device: ${deviceVerification.device?.hostname}\n  Technician: ${deviceVerification.technician}\n  IP: ${deviceVerification.device?.extIpAddress}`
      : `DEVICE NOT VERIFIED: ${deviceVerification.reason || 'No matching device'}`
    : 'No IP extracted — device lookup skipped';

  return `You are a Tier 1 SOC Analyst for Triple Cities Tech, a managed IT services provider.
You have already triaged this incident and determined:
  Verdict: ${verdict} (Confidence: ${Math.round(confidence * 100)}%)
  Reasoning: ${aiReasoning}

Now generate a COMPLETE operational action plan for this incident.

TICKETS (${tickets.length}):
${ticketDetails}

CORRELATION: ${correlationReason}
DEVICE VERIFICATION: ${deviceSummary}

${isMultiTicket ? `MERGE ANALYSIS REQUIRED:
These ${tickets.length} tickets appear related. Evaluate whether they should be merged in Autotask.
If merging, select the most descriptive ticket as the surviving ticket.
Generate a merged title that captures the full scope of the incident.` : `SINGLE TICKET ANALYSIS:
Generate the action plan for this individual ticket.`}

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "incidentSummary": "2-4 sentence operational summary of the entire incident",
  "proposedActions": {
    "merge": ${isMultiTicket ? `{
      "shouldMerge": true or false,
      "survivingTicketId": "the autotaskTicketId of the ticket to keep",
      "survivingTicketNumber": "the ticket number to keep",
      "mergeTicketIds": ["autotaskTicketIds to merge into surviving"],
      "mergeTicketNumbers": ["ticket numbers to merge"],
      "proposedTitle": "Combined incident title for the surviving ticket",
      "mergeReasoning": "Why merge is or is not appropriate"
    }` : 'null'},
    "internalNote": "The exact internal note to add to the ${isMultiTicket ? 'surviving' : ''} Autotask ticket. Include: incident summary, evidence, analysis, verdict, and confidence.",
    "statusChange": { "from": "${primaryTicket.statusLabel || 'current'}", "to": "recommended new status" } or null,
    "priorityChange": { "from": "${primaryTicket.priorityLabel || 'current'}", "to": "recommended priority" } or null,
    "queueChange": { "from": "${primaryTicket.queueLabel || 'current'}", "to": "recommended queue" } or null,
    "escalation": {
      "recommended": true or false,
      "targetQueue": "queue name if escalating" or null,
      "targetResource": "person or team name" or null,
      "urgency": "routine" or "urgent" or "critical",
      "reason": "why escalation is or is not needed"
    }
  },
  "humanGuidance": {
    "summary": "1-2 sentence summary for the human reviewer",
    "steps": [
      "Step 1: specific action the technician should take",
      "Step 2: another specific action",
      "... (provide 4-8 concrete next steps)"
    ],
    "draftCustomerMessage": "Draft message to send to the customer if contact is needed, or null if not needed",
    "riskLevel": "none" or "low" or "medium" or "high" or "critical"
  },
  "supportingReasoning": "Detailed explanation of why this action plan was chosen, including evidence from each ticket"
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
