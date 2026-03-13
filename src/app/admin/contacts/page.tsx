import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AdminHeader from '@/components/admin/AdminHeader'
import ContactsList from '@/components/contacts/ContactsList'

export const dynamic = 'force-dynamic'

export default async function ContactsPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  // Fetch all contacts with their company info
  let contacts: Array<{
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
  }> = []

  try {
    const rawContacts = await prisma.companyContact.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        title: true,
        phone: true,
        phoneType: true,
        isPrimary: true,
        isActive: true,
        companyId: true,
        customerRole: true,
        inviteStatus: true,
        invitedAt: true,
        inviteAcceptedAt: true,
        lastPortalLogin: true,
        company: { select: { id: true, displayName: true, slug: true } },
      },
      orderBy: { name: 'asc' },
    })

    contacts = rawContacts
  } catch {
    // Table may not exist yet — contacts will be empty
  }

  // Fetch staff users
  let staffUsers: Array<{
    id: string
    name: string
    email: string
    role: string
    isActive: boolean
    lastLogin: Date | null
  }> = []

  try {
    const rawStaff = await prisma.staffUser.findMany({
      select: { id: true, name: true, email: true, role: true, isActive: true, lastLogin: true },
      orderBy: { name: 'asc' },
    })
    staffUsers = rawStaff.map(s => ({ ...s, role: s.role as string }))
  } catch {
    // StaffRole enum may have changed — fall back to raw query
    try {
      staffUsers = await prisma.$queryRaw<typeof staffUsers>`
        SELECT id, name, email, role::text, "isActive", "lastLogin"
        FROM staff_users ORDER BY name ASC
      `
    } catch {
      // Table may not exist
    }
  }

  // Get current user info
  const currentStaff = staffUsers.find(s => s.email === session.user?.email)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">User Management</h1>
            <p className="text-sm text-slate-400 mt-1">Manage TCT staff permissions and client portal access</p>
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
            lastLogin: s.lastLogin?.toISOString() || null,
          }))}
          currentUserRole={currentStaff?.role || 'TECHNICIAN'}
          currentUserId={currentStaff?.id || ''}
        />
      </main>
    </div>
  )
}
