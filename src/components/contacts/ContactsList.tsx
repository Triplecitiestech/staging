'use client'

import { useState, useCallback } from 'react'
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
  customerRole: string
  inviteStatus: string
  invitedAt: string | null
  lastPortalLogin: string | null
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

const ROLE_LABELS: Record<string, { label: string; color: string; description: string }> = {
  CLIENT_MANAGER: { label: 'Manager', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30', description: 'Full access: projects, tickets, can manage contacts' },
  CLIENT_USER: { label: 'User', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30', description: 'Standard: view projects, submit and view tickets' },
  CLIENT_VIEWER: { label: 'Viewer', color: 'bg-slate-500/20 text-slate-300 border-slate-500/30', description: 'Read-only: view projects and tickets' },
}

const INVITE_STATUS: Record<string, { label: string; color: string; icon: string }> = {
  NOT_INVITED: { label: 'Not Invited', color: 'text-slate-500', icon: '' },
  INVITED: { label: 'Invited', color: 'text-orange-400', icon: '📧' },
  ACCEPTED: { label: 'Active', color: 'text-emerald-400', icon: '✓' },
  DECLINED: { label: 'Declined', color: 'text-rose-400', icon: '✗' },
}

export default function ContactsList({ contacts, staffUsers }: ContactsListProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'clients' | 'staff'>('clients')
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set())
  const [sendingInvites, setSendingInvites] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewContact, setPreviewContact] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [roleEditing, setRoleEditing] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [impersonating, setImpersonating] = useState<string | null>(null)

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

  const toggleSelect = (id: string) => {
    setSelectedContacts(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedContacts.size === filteredContacts.length) {
      setSelectedContacts(new Set())
    } else {
      setSelectedContacts(new Set(filteredContacts.map(c => c.id)))
    }
  }

  const sendInvites = useCallback(async (contactIds: string[]) => {
    setSendingInvites(true)
    setActionResult(null)
    try {
      const res = await fetch('/api/contacts/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds }),
      })
      const data = await res.json()
      if (!res.ok) {
        setActionResult({ type: 'error', message: data.error || 'Failed to send invites' })
      } else {
        setActionResult({ type: 'success', message: `Sent ${data.sent} invite(s)${data.failed > 0 ? `, ${data.failed} failed` : ''}` })
        setSelectedContacts(new Set())
        router.refresh()
      }
    } catch {
      setActionResult({ type: 'error', message: 'Failed to send invites' })
    }
    setSendingInvites(false)
  }, [router])

  const showPreview = async (contactId: string) => {
    setLoadingPreview(true)
    setPreviewContact(contactId)
    try {
      const res = await fetch(`/api/contacts/invite?contactId=${contactId}`)
      const data = await res.json()
      if (res.ok) {
        setPreviewHtml(data.html)
      }
    } catch { /* */ }
    setLoadingPreview(false)
  }

  const updateRole = async (contactId: string, customerRole: string) => {
    try {
      const res = await fetch('/api/contacts/invite', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, customerRole }),
      })
      if (res.ok) {
        setRoleEditing(null)
        router.refresh()
      }
    } catch { /* */ }
  }

  const impersonateCustomer = async (companySlug: string) => {
    setImpersonating(companySlug)
    try {
      const res = await fetch('/api/onboarding/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companySlug }),
      })
      const data = await res.json()
      if (res.ok && data.portalUrl) {
        window.open(data.portalUrl, '_blank')
      } else {
        setActionResult({ type: 'error', message: data.error || 'Failed to impersonate' })
      }
    } catch {
      setActionResult({ type: 'error', message: 'Failed to impersonate' })
    }
    setImpersonating(null)
  }

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
        <div className="flex items-center gap-3">
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
          {tab === 'clients' && selectedContacts.size > 0 && (
            <button
              onClick={() => sendInvites(Array.from(selectedContacts))}
              disabled={sendingInvites}
              className="px-4 py-2 text-sm font-semibold bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 disabled:opacity-50 transition-colors"
            >
              {sendingInvites ? 'Sending...' : `Send Invite (${selectedContacts.size})`}
            </button>
          )}
        </div>
      </div>

      {/* Action result banner */}
      {actionResult && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
          actionResult.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
            : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
        }`}>
          {actionResult.message}
          <button onClick={() => setActionResult(null)} className="float-right text-xs opacity-60 hover:opacity-100">dismiss</button>
        </div>
      )}

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
                    <th className="text-left px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedContacts.size === filteredContacts.length && filteredContacts.length > 0}
                        onChange={selectAll}
                        className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/50"
                      />
                    </th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Company</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Portal Role</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Invite Status</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map(contact => {
                    const invite = INVITE_STATUS[contact.inviteStatus] || INVITE_STATUS.NOT_INVITED
                    const role = ROLE_LABELS[contact.customerRole] || ROLE_LABELS.CLIENT_USER
                    return (
                      <tr
                        key={contact.id}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors"
                      >
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selectedContacts.has(contact.id)}
                            onChange={() => toggleSelect(contact.id)}
                            className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/50"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div
                            className="flex items-center gap-2 cursor-pointer"
                            onClick={() => router.push(`/admin/companies/${contact.companyId}`)}
                          >
                            <div className="w-8 h-8 rounded-full bg-violet-500/20 text-violet-300 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {contact.name[0]?.toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-white truncate">{contact.name}</div>
                              {contact.title && <div className="text-[11px] text-slate-500 truncate">{contact.title}</div>}
                              {!contact.isActive && <span className="text-[10px] text-red-400">Inactive</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-sm text-slate-300">{contact.email}</td>
                        <td className="px-3 py-3">
                          <span className="text-sm text-cyan-400">{contact.company.displayName}</span>
                        </td>
                        <td className="px-3 py-3">
                          {roleEditing === contact.id ? (
                            <select
                              defaultValue={contact.customerRole}
                              onChange={e => updateRole(contact.id, e.target.value)}
                              onBlur={() => setRoleEditing(null)}
                              autoFocus
                              className="text-xs bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white focus:outline-none focus:border-cyan-500"
                            >
                              <option value="CLIENT_MANAGER">Manager</option>
                              <option value="CLIENT_USER">User</option>
                              <option value="CLIENT_VIEWER">Viewer</option>
                            </select>
                          ) : (
                            <button
                              onClick={() => setRoleEditing(contact.id)}
                              title={role.description}
                              className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${role.color} hover:opacity-80 transition-opacity cursor-pointer`}
                            >
                              {role.label}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-medium ${invite.color}`}>
                              {invite.icon && <span className="mr-1">{invite.icon}</span>}
                              {invite.label}
                            </span>
                            {contact.invitedAt && contact.inviteStatus === 'INVITED' && (
                              <span className="text-[10px] text-slate-500">
                                {new Date(contact.invitedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                            {contact.lastPortalLogin && (
                              <span className="text-[10px] text-slate-500">
                                Last login: {new Date(contact.lastPortalLogin).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            {/* Send invite */}
                            <button
                              onClick={(e) => { e.stopPropagation(); sendInvites([contact.id]) }}
                              disabled={sendingInvites}
                              title={contact.inviteStatus === 'INVITED' ? 'Resend invite' : 'Send portal invite'}
                              className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                            </button>
                            {/* Preview email */}
                            <button
                              onClick={(e) => { e.stopPropagation(); showPreview(contact.id) }}
                              title="Preview invite email"
                              className="p-1.5 text-slate-400 hover:text-violet-400 hover:bg-violet-500/10 rounded transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                            {/* Impersonate */}
                            <button
                              onClick={(e) => { e.stopPropagation(); impersonateCustomer(contact.company.slug) }}
                              disabled={impersonating === contact.company.slug}
                              title={`View portal as ${contact.company.displayName}`}
                              className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
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

      {/* Email Preview Modal */}
      {previewContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h3 className="text-lg font-bold text-white">Invite Email Preview</h3>
              <button
                onClick={() => { setPreviewContact(null); setPreviewHtml(null) }}
                className="p-1 text-slate-400 hover:text-white rounded transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-2 bg-white rounded-b-xl">
              {loadingPreview ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-slate-500 text-sm">Loading preview...</div>
                </div>
              ) : previewHtml ? (
                <iframe
                  srcDoc={previewHtml}
                  className="w-full h-[60vh] border-0"
                  title="Email Preview"
                  sandbox="allow-same-origin"
                />
              ) : (
                <div className="flex items-center justify-center h-64">
                  <div className="text-slate-500 text-sm">Failed to load preview</div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
              <button
                onClick={() => { setPreviewContact(null); setPreviewHtml(null) }}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  if (previewContact) {
                    sendInvites([previewContact])
                    setPreviewContact(null)
                    setPreviewHtml(null)
                  }
                }}
                disabled={sendingInvites}
                className="px-4 py-2 text-sm font-semibold bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 disabled:opacity-50 transition-colors"
              >
                Send This Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
