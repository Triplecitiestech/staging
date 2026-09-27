import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'
import { hasPermission } from '@/lib/permissions'
import { checkCsrf } from '@/lib/security'
import { apiOk, apiError, generateRequestId } from '@/lib/api-response'
import {
  RESOLVED_MANUALLY_STATUS,
  RESOLVE_MANUALLY_MIN_AGE_MS,
  resolveManuallyEligibility,
  type HrRequestRow,
} from '@/lib/hr/pending-actions'

export const dynamic = 'force-dynamic'

const NOTE_MIN = 10
const NOTE_MAX = 1000

/**
 * POST /api/admin/hr/pending-actions/resolve
 * Body: { requestId, note }
 *
 * Marks ONE stuck HR request as resolved manually — the record-keeping half of
 * a close-out a technician already did by hand in the tenant. It changes
 * NOTHING in Microsoft 365 or Autotask; it moves the row to the terminal
 * status 'resolved_manually' so /admin/hr/pending stops reporting work that is
 * done, and writes an hr_audit_logs row naming who closed it and what they did.
 *
 * Kept apart from the read-only GET at ../route.ts so that route's contract —
 * it reports state and nothing else — stays true.
 *
 * Refused unless resolveManuallyEligibility() passes: status pending or
 * running, untouched for an hour (not mid-flight), and no armed deletion.
 * The UPDATE re-asserts all three, so a row that changes between the read and
 * the write is refused rather than overwritten.
 */
export async function POST(request: NextRequest) {
  const csrfBlocked = checkCsrf(request)
  if (csrfBlocked) return csrfBlocked

  const reqId = generateRequestId()

  const session = await auth()
  if (!session?.user?.email || !session.user.role) {
    return apiError('Unauthorized', reqId, 401)
  }
  if (!hasPermission(session.user.role, 'add_notes', session.user.permissionOverrides)) {
    return apiError('Forbidden', reqId, 403)
  }

  let body: { requestId?: unknown; note?: unknown }
  try {
    body = await request.json()
  } catch {
    return apiError('Body must be JSON: { requestId, note }', reqId, 400)
  }
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : ''
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  if (!requestId) return apiError('requestId is required', reqId, 400)
  if (note.length < NOTE_MIN || note.length > NOTE_MAX) {
    return apiError(
      `note is required: ${NOTE_MIN}-${NOTE_MAX} characters saying what was done by hand, and where it is recorded`,
      reqId,
      400
    )
  }

  const actor = session.user.email
  const pool = getPool()
  const client = await pool.connect()
  try {
    const { rows } = await client.query<
      Pick<HrRequestRow, 'id' | 'status' | 'scheduled_deletion_date' | 'updated_at' | 'started_at' | 'created_at'> & {
        company_id: string
      }
    >(
      `SELECT id, company_id, status,
              scheduled_deletion_date::text AS scheduled_deletion_date,
              updated_at, started_at, created_at
         FROM hr_requests
        WHERE id = $1`,
      [requestId]
    )
    const row = rows[0]
    if (!row) return apiError('HR request not found', reqId, 404)

    const eligibility = resolveManuallyEligibility(row, new Date())
    if (!eligibility.eligible) return apiError(eligibility.reason, reqId, 409)

    const stamp = new Date().toISOString().slice(0, 10)
    const errorMessage = `Resolved manually by ${actor} on ${stamp}: ${note}`

    await client.query('BEGIN')
    const updated = await client.query(
      `UPDATE hr_requests
          SET status = $2, error_message = $3, updated_at = NOW()
        WHERE id = $1
          AND status IN ('pending', 'running')
          AND scheduled_deletion_date IS NULL
          AND COALESCE(updated_at, started_at, created_at) < NOW() - ($4::int * INTERVAL '1 millisecond')
        RETURNING id`,
      [requestId, RESOLVED_MANUALLY_STATUS, errorMessage, RESOLVE_MANUALLY_MIN_AGE_MS]
    )
    if (updated.rowCount !== 1) {
      await client.query('ROLLBACK')
      return apiError('The request changed while this was being saved. Reload and try again.', reqId, 409)
    }
    await client.query(
      `INSERT INTO hr_audit_logs (company_id, request_id, actor, action, resource, details, severity)
       VALUES ($1, $2, $3, 'resolved_manually', $4, $5::jsonb, 'info')`,
      [
        row.company_id,
        requestId,
        actor,
        `hr_request:${requestId}`,
        JSON.stringify({ previousStatus: row.status, note }),
      ]
    )
    await client.query('COMMIT')

    return apiOk({ requestId, status: RESOLVED_MANUALLY_STATUS }, reqId)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    const err = error as { code?: string; message?: string }
    // 23514 = check_violation: the production constraint predates
    // 'resolved_manually'. POST /api/migrations/run widens it.
    if (err?.code === '23514') {
      return apiError(
        "The database does not accept 'resolved_manually' yet. Run the migrations (POST /api/migrations/run) and try again.",
        reqId,
        503
      )
    }
    console.error('[admin/hr/pending-actions/resolve] Failed:', err?.message ?? error)
    return apiError(`Could not mark the request resolved: ${err?.message ?? 'unknown error'}`, reqId, 500)
  } finally {
    client.release()
  }
}
