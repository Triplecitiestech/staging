/**
 * HR request pending-action classification.
 *
 * Why this exists: an HR request that never reaches a terminal status is
 * invisible. Nothing in the platform surfaced it — there was no admin view of
 * hr_requests at all, /api/hr/requests/[id] is GET-only and customer-scoped,
 * and /admin/hr/flow is a static diagram. The only way to find a stuck request
 * was to open the production database by hand.
 *
 * Two failure classes this makes visible, both observed in production:
 *
 *  1. WEDGED requests. A future-dated request is processed, the account is
 *     created (locked) or the offboarding is deferred, and the platform then
 *     tries to park the row at status 'scheduled'. When that write fails the
 *     row stays at 'running'. The cron only selects status = 'scheduled', so it
 *     never executes, and /api/hr/process refuses to re-drive a 'running' row
 *     while returning HTTP 200 — so a retry reports success and does nothing.
 *     Live cause as of 2026-09: a production-only CHECK constraint,
 *     hr_requests_status_check, rejects the value 'scheduled'. That constraint
 *     is not defined anywhere in this repository.
 *
 *  2. PENDING DELETIONS. scheduled_deletion_date arms an irreversible Graph
 *     DELETE /users up to 30 days in the future, with no cancellation path and
 *     no pre-execution verification. See
 *     docs/incidents/2026-09-03-tribros-scheduled-deletion-rca.md.
 *
 * Pure functions only — no I/O — so the classification is unit-testable
 * (pending-actions.test.ts) without a pg pool.
 *
 * READ-ONLY BY CONSTRUCTION: nothing here writes, cancels, or reschedules
 * anything. It describes state. Acting on a finding is a human task.
 */

/** Statuses that mean the request is finished and needs no attention. */
export const TERMINAL_STATUSES: readonly string[] = ['completed', 'failed']

/**
 * The statuses the application code actually writes to hr_requests.status.
 * Kept here so a value the code can emit but the database rejects is
 * reportable rather than mysterious.
 */
export const KNOWN_STATUSES: readonly string[] = [
  'pending',
  'running',
  'scheduled',
  'completed',
  'failed',
]

export type PendingSeverity = 'critical' | 'warning' | 'info'

export type PendingKind =
  /** scheduled_deletion_date is set — an irreversible deletion is armed */
  | 'pending_deletion'
  /** status 'running' with started_at — will never execute and will never retry */
  | 'wedged_running'
  /** status 'pending' with no started_at — processing never began */
  | 'never_started'
  /** status 'scheduled' — parked as designed, waiting for its date */
  | 'armed_scheduled'
  /** a status outside KNOWN_STATUSES — should be impossible */
  | 'unknown_status'

/** The shape this module needs from an hr_requests row. */
export interface HrRequestRow {
  id: string
  type: string
  status: string
  company_slug: string | null
  target_upn: string | null
  target_user_id: string | null
  scheduled_deletion_date: string | null
  autotask_ticket_id: number | null
  autotask_ticket_number: string | null
  submitted_by_email: string | null
  submitted_by_name: string | null
  impersonated_by_email: string | null
  error_message: string | null
  answers: Record<string, unknown> | string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string | null
}

export interface PendingAction {
  requestId: string
  kind: PendingKind
  severity: PendingSeverity
  type: string
  status: string
  companySlug: string | null
  /** Best available identifier for the person the request is about. */
  subject: string | null
  /** Entra objectId when the platform resolved one. Null is meaningful. */
  entraObjectId: string | null
  autotaskTicketId: number | null
  autotaskTicketNumber: string | null
  /** Direct link to the Autotask ticket, or null when there is no ticket. */
  autotaskTicketUrl: string | null
  submittedBy: string | null
  impersonatedBy: string | null
  /** onboarding start_date or offboarding last_day, whichever applies. */
  effectiveDate: string | null
  scheduledDeletionDate: string | null
  /** True when the request was future-dated at submission time. */
  wasFutureDated: boolean
  /** Days between the effective date and today. Negative = overdue. */
  daysUntilEffective: number | null
  errorMessage: string | null
  createdAt: string
  startedAt: string | null
  /** One sentence on what is wrong. */
  finding: string
  /** What a human should check, in plain language. No UI click paths. */
  consequence: string
}

const SEVERITY_ORDER: Record<PendingSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

function parseAnswers(raw: HrRequestRow['answers']): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }
  return Array.isArray(raw) ? {} : raw
}

