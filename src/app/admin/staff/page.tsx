import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AdminHeader from '@/components/admin/AdminHeader'
import ContactsList from '@/components/contacts/ContactsList'

export const dynamic = 'force-dynamic'

/**
 * /admin/staff — TCT internal staff user management.
 *
 * Renders the same ContactsList component as /admin/contacts but in
 * 'staff-only' mode (no client contacts tab). Centralizes role editing,
 * activation toggles, and permission overrides for TCT employees.
 */
export default async function StaffPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  let staffUsers: Array<{
    id: string
    name: string
    email: string
    role: string
    isActive: boolean
    lastLogin: Date | null
    permissionOverrides: unknown
  }> = []

  try {
    const rawStaff = await prisma.staffUser.findMany({
      select: { id: true, name: true, email: true, role: true, isActive: true, lastLogin: true, permissionOverrides: true },
      orderBy: { name: 'asc' },
    })
    staffUsers = rawStaff.map(s => ({ ...s, role: s.role as string }))
  } catch {
    try {
      const rawStaff = await prisma.staffUser.findMany({
        select: { id: true, name: true, email: true, role: true, isActive: true, lastLogin: true },
        orderBy: { name: 'asc' },
      })
      staffUsers = rawStaff.map(s => ({ ...s, role: s.role as string, permissionOverrides: null }))
    } catch {
      try {
        const rawRows = await prisma.$queryRaw<Array<{ id: string; name: string; email: string; role: string; isActive: boolean; lastLogin: Date | null }>>`
          SELECT id, name, email, role::text, "isActive", "lastLogin"
          FROM staff_users ORDER BY name ASC
        `
        staffUsers = rawRows.map(s => ({ ...s, permissionOverrides: null }))
      } catch {
        // Table may not exist
      }
    }
  }

  const currentStaff = staffUsers.find(s => s.email === session.user?.email)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Staff</h1>
            <p className="text-sm text-slate-400 mt-1">TCT staff roles, permissions, and access. Client contacts live on the <a href="/admin/contacts" className="underline">All Contacts page</a>.</p>
          </div>
        </div>

        <ContactsList
          mode="staff-only"
          contacts={[]}
          staffUsers={staffUsers.map(s => ({
            ...s,
            lastLogin: s.lastLogin?.toISOString() || null,
            permissionOverrides: s.permissionOverrides || null,
          })) as Parameters<typeof ContactsList>[0]['staffUsers']}
          currentUserRole={currentStaff?.role || 'TECHNICIAN'}
          currentUserId={currentStaff?.id || ''}
        />
      </main>
    </div>
  )
}
