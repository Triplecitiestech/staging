import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { deactivateConnection, getActiveConnection } from '@/lib/gusto/connection'

export const dynamic = 'force-dynamic'

export async function POST(_request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email || !session.user.role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasPermission(session.user.role, 'manage_pto_integrations', session.user.permissionOverrides)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const conn = await getActiveConnection()
  if (!conn) return NextResponse.json({ ok: true, alreadyDisconnected: true })
  await deactivateConnection(conn.id)
  return NextResponse.json({ ok: true })
}
