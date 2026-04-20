import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentAgent } from '@/lib/agent-auth'
import { prisma } from '@/lib/prisma'
import AgentHeader from '@/components/agents/AgentHeader'
import ReferralsTable from '@/components/agents/ReferralsTable'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Dashboard · Triple Cities Tech Agent Portal' }

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Submitted',
  CONTACTED: 'Contacted',
  PROPOSAL_SENT: 'Proposal Sent',
  SIGNED: 'Signed',
  MONTH_1_PAID: 'Month 1 Paid',
  MONTH_2_PAID: 'Month 2 Paid',
  COMMISSION_DUE: 'Commission Due',
  COMMISSION_PAID: 'Commission Paid',
  LOST: 'Lost',
  NOT_A_FIT: 'Not a Fit',
}

export default async function AgentDashboardPage() {
  const agent = await getCurrentAgent()
  if (!agent) redirect('/agents/login')

  const [referrals, agreement] = await Promise.all([
    prisma.salesReferral.findMany({
      where: { agentId: agent.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        businessName: true,
        contactName: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.agentAgreement.findUnique({
      where: { agentId: agent.id },
      select: { originalFilename: true, uploadedAt: true },
    }),
  ])

  const total = referrals.length
  const open = referrals.filter(r => !['LOST', 'NOT_A_FIT', 'COMMISSION_PAID'].includes(r.status)).length
  const signed = referrals.filter(r => ['SIGNED', 'MONTH_1_PAID', 'MONTH_2_PAID', 'COMMISSION_DUE', 'COMMISSION_PAID'].includes(r.status)).length

  return (
    <>
      <AgentHeader agentName={agent.firstName} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Welcome back, {agent.firstName}.</h1>
          <p className="text-slate-400 mt-2">Submit referrals, track their status, and access your training resources.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatCard label="Total Referrals" value={total} />
          <StatCard label="In Progress" value={open} />
          <StatCard label="Signed Clients" value={signed} accent />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* My Agreement card */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
            <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wider mb-3">My Agreement</h2>
            {agreement ? (
              <>
                <p className="text-white text-sm font-medium truncate" title={agreement.originalFilename}>
                  {agreement.originalFilename}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Uploaded {agreement.uploadedAt.toLocaleDateString()}
                </p>
                <a
                  href="/api/agent-portal/agreement"
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-slate-700/60 hover:bg-slate-700 border border-white/10 text-white rounded-lg text-sm transition-colors"
                >
                  Download
                </a>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-300">
                  Your signed referral agreement hasn't been uploaded yet. We'll get it loaded here shortly — reach out to{' '}
                  <a href="mailto:sales@triplecitiestech.com" className="text-cyan-400 hover:text-cyan-300">sales@triplecitiestech.com</a>
                  {' '}if you need a copy in the meantime.
                </p>
              </>
            )}
          </div>

          {/* Submit referral CTA */}
          <div className="bg-gradient-to-br from-cyan-900/30 to-slate-900/80 backdrop-blur-sm border border-cyan-500/30 rounded-lg p-6 lg:col-span-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">Have someone in mind?</h2>
              <p className="text-sm text-slate-300 mt-1">
                Send the referral over and we'll take it from there. You'll see status updates here as we move the deal forward.
              </p>
            </div>
            <Link
              href="/agents/refer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg font-medium shadow-lg shadow-cyan-500/20 whitespace-nowrap"
            >
              Submit a Referral
            </Link>
          </div>
        </div>

        {/* My referrals */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">My Referrals</h2>
            <Link href="/agents/refer" className="text-sm text-cyan-400 hover:text-cyan-300">+ New referral</Link>
          </div>
          <ReferralsTable
            referrals={referrals.map(r => ({
              id: r.id,
              businessName: r.businessName,
              contactName: r.contactName,
              status: r.status,
              statusLabel: STATUS_LABEL[r.status] || r.status,
              createdAt: r.createdAt.toISOString(),
              updatedAt: r.updatedAt.toISOString(),
            }))}
          />
        </div>
      </main>
    </>
  )
}

function StatCard({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-lg p-5 border ${accent ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-slate-800/50 border-white/10'}`}>
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`text-3xl font-bold mt-2 ${accent ? 'text-cyan-300' : 'text-white'}`}>{value}</div>
    </div>
  )
}
