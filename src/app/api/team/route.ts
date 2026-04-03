import { prisma } from '@/lib/prisma'
import { apiOk, apiError, generateRequestId } from '@/lib/api-response'

export const dynamic = 'force-dynamic'
export const revalidate = 3600 // Cache for 1 hour

/** Friendly role labels for public display */
const ROLE_TITLES: Record<string, string> = {
  SUPER_ADMIN: 'Founder & Principal Consultant',
  ADMIN: 'IT Administrator',
  BILLING_ADMIN: 'Account Manager',
  TECHNICIAN: 'IT Specialist',
}

/**
 * GET /api/team
 * Returns active staff members for public display on the About page.
 * Only exposes name and role — no email or internal IDs.
 */
export async function GET() {
  const reqId = generateRequestId()
  try {
    const staff = await prisma.staffUser.findMany({
      where: { isActive: true },
      select: { name: true, role: true },
      orderBy: [
        { role: 'asc' },   // SUPER_ADMIN first, then ADMIN, etc.
        { name: 'asc' },
      ],
    })

    const team = staff.map((s) => ({
      name: s.name,
      title: ROLE_TITLES[s.role] || 'IT Specialist',
      initials: s.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2),
    }))

    return apiOk({ team }, reqId)
  } catch (err) {
    console.error('[api/team] Failed to fetch staff:', err instanceof Error ? err.message : err)
    return apiError('Failed to load team data', reqId, 500)
  }
}
