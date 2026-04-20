import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { ensureSalesAgentTables } from '@/lib/sales-agents/ensure-tables'
import AdminHeader from '@/components/admin/AdminHeader'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Sales Agents · Triple Cities Tech Admin' }

export default async function AdminSalesAgentsPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  await ensureSalesAgentTables()

  const agents = await prisma.salesAgent.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      passwordHash: true,
      _count: { select: { referrals: true } },
    },
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Sales Agents</h1>
            <p className="text-slate-400 mt-2">Referral partners with portal access at /agents.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/sales-referrals"
              className="px-4 py-2 border border-white/20 text-slate-200 hover:text-white hover:bg-white/5 rounded-lg text-sm"
            >
              View Referrals
            </Link>
            <Link
              href="/admin/sales-agents/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg transition-all font-medium shadow-lg shadow-cyan-500/20"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Agent
            </Link>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
          {agents.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-300">
              No agents yet. Click <span className="text-cyan-300">Add Agent</span> to invite your first referral partner.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10">
                <thead className="bg-slate-900/50">
                  <tr>
                    <Th>Name</Th>
                    <Th>Email</Th>
                    <Th>Status</Th>
                    <Th>Referrals</Th>
                    <Th>Created</Th>
                    <Th>Last Login</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {agents.map(a => (
                    <tr key={a.id} className="hover:bg-white/5">
                      <td className="px-6 py-3 text-sm">
                        <Link href={`/admin/sales-agents/${a.id}`} className="text-cyan-300 hover:text-cyan-200 font-medium">
                          {a.firstName} {a.lastName}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-300">{a.email}</td>
                      <td className="px-6 py-3 text-sm">
                        <StatusPill active={a.isActive} hasPassword={!!a.passwordHash} />
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-200">{a._count.referrals}</td>
                      <td className="px-6 py-3 text-sm text-slate-400">{a.createdAt.toLocaleDateString()}</td>
                      <td className="px-6 py-3 text-sm text-slate-400">
                        {a.lastLoginAt ? a.lastLoginAt.toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">{children}</th>
}

function StatusPill({ active, hasPassword }: { active: boolean; hasPassword: boolean }) {
  if (!active) {
    return <span className="px-2 py-0.5 text-xs font-medium rounded border bg-slate-500/20 text-slate-300 border-slate-500/30">Disabled</span>
  }
  if (!hasPassword) {
    return <span className="px-2 py-0.5 text-xs font-medium rounded border bg-violet-500/20 text-violet-300 border-violet-500/30">Pending Setup</span>
  }
  return <span className="px-2 py-0.5 text-xs font-medium rounded border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">Active</span>
}
