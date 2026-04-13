import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { manuallyMap, unmap } from '@/lib/pto/mapping'
import { prisma } from '@/lib/prisma'
import { listEmployees } from '@/lib/gusto/client'
import { getActiveConnection } from '@/lib/gusto/connection'
import { ptoRouteErrorResponse } from '@/lib/pto/route-errors'

export const dynamic = 'force-dynamic'

/** GET — list all mappings plus unmatched staff + unmatched Gusto employees */
export async function GET(_request: NextRequest) {
  try {
  const session = await auth()
  if (!session?.user?.email || !session.user.role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasPermission(session.user.role, 'manage_pto_integrations', session.user.permissionOverrides)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const conn = await getActiveConnection()
  const [staff, mappings] = await Promise.all([
    prisma.staffUser.findMany({
      where: { isActive: true },
      select: { id: true, email: true, name: true, role: true },
      orderBy: { name: 'asc' },
    }),
    prisma.ptoEmployeeMapping.findMany({ orderBy: { staffEmail: 'asc' } }),
  ])

  let gustoEmployees: Array<{ uuid: string; name: string; workEmail: string | null; personalEmail: string | null }> = []
  if (conn?.companyUuid) {
    try {
      const raw = await listEmployees(conn.companyUuid)
      gustoEmployees = raw
        .filter((e) => !e.terminated)
        .map((e) => ({
          uuid: e.uuid,
          name: `${e.first_name} ${e.last_name}`.trim(),
          workEmail: e.work_email,
          personalEmail: e.email,
        }))
    } catch (err) {
      console.warn('[gusto/mapping] employee list failed:', err)
    }
  }

  const mappedStaffIds = new Set(mappings.map((m) => m.staffUserId))
  const mappedGustoUuids = new Set(mappings.map((m) => m.gustoEmployeeUuid))

  return NextResponse.json({
    connected: !!conn,
    mappings: mappings.map((m) => ({
      id: m.id,
      staffUserId: m.staffUserId,
      staffEmail: m.staffEmail,
      gustoEmployeeUuid: m.gustoEmployeeUuid,
      gustoName: `${m.gustoFirstName ?? ''} ${m.gustoLastName ?? ''}`.trim(),
      gustoWorkEmail: m.gustoWorkEmail,
      gustoPersonalEmail: m.gustoPersonalEmail,
      matchMethod: m.matchMethod,
      createdAt: m.createdAt.toISOString(),
    })),
    unmatchedStaff: staff.filter((s) => !mappedStaffIds.has(s.id)),
    unmatchedGustoEmployees: gustoEmployees.filter((e) => !mappedGustoUuids.has(e.uuid)),
  })
  } catch (err) {
    return ptoRouteErrorResponse(err)
  }
}

/** POST — { staffUserId, gustoEmployeeUuid } — manually map a staff user to a Gusto employee */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email || !session.user.role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasPermission(session.user.role, 'manage_pto_integrations', session.user.permissionOverrides)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!session.user.staffId) {
    return NextResponse.json({ error: 'Missing staff id on session' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const staffUserId = typeof body?.staffUserId === 'string' ? body.staffUserId : null
  const gustoEmployeeUuid = typeof body?.gustoEmployeeUuid === 'string' ? body.gustoEmployeeUuid : null
  if (!staffUserId || !gustoEmployeeUuid) {
    return NextResponse.json({ error: 'staffUserId and gustoEmployeeUuid required' }, { status: 400 })
  }

  try {
    await manuallyMap({ staffUserId, gustoEmployeeUuid, actorStaffId: session.user.staffId })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to map' },
      { status: 500 }
    )
  }
}

/** DELETE ?staffUserId=... — unmap */
export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email || !session.user.role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasPermission(session.user.role, 'manage_pto_integrations', session.user.permissionOverrides)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const staffUserId = request.nextUrl.searchParams.get('staffUserId')
  if (!staffUserId) return NextResponse.json({ error: 'staffUserId required' }, { status: 400 })
  await unmap(staffUserId)
  return NextResponse.json({ ok: true })
}
