import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/debug/staff-lookup?email=<address>
 *   Authorization: Bearer <MIGRATION_SECRET>
 *
 * POST /api/admin/debug/staff-lookup
 *   Authorization: Bearer <MIGRATION_SECRET>
 *   Body: { email: string, isActive?: boolean, role?: StaffRole }
 *
 * Lightweight admin diagnostic to check a staff user's sign-in state
 * (auto-provisioned? deactivated? correct role?) and optionally flip
 * isActive / role. Uses MIGRATION_SECRET rather than a staff session so
 * it works even when an admin can't sign in.
 */
function authorize(request: NextRequest): boolean {
  const header = request.headers.get('authorization')
  const query = request.nextUrl.searchParams.get('secret')
  const expected = process.env.MIGRATION_SECRET
  if (!expected) return false
  return (
    (header === `Bearer ${expected}`) ||
    (query === expected)
  )
}

function norm(email: string | null | undefined) {
  return email ? email.trim().toLowerCase() : null
}

/**
 * Heal any legacy role values that Prisma no longer knows about so that
 * subsequent queries selecting `role` don't crash with
 *   "Value 'VIEWER' not found in enum 'StaffRole'"
 * This is a side-effect of every call — raw SQL so it bypasses the
 * Prisma enum deserializer.
 */
async function healLegacyRoles(): Promise<number> {
  try {
    const rows = await prisma.$executeRawUnsafe<number>(
      `UPDATE "staff_users" SET "role" = 'TECHNICIAN' WHERE "role" NOT IN ('SUPER_ADMIN','ADMIN','BILLING_ADMIN','TECHNICIAN')`
    )
    return typeof rows === 'number' ? rows : 0
  } catch (err) {
    console.error('[staff-lookup] healLegacyRoles failed:', err)
    return -1
  }
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const email = norm(request.nextUrl.searchParams.get('email'))
  if (!email) return NextResponse.json({ error: 'email query param required' }, { status: 400 })

  const healedRows = await healLegacyRoles()

  try {
    // Case-insensitive lookup
    const row = await prisma.staffUser.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        permissionOverrides: true,
      },
    })
    return NextResponse.json({ email, exists: !!row, staff: row, healedLegacyRoles: healedRows })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'lookup failed' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json().catch(() => null)
  const email = norm(body?.email)
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const data: { isActive?: boolean; role?: string; permissionOverrides?: unknown } = {}
  if (typeof body?.isActive === 'boolean') data.isActive = body.isActive
  if (typeof body?.role === 'string') data.role = body.role

  // Optional grant/revoke of specific permissions
  const grantPermissions: string[] = Array.isArray(body?.grantPermissions)
    ? body.grantPermissions.filter((p: unknown): p is string => typeof p === 'string')
    : []
  const revokePermissions: string[] = Array.isArray(body?.revokePermissions)
    ? body.revokePermissions.filter((p: unknown): p is string => typeof p === 'string')
    : []

  const healedRows = await healLegacyRoles()

  try {
    const existing = await prisma.staffUser.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    })

    if (!existing) {
      // Create as TECHNICIAN (can be promoted via staff admin UI)
      const created = await prisma.staffUser.create({
        data: {
          email,
          name: body?.name ?? email.split('@')[0],
          role: (data.role as never) ?? 'TECHNICIAN',
          isActive: data.isActive ?? true,
        },
      })
      return NextResponse.json({ ok: true, created: true, staff: created, healedLegacyRoles: healedRows })
    }

    // Apply permission override grants/revokes
    if (grantPermissions.length > 0 || revokePermissions.length > 0) {
      const current = await prisma.staffUser.findUnique({
        where: { id: existing.id },
        select: { permissionOverrides: true },
      })
      const existingOv = (current?.permissionOverrides ?? {}) as {
        granted?: string[]
        revoked?: string[]
      }
      const grantedSet = new Set(Array.isArray(existingOv.granted) ? existingOv.granted : [])
      const revokedSet = new Set(Array.isArray(existingOv.revoked) ? existingOv.revoked : [])
      for (const p of grantPermissions) {
        grantedSet.add(p)
        revokedSet.delete(p)
      }
      for (const p of revokePermissions) {
        revokedSet.add(p)
        grantedSet.delete(p)
      }
      data.permissionOverrides = {
        granted: Array.from(grantedSet),
        revoked: Array.from(revokedSet),
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: true, changed: false, message: 'No changes requested', healedLegacyRoles: healedRows })
    }

    const updated = await prisma.staffUser.update({
      where: { id: existing.id },
      data: data as never,
    })
    return NextResponse.json({ ok: true, updated: true, staff: updated, healedLegacyRoles: healedRows })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'update failed' },
      { status: 500 }
    )
  }
}
