'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, RefreshCw } from 'lucide-react'

interface Company {
  id: string
  displayName: string
  primaryContact?: string | null
  contactEmail?: string | null
  _count?: {
    projects: number
  }
}

export default function CompanyList({ companies }: { companies: Company[] }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)

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

      alert(`✅ ${data.message}`)
      router.refresh()
    } catch (error) {
      alert(`Failed to send invite: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setSending(null)
    }
  }

  if (companies.length === 0) {
    return (
      <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-12 text-center">
        <h3 className="text-lg font-medium text-white">No companies yet</h3>
        <p className="text-sm text-slate-300 mt-2">Create your first company to get started</p>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
      <table className="min-w-full divide-y divide-white/10">
        <thead className="bg-slate-900/50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Company Name</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Contact</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Projects</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {companies.map((company) => (
            <tr key={company.id} className="hover:bg-slate-700/30 transition-colors">
              <td className="px-6 py-4">
                <div className="text-sm font-medium text-white">{company.displayName}</div>
              </td>
              <td className="px-6 py-4">
                {company.primaryContact && <div className="text-sm text-slate-300">{company.primaryContact}</div>}
                {company.contactEmail && <div className="text-xs text-slate-400">{company.contactEmail}</div>}
                {!company.contactEmail && <div className="text-xs text-red-400">No email</div>}
              </td>
              <td className="px-6 py-4 text-sm text-slate-300">{company._count?.projects || 0}</td>
              <td className="px-6 py-4 text-right">
                <div className="flex items-center justify-end gap-2">
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
  )
}
