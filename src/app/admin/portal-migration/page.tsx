import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { hasPermission, parseOverrides } from '@/lib/permissions'
import AdminHeader from '@/components/admin/AdminHeader'
import PortalMigrationClient from '@/components/admin/PortalMigrationClient'

export const dynamic = 'force-dynamic'

export default async function PortalMigrationPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  let canInvite = false
  try {
    const staff = await prisma.staffUser.findUnique({
      where: { email: session.user?.email ?? '' },
      select: { role: true, permissionOverrides: true, isActive: true },
    })
    if (staff?.isActive) {
      canInvite = hasPermission(staff.role as string, 'invite_customers', parseOverrides(staff.permissionOverrides))
    }
  } catch {
    /* Treat as denied; the UI will explain. */
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Portal Migration</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-3xl">
            Move customers from the legacy Autotask Client Access Portal (<span className="text-slate-300">triplecitiestech.itclientportal.com</span>) to the new TCT Customer Portal. Upload an Autotask Client Portal Log export, match against existing contacts, and send invites in bulk.
          </p>
        </div>

        {!canInvite ? (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-6 text-rose-200">
            You need the <span className="font-mono text-rose-100">invite_customers</span> permission to use this page. Ask a Super Admin to grant it.
          </div>
        ) : (
          <PortalMigrationClient />
        )}
      </main>
    </div>
  )
}
