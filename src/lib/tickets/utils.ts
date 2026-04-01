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

// ============================================
// CUSTOMER-FACING TICKET STATUS MAPPING
// ============================================

/**
 * Customer-facing ticket statuses.
 * These are the refined labels shown to customers in the portal.
 * The "Open Tickets" summary card still counts ALL non-resolved tickets.
 */
export type CustomerStatusLabel =
  | 'Open'
  | 'In Progress'
  | 'Scheduled'
  | 'Awaiting Your Team'
  | 'Waiting on Vendor'
  | 'Escalated'
  | 'Closed';

/** Badge color classes for each customer-facing status */
export const CUSTOMER_STATUS_COLORS: Record<CustomerStatusLabel, string> = {
  'Open':               'bg-blue-500/20 text-blue-300',
  'In Progress':        'bg-cyan-500/20 text-cyan-300',
  'Scheduled':          'bg-violet-500/20 text-violet-300',
  'Awaiting Your Team': 'bg-rose-500/20 text-rose-300',
  'Waiting on Vendor':  'bg-slate-500/20 text-slate-300',
  'Escalated':          'bg-red-500/20 text-red-300',
  'Closed':             'bg-green-500/20 text-green-300',
};

/**
 * Map an Autotask ticket status label (from the picklist) to a customer-facing label.
 * Matching is case-insensitive against known patterns.
 * If no pattern matches, falls back based on resolved/waiting classification.
 */
export function mapAutotaskLabelToCustomerStatus(
  autotaskLabel: string,
  statusId: number
): CustomerStatusLabel {
  const lower = autotaskLabel.toLowerCase();

  // Resolved / closed statuses
  if (/\b(complete|closed|resolved|done|cancelled|merged)\b/.test(lower)) {
    return 'Closed';
  }

  // Waiting on customer
  if (/\b(waiting\s*(on|for)?\s*customer|customer\s*(note|respond)|pending\s*customer|client\s*response|waiting\s*(on|for)?\s*client)\b/.test(lower)) {
    return 'Awaiting Your Team';
  }

  // Scheduled
  if (/\bschedul(ed|e)\b/.test(lower)) {
    return 'Scheduled';
  }

  // In progress / actively worked
  if (/\b(in\s*progress|work\s*in\s*progress|active|working)\b/.test(lower)) {
    return 'In Progress';
  }

  // Waiting on vendor / third party
  if (/\b(waiting\s*(on|for)?\s*(vendor|third|partner|supplier)|vendor|3rd\s*party)\b/.test(lower)) {
    return 'Waiting on Vendor';
  }

  // Escalated
  if (/\bescalat(ed|ion)\b/.test(lower)) {
    return 'Escalated';
  }

  // Assigned (tech picked it up but hasn't started active work yet — still "Open" to customer)
  if (/\b(assigned|new|open)\b/.test(lower)) {
    return 'Open';
  }

  // Fallback: use the existing resolved/waiting classification
  if (isResolvedStatus(statusId)) return 'Closed';
  if (isWaitingCustomerStatus(statusId)) return 'Awaiting Your Team';
  return 'Open';
}

// ============================================
// AUTOTASK TICKET STATUS PICKLIST CACHE
// ============================================

/** Cached map of Autotask ticket status ID → Autotask label */
let cachedTicketStatusPicklist: Record<number, string> | null = null;
let picklistFetchedAt = 0;
const PICKLIST_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Fetch and cache the Autotask Ticket status picklist.
 * Returns a map of status ID → Autotask label (e.g. { 1: "New", 8: "In Progress" }).
 * On failure, returns null (callers should use fallback logic).
 */
export async function getTicketStatusPicklist(): Promise<Record<number, string> | null> {
  const now = Date.now();
  if (cachedTicketStatusPicklist && (now - picklistFetchedAt) < PICKLIST_CACHE_TTL_MS) {
    return cachedTicketStatusPicklist;
  }

  try {
    const { AutotaskClient } = await import('@/lib/autotask');
    const client = new AutotaskClient();
    const fieldInfo = await client.getFieldInfo('Tickets');

    if (fieldInfo?.fields) {
      const statusField = fieldInfo.fields.find(
        (f: { name: string }) => f.name === 'status'
      );
      if (statusField?.picklistValues) {
        const map: Record<number, string> = {};
        for (const pv of statusField.picklistValues) {
          if (pv.isActive) {
            map[parseInt(pv.value, 10)] = pv.label;
          }
        }
        cachedTicketStatusPicklist = map;
        picklistFetchedAt = now;
        return map;
      }
    }
  } catch (err) {
    console.warn('[tickets/utils] Failed to fetch ticket status picklist:', err instanceof Error ? err.message : String(err));
  }

  return cachedTicketStatusPicklist; // Return stale cache if available, null otherwise
}

/**
 * Resolve a numeric Autotask ticket status to a customer-facing label.
 * Uses the picklist map if available, otherwise falls back to hardcoded classification.
 */
export function resolveCustomerStatusLabel(
  statusId: number,
  picklistMap: Record<number, string> | null
): CustomerStatusLabel {
  if (picklistMap && picklistMap[statusId]) {
    return mapAutotaskLabelToCustomerStatus(picklistMap[statusId], statusId);
  }

  // Fallback when no picklist is available
  if (isResolvedStatus(statusId)) return 'Closed';
  if (isWaitingCustomerStatus(statusId)) return 'Awaiting Your Team';
  return 'Open';
}

/**
 * Get badge color classes for a customer-facing status label.
 * Safe fallback for unknown labels.
 */
export function getStatusBadgeColor(statusLabel: string): string {
  return CUSTOMER_STATUS_COLORS[statusLabel as CustomerStatusLabel] || CUSTOMER_STATUS_COLORS['Open'];
}
