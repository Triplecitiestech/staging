'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type TemplateChoice = 'short' | 'full' | 'none'

interface TemplateResponse {
  templates: Array<{ key: 'short' | 'full'; label: string; description: string; body: string }>
}

export default function NewAgentForm() {
  const router = useRouter()
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '' })
  const [templateChoice, setTemplateChoice] = useState<TemplateChoice>('short')
  const [agreementText, setAgreementText] = useState('')
  const [templates, setTemplates] = useState<TemplateResponse['templates'] | null>(null)
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ id: string; emailSent: boolean; emailError: string | null; hasAgreement: boolean } | null>(null)

  // Load templates from the server once; the admin can then switch between
  // them. Template bodies are pre-rendered server-side so the reference URL
  // is already filled in.
  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      try {
        const res = await fetch('/api/admin/sales-agents/agreement-templates', { signal: controller.signal })
        const data = (await res.json()) as TemplateResponse
        if (res.ok && Array.isArray(data.templates)) {
          setTemplates(data.templates)
          const short = data.templates.find(t => t.key === 'short')
          if (short) setAgreementText(short.body)
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.error('Failed to load agreement templates', err)
      } finally {
        setTemplatesLoading(false)
      }
    })()
    return () => controller.abort()
  }, [])

  const onTemplateChange = (next: TemplateChoice) => {
    setTemplateChoice(next)
    if (next === 'none') {
      setAgreementText('')
      return
    }
    const t = templates?.find(x => x.key === next)
    if (t) setAgreementText(t.body)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (templateChoice !== 'none' && !agreementText.trim()) {
      setError('Agreement text cannot be empty. Switch to "No agreement" if you want to invite without one.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/sales-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          agreementText: templateChoice === 'none' ? '' : agreementText,
        }),
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
        hasAgreement: templateChoice !== 'none' && !!agreementText.trim(),
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
          {success.hasAgreement
            ? ' Their referral agreement is ready; they will be prompted to sign it after setting their password.'
            : ' No agreement text was attached — you can add one later from the agent profile.'}
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
            onClick={() => {
              setSuccess(null)
              setForm({ firstName: '', lastName: '', email: '', phone: '' })
              setTemplateChoice('short')
              const short = templates?.find(t => t.key === 'short')
              setAgreementText(short ? short.body : '')
              router.refresh()
            }}
            className="px-4 py-2 border border-white/20 text-slate-200 hover:text-white hover:bg-white/5 rounded-lg text-sm"
          >
            Add another
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6 space-y-6">
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-md text-sm text-red-300">{error}</div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-cyan-300 uppercase tracking-wider mb-3">Contact</h3>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
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
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-cyan-300 uppercase tracking-wider">Referral agreement</h3>
          <span className="text-xs text-slate-500">Sent with the welcome email · agent signs in portal</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
          <TemplateChip
            active={templateChoice === 'short'}
            onClick={() => onTemplateChange('short')}
            label="One-page summary"
            description="Short summary + link to full terms"
            disabled={submitting || templatesLoading}
          />
          <TemplateChip
            active={templateChoice === 'full'}
            onClick={() => onTemplateChange('full')}
            label="Full agreement"
            description="Complete long-form agreement"
            disabled={submitting || templatesLoading}
          />
          <TemplateChip
            active={templateChoice === 'none'}
            onClick={() => onTemplateChange('none')}
            label="No agreement"
            description="Invite without an agreement (add later)"
            disabled={submitting}
          />
        </div>

        {templateChoice !== 'none' && (
          <>
            <label className="block text-xs text-slate-400 mb-1">
              Review and edit before sending. The agent will see exactly this text when they log in.
            </label>
            <textarea
              value={agreementText}
              onChange={e => setAgreementText(e.target.value)}
              rows={14}
              disabled={submitting || templatesLoading}
              placeholder={templatesLoading ? 'Loading template…' : 'Paste or edit the agreement text here.'}
              className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-slate-100 placeholder-slate-500 font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
            <p className="text-xs text-slate-500 mt-1">
              Tip: switch templates above to reset the text. Editing here only affects this agent — the templates themselves stay untouched.
            </p>
          </>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
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

function TemplateChip({
  active,
  onClick,
  label,
  description,
  disabled,
}: {
  active: boolean
  onClick: () => void
  label: string
  description: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-left px-3 py-2 rounded-lg border transition-colors disabled:opacity-50 ${
        active
          ? 'bg-cyan-500/10 border-cyan-500/50 text-white'
          : 'bg-slate-900/40 border-white/10 text-slate-200 hover:border-white/20 hover:bg-slate-900/60'
      }`}
    >
      <div className="text-sm font-medium">{label}</div>
      <div className="text-xs text-slate-400 mt-0.5">{description}</div>
    </button>
  )
}
