import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'
import { apiOk, apiError, generateRequestId } from '@/lib/api-response'
import {
  buildPendingActionsReport,
  type HrRequestRow,
} from '@/lib/hr/pending-actions'

export const dynamic = 'force-dynamic'

/**
 * HR pending actions — READ ONLY.
 *
 * Surfaces hr_requests rows that never reached a terminal status, plus any
 * armed 30-day account deletion. Before this route existed there was no admin
 * view of hr_requests at all: /api/hr/requests/[id] is GET-only and scoped to
 * a customer contact, and /admin/hr/flow is a static diagram. Finding a stuck
 * request meant opening the production database by hand, which is how a
 * four-month outage of future-dated onboarding and offboarding went unnoticed.
 * See docs/incidents/2026-09-03-tribros-scheduled-deletion-rca.md
 *
 * GET is the only method. There is deliberately no cancel, retry or re-arm
 * verb here: this route reports state and nothing else. Acting on a finding is
 * a human task, and a destructive action needs the guards proposed in the RCA
 * before any code should be allowed to trigger it.
 */

const UNDEFINED_TABLE = '42P01'

/** Every column the classifier needs, and nothing else. */
const COLUMNS = `
  id,
  type,
  status,
  company_slug,
  target_upn,
  target_user_id,
  scheduled_deletion_date::text AS scheduled_deletion_date,
  autotask_ticket_id,
  autotask_ticket_number,
  submitted_by_email,
  submitted_by_name,
  impersonated_by_email,
  error_message,
  answers,
  started_at,
  completed_at,
  created_at,
  updated_at
`

/** Today's date in Eastern time — the timezone every HR date on the form means. */
function todayEastern(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  // en-CA formats as YYYY-MM-DD
  return parts
}

export async function GET() {
  const reqId = generateRequestId()

  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role) {
      return apiError('Unauthorized', reqId, 401)
    }

    const pool = getPool()

    // Read anything not terminal, plus anything with an armed deletion —
    // including completed rows, because a completed offboarding is exactly
    // where an armed deletion lives.
    const { rows } = await pool.query<HrRequestRow>(
      `SELECT ${COLUMNS}
         FROM hr_requests
        WHERE status IS NULL
           OR status NOT IN ('completed', 'failed')
           OR scheduled_deletion_date IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 500`
    )

    const report = buildPendingActionsReport(rows, todayEastern())

    return apiOk(
      {
        ...report,
        // Named so the UI can state its own limits rather than implying the
        // platform knows more than it does.
        limits: {
          readOnly: true,
          scope:
            'hr_requests rows that are not completed or failed, plus any row with an armed deletion date. Newest 500.',
          cannotDetermine:
            'Whether an account is actually enabled, licensed or in use is state in the customer tenant, not in this database. This page reports what the platform recorded, not what Microsoft 365 currently says.',
        },
      },
      reqId
    )
  } catch (error) {
    const err = error as { code?: string; message?: string }
    if (err?.code === UNDEFINED_TABLE) {
      // Fresh environment or preview DB with no HR tables yet — that is not a
      // failure, but it must never render as "nothing pending".
      return apiOk(
        {
          today: todayEastern(),
          summary: {
            pendingDeletions: 0,
            pendingDeletionsUrgent: 0,
            wedged: 0,
            neverStarted: 0,
            armedScheduled: 0,
            unknownStatus: 0,
            critical: 0,
            examined: 0,
          },
          actions: [],
          tableMissing: true,
          limits: {
            readOnly: true,
            scope: 'hr_requests does not exist in this environment.',
            cannotDetermine:
              'No HR requests could be read at all, so this is not evidence that nothing is pending.',
          },
        },
        reqId
      )
    }
    console.error('[admin/hr/pending-actions] Query failed:', err?.message ?? error)
    return apiError(
      `Could not read HR requests: ${err?.message ?? 'unknown error'}`,
      reqId,
      500
    )
  }
}
