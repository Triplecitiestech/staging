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
  let contacts: {
    id: string
    name: string
    email: string
    title: string | null
    phone: string | null
    phoneType: string | null
    isPrimary: boolean
    isActive: boolean
    companyId: string
    company: { id: string; displayName: string; slug: string }
  }[] = []

  try {
    contacts = await prisma.companyContact.findMany({
      include: {
        company: {
          select: { id: true, displayName: true, slug: true }
        }
      },
      orderBy: { name: 'asc' }
    })
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
            <p className="text-sm text-slate-400 mt-1">Manage all client and staff contacts</p>
          </div>
        </div>

        <ContactsList
          contacts={contacts.map(c => ({
            ...c,
            phoneType: c.phoneType as 'MOBILE' | 'WORK' | null,
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
