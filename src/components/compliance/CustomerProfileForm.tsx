'use client'

/**
 * Customer profile editor for the workflow step 2.
 *
 * Renders the CUSTOMER_PROFILE_SECTIONS schema (already defined
 * server-side) as native form controls. Saves via
 * POST /api/compliance/customer-profile. Read-modify-write on save so
 * partial edits don't clobber other sections.
 *
 * Slice 1 scope: render every section, save the whole form, show
 * inline success/error. Conditional question visibility (showIf, etc.)
 * is intentionally NOT implemented in this slice — every question is
 * always shown — so the operator can see the full surface. A later
 * slice can add conditional logic without breaking this component's
 * contract.
 */

import { useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import type {
  CustomerProfileQuestion,
  CustomerProfileSection,
  CustomerProfileAnswers,
} from '@/lib/compliance/customer-profile-schema'

interface Props {
  companyId: string
  sections: readonly CustomerProfileSection[]
  initial: CustomerProfileAnswers
}

type FormValue = string | string[]

export default function CustomerProfileForm({ companyId, sections, initial }: Props) {
  const router = useRouter()
  const [values, setValues] = useState<Record<string, FormValue>>(() => {
    const v: Record<string, FormValue> = {}
    for (const s of sections) {
      for (const q of s.questions) {
        const cur = initial[q.key]
        if (Array.isArray(cur)) v[q.key] = cur
        else if (cur === null || cur === undefined) v[q.key] = q.type === 'multi_select' ? [] : ''
        else v[q.key] = String(cur)
      }
    }
    return v
  })
  const [saving, setSaving] = useState(false)
  const [resultMsg, setResultMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function setOne(key: string, v: FormValue) {
    setValues((prev) => ({ ...prev, [key]: v }))
  }

  function toggleMulti(key: string, value: string) {
    setValues((prev) => {
      const cur = Array.isArray(prev[key]) ? (prev[key] as string[]) : []
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
      return { ...prev, [key]: next }
    })
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setResultMsg(null)
    setErrorMsg(null)
    try {
      const r = await fetch('/api/compliance/customer-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, answers: values }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        setErrorMsg(data?.error || `Save failed (HTTP ${r.status})`)
        return
      }
      setResultMsg('Saved.')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {(resultMsg || errorMsg) && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            errorMsg
              ? 'bg-rose-950/40 border-rose-500/30 text-rose-200'
              : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
          }`}
        >
          {errorMsg ?? resultMsg}
        </div>
      )}

      {sections.map((section) => (
        <section
          key={section.id}
          className="bg-slate-900/50 border border-white/10 rounded-xl p-5"
        >
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            {section.title}
          </h3>
          {section.description && (
            <p className="text-xs text-slate-400 mt-1">{section.description}</p>
          )}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {section.questions.map((q) => (
              <QuestionField
                key={q.key}
                question={q}
                value={values[q.key]}
                onText={(v) => setOne(q.key, v)}
                onMultiToggle={(v) => toggleMulti(q.key, v)}
              />
            ))}
          </div>
        </section>
      ))}

      <div className="flex items-center justify-end gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
  )
}

function QuestionField({
  question,
  value,
  onText,
  onMultiToggle,
}: {
  question: CustomerProfileQuestion
  value: FormValue | undefined
  onText: (v: string) => void
  onMultiToggle: (v: string) => void
}) {
  const id = `q-${question.key}`
  const label = (
    <label htmlFor={id} className="block text-xs font-medium text-slate-300 mb-1">
      {question.label}
      {question.required && <span className="text-rose-300 ml-1">*</span>}
    </label>
  )
  const helpText = question.helpText && (
    <p className="text-[11px] text-slate-500 mt-1">{question.helpText}</p>
  )
  const baseInput =
    'w-full bg-slate-950/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none'

  // Span both columns for textarea / multi_select for breathing room.
  const wide = question.type === 'textarea' || question.type === 'multi_select'

  if (question.type === 'textarea') {
    return (
      <div className={wide ? 'sm:col-span-2' : ''}>
        {label}
        <textarea
          id={id}
          value={typeof value === 'string' ? value : ''}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onText(e.target.value)}
          rows={3}
          className={baseInput}
          required={Boolean(question.required)}
        />
        {helpText}
      </div>
    )
  }

  if (question.type === 'select' || question.type === 'radio') {
    const opts = question.staticOptions ?? []
    if (question.type === 'select') {
      return (
        <div className={wide ? 'sm:col-span-2' : ''}>
          {label}
          <select
            id={id}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onText(e.target.value)}
            className={baseInput}
            required={Boolean(question.required)}
          >
            <option value="">— Select —</option>
            {opts.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {helpText}
        </div>
      )
    }
    // radio
    return (
      <div className={wide ? 'sm:col-span-2' : ''}>
        {label}
        <div className="flex flex-wrap gap-2">
          {opts.map((o) => {
            const checked = value === o.value
            return (
              <label
                key={o.value}
                className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer ${
                  checked
                    ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-100'
                    : 'bg-slate-800/40 border-white/10 text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <input
                  type="radio"
                  name={id}
                  value={o.value}
                  checked={checked}
                  onChange={() => onText(o.value)}
                  className="sr-only"
                />
                {o.label}
              </label>
            )
          })}
        </div>
        {helpText}
      </div>
    )
  }

  if (question.type === 'multi_select' || question.type === 'checkbox') {
    const opts = question.staticOptions ?? []
    const arr = Array.isArray(value) ? value : []
    return (
      <div className={wide ? 'sm:col-span-2' : ''}>
        {label}
        <div className="flex flex-wrap gap-2">
          {opts.map((o) => {
            const checked = arr.includes(o.value)
            return (
              <label
                key={o.value}
                className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer ${
                  checked
                    ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-100'
                    : 'bg-slate-800/40 border-white/10 text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <input
                  type="checkbox"
                  value={o.value}
                  checked={checked}
                  onChange={() => onMultiToggle(o.value)}
                  className="sr-only"
                />
                {o.label}
              </label>
            )
          })}
        </div>
        {helpText}
      </div>
    )
  }

  // text / email / phone / date — same shape
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      {label}
      <input
        id={id}
        type={question.type === 'date' ? 'date' : question.type === 'email' ? 'email' : 'text'}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onText(e.target.value)}
        className={baseInput}
        required={Boolean(question.required)}
      />
      {helpText}
    </div>
  )
}
