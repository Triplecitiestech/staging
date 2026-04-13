import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { getActiveConnection } from '@/lib/gusto/connection'
import { verifyConnection } from '@/lib/gusto/client'
import { getGustoEnvironment } from '@/lib/gusto/config'
import { isMissingTableError } from '@/lib/pto/route-errors'

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
  let conn: Awaited<ReturnType<typeof getActiveConnection>> = null
  try {
    conn = await getActiveConnection()
  } catch (err) {
    if (isMissingTableError(err)) {
      return NextResponse.json({
        connected: false,
        environment: env,
        migrationMissing: true,
        error:
          'PTO database tables are not installed yet. An admin must run the 20260413000000_add_pto_system migration.',
      })
    }
    return NextResponse.json(
      { connected: false, environment: env, error: err instanceof Error ? err.message : 'DB error' },
      { status: 500 }
    )
  }
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
