/**
 * GET /api/compliance/actions
 *
 * List remediation actions from the static catalog. Supports two filters:
 *   ?controlId=&frameworkId=  — only actions that satisfy this control
 *   ?capabilityId=            — only actions for this capability
 *
 * Returns the same RemediationAction shape that ships with the catalog —
 * no DB-derived state. See docs/plans/CHANGE_MANAGEMENT_AND_REMEDIATION.md §6.4.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { REMEDIATION_ACTIONS, suggestActionsForControl } from '@/lib/compliance/actions/catalog'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const controlId = request.nextUrl.searchParams.get('controlId')
  const frameworkId = request.nextUrl.searchParams.get('frameworkId')
  const capabilityId = request.nextUrl.searchParams.get('capabilityId')

  let data = REMEDIATION_ACTIONS as readonly typeof REMEDIATION_ACTIONS[number][]
  if (controlId && frameworkId) {
    data = suggestActionsForControl(frameworkId, controlId)
  }
  if (capabilityId) {
    data = data.filter((a) => a.capabilityId === capabilityId)
  }

  return NextResponse.json({ success: true, data, count: data.length })
}
