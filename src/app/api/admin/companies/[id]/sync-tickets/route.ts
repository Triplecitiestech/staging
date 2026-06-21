/**
 * POST /api/admin/companies/[id]/sync-tickets
 *
 * Force-sync Autotask tickets for ONE company, session-authed. Lets an operator
 * pull a newly-linked customer's tickets on demand without a cron secret.
 *
 * The routine global sync (/api/reports/jobs/sync-tickets cron) is incremental
 * — it only looks back ~2 days from its last run — so it never backfills an
 * existing customer's older tickets when that customer is first linked. This
 * does a forced, single-company pull (last 30 days; sync.ts caps the forced
 * window) which stays well under the function time limit. SOC alerts for the
 * customer become visible once their tickets land in the mirror.
 *
 * Mirrors /api/admin/companies/[id]/sync-contacts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { syncTickets } from '@/lib/reporting/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    // force=true → forced 30-day window (sync.ts caps the forced first run);
    // companyFilter=id → only this company, so it finishes well under maxDuration.
    const result = await syncTickets(90, 2, true, id)
    return NextResponse.json({
      success: true,
      created: result.created,
      updated: result.updated,
      statusChanges: result.statusChanges,
      errors: result.errors.length > 0 ? result.errors : undefined,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[admin/companies/sync-tickets] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
