'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, RefreshCw, Eye } from 'lucide-react'

interface Company {
  id: string
  slug: string
  displayName: string
  primaryContact?: string | null
  contactEmail?: string | null
  _count?: {
    projects: number
    contacts: number
  }
}

export default function CompanyList({ companies }: { companies: Company[] }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [impersonating, setImpersonating] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const handleImpersonate = async (slug: string) => {
    setImpersonating(slug)
    try {
      const res = await fetch('/api/onboarding/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companySlug: slug })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to impersonate')
      window.open(data.portalUrl, '_blank')
    } catch (error) {
      alert(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setImpersonating(null)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}? This will also delete all associated projects.`)) return

    setDeleting(id)
    try {
      const res = await fetch(`/api/companies?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      router.refresh()
    } catch {
      alert('Failed to delete company')
      setDeleting(null)
    }
  }

  const handleInvite = async (id: string, email: string | null | undefined, regenerate = false) => {
    if (!email) {
      alert('This company has no contact email. Please add an email address first.')
      return
    }

    const action = regenerate ? 'resend invite with new password' : 'send portal invite'
    if (!confirm(`${action} to ${email}?`)) return

    setSending(id)
    try {
      const res = await fetch(`/api/companies/${id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send invite')
      }

      alert(`Done: ${data.message}`)
      router.refresh()
    } catch (error) {
      alert(`Failed to send invite: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setSending(null)
    }
  }

  const filtered = useMemo(() => {
    if (!search) return companies
    const q = search.toLowerCase()
    return companies.filter(c =>
      c.displayName.toLowerCase().includes(q) ||
      (c.primaryContact && c.primaryContact.toLowerCase().includes(q)) ||
      (c.contactEmail && c.contactEmail.toLowerCase().includes(q))
    )
  }, [companies, search])

  if (companies.length === 0) {
    return (
      <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-12 text-center">
        <h3 className="text-lg font-medium text-white">No companies yet</h3>
        <p className="text-sm text-slate-300 mt-2">Create your first company to get started</p>
      </div>
    )
  }

  return (
    <div>
      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search companies..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>

      <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-white/10">
          <thead className="bg-slate-900/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Company Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Contact</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Projects</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Contacts</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {filtered.map((company) => (
              <tr
                key={company.id}
                onClick={() => router.push(`/admin/companies/${company.id}`)}
                className="hover:bg-slate-700/30 transition-colors cursor-pointer"
              >
                <td className="px-6 py-4">
                  <span className="text-sm font-medium text-white">
                    {company.displayName}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {company.primaryContact && <div className="text-sm text-slate-300">{company.primaryContact}</div>}
                  {company.contactEmail && <div className="text-xs text-slate-400">{company.contactEmail}</div>}
                  {!company.primaryContact && !company.contactEmail && <div className="text-xs text-slate-500">No contact</div>}
                </td>
                <td className="px-6 py-4 text-sm text-slate-300">{company._count?.projects || 0}</td>
                <td className="px-6 py-4 text-sm text-slate-300">{company._count?.contacts || 0}</td>
                <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleImpersonate(company.slug)}
                      disabled={impersonating === company.slug}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 text-white text-xs font-medium rounded transition-colors disabled:opacity-50"
                      title="View portal as this customer"
                    >
                      {impersonating === company.slug ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          Opening...
                        </>
                      ) : (
                        <>
                          <Eye size={14} />
                          View Portal
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleInvite(company.id, company.contactEmail, true)}
                      disabled={sending === company.id || !company.contactEmail}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-600 text-white text-xs font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={!company.contactEmail ? 'Add email first' : 'Send portal invite'}
                    >
                      {sending === company.id ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Mail size={14} />
                          Send Invite
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(company.id, company.displayName)}
                      disabled={deleting === company.id}
                      className="text-red-400 hover:text-red-300 text-xs font-medium disabled:opacity-50"
                    >
                      {deleting === company.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
