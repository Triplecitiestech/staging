/**
 * SOC Analyst Agent — AI Prompt Templates
 */

import type { SecurityTicket, DeviceVerification, SocRule, EnrichmentBundle } from './types';

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

  return `You are a senior SOC Analyst for Triple Cities Tech (TCT) MSP.
Perform deep analysis on this security incident group.

YOUR ROLE: You are the FULL analyst. Perform all investigation a human SOC analyst would do:
- OSINT: IP reputation, threat intelligence, geographic analysis, login pattern analysis
- Device/account ownership verification
- Historical pattern analysis for this company and alert type
- Evidence chain building

Include ALL investigative findings in your reasoning and ticketNote fields.

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
  const currentQueue = primaryTicket.queueLabel || 'Security Monitoring Alert';

  const deviceSummary = deviceVerification
    ? deviceVerification.verified
      ? `VERIFIED TECHNICIAN DEVICE:\n  Device: ${deviceVerification.device?.hostname}\n  Technician: ${deviceVerification.technician}\n  IP: ${deviceVerification.device?.extIpAddress}`
      : `DEVICE NOT VERIFIED: ${deviceVerification.reason || 'No matching device'}`
    : 'No IP extracted — device lookup skipped';

  return `You are a Tier 1 SOC Analyst AI agent for Triple Cities Tech (TCT), a managed IT services provider.
You have already triaged this incident and determined:
  Verdict: ${verdict} (Confidence: ${Math.round(confidence * 100)}%)
  Reasoning: ${aiReasoning}

Now generate a COMPLETE operational action plan for this incident.

TICKETS (${tickets.length}):
${ticketDetails}

CORRELATION: ${correlationReason}
DEVICE VERIFICATION: ${deviceSummary}

CRITICAL RULES:
1. QUEUE: Do NOT change the queue. Keep it as "${currentQueue}". Set queueChange to null. Never invent or guess queue names.
2. STATUS: Use only valid Autotask ticket statuses: "New", "In Progress", "Waiting Customer", "Complete", "Resolved". If you need customer input, use "Waiting Customer".
3. YOU ARE THE FULL AGENT: You are performing ALL tasks that a human TCT SOC analyst would do. This means:
   - Perform ALL OSINT investigation: IP reputation lookups, threat intelligence checks, login pattern analysis, account history review, geographic analysis, device ownership verification, and any other open-source intelligence relevant to the alert.
   - Put ALL your investigative findings in the INTERNAL NOTE. The internal note should read like a thorough analyst's investigation report: what you checked, what you found, what it means.
   - Handle the ENTIRE workflow yourself — from investigation to customer communication to follow-up monitoring.
   - Only escalate to a HUMAN when: (a) the customer explicitly denies knowledge of the activity, (b) the activity is confirmed compromised or malicious, or (c) you need authorization that exceeds your scope (e.g., disabling accounts, blocking IPs at the firewall).
   - For routine findings (stale accounts, legitimate logins from known locations, software installs, onboarding activity), YOU handle it end-to-end. Draft and send the customer message, set status to Waiting Customer, and define the follow-up cycle.
