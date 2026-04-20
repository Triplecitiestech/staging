'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

interface Row {
  id: string
  businessName: string
  contactName: string
  contactEmail: string
  status: string
  contractMonthlyValue: string | null
  createdAt: string
  updatedAt: string
  agentId: string
  agentName: string
}

const STATUSES = [
  'SUBMITTED', 'CONTACTED', 'PROPOSAL_SENT', 'SIGNED',
  'MONTH_1_PAID', 'MONTH_2_PAID', 'COMMISSION_DUE', 'COMMISSION_PAID',
  'LOST', 'NOT_A_FIT',
] as const

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Submitted', CONTACTED: 'Contacted', PROPOSAL_SENT: 'Proposal Sent',
  SIGNED: 'Signed', MONTH_1_PAID: 'Month 1 Paid', MONTH_2_PAID: 'Month 2 Paid',
  COMMISSION_DUE: 'Commission Due', COMMISSION_PAID: 'Commission Paid',
  LOST: 'Lost', NOT_A_FIT: 'Not a Fit',
}

interface Props {
  referrals: Row[]
  agents: { id: string; name: string }[]
}

export default function ReferralsAdminTable({ referrals, agents }: Props) {
  const [agentFilter, setAgentFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const filtered = useMemo(() => {
    return referrals.filter(r => {
      if (agentFilter && r.agentId !== agentFilter) return false
      if (statusFilter && r.status !== statusFilter) return false
      if (from && new Date(r.createdAt) < new Date(from)) return false
      if (to) {
        const toDate = new Date(to)
        toDate.setHours(23, 59, 59, 999)
        if (new Date(r.createdAt) > toDate) return false
      }
      return true
    })
  }, [referrals, agentFilter, statusFilter, from, to])

  return (
    <>
      <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <FilterField label="Agent">
          <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)} className={inputCls}>
            <option value="">All agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </FilterField>
        <FilterField label="Status">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={inputCls}>
            <option value="">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </FilterField>
        <FilterField label="Submitted from">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
        </FilterField>
        <FilterField label="Submitted to">
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
        </FilterField>
      </div>

      <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-300">
            No referrals match these filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-slate-900/50">
                <tr>
                  <Th>Business</Th>
                  <Th>Agent</Th>
                  <Th>Status</Th>
                  <Th>Monthly</Th>
                  <Th>Submitted</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-white/5">
                    <td className="px-6 py-3 text-sm">
                      <Link href={`/admin/sales-referrals/${r.id}`} className="text-cyan-300 hover:text-cyan-200 font-medium">
                        {r.businessName}
                      </Link>
                      <div className="text-xs text-slate-400">{r.contactName} &lt;{r.contactEmail}&gt;</div>
                    </td>
                    <td className="px-6 py-3 text-sm">
                      <Link href={`/admin/sales-agents/${r.agentId}`} className="text-slate-200 hover:text-cyan-300">
                        {r.agentName}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-200">Status: {STATUS_LABEL[r.status] || r.status}</td>
                    <td className="px-6 py-3 text-sm text-slate-200">
                      {r.contractMonthlyValue ? `$${Number(r.contractMonthlyValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-3 text-sm text-slate-400">{new Date(r.updatedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

const inputCls = 'w-full px-3 py-2 bg-slate-900/50 border border-white/20 rounded-lg text-white text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500'

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">{children}</th>
}
