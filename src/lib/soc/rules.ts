/**
 * SOC Rule Matching Engine
 *
 * Evaluates tickets against configured suppression/correlation/escalation rules.
 */

import type { SecurityTicket, SocRule, RulePattern } from './types';

/**
 * Find all matching rules for a given ticket.
 * Rules are checked in priority order (lower number = higher priority).
 */
export function matchRules(
  ticket: SecurityTicket,
  rules: SocRule[],
  context?: {
    recentTicketCount?: number;
    deviceVerified?: boolean;
  },
): SocRule[] {
  const active = rules
    .filter(r => r.isActive)
    .sort((a, b) => a.priority - b.priority);

  return active.filter(r => ruleMatchesTicket(ticket, r.pattern, context));
}

function ruleMatchesTicket(
  ticket: SecurityTicket,
  pattern: RulePattern,
  context?: { recentTicketCount?: number; deviceVerified?: boolean },
): boolean {
  // Title pattern matching (any pattern must match)
  if (pattern.titlePatterns && pattern.titlePatterns.length > 0) {
    const titleLower = ticket.title.toLowerCase();
    const descLower = (ticket.description || '').toLowerCase();
    const combined = `${titleLower} ${descLower}`;
    const hasMatch = pattern.titlePatterns.some(p => combined.includes(p.toLowerCase()));
    if (!hasMatch) return false;
  }

  // Source matching
  if (pattern.sourceMatch) {
    const ticketSource = detectAlertSource(ticket);
    if (ticketSource !== pattern.sourceMatch) return false;
  }

  // Company matching
  if (pattern.companyMatch && ticket.companyId !== pattern.companyMatch) {
    return false;
  }

  // Minimum tickets in window (for burst detection)
  if (pattern.minTicketsInWindow != null && context?.recentTicketCount != null) {
    if (context.recentTicketCount < pattern.minTicketsInWindow) return false;
  }

  // Require device verification
  if (pattern.requireDeviceVerification && !context?.deviceVerified) {
    return false;
  }

  // Priority cap (only match tickets at or below this priority)
  if (pattern.priorityMax != null && ticket.priority < pattern.priorityMax) {
    return false; // Lower number = higher priority in Autotask
  }

  return true;
}

/**
 * Detect the alert source from ticket metadata.
 * Checks title, description, source label, and queue label.
 */
export function detectAlertSource(ticket: SecurityTicket): string {
  const text = `${ticket.title} ${ticket.description || ''} ${ticket.sourceLabel || ''} ${ticket.queueLabel || ''}`.toLowerCase();

  if (text.includes('saas alert') || text.includes('saasalert')) return 'saas_alerts';
  if (text.includes('datto edr') || text.includes('endpoint detection')) return 'datto_edr';
  if (text.includes('rocketcyber') || text.includes('rocket cyber')) return 'rocketcyber';

  return 'unknown';
}

/** Queue names that are dedicated security alert queues in Autotask */
const SECURITY_QUEUE_NAMES = [
  'security monitoring alert',
  'security monitoring',
  'security alerts',
  'managed soc',
];

/**
 * Check if a ticket is a security alert.
 * Primary: queue-based detection (most reliable — Autotask routes all security alerts
 *   to the "Security Monitoring Alert" queue).
 * Fallback: keyword-based detection for tickets that may be in other queues.
 */
export function isSecurityTicket(ticket: SecurityTicket): boolean {
  // Primary: check if ticket is in a known security queue
  const queue = (ticket.queueLabel || '').toLowerCase();
  if (queue && SECURITY_QUEUE_NAMES.some(q => queue.includes(q))) {
    return true;
  }

  // Fallback: keyword matching for tickets not in a dedicated security queue
  const text = `${ticket.title} ${ticket.description || ''} ${ticket.sourceLabel || ''}`.toLowerCase();

  const securityKeywords = [
    'security alert', 'security warning', 'suspicious', 'malware', 'phishing',
    'unauthorized', 'threat', 'intrusion', 'anomaly', 'brute force',
    'impossible travel', 'unusual login', 'foreign country', 'unapproved',
    'saas alert', 'datto edr', 'rocketcyber', 'endpoint detection',
    'bitlocker', 'ransomware', 'trojan', 'exploit', 'vulnerability',
    'credential', 'compromised', 'data exfiltration', 'outbound connection',
    'vpn detected', 'gaming process', 'network inspection', 'bittorrent',
    'tor browser', 'tor exit', 'proxy', 'socks', 'blocked', 'firewall',
    'denied', 'quarantine', 'sandbox', 'detection',
  ];

  return securityKeywords.some(kw => text.includes(kw));
}
