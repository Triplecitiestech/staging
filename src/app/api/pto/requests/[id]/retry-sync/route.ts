import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { retrySyncs } from '@/lib/pto/service'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * POST /api/pto/requests/[id]/retry-sync
 *
 * Retries both Gusto balance adjustment and Microsoft 365 calendar sync for an
 * already-approved request. Only callable by approvers.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email || !session.user.role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasPermission(session.user.role, 'approve_pto', session.user.permissionOverrides)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  try {
    await retrySyncs(id)
    const updated = await prisma.timeOffRequest.findUnique({ where: { id } })
    return NextResponse.json({
      ok: true,
      gustoSyncStatus: updated?.gustoSyncStatus ?? null,
      graphSyncStatus: updated?.graphSyncStatus ?? null,
      gustoSyncError: updated?.gustoSyncError ?? null,
      graphSyncError: updated?.graphSyncError ?? null,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Retry failed' },
      { status: 500 }
    )
  }
}
