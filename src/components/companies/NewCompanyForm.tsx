'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, AlertTriangle, X } from 'lucide-react'

interface FormStatus {
  type: 'idle' | 'success' | 'error' | 'timeout'
  message?: string
  requestId?: string
}

export default function NewCompanyForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<FormStatus>({ type: 'idle' })
  const abortRef = useRef<AbortController | null>(null)
  const [formData, setFormData] = useState({
    displayName: '',
    primaryContact: '',
    contactEmail: '',
    contactTitle: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return // prevent double-submit

    setLoading(true)
    setStatus({ type: 'idle' })

    // Create abort controller with 30s timeout
    abortRef.current = new AbortController()
    const timeoutId = setTimeout(() => abortRef.current?.abort(), 30000)

    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(formData),
        signal: abortRef.current.signal,
      })

      clearTimeout(timeoutId)
      const data = await res.json()

      // Verified-create: only show success if backend confirms with id
      if (res.ok && data.success && data.data?.id) {
        setStatus({
          type: 'success',
          message: `Company "${data.data.displayName}" created successfully.`,
          requestId: data.requestId,
        })
        // Navigate after brief delay so user sees the confirmation
        setTimeout(() => {
          router.push('/admin/companies')
          router.refresh()
        }, 1000)
      } else {
        // Backend returned an error envelope
        setStatus({
          type: 'error',
          message: data.error || 'Failed to create company',
          requestId: data.requestId,
        })
        setLoading(false)
      }
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof DOMException && error.name === 'AbortError') {
        setStatus({
          type: 'timeout',
          message: 'Request timed out. Please try again.',
        })
      } else {
        setStatus({
          type: 'error',
          message: error instanceof Error ? error.message : 'Network error. Please check your connection.',
        })
      }
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Status banner */}
      {status.type === 'success' && (
        <div className="flex items-start gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
          <CheckCircle size={20} className="text-green-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-green-400 font-medium">{status.message}</p>
            <p className="text-green-400/60 text-xs mt-1">Redirecting...</p>
          </div>
        </div>
      )}

      {(status.type === 'error' || status.type === 'timeout') && (
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertTriangle size={20} className="text-red-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-red-400 font-medium">{status.message}</p>
            {status.requestId && (
              <p className="text-red-400/60 text-xs mt-1">
                Request ID: {status.requestId} — Contact support if this persists.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setStatus({ type: 'idle' })}
            className="text-red-400/60 hover:text-red-400"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">Company Name *</label>
          <input
            type="text"
            required
            disabled={loading}
            value={formData.displayName}
            onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
            className="w-full px-3 py-2 bg-slate-900/50 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 disabled:opacity-50"
            placeholder="e.g., Acme Corporation"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">Primary Contact</label>
          <input
            type="text"
            disabled={loading}
            value={formData.primaryContact}
            onChange={(e) => setFormData({ ...formData, primaryContact: e.target.value })}
            className="w-full px-3 py-2 bg-slate-900/50 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 disabled:opacity-50"
            placeholder="e.g., John Smith"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">Contact Title</label>
          <input
            type="text"
            disabled={loading}
            value={formData.contactTitle}
            onChange={(e) => setFormData({ ...formData, contactTitle: e.target.value })}
            className="w-full px-3 py-2 bg-slate-900/50 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 disabled:opacity-50"
            placeholder="e.g., CEO"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">Contact Email</label>
          <input
            type="email"
            disabled={loading}
            value={formData.contactEmail}
            onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
            className="w-full px-3 py-2 bg-slate-900/50 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 disabled:opacity-50"
            placeholder="e.g., john@acme.com"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push('/admin/companies')}
          disabled={loading}
          className="px-4 py-2 border border-white/20 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
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
