import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { ensureSalesAgentTables } from '@/lib/sales-agents/ensure-tables'
import AdminHeader from '@/components/admin/AdminHeader'
import ReferralsAdminTable from '@/components/admin/agents/ReferralsAdminTable'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Referrals · Triple Cities Tech Admin' }

export default async function AdminReferralsPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  await ensureSalesAgentTables()

  const [referrals, agents] = await Promise.all([
    prisma.salesReferral.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        businessName: true,
        contactName: true,
        contactEmail: true,
        status: true,
        contractMonthlyValue: true,
        createdAt: true,
        updatedAt: true,
        agent: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    }),
    prisma.salesAgent.findMany({
      orderBy: [{ firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ])

  const rows = referrals.map(r => ({
    id: r.id,
    businessName: r.businessName,
    contactName: r.contactName,
    contactEmail: r.contactEmail,
    status: r.status,
    contractMonthlyValue: r.contractMonthlyValue ? r.contractMonthlyValue.toString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    agentId: r.agent.id,
    agentName: `${r.agent.firstName} ${r.agent.lastName}`,
  }))

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Referrals</h1>
            <p className="text-slate-400 mt-2">Every referral submitted through the agent portal.</p>
          </div>
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- this is an API route, not a page; need real navigation to trigger download */}
            <a
              href="/api/admin/sales-referrals/export"
              download
              className="px-4 py-2 border border-white/20 text-slate-200 hover:text-white hover:bg-white/5 rounded-lg text-sm"
            >
              Export CSV
            </a>
            <Link
              href="/admin/sales-agents"
              className="px-4 py-2 bg-slate-700/60 hover:bg-slate-700 border border-white/10 text-white rounded-lg text-sm"
            >
              Manage Agents
            </Link>
          </div>
        </div>

        <ReferralsAdminTable
          referrals={rows}
          agents={agents.map(a => ({ id: a.id, name: `${a.firstName} ${a.lastName}` }))}
        />
      </main>
    </div>
  )
}