function asDateOnly(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value)
  return match ? match[1] : null
}

/**
 * The date the request is keyed to: start_date for onboarding, last_day for
 * offboarding. Null when the form did not carry one.
 */
export function effectiveDateOf(row: HrRequestRow): string | null {
  const a = parseAnswers(row.answers)
  return row.type === 'onboarding' ? asDateOnly(a.start_date) : asDateOnly(a.last_day)
}

/**
 * Whole days from `today` to `date`. Negative when the date has passed.
 * Both arguments are YYYY-MM-DD; the arithmetic is calendar-day, not elapsed
 * time, so a caller in any timezone gets the same answer for the same strings.
 */
export function daysBetween(today: string, date: string): number | null {
  const a = Date.parse(`${today}T00:00:00Z`)
  const b = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 86_400_000)
}

/** Subject of the request: the resolved UPN, else whatever the form named. */
export function subjectOf(row: HrRequestRow): string | null {
  if (row.target_upn) return row.target_upn
  const a = parseAnswers(row.answers)
  const candidates = [a.employee_to_offboard, a.work_email, a.desired_username]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  const first = typeof a.first_name === 'string' ? a.first_name.trim() : ''
  const last = typeof a.last_name === 'string' ? a.last_name.trim() : ''
  const name = [first, last].filter(Boolean).join(' ')
  return name || null
}

function ticketUrl(ticketId: number | null): string | null {
  return ticketId
    ? `https://ww14.autotask.net/Mvc/ServiceDesk/TicketDetail.mvc?TicketId=${ticketId}`
    : null
}

/**
 * Classify one row. Returns null when the row needs no attention — a terminal
 * status with no armed deletion.
 *
 * `today` is YYYY-MM-DD and is injected rather than read from the clock, so the
 * classification is deterministic in tests.
 */
export function classifyRequest(row: HrRequestRow, today: string): PendingAction | null {
  const status = (row.status ?? '').trim()
  const hasPendingDeletion = Boolean(row.scheduled_deletion_date)
  const isTerminal = TERMINAL_STATUSES.includes(status)

  if (isTerminal && !hasPendingDeletion) return null

  const effectiveDate = effectiveDateOf(row)
  const createdDate = asDateOnly(row.created_at)
  const wasFutureDated = Boolean(
    effectiveDate && createdDate && effectiveDate > createdDate
  )
  const daysUntilEffective = effectiveDate ? daysBetween(today, effectiveDate) : null

  const base = {
    requestId: row.id,
    type: row.type,
    status,
    companySlug: row.company_slug,
    subject: subjectOf(row),
    entraObjectId: row.target_user_id,
    autotaskTicketId: row.autotask_ticket_id,
    autotaskTicketNumber: row.autotask_ticket_number,
    autotaskTicketUrl: ticketUrl(row.autotask_ticket_id),
    submittedBy: row.submitted_by_email,
    impersonatedBy: row.impersonated_by_email,
    effectiveDate,
    scheduledDeletionDate: row.scheduled_deletion_date,
    wasFutureDated,
    daysUntilEffective,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
  }

  // An armed deletion outranks everything else about the row. It is the only
  // irreversible action in the system.
  if (hasPendingDeletion) {
    const days = row.scheduled_deletion_date
      ? daysBetween(today, row.scheduled_deletion_date)
      : null
    const when =
      days === null
        ? 'on an unparseable date'
        : days < 0
          ? `${Math.abs(days)} day(s) ago and has not cleared`
          : days === 0
            ? 'today'
            : `in ${days} day(s)`
    return {
      ...base,
      kind: 'pending_deletion',
      severity: days !== null && days <= 7 ? 'critical' : 'warning',
      finding: `A permanent Microsoft 365 account deletion is armed and due ${when}.`,
      consequence:
        'The nightly job deletes this account with no live check that it is still ' +
        'disabled, unlicensed or unused, and there is no cancellation path in the ' +
        'platform. If this person was reinstated, verify the account in the tenant ' +
        'before the date arrives.',
    }
  }

  if (status === 'running' && row.started_at) {
    // The wedge: cron ignores it (selects 'scheduled') and /api/hr/process
    // refuses to re-drive a 'running' row while answering HTTP 200.
    const onboarding = row.type === 'onboarding'
    const overdue = daysUntilEffective !== null && daysUntilEffective < 0
    return {
      ...base,
      kind: 'wedged_running',
      severity: overdue ? 'critical' : 'warning',
      finding:
        'Processing started but never finished. The request is stuck at "running", ' +
        'so the nightly job will not pick it up and re-submitting it returns ' +
        'success without doing anything.',
      consequence: onboarding
        ? row.target_user_id
          ? 'The Microsoft 365 account was created but future-dated onboardings are ' +
            'created with sign-in BLOCKED, and the job that unblocks them never ran. ' +
            'Check whether this person can actually sign in.'
          : 'No account was created for this person. Check whether they were set up ' +
            'by hand.'
        : 'The offboarding actions were deferred to the last working day and never ' +
          'ran. Check whether this person still has access.',
    }
  }

  if (status === 'pending' && !row.started_at) {
    return {
      ...base,
      kind: 'never_started',
      severity: 'critical',
      finding:
        'The request was submitted but processing never began — no Autotask ticket, ' +
        'no start time, nothing ran.',
      consequence:
        row.type === 'offboarding'
          ? 'Nothing was revoked. Check whether this person still has access.'
          : 'Nothing was provisioned. Check whether this person was set up by hand.',
    }
  }

  if (status === 'scheduled') {
    return {
      ...base,
      kind: 'armed_scheduled',
      severity: 'info',
      finding: 'Parked as designed, waiting for its date.',
      consequence:
        'No action needed unless the date has passed. This is what a healthy ' +
        'future-dated request looks like.',
    }
  }

  if (!KNOWN_STATUSES.includes(status)) {
    return {
      ...base,
      kind: 'unknown_status',
      severity: 'warning',
      finding: `Status "${status || '(empty)'}" is not a value this application writes.`,
      consequence:
        'Something outside the platform set this, or the row predates the current ' +
        'status values. Check the request before assuming it is finished.',
    }
  }

  // status 'running' with no started_at — mid-flight or an interrupted write.
  return {
    ...base,
    kind: 'wedged_running',
    severity: 'warning',
    finding:
      'Status is "running" but no start time was recorded, so it is unclear whether ' +
      'processing ever began.',
    consequence:
      'Treat as not run. Check the Autotask ticket and the tenant before assuming ' +
      'anything happened.',
  }
}

