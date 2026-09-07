import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'
import { apiOk, apiError, generateRequestId } from '@/lib/api-response'
import { cancelScheduledDeletion } from '@/lib/hr/cancel-deletion'

export const dynamic = 'force-dynamic'

/**
 * Cancel a pending 30-day account deletion. TCT staff only.
 *
 * This is the cancellation path that did not exist. The customer-visible note
 * posted when a deletion is armed has been telling clients since launch that
 * the deletion could be cancelled; until now that referred to nothing.
 *
 * STAFF ONLY, deliberately. Owner decision 2026-09-04 keeps the ability to
 * SCHEDULE a deletion with client contacts, but the customer portal's access
 * control is a shared URL with no password (owner decision 2026-03-20), so a
 * cancel button there would be only as strong as a forwarded link. A client
 * who wants a deletion stopped contacts TCT, and a named staff member acts.
 *
 * Cancelling is the SAFE direction — it prevents an irreversible action and
 * can be undone by submitting a new offboarding request. That asymmetry is why
 * this needs no second approval step, while arming one would.
 */
export async function POST(request: NextRequest) {
  const reqId = generateRequestId()

  const session = await auth()
  if (!session?.user?.email || !session.user.role) {
    return apiError('Unauthorized', reqId, 401)
  }

  let body: { requestId?: string; note?: string }
  try {
    body = await request.json()
  } catch {
    return apiError('Invalid JSON body', reqId, 400)
  }

  if (!body.requestId || typeof body.requestId !== 'string') {
    return apiError('requestId is required', reqId, 400)
  }

  const pool = getPool()
  const client = await pool.connect()
  try {
    const result = await cancelScheduledDeletion(
      client,
      body.requestId,
      // Attribution: the named human, not the literal 'system' the deletion
      // audit row used to carry.
      `staff:${session.user.email}`,
      'staff_cancelled',
      typeof body.note === 'string' ? body.note.slice(0, 500) : undefined
    )

    if (!result.cancelled) {
      // A no-op is reported as a no-op. Never render "cancelled" for a row
      // that was not armed — that is the success-shaped-output failure this
      // whole incident turned on.
      const status = result.reason === 'not_found' ? 404 : result.reason === 'error' ? 500 : 409
      return apiError(result.detail, reqId, status)
    }

    return apiOk(
      {
        cancelled: true,
        requestId: body.requestId,
        targetUpn: result.targetUpn,
        wasScheduledFor: result.scheduledDeletionDate,
        cancelledBy: session.user.email,
        detail: result.detail,
        note: 'The offboarding itself still stands — only the pending account deletion was called off.',
      },
      reqId
    )
  } finally {
    client.release()
  }
}
