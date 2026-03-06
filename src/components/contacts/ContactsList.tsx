'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Contact {
  id: string
  name: string
  email: string
  title: string | null
  phone: string | null
  phoneType: 'MOBILE' | 'WORK' | null
  isPrimary: boolean
  isActive: boolean
  companyId: string
  company: { id: string; displayName: string; slug: string }
}

interface StaffUser {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  lastLogin: string | null
}

interface ContactsListProps {
  contacts: Contact[]
  staffUsers: StaffUser[]
}

export default function ContactsList({ contacts, staffUsers }: ContactsListProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'clients' | 'staff'>('clients')

  const filteredContacts = contacts.filter(c => {
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.company.displayName.toLowerCase().includes(q) ||
      (c.title && c.title.toLowerCase().includes(q))
  })

  const filteredStaff = staffUsers.filter(s => {
    const q = search.toLowerCase()
    return s.name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      s.role.toLowerCase().includes(q)
  })

  return (
    <div>
      {/* Search and tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
        <div className="relative flex-1 w-full sm:max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          <button
            onClick={() => setTab('clients')}
            className={`px-4 py-2 text-sm font-semibold transition-colors ${
              tab === 'clients'
                ? 'bg-cyan-500 text-white'
                : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Client Contacts ({contacts.length})
          </button>
          <button
            onClick={() => setTab('staff')}
            className={`px-4 py-2 text-sm font-semibold transition-colors ${
              tab === 'staff'
                ? 'bg-cyan-500 text-white'
                : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700'
            }`}
          >
            TCT Staff ({staffUsers.length})
          </button>
        </div>
      </div>

      {/* Client contacts table */}
      {tab === 'clients' && (
        <div className="bg-slate-800/50 border border-white/10 rounded-lg overflow-hidden">
          {filteredContacts.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-400">{search ? 'No contacts match your search' : 'No client contacts yet'}</p>
              <p className="text-sm text-slate-500 mt-1">Add contacts from the company detail page</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Company</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Title</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Phone</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map(contact => (
                    <tr
                      key={contact.id}
                      onClick={() => router.push(`/admin/companies/${contact.companyId}`)}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-violet-500/20 text-violet-300 flex items-center justify-center text-xs font-bold">
                            {contact.name[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-white">{contact.name}</div>
                            {!contact.isActive && (
                              <span className="text-[10px] text-red-400">Inactive</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">{contact.email}</td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-cyan-400">
                          {contact.company.displayName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">{contact.title || '-'}</td>
                      <td className="px-4 py-3">
                        {contact.phone ? (
                          <div className="text-sm text-slate-300">
                            {contact.phone}
                            {contact.phoneType && (
                              <span className="text-[10px] text-slate-500 ml-1">({contact.phoneType})</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {contact.isPrimary && (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-cyan-500/20 text-cyan-300 rounded-full border border-cyan-500/30">
                            PRIMARY
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Staff table */}
      {tab === 'staff' && (
        <div className="bg-slate-800/50 border border-white/10 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Last Login</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map(staff => (
                  <tr key={staff.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">
                          {staff.name[0]?.toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-white">{staff.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">{staff.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                        staff.role === 'ADMIN'
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                          : staff.role === 'MANAGER'
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                          : 'bg-slate-500/20 text-slate-300 border-slate-500/30'
                      }`}>
                        {staff.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                        staff.isActive
                          ? 'bg-green-500/20 text-green-300'
                          : 'bg-red-500/20 text-red-300'
                      }`}>
                        {staff.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {staff.lastLogin
                        ? new Date(staff.lastLogin).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
