import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AdminHeader from '@/components/admin/AdminHeader'
import ContactsList from '@/components/contacts/ContactsList'

export const dynamic = 'force-dynamic'

/**
 * Ensure the customer portal columns exist on company_contacts.
 * Mirrors the logic in /api/contacts/invite but runs at page load
 * so the server component can SELECT the new columns.
 */
async function ensureContactColumns() {
  const cols = [
    `ALTER TABLE "company_contacts" ADD COLUMN IF NOT EXISTS "customerRole" TEXT NOT NULL DEFAULT 'CLIENT_USER'`,
    `ALTER TABLE "company_contacts" ADD COLUMN IF NOT EXISTS "inviteStatus" TEXT NOT NULL DEFAULT 'NOT_INVITED'`,
    `ALTER TABLE "company_contacts" ADD COLUMN IF NOT EXISTS "invitedAt" TIMESTAMP`,
    `ALTER TABLE "company_contacts" ADD COLUMN IF NOT EXISTS "inviteAcceptedAt" TIMESTAMP`,
    `ALTER TABLE "company_contacts" ADD COLUMN IF NOT EXISTS "lastPortalLogin" TIMESTAMP`,
  ]
  for (const sql of cols) {
    try { await prisma.$executeRawUnsafe(sql) } catch { /* already exists */ }
  }
}

export default async function ContactsPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  // Ensure portal columns exist before querying
  await ensureContactColumns()

  // Fetch all contacts with their company info + new portal fields
  interface ContactRow {
    id: string
    name: string
    email: string
    title: string | null
    phone: string | null
    phoneType: string | null
    isPrimary: boolean
    isActive: boolean
    companyId: string
    customerRole: string
    inviteStatus: string
    invitedAt: Date | null
    inviteAcceptedAt: Date | null
    lastPortalLogin: Date | null
    company: { id: string; displayName: string; slug: string }
  }

  let contacts: ContactRow[] = []

  try {
    // Use raw query to get the new columns that Prisma schema might not have generated yet
    const rawContacts = await prisma.$queryRaw<Array<{
      id: string
      name: string
      email: string
      title: string | null
      phone: string | null
      phoneType: string | null
      isPrimary: boolean
      isActive: boolean
      companyId: string
      customerRole: string
      inviteStatus: string
      invitedAt: Date | null
      inviteAcceptedAt: Date | null
      lastPortalLogin: Date | null
    }>>`
      SELECT id, name, email, title, phone, "phoneType", "isPrimary", "isActive",
             "companyId", "customerRole", "inviteStatus", "invitedAt", "inviteAcceptedAt", "lastPortalLogin"
      FROM "company_contacts"
      ORDER BY name ASC
    `

    // Fetch companies for the contacts
    const companyIds = Array.from(new Set(rawContacts.map(c => c.companyId)))
    const companies = companyIds.length > 0
      ? await prisma.company.findMany({
          where: { id: { in: companyIds } },
          select: { id: true, displayName: true, slug: true },
        })
      : []
    const companyMap = new Map(companies.map(c => [c.id, c]))

    contacts = rawContacts
      .filter(c => companyMap.has(c.companyId))
      .map(c => ({
        ...c,
        company: companyMap.get(c.companyId)!,
      }))
  } catch {
    // Table may not exist yet
  }

  // Also fetch staff users
  const staffUsers = await prisma.staffUser.findMany({
    select: { id: true, name: true, email: true, role: true, isActive: true, lastLogin: true },
    orderBy: { name: 'asc' }
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Contacts</h1>
            <p className="text-sm text-slate-400 mt-1">Manage client contacts, portal access, and invitations</p>
          </div>
        </div>

        <ContactsList
          contacts={contacts.map(c => ({
            ...c,
            phoneType: c.phoneType as 'MOBILE' | 'WORK' | null,
            customerRole: c.customerRole || 'CLIENT_USER',
            inviteStatus: c.inviteStatus || 'NOT_INVITED',
            invitedAt: c.invitedAt?.toISOString() || null,
            lastPortalLogin: c.lastPortalLogin?.toISOString() || null,
          }))}
          staffUsers={staffUsers.map(s => ({
            ...s,
            role: s.role as string,
            lastLogin: s.lastLogin?.toISOString() || null,
          }))}
        />
      </main>
    </div>
  )
}
