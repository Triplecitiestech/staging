/**
 * GET /api/compliance/actions/[actionId]
 *
 * Read one remediation action from the static catalog.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getRemediationAction } from '@/lib/compliance/actions/catalog'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ actionId: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { actionId } = await params
  const action = getRemediationAction(actionId)
  if (!action) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ success: true, data: action })
}
