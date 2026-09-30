/**
 * Shared ticket display utilities.
 */

import { classifyPublishVisibility } from '@/lib/autotask-activity';

/** Format minutes into a human-readable duration string. */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`;
  return `${(minutes / 1440).toFixed(1)}d`;
}

/** Priority → Tailwind class mapping */
export const PRIORITY_COLORS: Record<number, string> = {
  1: 'bg-rose-400/20 text-rose-400',
  2: 'bg-violet-400/20 text-violet-400',
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

/**
 * Resolved-label fallback. Custom instance statuses (e.g. "Complete - No Notify")
 * get NEW picklist IDs that aren't in RESOLVED_STATUSES, so callers must pass the
 * status label whenever one is available or closed counts will be understated.
 */
const RESOLVED_LABEL_PATTERN = /\b(complete|completed|closed|resolved|done|cancelled|canceled|merged)\b/i;

export function isResolvedStatus(status: number, statusLabel?: string | null): boolean {
  if (RESOLVED_STATUSES.has(status)) return true;
  return !!statusLabel && RESOLVED_LABEL_PATTERN.test(statusLabel);
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
  // ALWAYS check resolved/waiting status IDs first — these are authoritative
  // regardless of what the picklist label text says (a ticket can have a label
  // like "Scheduled" in its status history but actually be completed)
  if (isResolvedStatus(statusId)) return 'Closed';
  if (isWaitingCustomerStatus(statusId)) return 'Awaiting Your Team';

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

// ============================================
// Customer-visible ticket notes
// ============================================

/**
 * TicketNotes.noteType values that are CORRESPONDENCE — a person writing to or
 * about the customer — as opposed to Autotask system output.
 *
 * Why a note-type test exists at all: publish alone is not enough. Autotask
 * stamps its own workflow-rule firings, merge/absorb records, surveys and RMM
 * notes with publish 1 ("All Autotask Users", the customer-visible value) too,
 * and those bodies carry staff email addresses, SLA-breach warnings and
 * internal nag text ("Workflow Rule 'SLA Event: Breached' fired … to
 * ben@…; ghenel@…"). Before this list existed, a publish === 3 filter hid them
 * only by accident, because it hid everything.
 *
 * This is an ALLOWLIST so it fails closed: a note type Autotask adds later
 * stays hidden from customers until someone decides it is correspondence.
 *
 * Labels are the authority and are resolved against the live picklist at
 * runtime (see getCorrespondenceNoteTypeIds in adapters.ts); the ids are the
 * fallback used only if that lookup fails, and were read from this instance's
 * TicketNotes.noteType picklist on 2026-09-13. Deliberately excluded: 13
 * Workflow Rule Note - Task, 91 Workflow Rule Action Note, 92 Forward/Modify
 * Note, 93 Merged Into Ticket, 94 Absorbed Another Ticket, 95 Copied to
 * Project, 15 Duplicate Ticket Note, 16 Outsource Workflow Note, 17 Surveys,
 * 99 RMM Note, 100 BDR Note.
 */
export const CUSTOMER_CORRESPONDENCE_NOTE_TYPES: ReadonlyArray<{ label: string; fallbackId: number }> = [
  { label: 'Task Summary', fallbackId: 1 },
  { label: 'Task Detail', fallbackId: 2 },
  { label: 'Task Notes', fallbackId: 3 },
  { label: 'Client Portal Note', fallbackId: 18 },
  { label: 'Taskfire Note', fallbackId: 19 },
  { label: 'Email Note', fallbackId: 101 },
];

/** The fields the customer-visibility decision reads from an Autotask TicketNote. */
export interface CustomerNoteCandidate {
  publish?: number | null;
  noteType?: number | null;
  creatorResourceID?: number | null;
  createdByContactID?: number | null;
  title?: string | null;
}

/**
 * Should the customer portal show this ticket note?
 *
 * All three must hold: the publish value classifies as customer-visible (via
 * the shared classifier, never a bare number compare), the note type is
 * correspondence, and a person — a resource or a contact — authored it.
 * Anything unrecognised is hidden: a note wrongly shown to a customer is worse
 * than one wrongly hidden from them.
 */
export function isCustomerVisibleTicketNote(
  note: CustomerNoteCandidate,
  correspondenceNoteTypeIds: ReadonlySet<number>,
): boolean {
  if (classifyPublishVisibility(note.publish, null).scope !== 'customer_visible') return false;
  if (note.noteType == null || !correspondenceNoteTypeIds.has(note.noteType)) return false;
  if (!note.creatorResourceID && !note.createdByContactID) return false;
  return true;
}

const CUSTOMER_REPLY_TITLE_PREFIX = 'Customer Reply from ';

/** Title the portal gives a reply it posts on the customer's behalf. */
export function customerReplyTitle(customerName: string): string {
  return `${CUSTOMER_REPLY_TITLE_PREFIX}${customerName}`;
}

/**
 * The customer name from a portal reply's title, or null if the title is not
 * one the portal wrote.
 *
 * Needed because Autotask stamps the read-only creatorResourceID with the API
 * user on every note the portal creates, so a reply posted before contact
 * attribution was fixed reads as authored by the "TCT Customer Portal"
 * resource. The title is written only by /api/customer/tickets/reply.
 */
export function parseCustomerReplyAuthor(title: string | null | undefined): string | null {
  if (!title || !title.startsWith(CUSTOMER_REPLY_TITLE_PREFIX)) return null;
  const name = title.slice(CUSTOMER_REPLY_TITLE_PREFIX.length).trim();
  return name || null;
}

/**
 * Who a customer-visible note is from, as the customer should see it.
 *
 * A contact id wins over a resource id: when the portal posts a reply with
 * createdByContactID, Autotask may still stamp creatorResourceID with the API
 * user, and that reply is the customer's.
 */
export function resolveCustomerNoteAuthor(
  note: CustomerNoteCandidate,
  resourceName: string | undefined,
): { author: string; authorType: 'customer' | 'technician' } {
  const replyAuthor = parseCustomerReplyAuthor(note.title);
  if (note.createdByContactID) {
    return { author: replyAuthor ?? 'Customer', authorType: 'customer' };
  }
  if (replyAuthor) {
    return { author: replyAuthor, authorType: 'customer' };
  }
  return { author: resourceName || 'Triple Cities Tech', authorType: 'technician' };
}

// ============================================
// Portal ticket access
// ============================================

/** What the portal knows about the signed-in customer, resolved to Autotask ids. */
export interface PortalTicketAccess {
  autotaskCompanyId: number;
  isManager: boolean;
  /** Null when the signed-in email has no linked Autotask contact. */
  autotaskContactId: number | null;
}

/**
 * May this portal user open this ticket?
 *
 * The same rule the ticket LIST applies (getCustomerTicketList): the ticket
 * must belong to the user's company, and a non-manager sees only tickets they
 * are the contact on. Before this check existed the notes and reply endpoints
 * took any ticket id, so the list's restriction could be bypassed by typing a
 * ticket number — across companies, not only within one.
 */
export function portalMayAccessTicket(
  ticket: { companyID?: number | null; contactID?: number | null },
  access: PortalTicketAccess,
): boolean {
  if (ticket.companyID == null || ticket.companyID !== access.autotaskCompanyId) return false;
  if (access.isManager) return true;
  return access.autotaskContactId != null && ticket.contactID === access.autotaskContactId;
}
