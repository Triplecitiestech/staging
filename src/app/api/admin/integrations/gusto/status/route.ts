import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { getActiveConnection } from '@/lib/gusto/connection'
import { verifyConnection } from '@/lib/gusto/client'
import { getGustoEnvironment } from '@/lib/gusto/config'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email || !session.user.role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasPermission(session.user.role, 'manage_pto_integrations', session.user.permissionOverrides)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const env = getGustoEnvironment()
  const conn = await getActiveConnection()
  if (!conn) {
    return NextResponse.json({ connected: false, environment: env })
  }

  let live: { email?: string; primaryCompany?: { uuid: string; name: string } | null; error?: string } = {}
  try {
    const info = await verifyConnection()
    live = { email: info.email, primaryCompany: info.primaryCompany }
  } catch (err) {
    live = { error: err instanceof Error ? err.message : String(err) }
  }

  return NextResponse.json({
    connected: true,
    environment: conn.environment,
    companyUuid: conn.companyUuid,
    companyName: conn.companyName,
    tokenExpiresAt: conn.tokenExpiresAt.toISOString(),
    scope: conn.scope,
    live,
  })
}
