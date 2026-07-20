/**
 * Ticket classification: HUMAN SUPPORT vs AUTOMATED MONITORING.
 *
 * The single source of truth for deciding whether an Autotask ticket
 * represents human support work (a person asked for help / a tech worked it)
 * or an automated monitoring event (SaaS Alerts, Datto EDR/RMM, backup and
 * network alerts that auto-open and auto-resolve tickets).
 *
 * Every reporting surface (operations dashboard, company report, monthly/QBR
 * business review, annual report, TBR export, health scores, daily
 * aggregation) MUST classify through this module — never inline its own
 * source/queue checks. Automated tickets are excluded from every support
 * metric (counts, response time, resolution time, SLA, first-touch, reopens,
 * backlog, priority mix, themes) and reported separately as monitoring
 * activity.
 *
 * Classification rule (confirmed against the live TCT Autotask picklists and
 * ticket data for Tri-Bros Transportation, June 2026):
 *   1. PRIMARY — ticket source. Source 8 "Monitoring Alert" is the only
 *      automated source in this instance; every other source (Phone, Email,
 *      Client Portal, Chat, Web Portal, In Person/Onsite, Voice Mail, Verbal,
 *      Website, Microsoft Form, Insourced) is an interactive/human channel.
 *      A null source is treated as human — hiding possibly-real work is worse
 *      than counting a stray alert.
 *   2. MISFILE RESCUE — dirty source data exists, in both directions:
 *      a. A source-8 ticket that a real person was assigned to AND that
 *         either sits OUTSIDE the automated alert queues or has real logged
 *         time is a misfiled HUMAN ticket. (Confirmed: ticket 34477 "PENDING
 *         LOAD DOCS MOVED" — source 8 but assigned, worked in Help Desk.)
 *      b. A human-source ticket that is UNASSIGNED, sits IN an automated
 *         alert queue, and has no logged time is an AUTOMATED alert whose
 *         integration never set the source, so Autotask stamped the default
 *         ("Phone"). (Confirmed: ticket 34369 "CLI - User Created…" — a
 *         RocketCyber SOC alert with source 2, unassigned, in Security
 *         Monitoring Alert at status 52.)
 *
 * Like the status classification in ./types.ts, picklist ids are
 * instance-specific: defaults below match the TCT instance and are refreshed
 * from live picklist labels during ticket sync via
 * updateTicketClassificationFromPicklists().
 */

// ============================================
// PICKLIST DEFAULTS + DYNAMIC CACHE
// ============================================

/** Default automated ticket-source ids (TCT: 8 = "Monitoring Alert"). */
const DEFAULT_AUTOMATED_SOURCE_IDS = [8];

/**
 * Default automated alert queue ids (TCT):
 * 8 "Monitoring Alert" (system), 29683494 "Security Monitoring Alert",
 * 29683495 "Network Monitoring Alert", 29683496 "Backup Monitoring Alert".
 */
const DEFAULT_ALERT_QUEUE_IDS = [8, 29683494, 29683495, 29683496];

/** Source labels that indicate an automated (non-interactive) channel. */
const AUTOMATED_SOURCE_LABEL_PATTERNS = [/\bmonitoring\b/i, /\balert\b/i];

/** Queue labels that hold auto-generated alert tickets. */
const ALERT_QUEUE_LABEL_PATTERNS = [/\bmonitoring\s+alert(s)?\b/i];

let cachedAutomatedSourceIds: number[] | null = null;
let cachedAlertQueueIds: number[] | null = null;

/**
 * Refresh the automated source/queue id caches from live Autotask picklists.
 * Called during ticket sync alongside updateStatusClassification(). Only
 * updates a cache when the picklist yielded at least one match, so a failed
 * or partial picklist fetch can never blank the classification.
 */
export function updateTicketClassificationFromPicklists(picklists: {
  source?: Array<{ value: string; label: string; isActive: boolean }>;
  queue?: Array<{ value: string; label: string; isActive: boolean }>;
}): void {
  if (picklists.source) {
    const ids = picklists.source
      .filter(e => e.isActive && AUTOMATED_SOURCE_LABEL_PATTERNS.some(p => p.test(e.label)))
      .map(e => parseInt(e.value, 10))
      .filter(n => Number.isInteger(n));
    if (ids.length > 0) cachedAutomatedSourceIds = ids;
  }
  if (picklists.queue) {
    const ids = picklists.queue
      .filter(e => e.isActive && ALERT_QUEUE_LABEL_PATTERNS.some(p => p.test(e.label)))
      .map(e => parseInt(e.value, 10))
      .filter(n => Number.isInteger(n));
    if (ids.length > 0) cachedAlertQueueIds = ids;
  }
}

