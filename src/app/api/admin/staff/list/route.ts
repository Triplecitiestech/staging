import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/staff/list
 *
 * Lightweight list of active staff used by dropdowns (e.g. PTO coverage
 * picker). Any signed-in staff user can read it.
 */
export async function GET(_request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const staff = await prisma.staffUser.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ staff })
  } catch (err) {
    // Graceful degradation — if the enum heal hasn't run yet, fall back to raw SQL
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string; name: string; email: string }>>(
        `SELECT id, name, email FROM "staff_users" WHERE "isActive" = true ORDER BY name ASC`
      )
      return NextResponse.json({ staff: rows })
    } catch {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to list staff' },
        { status: 500 }
      )
    }
  }
}
