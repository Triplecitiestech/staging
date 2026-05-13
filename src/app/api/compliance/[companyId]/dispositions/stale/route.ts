/**
 * GET /api/compliance/[companyId]/dispositions/stale
 *
 * Returns finding dispositions (and deferred pending changes) that look
 * stale and need staff attention. Backs the future cockpit's "needs
 * attention" panel — C16/F4 from current-tasks.md.
 *
 * Pure read; no side effects.
 *
 * Query params:
 *   ?limit=N  — cap rows returned (default 100, max 500)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { findStaleDispositions } from '@/lib/compliance/stale-dispositions'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { companyId } = await params
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  const rawLimit = request.nextUrl.searchParams.get('limit')
  const limit = rawLimit ? Math.min(Math.max(parseInt(rawLimit, 10) || 0, 1), 500) : 100

  await ensureComplianceTables()
  try {
    const rows = await findStaleDispositions(companyId, limit)
    return NextResponse.json({ success: true, data: rows, count: rows.length })
  } catch (err) {
    console.error('[compliance/dispositions/stale] error:', err)
    return NextResponse.json({ error: 'Failed to load stale dispositions' }, { status: 500 })
  }
}