/** Current automated source ids (dynamic or TCT defaults). */
export function getAutomatedSourceIds(): number[] {
  return cachedAutomatedSourceIds ?? DEFAULT_AUTOMATED_SOURCE_IDS;
}

/** Current automated alert queue ids (dynamic or TCT defaults). */
export function getAlertQueueIds(): number[] {
  return cachedAlertQueueIds ?? DEFAULT_ALERT_QUEUE_IDS;
}

/** Test-only: reset the dynamic caches back to defaults. */
export function resetTicketClassificationCache(): void {
  cachedAutomatedSourceIds = null;
  cachedAlertQueueIds = null;
}

// ============================================
// CLASSIFIER
// ============================================

export type TicketClassification = 'human' | 'automated';

/**
 * The minimal ticket shape the classifier needs. Works for both synced DB
 * rows (Ticket / joined lifecycle data) and live Autotask API tickets —
 * map `assignedResourceID` → `assignedResourceId`, `queueID` → `queueId`.
 */
export interface ClassifiableTicket {
  /** Autotask source picklist id (null = unknown → human) */
  source: number | null | undefined;
  sourceLabel?: string | null;
  queueId?: number | null;
  queueLabel?: string | null;
  assignedResourceId?: number | null;
  /**
   * Total hours logged on the ticket when the caller has them (lifecycle
   * totalHoursLogged / summed time entries). undefined = unknown, which only
   * affects the rescue of an assigned source-8 ticket still sitting in an
   * alert queue — callers without time data treat those as automated.
   */
  hoursLogged?: number | null;
}

/** Is this source id/label an automated (monitoring) channel? */
export function isAutomatedSource(source: number | null | undefined, sourceLabel?: string | null): boolean {
  if (source !== null && source !== undefined) {
    if (getAutomatedSourceIds().includes(source)) return true;
  }
  if (sourceLabel) {
    return AUTOMATED_SOURCE_LABEL_PATTERNS.some(p => p.test(sourceLabel));
  }
  return false;
}

/** Is this queue an automated alert queue? */
export function isAlertQueue(queueId?: number | null, queueLabel?: string | null): boolean {
  if (queueId !== null && queueId !== undefined && getAlertQueueIds().includes(queueId)) return true;
  if (queueLabel) return ALERT_QUEUE_LABEL_PATTERNS.some(p => p.test(queueLabel));
  return false;
}

/**
 * Classify one ticket. See the module docstring for the rule; the canonical
 * truth table:
 *
 *   automated source (8):
 *     unassigned                          → automated
 *     assigned + non-alert queue          → human   (misfiled — ticket 34477)
 *     assigned + alert queue + real time  → human   (a tech actually worked it)
 *     assigned + alert queue + no time    → automated
 *   human/null source:
 *     alert queue + unassigned + no time  → automated (integration left the
 *                                           default source — ticket 34369)
 *     everything else                     → human
 */
export function classifyTicket(t: ClassifiableTicket): TicketClassification {
  const assigned = t.assignedResourceId !== null && t.assignedResourceId !== undefined;
  const hasTime = typeof t.hoursLogged === 'number' && t.hoursLogged > 0;

  if (!isAutomatedSource(t.source, t.sourceLabel)) {
    // Human source — but an unassigned, untouched ticket in an automated
    // alert queue is an alert whose integration never set the source.
    if (isAlertQueue(t.queueId, t.queueLabel) && !assigned && !hasTime) return 'automated';
    return 'human';
  }

  // Source says automated — apply the misfile rescue.
  if (assigned) {
    if (!isAlertQueue(t.queueId, t.queueLabel)) return 'human';
    if (hasTime) return 'human';
  }
  return 'automated';
}

export function isAutomatedTicket(t: ClassifiableTicket): boolean {
  return classifyTicket(t) === 'automated';
}

export function isHumanTicket(t: ClassifiableTicket): boolean {
  return classifyTicket(t) === 'human';
}

/** Partition a ticket list into human-support and automated-monitoring buckets. */
export function splitByClassification<T extends ClassifiableTicket>(
  tickets: T[],
): { human: T[]; automated: T[] } {
  const human: T[] = [];
  const automated: T[] = [];
  for (const t of tickets) {
    (classifyTicket(t) === 'human' ? human : automated).push(t);
  }
  return { human, automated };
}

