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
