'use client'

import Link from 'next/link'

interface Row {
  id: string
  businessName: string
  contactName: string
  status: string
  statusLabel: string
  createdAt: string
  updatedAt: string
}

const STATUS_COLOR: Record<string, string> = {
  SUBMITTED: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  CONTACTED: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  PROPOSAL_SENT: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  SIGNED: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  MONTH_1_PAID: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  MONTH_2_PAID: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  COMMISSION_DUE: 'bg-cyan-500/30 text-cyan-200 border-cyan-400/40',
  COMMISSION_PAID: 'bg-green-500/20 text-green-300 border-green-500/30',
  LOST: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  NOT_A_FIT: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
}

export default function ReferralsTable({ referrals }: { referrals: Row[] }) {
  if (referrals.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-slate-300 mb-3">You haven't submitted any referrals yet.</p>
        <Link
          href="/agents/refer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium"
        >
          Submit your first one →
        </Link>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-white/10">
        <thead className="bg-slate-900/50">
          <tr>
            <Th>Business</Th>
            <Th>Contact</Th>
            <Th>Status</Th>
            <Th>Submitted</Th>
            <Th>Updated</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {referrals.map(r => (
            <tr key={r.id} className="hover:bg-white/5 transition-colors">
              <td className="px-6 py-3 text-sm">
                <Link href={`/agents/referrals/${r.id}`} className="text-cyan-300 hover:text-cyan-200 font-medium">
                  {r.businessName}
                </Link>
              </td>
              <td className="px-6 py-3 text-sm text-slate-300">{r.contactName}</td>
              <td className="px-6 py-3 text-sm">
                <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${STATUS_COLOR[r.status] || 'bg-slate-500/20 text-slate-300 border-slate-500/30'}`}>
                  Status: {r.statusLabel}
                </span>
              </td>
              <td className="px-6 py-3 text-sm text-slate-400">
                {new Date(r.createdAt).toLocaleDateString()}
              </td>
              <td className="px-6 py-3 text-sm text-slate-400">
                {new Date(r.updatedAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
      {children}
    </th>
  )
}
