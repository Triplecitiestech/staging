'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const EMPLOYEE_RANGES = ['1-10', '11-25', '26-50', '51-100', '100+'] as const
const INDUSTRIES = [
  'Healthcare', 'Professional Services', 'Construction', 'Nonprofit',
  'Manufacturing', 'Retail', 'Other',
] as const

interface FormState {
  businessName: string
  contactName: string
  contactEmail: string
  contactPhone: string
  addressLine1: string
  city: string
  state: string
  zip: string
  employeeCountRange: string
  industry: string
  notes: string
  initialConversationDate: string
  consent: boolean
}

const empty: FormState = {
  businessName: '', contactName: '', contactEmail: '', contactPhone: '',
  addressLine1: '', city: '', state: '', zip: '',
  employeeCountRange: '', industry: '', notes: '', initialConversationDate: '',
  consent: false,
}

export default function ReferralForm() {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(empty)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ id: string } | null>(null)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/agent-portal/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Submission failed.')
        setSubmitting(false)
        return
      }
      setSuccess({ id: data.referralId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.')
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-8 text-center">
        <h2 className="text-xl font-bold text-emerald-300 mb-2">Referral submitted</h2>
        <p className="text-slate-200 mb-6">
          Thanks! We've notified the Triple Cities Tech sales team and will reach out to your contact shortly.
          You'll see status updates on your dashboard as the deal moves forward.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/agents/dashboard"
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium"
          >
            Back to dashboard
          </Link>
          <button
            type="button"
            onClick={() => { setSuccess(null); setForm(empty); router.refresh() }}
            className="px-4 py-2 border border-white/20 text-slate-200 hover:text-white hover:bg-white/5 rounded-lg text-sm"
          >
            Submit another
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-md text-sm text-red-300">
          {error}
        </div>
      )}

      <Section title="Business">
        <Field label="Business name" required>
          <input
            type="text"
            required
            value={form.businessName}
            onChange={e => set('businessName', e.target.value)}
            disabled={submitting}
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Approx. employees">
            <select
              value={form.employeeCountRange}
              onChange={e => set('employeeCountRange', e.target.value)}
              disabled={submitting}
              className={inputCls}
            >
              <option value="">Select…</option>
              {EMPLOYEE_RANGES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Industry">
            <select
              value={form.industry}
              onChange={e => set('industry', e.target.value)}
              disabled={submitting}
              className={inputCls}
            >
              <option value="">Select…</option>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Primary Contact">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Name" required>
            <input
              type="text"
              required
              value={form.contactName}
              onChange={e => set('contactName', e.target.value)}
              disabled={submitting}
              className={inputCls}
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={form.contactPhone}
              onChange={e => set('contactPhone', e.target.value)}
              disabled={submitting}
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="Email" required>
          <input
            type="email"
            required
            value={form.contactEmail}
            onChange={e => set('contactEmail', e.target.value)}
            disabled={submitting}
            className={inputCls}
          />
        </Field>
      </Section>

      <Section title="Business Address (optional)">
        <Field label="Street">
          <input
            type="text"
            value={form.addressLine1}
            onChange={e => set('addressLine1', e.target.value)}
            disabled={submitting}
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="City">
            <input
              type="text"
              value={form.city}
              onChange={e => set('city', e.target.value)}
              disabled={submitting}
              className={inputCls}
            />
          </Field>
          <Field label="State">
            <input
              type="text"
              value={form.state}
              onChange={e => set('state', e.target.value)}
              disabled={submitting}
              className={inputCls}
            />
          </Field>
          <Field label="ZIP">
            <input
              type="text"
              value={form.zip}
              onChange={e => set('zip', e.target.value)}
              disabled={submitting}
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      <Section title="Context">
        <Field label="Date of initial conversation">
          <input
            type="date"
            value={form.initialConversationDate}
            onChange={e => set('initialConversationDate', e.target.value)}
            disabled={submitting}
            className={inputCls}
          />
        </Field>
        <Field label="Notes / context">
          <textarea
            rows={5}
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            disabled={submitting}
            placeholder="How do you know them? What are they looking for? Any urgency or special context?"
            className={inputCls}
          />
        </Field>
      </Section>

      <label className="flex items-start gap-3 px-4 py-3 bg-slate-900/50 border border-white/10 rounded-lg cursor-pointer">
        <input
          type="checkbox"
          required
          checked={form.consent}
          onChange={e => set('consent', e.target.checked)}
          disabled={submitting}
          className="mt-1 w-4 h-4 accent-cyan-500"
        />
        <span className="text-sm text-slate-200">
          I confirm I have permission to share this contact's information with Triple Cities Tech.
        </span>
      </label>

      <div className="flex items-center justify-end gap-3">
        <Link
          href="/agents/dashboard"
          className="px-4 py-2 border border-white/20 text-slate-300 hover:text-white hover:bg-white/5 rounded-lg"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg disabled:opacity-50 font-medium"
        >
          {submitting ? 'Submitting…' : 'Submit referral'}
        </button>
      </div>
    </form>
  )
}

const inputCls = 'w-full px-3 py-2 bg-slate-900/50 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 disabled:opacity-50'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6 space-y-4">
      <h3 className="text-sm font-semibold text-cyan-300 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  )
}

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
