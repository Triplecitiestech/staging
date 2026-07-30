// src/lib/autotask-activity.ts
//
// Pure logic for the ticket ACTIVITY timeline and the activity-gap check.
//
// WHY THIS EXISTS (2026-07-30, ticket 34648): autotask_ticket_notes returns
// Autotask TicketNotes and STRUCTURALLY EXCLUDES time entries. On ticket 34648
// a technician logged 2.67 hours of completed provisioning work as time entry
// 13188; it was invisible to the notes read, and the assistant told the owner
// there was "no update from Ghenel showing the work finished". The ticket
// payload already carried the contradiction — lastActivityDate was
// 2026-07-29T14:48:47 while the newest returned note was 12:08:22 — and nothing
// compared the two.
//
// That is a FALSE-ACCUSATION risk against an employee, so it is treated as a
// correctness bug: a read that cannot see all activity must say so, and any
// read whose lastActivityDate postdates the newest row it returned must warn
// that unretrieved activity exists.
//
// Everything here is pure and unit-tested (autotask-activity.test.ts) — the
// I/O lives on AutotaskClient.getTicketActivity().

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

/**
 * Whether a timeline item is visible to the customer.
 *
 * `unknown` is a first-class answer, not a fallback to guessing: the REST
 * TimeEntries entity carries NO publish/visibility field on this instance
 * (verified live via entityInformation), so a time entry's customer visibility
 * genuinely cannot be read from the API. Reporting `unknown` with the reason is
 * correct; inferring `internal` or `customer_visible` would be inventing a
 * vendor capability, which is the class of bug this module exists to kill.
 */
export type VisibilityScope = 'customer_visible' | 'internal' | 'unknown'

export interface ActivityVisibility {
  scope: VisibilityScope
  /** Exactly what the scope was derived from, so a human can audit it. */
  basis: string
}

/**
 * Official basis for reading TicketNotes.publish as customer visibility.
 *
 * Kaseya's own UI documentation for the note form (the "Internal" check box,
 * which is what `publish` records) states: "If cleared (default setting), all
 * Autotask resources, Outsourcing partners, and customers with access to the
 * item in the Client Portal can view the note. If selected, only internal
 * Autotask resources will be able to view the note."
 *
 * https://www.autotask.net/help/content/3_features/7_servicedesk/WorkTickets/AddTaskTicketNote.htm
 *
 * On this instance the cleared state is publish id 1, label "All Autotask
 * Users" (system picklist value). The label is counter-intuitive — it reads as
 * MSP-internal but is the CUSTOMER-VISIBLE setting — which is why the label is
 * always echoed alongside the scope rather than left for a reader to infer.
 */
const PUBLISH_DOC =
  'Kaseya note-form docs: Internal cleared (publish "All Autotask Users") = resources, outsourcing partners and Client Portal customers can view; Internal selected = internal resources only'

/**
 * Classify a note/attachment publish value.
 *
 * LABEL-DRIVEN first, id second. The live picklist label is the instance's own
 * word for the setting, so matching on it survives an instance whose ids differ,
 * and the id check is the fallback for a label we do not recognise. Anything
 * unrecognised is `unknown` — never defaulted.
 */
export function classifyPublishVisibility(
  publish: number | null | undefined,
  label: string | null | undefined,
): ActivityVisibility {
  const l = (label ?? '').trim()
  const shown = l ? `publish ${publish ?? '?'} "${l}"` : `publish ${publish ?? 'absent'} (label not resolved)`

  if (/^internal/i.test(l)) {
    return { scope: 'internal', basis: `${shown} — label begins "Internal", so not visible to customer contacts. ${PUBLISH_DOC}` }
  }
  if (/^all autotask users$/i.test(l)) {
    return { scope: 'customer_visible', basis: `${shown} — ${PUBLISH_DOC}` }
  }
  // Label unresolved or unrecognised: fall back to the system publish ids.
  if (publish === 1) {
    return { scope: 'customer_visible', basis: `${shown} — id 1 is the Internal-cleared state. ${PUBLISH_DOC}` }
  }
  if (publish === 2 || publish === 4) {
    return { scope: 'internal', basis: `${shown} — id ${publish} is an Internal state. ${PUBLISH_DOC}` }
  }
  return {
    scope: 'unknown',
    basis: `${shown} — not a publish value this connector can classify; read it in Autotask before treating the item as customer-visible or internal`,
  }
}

/**
 * Time-entry visibility. Constant, because there is nothing to derive from.
 *
 * autotask_capability_check(TimeEntries, publish) returns: "entityInformation
 * for TimeEntries lists no field named publish". summaryNotes and internalNotes
 * are separate fields with no per-record visibility flag between them, so the
 * honest answer is `unknown` plus the field-level split.
 */
