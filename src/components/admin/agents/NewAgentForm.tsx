'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NewAgentForm() {
  const router = useRouter()
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ id: string; emailSent: boolean; emailError: string | null } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/sales-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not create agent.')
        setSubmitting(false)
        return
      }
      setSuccess({
        id: data.agentId,
        emailSent: !!data.welcomeEmailSent,
        emailError: data.welcomeEmailError || null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.')
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="bg-slate-800/50 border border-white/10 rounded-lg p-6 space-y-4">
        <div className="px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-md text-sm text-emerald-200">
          Agent created.
          {success.emailSent
            ? ' A welcome email with a "Set your password" link was sent (48-hour expiry).'
            : ' WARNING: the welcome email failed to send — open the agent profile and click "Resend welcome email" to retry.'}
          {success.emailError && (
            <div className="mt-2 text-xs text-rose-300">Email error: {success.emailError}</div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/sales-agents/${success.id}`}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium"
          >
            Open agent profile
          </Link>
          <button
            type="button"
            onClick={() => { setSuccess(null); setForm({ firstName: '', lastName: '', email: '', phone: '' }); router.refresh() }}
            className="px-4 py-2 border border-white/20 text-slate-200 hover:text-white hover:bg-white/5 rounded-lg text-sm"
          >
            Add another
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6 space-y-5">
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-md text-sm text-red-300">{error}</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="First name" required>
          <input
            type="text"
            required
            value={form.firstName}
            onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
            disabled={submitting}
            className={inputCls}
          />
        </Field>
        <Field label="Last name" required>
          <input
            type="text"
            required
            value={form.lastName}
            onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
            disabled={submitting}
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="Email" required>
        <input
          type="email"
          required
          value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          disabled={submitting}
          className={inputCls}
          placeholder="agent@example.com"
        />
      </Field>
      <Field label="Phone">
        <input
          type="tel"
          value={form.phone}
          onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
          disabled={submitting}
          className={inputCls}
        />
      </Field>
      <div className="flex items-center justify-end gap-3">
        <Link href="/admin/sales-agents" className="px-4 py-2 border border-white/20 text-slate-300 hover:text-white hover:bg-white/5 rounded-lg">
          Cancel
        </Link>
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg disabled:opacity-50 font-medium"
        >
          {submitting ? 'Creating…' : 'Create & send welcome email'}
        </button>
      </div>
    </form>
  )
}

const inputCls = 'w-full px-3 py-2 bg-slate-900/50 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 disabled:opacity-50'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-200 mb-2">
        {label} {required && <span className="text-rose-400">*</span>}
      </label>
      {children}
    </div>
  )
}
