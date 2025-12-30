'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

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
              </td>
              <td className="px-6 py-4 text-sm text-slate-300">{company._count?.projects || 0}</td>
              <td className="px-6 py-4 text-right">
                <button
                  onClick={() => handleDelete(company.id, company.displayName)}
                  disabled={deleting === company.id}
                  className="text-red-400 hover:text-red-300 text-sm font-medium disabled:opacity-50"
                >
                  {deleting === company.id ? 'Deleting...' : 'Delete'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