4. CUSTOMER COMMUNICATION: Customer-facing messages must be written in PLAIN, NON-TECHNICAL LANGUAGE (layman's terms). Do NOT use jargon like "IP address", "OSINT", "false positive", "threat intelligence", "IOC", "hash", etc. Instead, say things like "we noticed a login to your account from an unfamiliar location" or "we detected new software being installed on one of your computers". Be specific about what was found but explain it simply, as if talking to a business owner who is not technical. The message will be posted as an Autotask ticket note visible to the customer.
5. INTERNAL NOTE REQUIREMENTS: The internal note must include:
   - Full OSINT investigation results (IP lookups, reputation checks, geo-location, threat feeds consulted)
   - Login/activity timeline analysis
   - Device verification results and ownership confirmation
   - Historical pattern analysis for this company/alert type
   - Clear evidence chain supporting your verdict
   - Specific technical details (IPs, hostnames, timestamps, user accounts) — technical language is fine for internal notes

${isMultiTicket ? `MERGE ANALYSIS REQUIRED:
These ${tickets.length} tickets appear related. You MUST evaluate whether they should be merged in Autotask.
If merging (recommended for same-device bursts), select the most descriptive ticket as the surviving ticket.
Generate a merged title that captures the full scope of the incident.
Generate a complete internal note for the surviving ticket.` : `SINGLE TICKET ANALYSIS:
Generate the complete action plan for this individual ticket.
If this is a routine security hygiene alert, you should handle the workflow yourself.`}

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
    "statusChange": { "from": "${primaryTicket.statusLabel || 'current'}", "to": "recommended new status (use valid Autotask statuses only)" } or null,
    "priorityChange": { "from": "${primaryTicket.priorityLabel || 'current'}", "to": "recommended priority" } or null,
    "queueChange": null,
    "escalation": {
      "recommended": true or false,
      "targetQueue": null,
      "targetResource": "person or team name if escalating" or null,
      "urgency": "routine" or "urgent" or "critical",
      "reason": "why escalation is or is not needed"
    }
  },
  "humanGuidance": {
    "summary": "1-2 sentence summary of what the AI will do vs what needs human attention",
    "steps": [
      "Step 1: specific action (prefix with [AI] if the AI will do it, or [HUMAN] if human needed)",
      "Step 2: ...",
      "... (provide 4-8 concrete steps showing the full workflow)"
    ],
    "draftCustomerMessage": "If customer contact is needed: the exact message to send to the customer's primary IT contact. Be specific about the finding, include account details, and ask for clear approval/denial. Or null if no customer contact needed.",
    "riskLevel": "none" or "low" or "medium" or "high" or "critical"
  },
  "customerCommunication": {
    "required": true or false,
    "recipient": "primary IT contact for the company" or null,
    "method": "autotask_ticket_note",
    "message": "The exact customer-facing message to post (or null)",
    "setStatusWaitingCustomer": true or false,
    "followUpDays": 5,
    "followUpMessage": "Follow-up message if no response (or null)",
    "approvalAction": "What the AI does if customer approves",
    "denialAction": "What the AI does if customer denies/provides business justification",
    "escalationTrigger": "What condition triggers escalation to a human"
  },
  "nextCycleChecks": [
    "On next triage cycle, check if customer replied to the message",
    "If approved, document approval and proceed with the action",
    "If no response after 5 days, send follow-up",
    "..."
  ],
  "supportingReasoning": "Detailed explanation of why this action plan was chosen, including evidence from each ticket"
}`;
}

/**
 * Build the reasoning layer prompt (replaces action plan for new analyses).
 * Produces a structured SocReasoning document with dynamic evidence items.
 */
export function buildReasoningPrompt(
  tickets: SecurityTicket[],
  correlationReason: string,
  verdict: string,
  confidence: number,
  aiReasoning: string,
  deviceVerification: DeviceVerification | null,
  technicianRoster: string[],
  historicalFpRate: number | null,
  similarFpCount: number,
): string {
  const ticketDetails = tickets.map((t, i) =>
    `  ${i + 1}. [${t.ticketNumber}] "${t.title}"
     - Company: ${t.companyName || t.companyId || 'Unknown'}
     - Status: ${t.statusLabel || t.status} | Priority: ${t.priorityLabel || t.priority}
     - Queue: ${t.queueLabel || 'Unknown'} | Source: ${t.sourceLabel || 'Unknown'}
     - Created: ${t.createDate}
     - Description: ${t.description?.slice(0, 500) || '(no description)'}`
  ).join('\n');

  const deviceSummary = deviceVerification
    ? deviceVerification.verified
      ? `VERIFIED TECHNICIAN DEVICE:\n  Device: ${deviceVerification.device?.hostname}\n  Technician: ${deviceVerification.technician}\n  IP: ${deviceVerification.device?.extIpAddress}\n  Site: ${deviceVerification.device?.siteName}\n  Last Seen: ${deviceVerification.device?.lastSeen}`
      : `DEVICE NOT VERIFIED: ${deviceVerification.reason || 'No matching device'}`
    : 'No IP extracted — device lookup skipped';

  const rosterSummary = technicianRoster.length > 0
    ? `Known TCT Technicians: ${technicianRoster.join(', ')}`
    : 'Technician roster not available';

  const historicalSummary = historicalFpRate !== null
    ? `This company's historical false positive rate: ${historicalFpRate}%\nSimilar alerts resolved as FP in past 30 days: ${similarFpCount}`
    : 'No historical data available for this company/alert type';

  return `You are a senior SOC Analyst for Triple Cities Tech (TCT), a managed IT services provider.
You have already performed initial triage on this incident:
  Initial Verdict: ${verdict} (Confidence: ${Math.round(confidence * 100)}%)
  Initial Reasoning: ${aiReasoning}

Now produce a COMPLETE reasoning document for this incident.

TICKETS (${tickets.length}):
${ticketDetails}

CORRELATION: ${correlationReason}
DEVICE VERIFICATION: ${deviceSummary}
${rosterSummary}

HISTORICAL PATTERNS:
${historicalSummary}

YOUR TASK: Produce a structured reasoning document that explains your analysis clearly for a technician who may not be a security expert.

CLASSIFICATION SYSTEM (use exactly one):
- "false_positive": Alert triggered by a system error, misconfiguration, or benign anomaly. No real security event occurred.
- "expected_activity": Real activity that is legitimate and expected — technician login, scheduled scan, onboarding, RMM script execution. Alert is accurate but not a threat.
- "informational": Activity worth noting but no immediate action needed — new software detected, password change, configuration change.
- "suspicious": Cannot be confirmed as benign. Requires investigation or customer verification.
- "confirmed_threat": Activity confirmed malicious or compromised. Requires immediate human response.

IMPORTANT DISTINCTION: A technician logging in from a verified device is "expected_activity", NOT "false_positive". Reserve "false_positive" for alerts that should not have fired at all.

EVIDENCE RULES:
- Include ONLY evidence items relevant to THIS specific alert type
- Each evidence item has a label, value, and type (positive=confirms benign, negative=raises concern, neutral=context, info=supplemental)
- For a suspicious login: include login location, device, user account, IP reputation, login history
- For malware detection: include file path, detection engine, device, quarantine status
- For software install: include software name, device, user, whether expected
- Do NOT pad with irrelevant fields. If there is no IP to report, do not include an IP evidence item.

CUSTOMER MESSAGE RULES:
- Set customerMessageRequired to TRUE only when:
  * The customer must confirm or deny the activity
  * A confirmed or likely compromise the customer must know about
  * The customer must take a specific action (change password, etc.)
- Set customerMessageRequired to FALSE when:
  * False positive or expected activity — no customer action needed
  * Informational alert with no required customer response
  * The SOC team can fully resolve without customer involvement
- Customer messages must use PLAIN, NON-TECHNICAL LANGUAGE. No jargon like "IP address", "OSINT", "false positive", "threat intelligence". Say things like "we noticed a login from an unfamiliar location" or "we detected new software being installed on one of your computers".

INTERNAL NOTE RULES:
- The internal note is for TCT technicians, technical language is fine
- Include: investigation findings, IP lookups, device verification, timeline analysis, evidence chain, verdict justification
- This should read like a thorough analyst's investigation report

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "incidentSummary": "Plain-language explanation of what happened. 2-4 sentences. No jargon.",
  "classification": "false_positive" or "expected_activity" or "informational" or "suspicious" or "confirmed_threat",
  "riskLevel": "none" or "low" or "medium" or "high" or "critical",
  "confidence": 0.0 to 1.0,
  "assessmentRationale": "1-3 sentences explaining why this classification was chosen",
  "evidence": [
    { "label": "Relevant Field Name", "value": "The finding", "type": "positive" or "negative" or "neutral" or "info" }
  ],
  "recommendedAction": "Clear recommendation for what to do with this ticket",
  "customerMessageRequired": true or false,
  "customerMessageDraft": "The exact customer message (plain language) or null if not required",
  "internalNote": "Full technical investigation note for Autotask internal use"
}`;
}