export function timeEntryVisibility(): ActivityVisibility {
  return {
    scope: 'unknown',
    basis:
      'The Autotask REST TimeEntries entity exposes NO publish/visibility field (verified against live entityInformation), so customer visibility cannot be read from the API. summaryNotes is the customer-facing work summary and internalNotes is internal, but no API field states who may view the record.',
  }
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export type ActivitySource = 'ticket_note' | 'time_entry' | 'attachment'

export interface ActivityAuthor {
  /** 'resource' = TCT staff, 'contact' = the customer, 'unknown' = neither id present. */
  type: 'resource' | 'contact' | 'unknown'
  resourceId: number | null
  name: string | null
  email: string | null
  contactId: number | null
  /**
   * Set when the row was written through the API on someone's behalf (the
   * connector always impersonates the signed-in tech). Autotask attributes the
   * row to creatorResourceID and records the impersonator separately.
   */
  impersonatorResourceId: number | null
}

export interface ActivityItem {
  source: ActivitySource
  /** The REST entity this row came from — the tag that makes exclusions visible. */
  sourceEntity: 'TicketNotes' | 'TimeEntries' | 'TicketAttachments'
  id: number
  /** Timestamp the timeline is ordered by. */
  at: string
  /** Which field `at` came from, so ordering provenance is never guessed at. */
  atField: string
  title: string | null
  author: ActivityAuthor
  visibility: ActivityVisibility
  /** Note description / time-entry summary / attachment path. */
  body: string | null
  /** Internal-only text, where the entity has a distinct field for it. */
  internalBody: string | null
  /** Time entries only. */
  work: { dateWorked: string | null; startDateTime: string | null; endDateTime: string | null; hoursWorked: number | null; hoursToBill: number | null; billable: boolean | null } | null
  /** Attachments only: which note/time entry the file hangs off, if any. */
  parent: { ticketNoteId: number | null; timeEntryId: number | null } | null
  /** Attachments only. */
  file: { contentType: string | null; attachmentType: string | null } | null
  /**
   * Notes only. noteType 13 is Autotask's own "Workflow Rule X fired" system
   * note — machine activity, not a person's update — so a reader can tell those
   * apart from a technician's note without pattern-matching the title.
   */
  noteType: { id: number; label: string | null } | null
}

/** Ascending by `at`; rows with an unparseable `at` sort last, in id order. */
export function sortActivity(items: ActivityItem[]): ActivityItem[] {
  return [...items].sort((a, b) => {
    const ta = Date.parse(a.at)
    const tb = Date.parse(b.at)
    const va = Number.isNaN(ta)
    const vb = Number.isNaN(tb)
    if (va && vb) return a.id - b.id
    if (va) return 1
    if (vb) return -1
    if (ta !== tb) return ta - tb
    return a.id - b.id
  })
}

/** Newest parseable timestamp across the items, or null when there are none. */
export function newestTimestamp(items: Array<{ at: string }>): string | null {
  let best: number | null = null
  let bestRaw: string | null = null
  for (const it of items) {
    const t = Date.parse(it.at)
    if (Number.isNaN(t)) continue
    if (best === null || t > best) { best = t; bestRaw = it.at }
  }
  return bestRaw
}

// ---------------------------------------------------------------------------
// Activity gap
// ---------------------------------------------------------------------------

export interface ActivityGap {
  /**
   * true  = lastActivityDate postdates the newest row this read returned, so
   *         activity exists that the caller has NOT seen.
   * false = the read accounts for the ticket's last activity.
   * null  = NOT MEASURED (the ticket carried no lastActivityDate). Never
   *         collapsed to false — an unmeasured check must not read as a clean
   *         bill of health.
   */
  activityGap: boolean | null
  lastActivityDate: string | null
  /** Newest item this read returned, or null when it returned none. */
  newestRetrievedActivityAt: string | null
  /** Raw size of the gap. A human can always see whether it is 3s or 40min. */
  gapSeconds: number | null
  reason: 'no_last_activity_date' | 'no_items_retrieved' | 'activity_newer_than_read' | 'read_accounts_for_last_activity'
}

/**
 * Compare a ticket's lastActivityDate against the newest row a read returned.
 *
 * NO TOLERANCE WINDOW, deliberately. Autotask stamps lastActivityDate as a side
 * effect of the same transaction, and async workflow/notification notes land a
 * second or two later, so small positive gaps are common and a tolerance would
 * suppress them. It would also suppress real ones. Given the failure being
 * fixed — an employee wrongly reported as having done no work — the asymmetry is
 * clear: a spurious "go check the timeline" costs one tool call, a missed gap
 * costs someone a false accusation. So this errs toward warning and publishes
 * gapSeconds so the reader can tell workflow skew from unretrieved work.
 */
export function computeActivityGap(input: {
  lastActivityDate?: string | null
  newestRetrievedActivityAt?: string | null
}): ActivityGap {
  const last = (input.lastActivityDate ?? '').trim() || null
  const newest = (input.newestRetrievedActivityAt ?? '').trim() || null
  const lastMs = last ? Date.parse(last) : NaN

  if (!last || Number.isNaN(lastMs)) {
    return { activityGap: null, lastActivityDate: last, newestRetrievedActivityAt: newest, gapSeconds: null, reason: 'no_last_activity_date' }
  }
  if (!newest) {
    return { activityGap: true, lastActivityDate: last, newestRetrievedActivityAt: null, gapSeconds: null, reason: 'no_items_retrieved' }
  }
  const newestMs = Date.parse(newest)
  if (Number.isNaN(newestMs)) {
    return { activityGap: true, lastActivityDate: last, newestRetrievedActivityAt: newest, gapSeconds: null, reason: 'no_items_retrieved' }
  }
  const gapSeconds = Math.round((lastMs - newestMs) / 1000)
  return gapSeconds > 0
    ? { activityGap: true, lastActivityDate: last, newestRetrievedActivityAt: newest, gapSeconds, reason: 'activity_newer_than_read' }
    : { activityGap: false, lastActivityDate: last, newestRetrievedActivityAt: newest, gapSeconds, reason: 'read_accounts_for_last_activity' }
}

function humanDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (h < 24) return rem ? `${h}h ${rem}m` : `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

/**
 * Human-readable warning for a gap, naming the tool to call. Returns null when
 * there is nothing to warn about (gap false, or not measured).
 */
export function activityGapWarning(
  ticketId: number,
  gap: ActivityGap,
  opts: { retrieved: string; isActivityTool?: boolean },
): string | null {
  if (gap.activityGap !== true) return null
  const next = opts.isActivityTool
    ? `Re-read with autotask_ticket_activity({ ticketId: ${ticketId} }); if the gap persists, the remaining activity is a ticket field change (status, assignment, a Quick Edit) rather than a note, time entry or attachment — open the ticket in Autotask.`
    : `Call autotask_ticket_activity({ ticketId: ${ticketId} }) for the merged timeline (notes + time entries + attachments) before stating that work was not done or that the ticket was not updated.`

  if (gap.reason === 'no_items_retrieved') {
    return `UNRETRIEVED ACTIVITY: ticket ${ticketId} reports lastActivityDate ${gap.lastActivityDate}, and this read returned no ${opts.retrieved}. Activity exists on this ticket that you have not seen. ${next}`
  }
  return `UNRETRIEVED ACTIVITY: ticket ${ticketId} reports lastActivityDate ${gap.lastActivityDate}, which is ${humanDuration(gap.gapSeconds ?? 0)} NEWER than the most recent ${opts.retrieved} this read returned (${gap.newestRetrievedActivityAt}). Activity exists on this ticket that this read did not return. ${next}`
}

// ---------------------------------------------------------------------------
// Customer-notification verdict
// ---------------------------------------------------------------------------

export interface NotificationVerdict {
  customerNotified: boolean
  reason: 'advanced' | 'no_baseline' | 'unchanged' | 'never_notified'
}

/**
 * Did a CUSTOMER notification fire, judged from Tickets.lastCustomerNotification-
 * DateTime read before and after a write?
 *
 * Pure and separately tested because it is the exact decision that, done
 * sloppily, recreates the bug being fixed. In particular a MISSING BASELINE
 * (the pre-write read failed) must never be treated as "previously null": a
 * ticket notified last week would then look freshly notified, and the tool would
 * report a customer as contacted when nothing was sent.
 *
 * `true` requires positive evidence. Everything else is false — fail-closed,
 * because notifications may dispatch asynchronously but the only dangerous
 * direction is claiming contact that never happened.
 */
export function decideNotificationVerdict(input: {
  /** false when the pre-write read failed. */
  baselineEstablished: boolean
  before: string | null
  after: string | null
}): NotificationVerdict {
  if (!input.baselineEstablished) return { customerNotified: false, reason: 'no_baseline' }

  const afterMs = input.after ? Date.parse(input.after) : NaN
  if (!input.after || Number.isNaN(afterMs)) return { customerNotified: false, reason: 'never_notified' }

  const beforeMs = input.before ? Date.parse(input.before) : NaN
  if (!input.before || Number.isNaN(beforeMs)) return { customerNotified: true, reason: 'advanced' }

  return afterMs > beforeMs
    ? { customerNotified: true, reason: 'advanced' }
    : { customerNotified: false, reason: 'unchanged' }
}

// ---------------------------------------------------------------------------
// Structural exclusions
// ---------------------------------------------------------------------------

/**
 * Permanent, unconditional caveat for autotask_ticket_notes.
 *
 * The timestamp gap check catches unretrieved NEWER activity. It does NOT catch
 * the structural hole that caused the 34648 defect: on that ticket the two time
 * entries were OLDER than the newest note, so a pure timestamp comparison would
 * have reported no gap while the completed work was still invisible. Both
 * signals are therefore emitted — this one on every notes read, regardless of
 * timestamps.
 */
export const TICKET_NOTES_EXCLUSIONS = {
  returns: ['TicketNotes'],
  excludes: ['TimeEntries (technician time entries and their work summaries)', 'TicketAttachments'],
  doNotUseFor:
    'Do NOT use this read as the basis for any claim that work was not done, that a technician did not update the ticket, or that nothing happened in a period. Time entries are excluded by construction and a technician\'s completed work is routinely recorded there and nowhere else. autotask_ticket_activity is the tool for that question.',
} as const
