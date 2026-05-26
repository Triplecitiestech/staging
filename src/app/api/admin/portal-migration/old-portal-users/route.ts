import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { AutotaskClient } from '@/lib/autotask'
import { hasPermission, parseOverrides, type Permission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function staffCanDo(sessionEmail: string | null | undefined, permission: Permission): Promise<boolean> {
  if (!sessionEmail) return false
  try {
    const staff = await prisma.staffUser.findUnique({
      where: { email: sessionEmail },
      select: { role: true, permissionOverrides: true, isActive: true },
    })
    if (!staff || !staff.isActive) return false
    return hasPermission(staff.role as string, permission, parseOverrides(staff.permissionOverrides))
  } catch {
    return false
  }
}

type MatchStatus =
  | 'ready'
  | 'already_invited'
  | 'already_active'
  | 'declined'
  | 'inactive'
  | 'no_match'
  | 'ambiguous'

interface ContactMatch {
  contactId: string
  contactName: string
  contactRole: string
  inviteStatus: string
  invitedAt: string | null
  inviteAcceptedAt: string | null
  companyId: string
  companyName: string
  companySlug: string
}

interface MatchedRow {
  rowIndex: number
  email: string
  lastLoginIso: string | null
  daysSinceLogin: number | null
  csvName: string | null
  csvCompanyHint: string | null
  status: MatchStatus
  matches: ContactMatch[]
}

/**
 * GET /api/admin/portal-migration/old-portal-users
 *
 * Pulls all active Client Access Portal users from Autotask, joins them to
 * local company_contacts via autotaskContactId, and returns rows in the same
 * shape as the CSV-match endpoint so the same UI table can render them.
 *
 * Rows without a matching local contact appear as `no_match` — those need to
 * be brought into the local DB first (typically via the company sync).
 */
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await staffCanDo(session.user?.email, 'invite_customers'))) {
    return NextResponse.json({ error: 'Forbidden — you need the "invite_customers" permission' }, { status: 403 })
  }

  let portalUsers
  try {
    const client = new AutotaskClient()
    portalUsers = await client.getActiveClientPortalUsers()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Autotask query failed: ${message}` }, { status: 502 })
  }

  if (portalUsers.length === 0) {
    return NextResponse.json({ rows: [], portalUserCount: 0, contactCount: 0 })
  }

  const contactIds = Array.from(
    new Set(
      portalUsers
        .map((u) => u.contactID)
        .filter((id): id is number => typeof id === 'number' && id > 0)
        .map((id) => String(id))
    )
  )

  const localContacts = contactIds.length
    ? await prisma.companyContact.findMany({
        where: { autotaskContactId: { in: contactIds } },
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          customerRole: true,
          inviteStatus: true,
          invitedAt: true,
          inviteAcceptedAt: true,
          companyId: true,
          autotaskContactId: true,
          company: { select: { displayName: true, slug: true } },
        },
      })
    : []

  const byAtId = new Map<string, typeof localContacts>()
  for (const c of localContacts) {
    if (!c.autotaskContactId) continue
    const list = byAtId.get(c.autotaskContactId) ?? []
    list.push(c)
    byAtId.set(c.autotaskContactId, list)
  }

  const rows: MatchedRow[] = portalUsers
    .filter((u) => typeof u.contactID === 'number' && u.contactID > 0)
    .map((u, idx) => {
      const key = String(u.contactID)
      const hits = byAtId.get(key) ?? []

      const mappedHits: ContactMatch[] = hits.map((c) => ({
        contactId: c.id,
        contactName: c.name,
        contactRole: c.customerRole as string,
        inviteStatus: c.inviteStatus as string,
        invitedAt: c.invitedAt?.toISOString() ?? null,
        inviteAcceptedAt: c.inviteAcceptedAt?.toISOString() ?? null,
        companyId: c.companyId,
        companyName: c.company.displayName,
        companySlug: c.company.slug,
      }))

      let status: MatchStatus
      if (hits.length === 0) {
        status = 'no_match'
      } else if (hits.length > 1) {
        status = 'ambiguous'
      } else {
        const c = hits[0]
        if (!c.isActive) status = 'inactive'
        else if (c.inviteStatus === 'ACCEPTED') status = 'already_active'
        else if (c.inviteStatus === 'INVITED') status = 'already_invited'
        else if (c.inviteStatus === 'DECLINED') status = 'declined'
        else status = 'ready'
      }

      const primary = hits[0]
      const email = primary?.email ?? `(Autotask contact #${u.contactID})`
      const name = primary?.name ?? null
      const companyHint = primary?.company.displayName ?? null

      return {
        rowIndex: idx,
        email,
        lastLoginIso: null,
        daysSinceLogin: null,
        csvName: name,
        csvCompanyHint: companyHint,
        status,
        matches: mappedHits,
      }
    })

  return NextResponse.json({
    rows,
    portalUserCount: portalUsers.length,
    contactCount: localContacts.length,
  })
}
