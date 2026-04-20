import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import AdminHeader from '@/components/admin/AdminHeader'
import ReferralEditor from '@/components/admin/agents/ReferralEditor'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Submitted', CONTACTED: 'Contacted', PROPOSAL_SENT: 'Proposal Sent',
  SIGNED: 'Signed', MONTH_1_PAID: 'Month 1 Paid', MONTH_2_PAID: 'Month 2 Paid',
  COMMISSION_DUE: 'Commission Due', COMMISSION_PAID: 'Commission Paid',
  LOST: 'Lost', NOT_A_FIT: 'Not a Fit',
}

export default async function AdminReferralDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) redirect('/admin')

  const { id } = await params
  const referral = await prisma.salesReferral.findUnique({
    where: { id },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
      statusHistory: { orderBy: { changedAt: 'desc' } },
    },
  })
  if (!referral) notFound()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/admin/sales-referrals" className="text-sm text-cyan-400 hover:text-cyan-300">← All referrals</Link>
        <div className="mt-2 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-3xl font-bold text-white">{referral.businessName}</h1>
            <p className="text-slate-400 mt-1">
              From{' '}
              <Link href={`/admin/sales-agents/${referral.agent.id}`} className="text-cyan-300 hover:text-cyan-200">
                {referral.agent.firstName} {referral.agent.lastName}
              </Link>{' '}
              ({referral.agent.email})
            </p>
          </div>
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
              <Row label="Initial conversation" value={referral.initialConversationDate.toLocaleDateString()} />
            )}
          </Card>
        </div>

        {referral.notes && (
          <Card title="Agent's notes">
            <p className="text-sm text-slate-200 whitespace-pre-wrap">{referral.notes}</p>
          </Card>
        )}

        <div className="mt-6">
          <ReferralEditor
            referralId={referral.id}
            initial={{
              status: referral.status,
              contractMonthlyValue: referral.contractMonthlyValue ? referral.contractMonthlyValue.toString() : '',
              commissionDueDate: referral.commissionDueDate ? referral.commissionDueDate.toISOString().slice(0, 10) : '',
              commissionPaidDate: referral.commissionPaidDate ? referral.commissionPaidDate.toISOString().slice(0, 10) : '',
              internalAdminNotes: referral.internalAdminNotes || '',
            }}
          />
        </div>

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
                  <div className="text-xs text-slate-400 mt-0.5">
                    {h.changedByType === 'admin' ? `by admin: ${h.changedByIdentifier}` : h.changedByType}
                    {h.note ? ` — ${h.note}` : ''}
                  </div>
                </li>
              ))}
            </ul>
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