/**
 * Render the cross-stack enrichment bundle into a compact-but-complete block
 * for the AI. The raw RocketCyber payload is included (truncated) so the model
 * sees the real detection fields, not the gutted Autotask body.
 */
export function formatEnrichmentForPrompt(bundle: EnrichmentBundle): string {
  const lines: string[] = [];

  // RocketCyber detail — the headline evidence.
  if (bundle.rocketCyber) {
    const rc = bundle.rocketCyber;
    lines.push('ROCKETCYBER INCIDENT DETAIL (pulled directly from the API — this is the "Details" data):');
    const field = (label: string, val: string | null) => { if (val) lines.push(`  ${label}: ${val}`); };
    field('Incident ID', rc.incidentId);
    field('Account ID', rc.accountId);
    field('Status', rc.status);
    field('Threat Name', rc.threatName);
    field('Threat Type', rc.threatType);
    field('Severity', rc.severity);
    field('Action Taken', rc.actionTaken);
    field('Event Time', rc.eventTime);
    field('Device', rc.device);
    field('Organization', rc.organization);
    field('User Context', rc.userContext);
    field('Process', rc.process);
    field('Path', rc.path);
    field('Target Command Line', rc.targetCommandLine);
    field('Parent Command Line', rc.parentCommandLine);
    field('Hash', rc.hash);
    field('Detection Message', rc.detectionMessage);
    field('Remediation', rc.remediation);
    // Raw payload so nothing is lost (truncated to keep token use sane).
    const raw = JSON.stringify(rc.rawIncident).slice(0, 3500);
    lines.push(`  Raw incident JSON (truncated): ${raw}`);
    if (rc.rawEvents.length > 0) {
      lines.push(`  Raw events JSON (truncated): ${JSON.stringify(rc.rawEvents).slice(0, 2500)}`);
    }
  } else {
    lines.push('ROCKETCYBER: no detailed detection record retrieved.');
  }

  // Datto RMM device health.
  if (bundle.deviceHealth) {
    const d = bundle.deviceHealth;
    lines.push('\nDATTO RMM DEVICE HEALTH:');
    lines.push(`  Device: ${d.hostname} | Online: ${d.online ?? 'unknown'} | OS: ${d.operatingSystem || 'unknown'}`);
    lines.push(`  Last User: ${d.lastUser || 'unknown'} | Last Seen: ${d.lastSeen || 'unknown'} | Site: ${d.siteName || 'unknown'}`);
    lines.push(`  Reboot Required: ${d.rebootRequired ?? 'unknown'} | Patch Status: ${d.patchStatus || 'unknown'} | Pending Patches: ${d.patchesApprovedPending ?? 'unknown'}`);
    lines.push(`  Antivirus: ${d.antivirusProduct || 'unknown'} (${d.antivirusStatus || 'unknown'})`);
    if (d.recentSoftware.length > 0) {
      lines.push(`  Recently installed software: ${d.recentSoftware.map(s => `${s.name} ${s.version}`.trim()).join('; ')}`);
    }
  } else {
    lines.push('\nDATTO RMM: no device health available.');
  }

  // Datto RMM company-network match (source IP → known company devices).
  if (bundle.companyNetworkMatch) {
    const n = bundle.companyNetworkMatch;
    lines.push(`\nDATTO RMM NETWORK MATCH: source IP ${n.ip} belongs to this company's known network — ${n.deviceCount} managed device(s) behind it (${n.hostnames.slice(0, 6).join(', ')}). Activity originated from a known company location.`);
  }

  // Datto EDR detections.
  if (bundle.edr && bundle.edr.detectionCount > 0) {
    const e = bundle.edr;
    lines.push(`\nDATTO EDR: ${e.detectionCount} detection(s) in the window — ${e.suspiciousCount} suspicious/bad, ${e.unclassifiedCount} unclassified/unknown.`);
    lines.push(e.deviceScoped
      ? '  (scoped to the affected device)'
      : "  (this customer's org only, not device-confirmed — do not treat raw volume as threat; weight only Bad/Suspicious tied to the affected device/user.)");
    if (!e.deviceScoped && e.byDevice.length > 0) {
      lines.push(`  Per-device: ${e.byDevice.map(d => `${d.hostname}: ${d.total} (${d.suspicious} susp)`).join('; ')}`);
    }
    for (const d of e.detections) {
      lines.push(`  - [${d.threatName}${d.threatScore != null ? ` score ${d.threatScore}` : ''}] ${d.name}${d.path ? ` (${d.path})` : ''}${d.hostname ? ` on ${d.hostname}` : ''} — ${d.timestamp}, status ${d.status}${d.hash ? `, hash ${d.hash}` : ''}`);
    }
    if (e.rawDetections.length > 0) {
      lines.push(`  Raw top-detection JSON (truncated): ${JSON.stringify(e.rawDetections).slice(0, 2500)}`);
    }
  } else {
    lines.push('\nDATTO EDR: no related endpoint detections found in the window.');
  }

  // DNSFilter query-log correlation.
  if (bundle.dns) {
    const d = bundle.dns;
    lines.push(`\nDNSFILTER (org "${d.orgName || '?'}", ±6h window): ${d.totalBlocked} blocked quer${d.totalBlocked === 1 ? 'y' : 'ies'}, ${d.totalThreats} flagged as threats. ${d.deviceScoped ? 'Some tied to the affected device.' : 'NOT tied to the specific device (org-level).'}`);
    if (d.topBlockedDomains.length > 0) {
      lines.push(`  Top blocked domains: ${d.topBlockedDomains.map(x => `${x.domain} (${x.count})`).join(', ')}`);
    }
    for (const s of d.samples) {
      lines.push(`  - ${s.threat ? 'THREAT' : 'blocked'} ${s.fqdn}${s.categories ? ` [${s.categories}]` : ''}${s.device ? ` on ${s.device}` : ''}${s.requesterIp ? ` from ${s.requesterIp}` : ''} (${s.time})`);
    }
  } else {
    lines.push('\nDNSFILTER: no data.');
  }

  // SaaS Alerts.
  if (bundle.saasAlerts && bundle.saasAlerts.eventCount > 0) {
    lines.push(`\nSAAS ALERTS: ${bundle.saasAlerts.eventCount} event(s) for this customer near the window:`);
    for (const e of bundle.saasAlerts.events) {
      lines.push(`  - [${e.severity}] ${e.type}: ${e.description} (${e.time}${e.user ? `, user: ${e.user}` : ''})`);
    }
  } else {
    lines.push('\nSAAS ALERTS: no correlated identity/SaaS events found.');
  }

  // Known benign catalogue matches.
  if (bundle.knownBenignMatches.length > 0) {
    lines.push('\nKNOWN BENIGN MATCHES (informational — trusted-tool catalogue):');
    for (const m of bundle.knownBenignMatches) {
      lines.push(`  - ${m.vendor} ${m.product}${m.executablePath ? ` (${m.executablePath})` : ''} | matched on: ${m.matchedOn} | recommended: ${m.recommendedHandling || 'n/a'} | scope: ${m.scope}`);
    }
  } else {
    lines.push('\nKNOWN BENIGN MATCHES: none.');
  }

  // Data source roll-up + gaps.
  lines.push('\nDATA SOURCES ATTEMPTED:');
  for (const s of bundle.dataSources) {
    lines.push(`  - ${s.source}: ${s.status} — ${s.detail}`);
  }
  if (bundle.dataGaps.length > 0) {
    lines.push('\nDATA GAPS:');
    for (const g of bundle.dataGaps) lines.push(`  - ${g}`);
  }

  return lines.join('\n');
}

