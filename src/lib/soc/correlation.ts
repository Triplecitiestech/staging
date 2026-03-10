/**
 * SOC Alert Correlation Engine
 *
 * Groups related security tickets into incidents based on:
 * - Same device (hostname extracted from ticket text)
 * - Same company within time window
 * - Same source IP
 * - Same alert source
 */

import type { SecurityTicket, IncidentGroup, CorrelationReason } from './types';
import { extractPrimaryIp } from './ip-extractor';
import { detectAlertSource } from './rules';

const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Correlate an array of security tickets into incident groups.
 * Tickets in the same group are likely related to a single event.
 */
export function correlateTickets(
  tickets: SecurityTicket[],
  windowMinutes?: number,
): IncidentGroup[] {
  const windowMs = (windowMinutes || 15) * 60 * 1000 || DEFAULT_WINDOW_MS;
  const sorted = [...tickets].sort(
    (a, b) => new Date(a.createDate).getTime() - new Date(b.createDate).getTime()
  );

  const groups: IncidentGroup[] = [];
  const assigned = new Set<string>();

  for (const ticket of sorted) {
    if (assigned.has(ticket.autotaskTicketId)) continue;

    const related = sorted.filter(t => {
      if (assigned.has(t.autotaskTicketId)) return false;
      if (t.autotaskTicketId === ticket.autotaskTicketId) return false;

      // Must be within time window
      const timeDiff = Math.abs(
        new Date(t.createDate).getTime() - new Date(ticket.createDate).getTime()
      );
      if (timeDiff > windowMs) return false;

      // Must be same company
      if (!ticket.companyId || t.companyId !== ticket.companyId) return false;

      // At least one correlation signal
      return (
        hasSameSource(t, ticket) ||
        hasSameIp(t, ticket) ||
        hasSameHostname(t, ticket)
      );
    });

    const group: IncidentGroup = {
      tickets: [ticket, ...related],
      reason: related.length > 0
        ? determineCorrelationReason(ticket, related)
        : 'single_alert',
      primaryTicket: ticket,
    };
    groups.push(group);
    assigned.add(ticket.autotaskTicketId);
    for (const t of related) {
      assigned.add(t.autotaskTicketId);
    }
  }

  return groups;
}

function hasSameSource(a: SecurityTicket, b: SecurityTicket): boolean {
  const srcA = detectAlertSource(a);
  const srcB = detectAlertSource(b);
  return srcA !== 'unknown' && srcA === srcB;
}

function hasSameIp(a: SecurityTicket, b: SecurityTicket): boolean {
  const ipA = extractPrimaryIp(a.title, a.description);
  const ipB = extractPrimaryIp(b.title, b.description);
  return !!ipA && ipA === ipB;
}

function hasSameHostname(a: SecurityTicket, b: SecurityTicket): boolean {
  const hostA = extractHostname(a.title + ' ' + (a.description || ''));
  const hostB = extractHostname(b.title + ' ' + (b.description || ''));
  return !!hostA && hostA === hostB;
}

/** Extract a hostname pattern from text (e.g., "DESKTOP-ABC123", "LAPTOP-XYZ") */
function extractHostname(text: string): string | null {
  const patterns = [
    /\b(DESKTOP-[A-Z0-9]+)\b/i,
    /\b(LAPTOP-[A-Z0-9]+)\b/i,
    /\b(PC-[A-Z0-9]+)\b/i,
    /\b(SRV-[A-Z0-9]+)\b/i,
    /\b(TCT-[A-Z0-9-]+)\b/i,
    /\b(WIN-[A-Z0-9]+)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

function determineCorrelationReason(primary: SecurityTicket, related: SecurityTicket[]): CorrelationReason {
  const allTickets = [primary, ...related];
  const text = allTickets.map(t => `${t.title} ${t.description || ''}`).join(' ').toLowerCase();

  // Check for onboarding patterns
  const onboardingKeywords = ['agent install', 'onboard', 'new device', 'first connection', 'initial setup'];
  if (onboardingKeywords.some(kw => text.includes(kw))) {
    return 'onboarding_cluster';
  }

  // Check for same IP (likely technician session)
  const ips = allTickets.map(t => extractPrimaryIp(t.title, t.description)).filter(Boolean);
  const uniqueIps = new Set(ips);
  if (uniqueIps.size === 1 && ips.length > 1) {
    return 'technician_session';
  }

  // Check for same hostname
  const hostnames = allTickets.map(t => extractHostname(`${t.title} ${t.description || ''}`)).filter(Boolean);
  const uniqueHostnames = new Set(hostnames);
  if (uniqueHostnames.size === 1 && hostnames.length > 1) {
    return 'same_device_burst';
  }

  return 'same_source_company';
}
