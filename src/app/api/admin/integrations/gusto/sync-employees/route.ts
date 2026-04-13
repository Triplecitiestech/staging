import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { findOrCreateAutoMappings } from '@/lib/pto/mapping'
import { getActiveConnection, updateCompanyInfo } from '@/lib/gusto/connection'
import { getPrimaryCompany } from '@/lib/gusto/client'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/integrations/gusto/sync-employees
 *
 * Pulls employees from Gusto and auto-matches by email to StaffUsers.
 * Returns unmatched staff + unmatched Gusto employees for manual mapping.
 */
export async function POST(_request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email || !session.user.role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasPermission(session.user.role, 'manage_pto_integrations', session.user.permissionOverrides)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const conn = await getActiveConnection()
    if (!conn) {
      return NextResponse.json({ error: 'Gusto is not connected' }, { status: 400 })
    }
    if (!conn.companyUuid) {
      const primary = await getPrimaryCompany()
      if (!primary) {
        return NextResponse.json(
          { error: 'Could not resolve Gusto company UUID. Ensure the OAuth user administers a company.' },
          { status: 400 }
        )
      }
      await updateCompanyInfo(conn.id, primary.uuid, primary.name)
    }

    if (!session.user.staffId) {
      return NextResponse.json({ error: 'Staff profile missing' }, { status: 400 })
    }
    const result = await findOrCreateAutoMappings(session.user.staffId)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
