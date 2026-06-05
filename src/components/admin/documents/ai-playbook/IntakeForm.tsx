'use client'

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import {
  INTAKE_SECTIONS,
  SYSTEM_AREAS,
  WORKFLOW_COUNT,
  sysKey,
  wfKey,
  type IntakeField,
} from '@/lib/ai-discovery/intake'

const inputClass =
  'w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500'

export default function IntakeForm({ token, companyName }: { token: string; companyName: string }) {
  const [data, setData] = useState<Record<string, string>>({})
  const [honeypot, setHoneypot] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (id: string, v: string) => setData((d) => ({ ...d, [id]: v }))

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, data, company_fax: honeypot }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Submission failed')
      setSubmitted(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="max-w-md mx-auto mt-20 rounded-xl bg-white p-10 text-center shadow-sm">
        <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
          <Check size={24} />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Thank you!</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your responses are in. Triple Cities Tech will use them to prepare for your discovery call.
        </p>
      </div>
    )
  }

  const renderField = (f: IntakeField) => (
    <div key={f.id}>
      <label className="block text-[14px] font-semibold text-slate-700 mb-1.5">
        {f.label}{f.hint && <span className="text-slate-400 font-normal"> · {f.hint}</span>}
      </label>
      {f.kind === 'yesno' ? (
        <div className="flex gap-2">
          {['Yes', 'No'].map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => set(f.id, data[f.id] === opt ? '' : opt)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                data[f.id] === opt
                  ? 'bg-cyan-600 border-cyan-600 text-white'
                  : 'bg-white border-slate-300 text-slate-700 hover:border-cyan-500'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : f.kind === 'longtext' ? (
        <textarea rows={3} value={data[f.id] ?? ''} onChange={(e) => set(f.id, e.target.value)} className={`${inputClass} resize-y`} />
      ) : (
        <input value={data[f.id] ?? ''} onChange={(e) => set(f.id, e.target.value)} className={inputClass} />
      )}
    </div>
  )

  const SectionCard = ({ n, title, blurb, children }: { n: number; title: string; blurb?: string; children: React.ReactNode }) => (
    <section className="rounded-xl bg-white border border-slate-200 p-6 sm:p-7 shadow-sm">
      <h2 className="text-[18px] font-bold text-slate-900">
        <span className="text-cyan-600 mr-2">{n}.</span>{title}
      </h2>
      {blurb && <p className="text-sm text-slate-500 mt-1 mb-4">{blurb}</p>}
      <div className={blurb ? '' : 'mt-4'}>{children}</div>
    </section>
  )

  const [contact, ...rest] = INTAKE_SECTIONS

  return (
    <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-10">
      <header className="mb-8 text-center">
        <div className="text-[12px] font-bold uppercase tracking-[0.2em] text-cyan-700 mb-2">Triple Cities Tech</div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">Business Snapshot</h1>
        <p className="text-slate-500 mt-2 text-[15px]">
          A few questions for <strong className="text-slate-700">{companyName}</strong> before your AI discovery call. It takes ~10 minutes — be candid; there are no wrong answers.
        </p>
      </header>

      <div className="flex flex-col gap-5">
        <SectionCard n={1} title={contact.title}>
          <div className="flex flex-col gap-4">{contact.fields.map(renderField)}</div>
        </SectionCard>

        {/* Systems & tools */}
        <SectionCard n={2} title="Current systems & tools" blurb="What you use in each area — and whether manual work is still involved.">
          <div className="flex flex-col gap-4">
            {SYSTEM_AREAS.map((area, i) => (
              <div key={area} className="rounded-lg border border-slate-200 p-4">
                <div className="text-[14px] font-bold text-slate-800 mb-2.5">{area}</div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                  <input
                    placeholder="Tools / systems used"
                    value={data[sysKey(i, 'tools')] ?? ''}
                    onChange={(e) => set(sysKey(i, 'tools'), e.target.value)}
                    className={inputClass}
                  />
                  <div className="flex gap-2 items-center">
                    <span className="text-[12px] text-slate-500 whitespace-nowrap">Manual work?</span>
                    {['Y', 'N'].map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => set(sysKey(i, 'manual'), data[sysKey(i, 'manual')] === opt ? '' : opt)}
                        className={`w-9 h-9 rounded-lg text-sm font-bold border ${
                          data[sysKey(i, 'manual')] === opt ? 'bg-cyan-600 border-cyan-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:border-cyan-500'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  placeholder="Notes (optional)"
                  value={data[sysKey(i, 'notes')] ?? ''}
                  onChange={(e) => set(sysKey(i, 'notes'), e.target.value)}
                  className={`${inputClass} mt-2`}
                />
              </div>
            ))}
          </div>
        </SectionCard>

        {/* team, pain, ai_state */}
        {rest.map((section, idx) => (
          <SectionCard key={section.id} n={idx + 3} title={section.title} blurb={section.blurb}>
            <div className="flex flex-col gap-4">{section.fields.map(renderField)}</div>
          </SectionCard>
        ))}

        {/* Workflows */}
        <SectionCard n={INTAKE_SECTIONS.length + 2} title="Top workflows to automate" blurb="The repetitive workflows you'd most want AI to take off your plate.">
          <div className="flex flex-col gap-3">
            {Array.from({ length: WORKFLOW_COUNT }, (_, k) => k + 1).map((n) => (
              <div key={n} className="grid grid-cols-1 sm:grid-cols-[1fr_120px_120px] gap-2">
                <input placeholder={`Workflow ${n}`} value={data[wfKey(n, 'name')] ?? ''} onChange={(e) => set(wfKey(n, 'name'), e.target.value)} className={inputClass} />
                <input placeholder="× / week" value={data[wfKey(n, 'freq')] ?? ''} onChange={(e) => set(wfKey(n, 'freq'), e.target.value)} className={inputClass} />
                <input placeholder="time each" value={data[wfKey(n, 'time')] ?? ''} onChange={(e) => set(wfKey(n, 'time'), e.target.value)} className={inputClass} />
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Honeypot — visually hidden */}
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          className="absolute -left-[9999px] w-px h-px opacity-0"
          aria-hidden
        />

        {error && <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">{error}</div>}

        <button
          onClick={submit}
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-bold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50"
        >
          {submitting ? <Loader2 size={18} className="animate-spin" /> : null}
          Submit my responses
        </button>
        <p className="text-center text-[12px] text-slate-400 pb-6">Your responses go directly to Triple Cities Tech.</p>
      </div>
    </div>
  )
}
