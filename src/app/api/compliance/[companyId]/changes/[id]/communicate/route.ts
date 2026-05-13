/**
 * POST /api/compliance/[companyId]/changes/[id]/communicate
 *
 * Staff attestation that the change was communicated to the customer.
 * Moves status: awaiting_customer → scheduled. This is the only gate
 * before deployment — customer-side acknowledgement is not separately
 * required.
 *
 * Body:
 *   {
 *     communicationMethod: 'email' | 'phone' | 'in_person' | 'ticket' | 'screenshare' | 'meeting'
 *     scheduledFor?: string                  // ISO datetime — when staff plans to deploy
 *     customerReplyReference?: string        // free-text link / ticket id / etc.
 *   }
 *
 * See docs/plans/CHANGE_MANAGEMENT_AND_REMEDIATION.md §4.3.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import {
  assertStatusTransition,
  loadPendingChange,
  withClient,
  writeAudit,
} from '@/lib/compliance/change-management'

export const dynamic = 'force-dynamic'

const VALID_METHODS = new Set(['email', 'phone', 'in_person', 'ticket', 'screenshare', 'meeting'])

interface Body {
  communicationMethod?: string
  scheduledFor?: string | null
  customerReplyReference?: string | null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string; id: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { companyId, id } = await params

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.communicationMethod || !VALID_METHODS.has(body.communicationMethod)) {
    return NextResponse.json(
      { error: `communicationMethod must be one of: ${Array.from(VALID_METHODS).join(', ')}` },
      { status: 400 }
    )
  }

  await ensureComplianceTables()
  try {
    const result = await withClient(async (client) => {
      const current = await loadPendingChange(client, companyId, id)
      if (!current) return { notFound: true as const }
      try {
        assertStatusTransition(current.status, 'scheduled')
      } catch (err) {
        return { illegalState: true as const, error: (err as Error).message }
      }
      await client.query(
        `UPDATE compliance_pending_changes
         SET status = 'scheduled',
             "communicatedAt" = NOW(),
             "communicatedBy" = $1,
             "communicationMethod" = $2,
             "customerReplyReference" = COALESCE($3, "customerReplyReference"),
             "scheduledFor" = $4::timestamptz,
             "updatedAt" = NOW()
         WHERE id = $5`,
        [
          session.user.email,
          body.communicationMethod,
          body.customerReplyReference ?? null,
          body.scheduledFor ?? null,
          id,
        ]
      )
      await writeAudit(client, {
        companyId,
        action: 'pending_change.communicated',
        actor: session.user.email!,
        details: {
          id,
          previousStatus: current.status,
          communicationMethod: body.communicationMethod,
          scheduledFor: body.scheduledFor ?? null,
        },
      })
      return { ok: true as const }
    })

    if ('notFound' in result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if ('illegalState' in result) return NextResponse.json({ error: result.error }, { status: 409 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[compliance/changes/communicate] error:', err)
    return NextResponse.json({ error: 'Failed to record staff attestation' }, { status: 500 })
  }
}