export interface PendingActionsSummary {
  pendingDeletions: number
  /** Pending deletions due within 7 days. */
  pendingDeletionsUrgent: number
  wedged: number
  neverStarted: number
  armedScheduled: number
  unknownStatus: number
  /** Rows classified critical. */
  critical: number
  /** Total rows examined, including healthy ones that produced no finding. */
  examined: number
}

export interface PendingActionsReport {
  today: string
  summary: PendingActionsSummary
  /** Most severe first, then soonest effective date, then newest. */
  actions: PendingAction[]
}

/**
 * Classify a whole result set and order it so the thing that matters most is
 * first. Rows needing no attention are dropped, but still counted in
 * `summary.examined` — so "nothing to show" is distinguishable from
 * "nothing was read".
 */
export function buildPendingActionsReport(
  rows: HrRequestRow[],
  today: string
): PendingActionsReport {
  const actions: PendingAction[] = []
  for (const row of rows) {
    const action = classifyRequest(row, today)
    if (action) actions.push(action)
  }

  actions.sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sev !== 0) return sev
    const aDate = a.scheduledDeletionDate ?? a.effectiveDate ?? ''
    const bDate = b.scheduledDeletionDate ?? b.effectiveDate ?? ''
    if (aDate && bDate && aDate !== bDate) return aDate < bDate ? -1 : 1
    if (aDate && !bDate) return -1
    if (!aDate && bDate) return 1
    return a.createdAt < b.createdAt ? 1 : -1
  })

  const countKind = (kind: PendingKind) => actions.filter((a) => a.kind === kind).length

  return {
    today,
    summary: {
      pendingDeletions: countKind('pending_deletion'),
      pendingDeletionsUrgent: actions.filter(
        (a) => a.kind === 'pending_deletion' && a.severity === 'critical'
      ).length,
      wedged: countKind('wedged_running'),
      neverStarted: countKind('never_started'),
      armedScheduled: countKind('armed_scheduled'),
      unknownStatus: countKind('unknown_status'),
      critical: actions.filter((a) => a.severity === 'critical').length,
      examined: rows.length,
    },
    actions,
  }
}
