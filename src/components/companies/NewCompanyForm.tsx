'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewCompanyForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    displayName: '',
    primaryContact: '',
    contactEmail: '',
    contactTitle: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!res.ok) throw new Error('Failed to create company')

      router.push('/admin/companies')
      router.refresh()
    } catch {
      alert('Failed to create company')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">Company Name *</label>
          <input
            type="text"
            required
            value={formData.displayName}
            onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
            className="w-full px-3 py-2 bg-slate-900/50 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
            placeholder="e.g., Acme Corporation"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">Primary Contact</label>
          <input
            type="text"
            value={formData.primaryContact}
            onChange={(e) => setFormData({ ...formData, primaryContact: e.target.value })}
            className="w-full px-3 py-2 bg-slate-900/50 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
            placeholder="e.g., John Smith"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">Contact Title</label>
          <input
            type="text"
            value={formData.contactTitle}
            onChange={(e) => setFormData({ ...formData, contactTitle: e.target.value })}
            className="w-full px-3 py-2 bg-slate-900/50 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
            placeholder="e.g., CEO"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">Contact Email</label>
          <input
            type="email"
            value={formData.contactEmail}
            onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
            className="w-full px-3 py-2 bg-slate-900/50 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
            placeholder="e.g., john@acme.com"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push('/admin/companies')}
          className="px-4 py-2 border border-white/20 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-all"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg transition-all disabled:opacity-50 font-medium"
        >
          {loading ? 'Creating...' : 'Create Company'}
        </button>
      </div>
    </form>
  )
}
