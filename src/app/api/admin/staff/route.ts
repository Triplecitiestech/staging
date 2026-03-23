import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { hasPermission, ALL_PERMISSIONS, Permission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/staff — List all staff users with roles and permission overrides
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
        permissionOverrides: true,
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
 * PATCH /api/admin/staff — Update a staff user's role, active status, or permission overrides
 * Only SUPER_ADMIN can change roles and permissions
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { staffId, role, isActive, permissionOverrides } = await request.json()

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

    // Active status changes also require deactivate_staff
    if (isActive !== undefined) {
      if (!hasPermission(session.user?.role, 'deactivate_staff')) {
        return NextResponse.json({ error: 'Forbidden: only Super Admin can deactivate staff' }, { status: 403 })
      }

      // Prevent deactivating yourself
      if (staffId === session.user?.staffId && isActive === false) {
        return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 400 })
      }
    }

    // Permission override changes require manage_staff_roles
    if (permissionOverrides !== undefined) {
      if (!hasPermission(session.user?.role, 'manage_staff_roles')) {
        return NextResponse.json({ error: 'Forbidden: only Super Admin can change permissions' }, { status: 403 })
      }

      // Validate override structure
      if (permissionOverrides !== null) {
        if (typeof permissionOverrides !== 'object') {
          return NextResponse.json({ error: 'Invalid permissionOverrides format' }, { status: 400 })
        }
        const { granted, revoked } = permissionOverrides
        if (granted && !Array.isArray(granted)) {
          return NextResponse.json({ error: 'granted must be an array' }, { status: 400 })
        }
        if (revoked && !Array.isArray(revoked)) {
          return NextResponse.json({ error: 'revoked must be an array' }, { status: 400 })
        }
        // Validate all permission keys
        const allValid = [...(granted || []), ...(revoked || [])].every(
          (p: string) => ALL_PERMISSIONS.includes(p as Permission)
        )
        if (!allValid) {
          return NextResponse.json({ error: 'Invalid permission key in overrides' }, { status: 400 })
        }
      }
    }

    const updateData: Record<string, unknown> = {}
    if (role !== undefined) updateData.role = role
    if (isActive !== undefined) updateData.isActive = isActive
    if (permissionOverrides !== undefined) updateData.permissionOverrides = permissionOverrides

    const updated = await prisma.staffUser.update({
      where: { id: staffId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        permissionOverrides: true,
      },
    })

    return NextResponse.json({ success: true, staff: updated })
  } catch (error) {
    console.error('[Staff API] PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update staff' }, { status: 500 })
  }
}
