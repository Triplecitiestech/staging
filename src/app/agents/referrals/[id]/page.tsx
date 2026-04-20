import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentAgent } from '@/lib/agent-auth'
import { prisma } from '@/lib/prisma'
import AgentHeader from '@/components/agents/AgentHeader'

export const dynamic = 'force-dynamic'

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

export default async function AgentReferralDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const agent = await getCurrentAgent()
  if (!agent) redirect('/agents/login')

  const { id } = await params

  // Enforce ownership at the query level — never trust the URL.
  const referral = await prisma.salesReferral.findFirst({
    where: { id, agentId: agent.id },
    include: {
      statusHistory: { orderBy: { changedAt: 'desc' } },
    },
  })
  if (!referral) notFound()

  return (
    <>
      <AgentHeader agentName={agent.firstName} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/agents/dashboard" className="text-sm text-cyan-400 hover:text-cyan-300">← Back to dashboard</Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-2 mb-6">
          <h1 className="text-3xl font-bold text-white">{referral.businessName}</h1>
          <span className="self-start inline-block px-3 py-1 rounded-md bg-cyan-500/20 text-cyan-200 border border-cyan-500/30 text-sm font-medium">
            Status: {STATUS_LABEL[referral.status] || referral.status}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card title="Contact">
            <Row label="Name" value={referral.contactName} />
            <Row label="Email" value={referral.contactEmail} />
            {referral.contactPhone && <Row label="Phone" value={referral.contactPhone} />}
          </Card>
          <Card title="Business">
            {referral.industry && <Row label="Industry" value={referral.industry} />}
            {referral.employeeCountRange && <Row label="Employees" value={referral.employeeCountRange} />}
            {(referral.addressLine1 || referral.city) && (
              <Row label="Address" value={[referral.addressLine1, referral.city, referral.state, referral.zip].filter(Boolean).join(', ')} />
            )}
            {referral.initialConversationDate && (
              <Row label="First conversation" value={referral.initialConversationDate.toLocaleDateString()} />
            )}
          </Card>
        </div>

        {referral.notes && (
          <Card title="Your notes">
            <p className="text-sm text-slate-200 whitespace-pre-wrap">{referral.notes}</p>
          </Card>
        )}

        <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden mt-6">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wider">Status history</h2>
          </div>
          {referral.statusHistory.length === 0 ? (
            <p className="px-6 py-6 text-sm text-slate-400">No status changes recorded yet.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {referral.statusHistory.map(h => (
                <li key={h.id} className="px-6 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-white font-medium">
                      {h.oldStatus ? `${STATUS_LABEL[h.oldStatus] || h.oldStatus} → ` : ''}
                      {STATUS_LABEL[h.newStatus] || h.newStatus}
                    </span>
                    <span className="text-xs text-slate-400">{h.changedAt.toLocaleString()}</span>
                  </div>
                  {h.note && <p className="text-xs text-slate-400 mt-1">{h.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
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
