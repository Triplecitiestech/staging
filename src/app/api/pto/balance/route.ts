import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { getMappingForStaffId } from '@/lib/pto/mapping'
import { getEmployeeBalances } from '@/lib/gusto/client'
import { getActiveConnection } from '@/lib/gusto/connection'
import { ptoRouteErrorResponse } from '@/lib/pto/route-errors'

export const dynamic = 'force-dynamic'

/**
 * GET /api/pto/balance
 *   - returns current user's balances
 * GET /api/pto/balance?staffUserId=...
 *   - returns another user's balances (requires approve_pto)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role || !session.user.staffId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const queryStaffId = request.nextUrl.searchParams.get('staffUserId')
    let targetStaffId = session.user.staffId
    if (queryStaffId && queryStaffId !== session.user.staffId) {
      if (!hasPermission(session.user.role, 'approve_pto', session.user.permissionOverrides)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      targetStaffId = queryStaffId
    }

    const conn = await getActiveConnection()
    if (!conn || !conn.companyUuid) {
      return NextResponse.json({ connected: false, balances: [] })
    }

    const mapping = await getMappingForStaffId(targetStaffId)
    if (!mapping) {
      return NextResponse.json({ connected: true, mapped: false, balances: [] })
    }

    try {
      const balances = await getEmployeeBalances(conn.companyUuid, mapping.gustoEmployeeUuid)
      return NextResponse.json({ connected: true, mapped: true, balances })
    } catch (err) {
      return NextResponse.json(
        {
          connected: true,
          mapped: true,
          balances: [],
          error: err instanceof Error ? err.message : 'Fetch failed',
        },
        { status: 502 }
      )
    }
  } catch (err) {
    return ptoRouteErrorResponse(err)
  }
}