// ============================================
// SQL PREDICATES (bulk aggregation paths)
// ============================================
// The daily aggregation jobs compute metrics in bulk SQL where the TS
// classifier can't run per row. These fragments mirror classifyTicket()
// EXACTLY — the TS function is canonical; change both together (locked by
// ticket-classification.test.ts). Ids are integers from our own picklist
// cache, validated below — never user input.

function intList(ids: number[]): string {
  const safe = ids.filter(n => Number.isInteger(n));
  return safe.length > 0 ? safe.join(', ') : 'NULL';
}

/**
 * SQL condition matching AUTOMATED tickets, for a query aliasing the
 * `tickets` table as `alias`. Requires the ticket_time_entries table to be
 * joinable (uses an EXISTS subquery for the logged-time rescue). Every atom
 * is null-guarded so the whole expression is two-valued — negating it for
 * the human condition can never silently drop null-source rows.
 */
export function automatedTicketSqlCondition(alias: string): string {
  const sources = intList(getAutomatedSourceIds());
  const queues = intList(getAlertQueueIds());
  const automatedSource = `(${alias}.source IS NOT NULL AND ${alias}.source IN (${sources}))`;
  const inAlertQueue = `(${alias}."queueId" IS NOT NULL AND ${alias}."queueId" IN (${queues}))`;
  const unassigned = `${alias}."assignedResourceId" IS NULL`;
  const noTime = `NOT EXISTS (` +
    `SELECT 1 FROM ticket_time_entries te_cls ` +
    `WHERE te_cls."autotaskTicketId" = ${alias}."autotaskTicketId" AND te_cls."hoursWorked" > 0)`;
  return `((${automatedSource} AND (${unassigned} OR (${inAlertQueue} AND ${noTime})))` +
    ` OR (NOT ${automatedSource} AND ${inAlertQueue} AND ${unassigned} AND ${noTime}))`;
}

/** SQL condition matching HUMAN tickets (negation of the automated condition). */
export function humanTicketSqlCondition(alias: string): string {
  return `(NOT ${automatedTicketSqlCondition(alias)})`;
}

// ============================================
// MONITORING EVENT BREAKDOWN
// ============================================
// Presentation grouping for the "Security Monitoring Activity" section —
// which platform generated an automated ticket, derived from title/queue.

export type MonitoringEventType = 'saas-identity' | 'endpoint' | 'network' | 'backup' | 'other';

export const MONITORING_EVENT_TYPE_LABELS: Record<MonitoringEventType, string> = {
  'saas-identity': 'Cloud & identity protection (SaaS Alerts)',
  endpoint: 'Endpoint threat detection (Datto EDR)',
  network: 'Network monitoring',
  backup: 'Backup monitoring',
  other: 'Other monitoring',
};

/** SaaS Alerts identity/file event titles (file events, IAM events, sign-ins, responses). */
const SAAS_IDENTITY_TITLE_PATTERNS = [
  /\bfile\s+(event|download|upload|delete|deletion)\b/i,
  /\bfile \w+ limit exceeded\b/i,
  /outside approved location/i,
  /\biam\b/i,
  /\bsign[\s-]?in\b/i,
  /\blog[\s-]?in\b/i,
  /\brespond:/i,
  /\bstale account\b/i,
  /\baccount clean\s?up\b/i,
  /\bsaas\b/i,
  /\bmailbox\b/i,
  /\bidentity\b/i,
];

/** Datto EDR / endpoint / managed-SOC host detection titles. */
const ENDPOINT_TITLE_PATTERNS = [
  /\bdatto\s+edr\b/i,
  /\bedr\b/i,
  /\bendpoint\b/i,
  /\bransomware\b/i,
  /\bmalware\b/i,
  /\bmanaged soc\b/i,
];

/** Group an automated ticket by the platform that generated it. */
export function classifyMonitoringEvent(t: {
  title?: string | null;
  queueId?: number | null;
  queueLabel?: string | null;
}): MonitoringEventType {
  const title = t.title || '';
  if (ENDPOINT_TITLE_PATTERNS.some(p => p.test(title))) return 'endpoint';
  if (SAAS_IDENTITY_TITLE_PATTERNS.some(p => p.test(title))) return 'saas-identity';
  const queue = t.queueLabel || '';
  if (/\bnetwork\b/i.test(queue)) return 'network';
  if (/\bbackup\b/i.test(queue)) return 'backup';
  return 'other';
}
