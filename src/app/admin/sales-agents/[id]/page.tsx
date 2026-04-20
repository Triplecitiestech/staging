import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { ensureSalesAgentTables } from '@/lib/sales-agents/ensure-tables'
import AdminHeader from '@/components/admin/AdminHeader'
import AgentProfileActions from '@/components/admin/agents/AgentProfileActions'
import AgreementUpload from '@/components/admin/agents/AgreementUpload'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Submitted', CONTACTED: 'Contacted', PROPOSAL_SENT: 'Proposal Sent',
  SIGNED: 'Signed', MONTH_1_PAID: 'Month 1 Paid', MONTH_2_PAID: 'Month 2 Paid',
  COMMISSION_DUE: 'Commission Due', COMMISSION_PAID: 'Commission Paid',
  LOST: 'Lost', NOT_A_FIT: 'Not a Fit',
}

export default async function AdminAgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) redirect('/admin')

  await ensureSalesAgentTables()

  const { id } = await params
  const agent = await prisma.salesAgent.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      createdByAdminEmail: true,
      passwordHash: true,
      passwordSetTokenExpires: true,
    },
  })
  if (!agent) notFound()

  const [agreement, referrals] = await Promise.all([
    prisma.agentAgreement.findUnique({
      where: { agentId: id },
      select: { id: true, originalFilename: true, mimeType: true, fileSize: true, uploadedAt: true, uploadedByAdminEmail: true },
    }),
    prisma.salesReferral.findMany({
      where: { agentId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, businessName: true, contactName: true, status: true, createdAt: true },
    }),
  ])

  const hasPassword = !!agent.passwordHash
  const tokenActive = !hasPassword && agent.passwordSetTokenExpires && agent.passwordSetTokenExpires.getTime() > Date.now()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/admin/sales-agents" className="text-sm text-cyan-400 hover:text-cyan-300">← All Sales Agents</Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-2 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white">{agent.firstName} {agent.lastName}</h1>
            <p className="text-slate-400 mt-1">{agent.email}</p>
          </div>
          <AgentProfileActions agentId={agent.id} isActive={agent.isActive} hasPassword={hasPassword} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card title="Account">
            <Row label="Status" value={agent.isActive ? 'Active' : 'Disabled'} />
            <Row label="Password set" value={hasPassword ? 'Yes' : 'Pending'} />
            {!hasPassword && (
              <Row
                label="Setup link expires"
                value={
                  agent.passwordSetTokenExpires
                    ? agent.passwordSetTokenExpires.toLocaleString() + (tokenActive ? '' : ' (expired)')
                    : 'No active link'
                }
              />
            )}
            <Row label="Last login" value={agent.lastLoginAt ? agent.lastLoginAt.toLocaleString() : '—'} />
            <Row label="Phone" value={agent.phone || '—'} />
          </Card>
          <Card title="Audit">
            <Row label="Created" value={agent.createdAt.toLocaleString()} />
            <Row label="Created by" value={agent.createdByAdminEmail || '—'} />
          </Card>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6 mb-6">
          <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wider mb-3">Referral Agreement</h2>
          {agreement ? (
            <div className="mb-4 text-sm text-slate-200">
              <div><strong className="text-white">{agreement.originalFilename}</strong> ({Math.round(agreement.fileSize / 1024)} KB)</div>
              <div className="text-xs text-slate-400 mt-1">
                Uploaded {agreement.uploadedAt.toLocaleString()} by {agreement.uploadedByAdminEmail}
              </div>
              <a
                href={`/api/admin/sales-agents/${agent.id}/agreement`}
                className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-slate-700/60 hover:bg-slate-700 border border-white/10 text-white rounded-lg text-sm transition-colors"
              >
                Download
              </a>
            </div>
          ) : (
            <p className="text-sm text-slate-400 mb-4">No agreement uploaded yet.</p>
          )}
          <AgreementUpload agentId={agent.id} hasExisting={!!agreement} />
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wider">Referrals submitted by this agent</h2>
          </div>
          {referrals.length === 0 ? (
            <p className="px-6 py-6 text-sm text-slate-400">No referrals submitted yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10">
                <thead className="bg-slate-900/50">
                  <tr>
                    <Th>Business</Th>
                    <Th>Contact</Th>
                    <Th>Status</Th>
                    <Th>Submitted</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {referrals.map(r => (
                    <tr key={r.id} className="hover:bg-white/5">
                      <td className="px-6 py-3 text-sm">
                        <Link href={`/admin/sales-referrals/${r.id}`} className="text-cyan-300 hover:text-cyan-200 font-medium">
                          {r.businessName}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-300">{r.contactName}</td>
                      <td className="px-6 py-3 text-sm text-slate-200">Status: {STATUS_LABEL[r.status] || r.status}</td>
                      <td className="px-6 py-3 text-sm text-slate-400">{r.createdAt.toLocaleDateString()}</td>
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
      <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wider mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-sm text-white">{value}</div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">{children}</th>
}
