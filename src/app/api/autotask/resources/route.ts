import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { AutotaskClient } from '@/lib/autotask'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/autotask/resources
 * Returns the current user's Autotask resource info (matched by email).
 * Caches the mapping in the staff_users table for future lookups.
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const staffUser = await prisma.staffUser.findUnique({
      where: { email: session.user.email },
    })

    // Check cache first
    if (staffUser?.autotaskResourceId) {
      const cachedResourceId = parseInt(staffUser.autotaskResourceId, 10)
      const client = new AutotaskClient()
      try {
        const resource = await client.getResource(cachedResourceId)
        return NextResponse.json({
          matched: true,
          resourceId: resource.id,
          name: `${resource.firstName} ${resource.lastName}`.trim(),
          email: resource.email,
        })
      } catch {
        // Cached ID no longer valid, fall through to email lookup
      }
    }

    // Look up by email
    const client = new AutotaskClient()
    const resource = await client.getResourceByEmail(session.user.email)

    if (!resource) {
      return NextResponse.json({
        matched: false,
        message: 'No Autotask resource found for your email address.',
      })
    }

    // Cache the mapping
    try {
      await prisma.staffUser.update({
        where: { email: session.user.email },
        data: { autotaskResourceId: String(resource.id) },
      })
    } catch {
      // Non-critical
    }

    return NextResponse.json({
      matched: true,
      resourceId: resource.id,
      name: `${resource.firstName} ${resource.lastName}`.trim(),
      email: resource.email,
    })
  } catch (error) {
    console.error('Error looking up Autotask resource:', error)
    return NextResponse.json(
      { error: 'Failed to look up resource', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
