import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { checkCsrf } from '@/lib/security'
import { hasPermission, parseOverrides, type Permission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

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

interface InputRow {
  email: string
  lastLoginIso: string | null
  name?: string | null
  companyHint?: string | null
  rowIndex: number
}

type MatchStatus =
  | 'ready'           // contact exists, not yet invited to new portal
  | 'already_invited' // inviteStatus = INVITED
  | 'already_active'  // inviteStatus = ACCEPTED
  | 'declined'        // inviteStatus = DECLINED
  | 'inactive'        // contact found but isActive = false
  | 'no_match'        // no contact in our DB for that email
  | 'ambiguous'       // multiple contacts share this email across different companies

interface MatchedRow {
  rowIndex: number
  email: string
  lastLoginIso: string | null
  daysSinceLogin: number | null
  csvName: string | null
  csvCompanyHint: string | null
  status: MatchStatus
  matches: Array<{
    contactId: string
    contactName: string
    contactRole: string
    inviteStatus: string
    invitedAt: string | null
    inviteAcceptedAt: string | null
    companyId: string
    companyName: string
    companySlug: string
  }>
}

export async function POST(request: NextRequest) {
  const csrfDenied = checkCsrf(request)
  if (csrfDenied) return csrfDenied

  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await staffCanDo(session.user?.email, 'invite_customers'))) {
    return NextResponse.json({ error: 'Forbidden — you need the "invite_customers" permission' }, { status: 403 })
  }

  let body: { rows?: InputRow[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rows = Array.isArray(body.rows) ? body.rows : []
  if (rows.length === 0) {
    return NextResponse.json({ rows: [] })
  }

  if (rows.length > 5000) {
    return NextResponse.json({ error: 'Too many rows (max 5000). Split the CSV and try again.' }, { status: 413 })
  }

  const emails = Array.from(
    new Set(
      rows
        .map((r) => (r.email || '').trim().toLowerCase())
        .filter((e) => e.length > 0 && e.includes('@'))
    )
  )

  const contacts = emails.length
    ? await prisma.companyContact.findMany({
        where: { email: { in: emails, mode: 'insensitive' } },
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
          company: { select: { displayName: true, slug: true } },
        },
      })
    : []

  const byEmail = new Map<string, typeof contacts>()
  for (const c of contacts) {
    const key = c.email.trim().toLowerCase()
    const list = byEmail.get(key) ?? []
    list.push(c)
    byEmail.set(key, list)
  }

  const now = Date.now()
  const matched: MatchedRow[] = rows.map((r) => {
    const emailKey = (r.email || '').trim().toLowerCase()
    const hits = byEmail.get(emailKey) ?? []

    const daysSinceLogin =
      r.lastLoginIso && !Number.isNaN(Date.parse(r.lastLoginIso))
        ? Math.floor((now - Date.parse(r.lastLoginIso)) / 86_400_000)
        : null

    const mappedHits = hits.map((c) => ({
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

    return {
      rowIndex: r.rowIndex,
      email: r.email,
      lastLoginIso: r.lastLoginIso,
      daysSinceLogin,
      csvName: r.name ?? null,
      csvCompanyHint: r.companyHint ?? null,
      status,
      matches: mappedHits,
    }
  })

  return NextResponse.json({ rows: matched, contactCount: contacts.length })
}
