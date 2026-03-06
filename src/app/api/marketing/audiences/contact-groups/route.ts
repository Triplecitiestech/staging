import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/marketing/audiences/contact-groups
 * Returns available Autotask Contact Groups (Action Types)
 * for audience targeting in the marketing system.
 */
export async function GET() {
  try {
    const { AutotaskClient } = await import('@/lib/autotask')
    const client = new AutotaskClient()
    const groups = await client.getContactGroups()

    return NextResponse.json({
      groups: groups.map(g => ({
        id: String(g.id),
        name: g.name,
        isActive: g.isActive,
      })),
    })
  } catch (error) {
    console.error('[Contact Groups API] Error:', error)
    return NextResponse.json({ groups: [] })
  }
}
