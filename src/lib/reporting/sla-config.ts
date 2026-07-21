import { classifyTicket, isAlertQueue, type ClassifiableTicket } from './ticket-classification';

/**
 * SLA Configuration — matched to Autotask "TCT – Fully Managed IT Services" agreement.
 *
 * Source: Autotask SLA objectID=2, last updated 10/23/2025.
 * Timeframe: Business Hours (Main Office).
 * Applies ONLY to companies classified as "Platinum Managed Service" in Autotask.
 *
 * Three SLA metrics:
 *   1. First Response — time to first technician response
 *   2. Resolution Plan — time to have a documented plan/path to resolution
 *   3. Resolved — time to full resolution
 */

/** Company classification that qualifies for SLA reporting */
export const SLA_ELIGIBLE_CLASSIFICATION = 'Platinum Managed Service';

// ============================================
// FULLY MANAGED SLA IDENTITY
// ============================================
// Customer-facing SLA reporting applies ONLY to the "TCT – Fully Managed IT
// Services" agreement (owner decision 2026-07-21) — the same agreement the
// operations SLA widgets filter on. SLA ids are instance-specific picklist
// values; this default matches the live TCT instance (id 2, confirmed via the
// connector's autotask_list_slas) and is refreshed from the live SLA picklist
// during ticket sync, mirroring how status classification self-updates.

/** Default Fully Managed SLA id on the TCT instance (live-confirmed). */
const DEFAULT_FULLY_MANAGED_SLA_ID = 2;

/** Labels that identify the Fully Managed agreement in the SLA picklist. */
const FULLY_MANAGED_SLA_LABEL_PATTERNS = [/\bfully\s*managed\b/i];

let cachedFullyManagedSlaId: number | null = null;

/**
 * Refresh the Fully Managed SLA id from the live SLA picklist
 * (id + label pairs from autotask_list_slas / the serviceLevelAgreementID
 * picklist). Only updates when a match is found, so a failed fetch can never
 * blank the classification.
 */
export function updateFullyManagedSlaId(
  slas: Array<{ id: number; label: string }>,
): void {
  const match = slas.find(s => FULLY_MANAGED_SLA_LABEL_PATTERNS.some(p => p.test(s.label)));
  if (match) cachedFullyManagedSlaId = match.id;
}

/** Current Fully Managed SLA id (dynamic or default). */
export function getFullyManagedSlaId(): number {
  return cachedFullyManagedSlaId ?? DEFAULT_FULLY_MANAGED_SLA_ID;
}

/** Is this ticket on the Fully Managed SLA (the only SLA we report against)? */
export function isFullyManagedSla(slaId: number | null | undefined): boolean {
  return slaId !== null && slaId !== undefined && slaId === getFullyManagedSlaId();
}

/**
 * Whether a ticket's SLA compliance should be reported at all. Three gates,
 * matching the owner's model + the ops SLA widget filters:
 *   1. On the Fully Managed SLA (the only reported plan).
 *   2. A human/user-created ticket (not automated monitoring).
 *   3. Not in an automated alert queue (network/security/monitoring alerts
 *      never carry an SLA, even the rare human-source one — e.g. a SOC alert
 *      a tech triaged).
 */
export function isSlaReportableTicket(
  t: ClassifiableTicket & { slaId: number | null | undefined },
): boolean {
  return isFullyManagedSla(t.slaId)
    && classifyTicket(t) === 'human'
    && !isAlertQueue(t.queueId, t.queueLabel);
}

/** Test-only: reset the dynamic cache. */
export function resetFullyManagedSlaCache(): void {
  cachedFullyManagedSlaId = null;
}

/** SLA compliance goal percentages from Autotask */
export const SLA_GOALS = {
  firstResponse: 95.0,    // First Response Goal (%)
  resolutionPlan: 95.0,   // Resolution Plan Goal (%)
  resolved: 95.0,         // Resolved Goal (%)
} as const;

/**
 * SLA targets by priority (in business-hour minutes).
 * null = no SLA target defined for that priority/metric combination.
 */
export const SLA_TARGETS = {
  CRITICAL: {
    firstResponse: 30,     // 0.5 hours
    resolutionPlan: 120,   // 2 hours
    resolved: 240,         // 4 hours
  },
  HIGH: {
    firstResponse: 60,     // 1 hour
    resolutionPlan: 240,   // 4 hours
    resolved: 480,         // 8 hours
  },
  MEDIUM: {
    firstResponse: 120,    // 2 hours
    resolutionPlan: 480,   // 8 hours
    resolved: 1440,        // 24 hours
  },
  LOW: {
    firstResponse: 480,    // 8 hours
    resolutionPlan: 1440,  // 24 hours
    resolved: null,        // No "Resolved" target for Low priority
  },
} as const;

/** Map Autotask priority number to our SLA key */
export function priorityToSlaKey(priority: number): keyof typeof SLA_TARGETS {
  switch (priority) {
    case 1: return 'CRITICAL';
    case 2: return 'HIGH';
    case 3: return 'MEDIUM';
    case 4: return 'LOW';
    default: return 'MEDIUM';
  }
}

/** Get first response target in minutes for a given Autotask priority */
export function getFirstResponseTarget(priority: number): number {
  return SLA_TARGETS[priorityToSlaKey(priority)].firstResponse;
}

/** Get resolution plan target in minutes for a given Autotask priority */
export function getResolutionPlanTarget(priority: number): number {
  return SLA_TARGETS[priorityToSlaKey(priority)].resolutionPlan;
}

/** Get resolved target in minutes for a given Autotask priority, or null if not defined */
export function getResolvedTarget(priority: number): number | null {
  return SLA_TARGETS[priorityToSlaKey(priority)].resolved;
}

/**
 * Format SLA minutes to human-readable string.
 * Uses business hours (1 day = 8 business hours).
 */
export function formatSlaMinutes(minutes: number | null): string {
  if (minutes === null) return 'N/A';
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours} hr${hours !== 1 ? 's' : ''}`;
  const days = hours / 8; // business hours
  return `${days.toFixed(1)} biz days`;
}