/**
 * Build the cross-stack assessment prompt. This is the primary reasoning step
 * once the enrichment bundle is assembled. It produces the redesigned
 * SocAssessment, including a fully self-contained internal note (technicians
 * act in Autotask, not on the website).
 */
export function buildCrossStackAssessmentPrompt(
  ticket: SecurityTicket,
  recentTickets: SecurityTicket[],
  enrichment: EnrichmentBundle,
  deviceVerification: DeviceVerification | null,
  historicalFpRate: number | null,
  similarFpCount: number,
): string {
  const recentSummary = recentTickets.length > 0
    ? recentTickets.map(t => `  - [${t.ticketNumber}] ${t.title} (${t.createDate})`).join('\n')
    : '  (none)';

  const deviceSummary = deviceVerification
    ? deviceVerification.verified
      ? `VERIFIED as TCT technician device "${deviceVerification.device?.hostname}" (tech: ${deviceVerification.technician})`
      : `NOT verified as a technician device: ${deviceVerification.reason || 'no match'}`
    : 'No IP extracted for technician verification.';

  const historicalSummary = historicalFpRate !== null
    ? `This company's historical false-positive rate for this source: ${historicalFpRate}% (${similarFpCount} similar FPs in 30 days)`
    : 'No historical FP data for this company/source.';

  return `You are a senior SOC Analyst for Triple Cities Tech (TCT), a managed IT services provider.
You triage RocketCyber / SaaS Alerts / Datto EDR security alerts that land in Autotask.

CRITICAL CONTEXT: The Autotask ticket body is generated from a vendor email template that frequently
blanks fields as "UNDEFINED". DO NOT base your verdict on the ticket body alone. Base it on the
CORRELATED EVIDENCE below, which was pulled directly from the security stack APIs.

TICKET:
  Number: ${ticket.ticketNumber}
  Title: ${ticket.title}
  Company: ${ticket.companyName || ticket.companyId || 'Unknown'}
  Source: ${ticket.sourceLabel || 'Unknown'} | Queue: ${ticket.queueLabel || 'Unknown'} | Priority: ${ticket.priorityLabel}
  Created: ${ticket.createDate}
  Body: ${ticket.description?.slice(0, 1500) || '(empty)'}

RECENT TICKETS (same company):
${recentSummary}

TECHNICIAN DEVICE CHECK: ${deviceSummary}
HISTORICAL: ${historicalSummary}

═══ CORRELATED EVIDENCE FROM THE SECURITY STACK ═══
${formatEnrichmentForPrompt(enrichment)}
═══ END CORRELATED EVIDENCE ═══

CLASSIFICATION (choose exactly one):
- "confirmed_malicious": Evidence confirms a real malicious/compromise event. Immediate human response.
- "suspicious_review": Cannot be confirmed benign from available data; a technician must review/investigate.
- "likely_false_positive": Evidence strongly suggests benign (e.g. matches a trusted tool's behavior, no corroborating detections, device healthy) but is not 100% certain.
- "confirmed_false_positive": Confirmed benign — matches a Known Benign entry or is unambiguously a trusted process/tool (e.g. Datto Rollback Driver, RMM/EDR/backup agent) with no other suspicious signals.
- "insufficient_data": Not enough correlated data to make a call (e.g. RocketCyber/Datto not reachable, device not found). Say what is missing.

TRUSTED-TOOL RECOGNITION: Datto Rollback Driver, Datto RMM components, Datto EDR components, backup
agents, security tools, approved scripts, and other known Kaseya/Datto tooling commonly trip Defender
ASR / LSASS-access rules. When the correlated evidence shows the triggering process is one of these
(e.g. path under "C:\\Program Files\\Datto\\..."), and there are no corroborating detections elsewhere
in the stack and the device is healthy, classify as likely/confirmed false positive and explain why.

CORRELATION DISCIPLINE — DO NOT OVER-ESCALATE ON NOISE:
- Datto EDR detection COUNT is not a threat signal. Most "Unknown"/"Good" threatName detections are
  routine background scan results, not active threats. Weight only Bad/Suspicious detections, and only
  when they are tied to the SAME device/timeframe as this alert.
- If the EDR data is labeled "org-wide (NOT confirmed related)", it was NOT tied to this alert's
  device/user — treat it as low-confidence context, not corroboration. Do not claim "138 active
  detections on this device" when the detections are org-wide and unclassified. Say what is actually
  known and put the rest in Data Gaps.
- DATTO RMM NETWORK MATCH: if the alert's source IP belongs to the company's known managed network,
  the activity originated from a known company location — this REDUCES suspicion for identity/SaaS
  alerts (logins, file operations). Treat it as a benign-leaning signal unless other evidence contradicts.
- For SaaS Alerts identity/file-activity alerts (bulk delete, login location), the user operating from a
  known company device/network with a clean IP and a high historical FP rate points to false positive
  unless there is device-scoped Bad/Suspicious EDR detail or confirmed compromise.

INTERNAL NOTE — THE PRIMARY DELIVERABLE:
Technicians act inside Autotask, NOT on this website. The internalNote you write IS the product. It must
be fully self-contained and follow this exact structure:

═══ SOC ANALYST ASSESSMENT ═══
Classification: <LABEL> (Confidence <X>%)  |  Risk: <level>

EXECUTIVE SUMMARY
<2-4 plain sentences: what fired, what the real detection was, and the bottom line.>

EVIDENCE & CORRELATION
- RocketCyber: <real process/path/hash/threat/action, or "no detail retrieved">
- Datto RMM: <device health summary, or "n/a">
- Datto EDR: <related detections or "none in window">
- DNSFilter: <blocked-domain context or "n/a">
- SaaS Alerts: <identity events or "none">
- Known Benign: <matched entry or "no match">

WHY THIS CLASSIFICATION
- <bullet reasons tied to the evidence, e.g. "Defender blocked the action", "path matched Datto Rollback Driver", "no other detections", "device health clean">

RECOMMENDED TECHNICIAN ACTION
<Concrete, technical next steps if any are needed. For a clean false positive: "No remediation required; close after review." For real concerns: isolation, password reset, escalation, etc.>

DATA GAPS
- <what could not be determined and why, or "none">

CUSTOMER MESSAGE (copy/paste — only if this is a real concern, NOT for false positives)
<If customerMessageRequired is true: a plain-language, non-technical message the tech can paste to inform the customer. If false: write exactly "Not required — <reason>. No customer notification recommended.">

SUGGESTED TICKET CLOSURE NOTE (copy/paste to resolve the ticket)
<the same 2-4 sentence resolution note as the closureNote field below>
═══ END SOC ASSESSMENT ═══

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "executiveSummary": "2-4 plain sentences, no jargon",
  "finalRecommendation": "One clear sentence: what to do with this ticket",
  "classification": "confirmed_malicious|suspicious_review|likely_false_positive|confirmed_false_positive|insufficient_data",
  "confidence": 0.0,
  "riskLevel": "none|low|medium|high|critical",
  "evidence": [ { "label": "Triggering Process", "value": "updater.exe", "type": "neutral|positive|negative|info" } ],
  "knownBenignMatch": { "matched": true, "reason": "Path matches Datto Rollback Driver catalogue entry" } or null,
  "customerImpact": "Plain-language statement of impact to the customer, or 'None — no customer-visible impact.'",
  "recommendedTechnicianActions": [ "step 1", "step 2" ],
  "dataGaps": [ "what was missing" ],
  "internalNote": "The full self-contained note following the structure above, ready to post to Autotask",
  "closureNote": "A short (2-4 sentence) copy/paste resolution note the technician pastes when closing/updating the ticket. State the verdict, the triggering binary and why it's benign or a concern, that Defender blocked it (if applicable), and the disposition (e.g. 'Closing as false positive — no action required.'). For a real concern, summarize what was done / escalated instead.",
  "customerMessageRequired": false,
  "customerMessageDraft": "plain-language message or null"
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
