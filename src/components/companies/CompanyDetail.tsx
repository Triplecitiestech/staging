'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useDemoMode } from '@/components/admin/DemoModeProvider'

interface Contact {
  id: string
  name: string
  email: string
  title: string | null
  phone: string | null
  phoneType: 'MOBILE' | 'WORK' | null
  isPrimary: boolean
  isActive: boolean
}

interface Project {
  id: string
  title: string
  status: string
  projectType: string
  createdAt: string
}

interface Company {
  id: string
  slug: string
  displayName: string
  primaryContact: string | null
  contactTitle: string | null
  contactEmail: string | null
  m365SetupStatus: string | null
  createdAt: string
  updatedAt: string
}

interface CompanyDetailProps {
  company: Company
  contacts: Contact[]
  projects: Project[]
}

export default function CompanyDetail({ company, contacts: initialContacts, projects }: CompanyDetailProps) {
  const router = useRouter()
  const demo = useDemoMode()
  const [contacts, setContacts] = useState(initialContacts)
  const [copiedLink, setCopiedLink] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    displayName: company.displayName,
    primaryContact: company.primaryContact || '',
    contactTitle: company.contactTitle || '',
    contactEmail: company.contactEmail || '',
  })
  const [saving, setSaving] = useState(false)

  // Sync state with props when parent re-renders (e.g., after router.refresh())
  useEffect(() => {
    setContacts(initialContacts)
  }, [initialContacts])

  useEffect(() => {
    if (!editing) {
      setEditForm({
        displayName: company.displayName,
        primaryContact: company.primaryContact || '',
        contactTitle: company.contactTitle || '',
        contactEmail: company.contactEmail || '',
      })
    }
  }, [company, editing])

  // New contact form
  const [showAddContact, setShowAddContact] = useState(false)
  const [newContact, setNewContact] = useState({
    name: '', email: '', title: '', phone: '', phoneType: 'MOBILE' as 'MOBILE' | 'WORK',
  })
  const [addingContact, setAddingContact] = useState(false)

  const handleSaveCompany = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) throw new Error()
      setEditing(false)
      router.refresh()
    } catch {
      alert('Failed to update company')
    } finally {
      setSaving(false)
    }
  }

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newContact.name.trim() || !newContact.email.trim()) return

    setAddingContact(true)
    try {
      const res = await fetch(`/api/companies/${company.id}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newContact.name.trim(),
          email: newContact.email.trim(),
          title: newContact.title.trim() || null,
          phone: newContact.phone.trim() || null,
          phoneType: newContact.phone.trim() ? newContact.phoneType : null,
          isPrimary: contacts.length === 0, // First contact is primary
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to add contact')
      }

      const contact = await res.json()
      setContacts([...contacts, contact])
      setNewContact({ name: '', email: '', title: '', phone: '', phoneType: 'MOBILE' })
      setShowAddContact(false)
      router.refresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to add contact')
    } finally {
      setAddingContact(false)
    }
  }

  const handleSetPrimary = async (contactId: string) => {
    try {
      const res = await fetch(`/api/companies/${company.id}/contacts/${contactId}/primary`, {
        method: 'PATCH',
      })
      if (!res.ok) throw new Error()
      setContacts(contacts.map(c => ({ ...c, isPrimary: c.id === contactId })))
      router.refresh()
    } catch {
      alert('Failed to set primary contact')
    }
  }

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm('Remove this contact?')) return
    try {
      const res = await fetch(`/api/companies/${company.id}/contacts/${contactId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      setContacts(contacts.filter(c => c.id !== contactId))
      router.refresh()
    } catch {
      alert('Failed to remove contact')
    }
  }

  // Project status colors mapped to Autotask: Inactive(0), Active(4), Complete(5)
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-500/20 text-green-300 border-green-500/30'
      case 'COMPLETED': return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
      case 'ON_HOLD':
      case 'CANCELLED': return 'bg-slate-500/20 text-slate-300 border-slate-500/30'
      default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'Active'
      case 'COMPLETED': return 'Complete'
      case 'ON_HOLD':
      case 'CANCELLED': return 'Inactive'
      default: return status.replace(/_/g, ' ')
    }
  }

  return (
    <div>
      {/* Breadcrumb + Onboard button */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Link href="/admin/companies" className="hover:text-cyan-400 transition-colors">Companies</Link>
          <span>/</span>
          <span className="text-white">{demo.company(company.displayName)}</span>
        </div>
        <Link
          href={`/admin/companies/${company.id}/onboard`}
          className="px-4 py-2 text-sm font-semibold bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          🚀 Onboard Customer
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Company Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-800/50 border border-white/10 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Company Details</h2>
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="px-3 py-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/10 transition-colors"
                >
                  Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={handleSaveCompany} disabled={saving} className="px-3 py-1.5 text-xs font-semibold bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-300">
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Company Name</label>
                  <input value={editForm.displayName} onChange={e => setEditForm({ ...editForm, displayName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500/50" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Primary Contact Name</label>
                    <input value={editForm.primaryContact} onChange={e => setEditForm({ ...editForm, primaryContact: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500/50" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Contact Title</label>
                    <input value={editForm.contactTitle} onChange={e => setEditForm({ ...editForm, contactTitle: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500/50" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Contact Email</label>
                  <input value={editForm.contactEmail} onChange={e => setEditForm({ ...editForm, contactEmail: e.target.value })} type="email"
                    className="w-full px-3 py-2 bg-slate-900 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500/50" />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">Company Name</p>
                    <p className="text-sm text-white font-medium">{demo.company(company.displayName)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">Portal Slug</p>
                    <p className="text-sm text-slate-300 font-mono">{demo.active ? 'demo-company' : company.slug}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">Primary Contact</p>
                    <p className="text-sm text-white">{company.primaryContact ? demo.person(company.primaryContact) : '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">Contact Email</p>
                    <p className="text-sm text-white">{company.contactEmail ? demo.email(company.contactEmail) : '-'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">Created</p>
                    <p className="text-sm text-slate-300">{new Date(company.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">Updated</p>
                    <p className="text-sm text-slate-300">{new Date(company.updatedAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Contacts Section */}
          <div className="bg-slate-800/50 border border-white/10 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Contacts ({contacts.length})</h2>
              <button
                onClick={() => setShowAddContact(!showAddContact)}
                className="px-3 py-1.5 text-xs font-semibold bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
              >
                {showAddContact ? 'Cancel' : '+ Add Contact'}
              </button>
            </div>

            {showAddContact && (
              <form onSubmit={handleAddContact} className="mb-4 p-4 bg-slate-900/50 border border-white/10 rounded-lg space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Name *</label>
                    <input value={newContact.name} onChange={e => setNewContact({ ...newContact, name: e.target.value })} required
                      className="w-full px-3 py-2 bg-slate-800 border border-white/20 rounded text-white text-sm focus:outline-none focus:border-cyan-500/50" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Email *</label>
                    <input value={newContact.email} onChange={e => setNewContact({ ...newContact, email: e.target.value })} type="email" required
                      className="w-full px-3 py-2 bg-slate-800 border border-white/20 rounded text-white text-sm focus:outline-none focus:border-cyan-500/50" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Title</label>
                    <input value={newContact.title} onChange={e => setNewContact({ ...newContact, title: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-800 border border-white/20 rounded text-white text-sm focus:outline-none focus:border-cyan-500/50" placeholder="e.g. IT Director" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Phone</label>
                    <div className="flex gap-2">
                      <select value={newContact.phoneType} onChange={e => setNewContact({ ...newContact, phoneType: e.target.value as 'MOBILE' | 'WORK' })}
                        className="px-2 py-2 bg-slate-800 border border-white/20 rounded text-white text-sm focus:outline-none focus:border-cyan-500/50 w-24">
                        <option value="MOBILE">Mobile</option>
                        <option value="WORK">Work</option>
                      </select>
                      <input value={newContact.phone} onChange={e => setNewContact({ ...newContact, phone: e.target.value })} type="tel"
                        className="flex-1 px-3 py-2 bg-slate-800 border border-white/20 rounded text-white text-sm focus:outline-none focus:border-cyan-500/50" placeholder="(555) 123-4567" />
                    </div>
                  </div>
                </div>
                {contacts.length === 0 && (
                  <p className="text-[10px] text-cyan-400">This will be set as the primary contact.</p>
                )}
                <button type="submit" disabled={addingContact}
                  className="px-4 py-2 text-xs font-semibold bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 transition-colors">
                  {addingContact ? 'Adding...' : 'Add Contact'}
                </button>
              </form>
            )}

            {contacts.length === 0 ? (
              <p className="text-sm text-slate-400 italic text-center py-6">No contacts yet. Add the first contact above.</p>
            ) : (
              <div className="space-y-2">
                {contacts.map(contact => (
                  <div key={contact.id} className="flex items-center gap-3 p-3 bg-slate-900/40 border border-white/5 rounded-lg hover:bg-slate-900/60 transition-colors">
                    <div className="w-9 h-9 rounded-full bg-violet-500/20 text-violet-300 flex items-center justify-center text-sm font-bold shrink-0">
                      {demo.person(contact.name)[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">{demo.person(contact.name)}</span>
                        {contact.isPrimary && (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold bg-cyan-500/20 text-cyan-300 rounded-full border border-cyan-500/30">PRIMARY</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span>{demo.email(contact.email)}</span>
                        {contact.title && <span>• {demo.active ? 'Staff' : contact.title}</span>}
                        {contact.phone && <span>• {demo.active ? '(555) 000-0000' : contact.phone} ({contact.phoneType})</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!contact.isPrimary && (
                        <button onClick={() => handleSetPrimary(contact.id)} title="Set as primary"
                          className="p-1.5 text-slate-400 hover:text-cyan-400 transition-colors rounded hover:bg-white/5">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                          </svg>
                        </button>
                      )}
                      <button onClick={() => handleDeleteContact(contact.id)} title="Remove contact"
                        className="p-1.5 text-slate-400 hover:text-red-400 transition-colors rounded hover:bg-white/5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="bg-slate-800/50 border border-white/10 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-white mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <a href={demo.active ? '#' : `/api/admin/portal-access?company=${company.slug}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors w-full">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                View Portal
              </a>
              <Link href={`/admin/companies/${company.id}/form-config`}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors w-full">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Form Config
              </Link>
            </div>
          </div>

          {/* Form Links — shown when M365 is configured */}
          {company.m365SetupStatus === 'verified' && (
            <div className="bg-slate-800/50 border border-white/10 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-white mb-3">HR Form Links</h3>
              <p className="text-xs text-slate-400 mb-3">
                Share these links with authorized managers. M365 sign-in required.
              </p>
              <div className="space-y-2">
                {(['onboarding', 'offboarding'] as const).map((type) => {
                  const url = demo.active
                    ? `https://www.triplecitiestech.com/forms/demo-company/${type}`
                    : `https://www.triplecitiestech.com/forms/${company.slug}/${type}`
                  const isCopied = copiedLink === type
                  return (
                    <div key={type} className="flex items-center gap-2 p-3 bg-slate-900/40 border border-white/5 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white capitalize mb-0.5">
                          Employee {type}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate font-mono">{url}</p>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(url)
                          setCopiedLink(type)
                          setTimeout(() => setCopiedLink(null), 2000)
                        }}
                        className="shrink-0 px-2.5 py-1.5 text-[10px] font-semibold rounded-md border transition-colors"
                        title={`Copy ${type} form link`}
                      >
                        {isCopied ? (
                          <span className="text-emerald-400 border-emerald-500/30">Copied!</span>
                        ) : (
                          <span className="text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10">Copy</span>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Documents - company-specific */}
          {company.slug === 'olujo' && (
            <div className="bg-slate-800/50 border border-white/10 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-white mb-3">Documents</h3>
              <div className="space-y-2">
                <Link href="/admin/projects/olujo-docs/executive-summary" target="_blank"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors w-full">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Executive Summary
                </Link>
                <Link href="/admin/projects/olujo-plan" target="_blank"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors w-full">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  Project Plan
                </Link>
                <Link href="/admin/projects/olujo-docs/crm-handling" target="_blank"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors w-full">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  CRM Handling
                </Link>
                <Link href="/admin/projects/olujo-docs/call-handling" target="_blank"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors w-full">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Call Handling
                </Link>
                <Link href="/admin/projects/olujo-docs/hiring-guidelines" target="_blank"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors w-full">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  Hiring Guidelines
                </Link>
                <Link href="/admin/projects/olujo-docs/contractor-agreement" target="_blank"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors w-full">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Contractor Agreement
                </Link>
                <Link href="/admin/projects/olujo-docs/manager-hiring" target="_blank"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors w-full">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Manager Hiring
                </Link>
                <Link href="/admin/projects/olujo-docs/purchase-tracking" target="_blank"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors w-full">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                  </svg>
                  Purchase Tracking
                </Link>
              </div>
            </div>
          )}

          {/* Projects */}
          <div className="bg-slate-800/50 border border-white/10 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-white mb-3">Projects ({projects.length})</h3>
            {projects.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No projects yet</p>
            ) : (
              <div className="space-y-2">
                {projects.map(project => (
                  <Link key={project.id} href={`/admin/projects/${project.id}`}
                    className="block p-3 bg-slate-900/40 border border-white/5 rounded-lg hover:bg-slate-900/60 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-white truncate">{demo.title(project.title)}</span>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${getStatusColor(project.status)}`}>
                        {getStatusLabel(project.status)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{new Date(project.createdAt).toLocaleDateString()}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
