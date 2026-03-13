import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/staff — List all staff users with roles
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!hasPermission(session.user?.role, 'view_staff')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const staff = await prisma.staffUser.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        autotaskResourceId: true,
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ staff })
  } catch (error) {
    console.error('[Staff API] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/staff — Update a staff user's role or active status
 * Only SUPER_ADMIN can change roles
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { staffId, role, isActive } = await request.json()

    if (!staffId) {
      return NextResponse.json({ error: 'staffId is required' }, { status: 400 })
    }

    // Role changes require manage_staff_roles permission (SUPER_ADMIN only)
    if (role !== undefined) {
      if (!hasPermission(session.user?.role, 'manage_staff_roles')) {
        return NextResponse.json({ error: 'Forbidden: only Super Admin can change roles' }, { status: 403 })
      }

      const validRoles = ['SUPER_ADMIN', 'ADMIN', 'BILLING_ADMIN', 'TECHNICIAN']
      if (!validRoles.includes(role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
      }

      // Prevent demoting yourself
      if (staffId === session.user?.staffId && role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 })
      }
    }

    // Active status changes also require manage_staff_roles
    if (isActive !== undefined) {
      if (!hasPermission(session.user?.role, 'deactivate_staff')) {
        return NextResponse.json({ error: 'Forbidden: only Super Admin can deactivate staff' }, { status: 403 })
      }

      // Prevent deactivating yourself
      if (staffId === session.user?.staffId && isActive === false) {
        return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 400 })
      }
    }

    const updateData: Record<string, unknown> = {}
    if (role !== undefined) updateData.role = role
    if (isActive !== undefined) updateData.isActive = isActive

    const updated = await prisma.staffUser.update({
      where: { id: staffId },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, isActive: true },
    })

    return NextResponse.json({ success: true, staff: updated })
  } catch (error) {
    console.error('[Staff API] PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update staff' }, { status: 500 })
  }
}
