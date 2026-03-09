/**
 * Shared ticket display utilities.
 */

/** Format minutes into a human-readable duration string. */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`;
  return `${(minutes / 1440).toFixed(1)}d`;
}

/** Priority → Tailwind class mapping */
export const PRIORITY_COLORS: Record<number, string> = {
  1: 'bg-rose-400/20 text-rose-400',
  2: 'bg-orange-400/20 text-orange-400',
  3: 'bg-cyan-400/20 text-cyan-400',
  4: 'bg-slate-400/20 text-slate-400',
};

/** Fallback priority labels when Autotask labels aren't available */
export const PRIORITY_LABELS: Record<number, string> = {
  1: 'Critical',
  2: 'High',
  3: 'Medium',
  4: 'Low',
};

/** Build the Autotask web URL base from the API base URL env var */
export function getAutotaskWebUrl(): string | null {
  const apiBaseUrl = process.env.AUTOTASK_API_BASE_URL || '';
  const zoneMatch = apiBaseUrl.match(/webservices(\d+)/);
  return zoneMatch
    ? `https://ww${zoneMatch[1]}.autotask.net/Mvc/ServiceDesk/TicketDetail.mvc`
    : null;
}

/** Build a full Autotask deep link for a ticket */
export function getAutotaskTicketUrl(ticketId: string): string | null {
  const base = getAutotaskWebUrl();
  return base ? `${base}?ticketId=${ticketId}` : null;
}

/** Autotask resolved statuses (5=Complete, 13=Resolved, 29=Customer Resolved) */
const RESOLVED_STATUSES = new Set([5, 13, 29]);

export function isResolvedStatus(status: number): boolean {
  return RESOLVED_STATUSES.has(status);
}

/** Autotask "waiting on customer" statuses (7=Waiting Customer, 12=Customer Note Added) */
const WAITING_CUSTOMER_STATUSES = new Set([7, 12]);

export function isWaitingCustomerStatus(status: number): boolean {
  return WAITING_CUSTOMER_STATUSES.has(status);
}
