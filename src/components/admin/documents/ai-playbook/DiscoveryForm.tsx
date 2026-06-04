'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Check, Loader2, Sparkles, FileText, ExternalLink } from 'lucide-react'
import {
  DISCOVERY_GROUPS,
  PLATFORM_LABELS,
  suggestPlatform,
  sumMonthlyWaste,
  type PlatformLean,
} from '@/lib/ai-discovery/questions'

interface Summary {
  id: string
  companyName: string
  status: 'draft' | 'complete'
  platformRecommendation: string | null
  updatedAt: string
  hasReport: boolean
}

interface Draft {
  id: string | null
  companyName: string
  answers: Record<string, string>
  platformRecommendation: string
  notes: string
  status: 'draft' | 'complete'
  reportGeneratedAt: string | null
  shareToken: string | null
}

const blankDraft = (): Draft => ({
  id: null,
  companyName: '',
  answers: {},
  platformRecommendation: 'undecided',
  notes: '',
  status: 'draft',
  reportGeneratedAt: null,
  shareToken: null,
})

function fmtDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function DiscoveryForm() {
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [sharePending, setSharePending] = useState(false)
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState('')

  useEffect(() => { setOrigin(window.location.origin) }, [])

  const fetchList = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/admin/ai-discovery', { signal })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`)
      const data = await res.json()
      setSummaries(data.assessments ?? [])
      setListError(null)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setListError(err instanceof Error ? err.message : 'Failed to load')
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchList(controller.signal)
    return () => controller.abort()
  }, [fetchList])

  const openAssessment = useCallback(async (id: string) => {
    setSaveError(null)
    try {
      const res = await fetch(`/api/admin/ai-discovery?id=${encodeURIComponent(id)}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`)
      const { assessment } = await res.json()
      setReportError(null)
      setDraft({
        id: assessment.id,
        companyName: assessment.companyName ?? '',
        answers: assessment.answers ?? {},
        platformRecommendation: assessment.platformRecommendation ?? 'undecided',
        notes: assessment.notes ?? '',
        status: assessment.status ?? 'draft',
        reportGeneratedAt: assessment.reportGeneratedAt ?? null,
        shareToken: assessment.shareToken ?? null,
      })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to open assessment')
    }
  }, [])

  const setAnswer = (qid: string, value: string) => {
    setDraft((d) => (d ? { ...d, answers: { ...d.answers, [qid]: value } } : d))
  }

  const save = async (status?: 'draft' | 'complete'): Promise<string | null> => {
    if (!draft) return null
    if (!draft.companyName.trim()) {
      setSaveError('Company name is required.')
      return null
    }
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/admin/ai-discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, status: status ?? draft.status }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`)
      const { assessment } = await res.json()
      setDraft((d) => (d ? { ...d, id: assessment.id, status: assessment.status } : d))
      setSavedAt(Date.now())
      await fetchList()
      return assessment.id as string
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
      return null
    } finally {
      setSaving(false)
    }
  }

  const generateReport = async () => {
    if (!draft || generating) return
    setReportError(null)
    // Always save first so the report reflects the latest answers and we have an id.
    const id = await save(draft.status)
    if (!id) return
    setGenerating(true)
    try {
      const res = await fetch('/api/admin/ai-discovery/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`)
      await res.json()
      setDraft((d) => (d ? { ...d, reportGeneratedAt: new Date().toISOString() } : d))
      await fetchList()
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  const toggleShare = async (enable: boolean) => {
    if (!draft?.id || sharePending) return
    setReportError(null)
    setSharePending(true)
    try {
      const res = await fetch('/api/admin/ai-discovery/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draft.id, enable }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`)
      const { token } = await res.json()
      setDraft((d) => (d ? { ...d, shareToken: token ?? null } : d))
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Failed to update share link')
    } finally {
      setSharePending(false)
    }
  }

  const shareUrl = draft?.shareToken ? `${origin}/share/aigpa/${draft.shareToken}` : ''
  const copyShare = () => {
    if (!shareUrl) return
    navigator.clipboard?.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const suggestion = draft ? suggestPlatform(draft.answers) : null
  const wasteTotal = draft ? sumMonthlyWaste(draft.answers) : 0

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/admin/documents/ai-playbook"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-cyan-400 transition-colors mb-5"
      >
        <ArrowLeft size={14} /> AI Managed Services Playbook
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
        <div>
          <div className="text-[12px] font-bold uppercase tracking-[0.2em] text-cyan-400 mb-1.5">Phase 1 · The Assessment</div>
          <h1 className="text-3xl font-black tracking-tight text-white">AI Profit &amp; Readiness Assessment</h1>
          <p className="text-slate-400 mt-2 max-w-2xl text-[15px] leading-relaxed">
            Fill this out with the client during the discovery call. Answers are saved per company and steer the platform
            recommendation, the readiness gates, and the downstream project scope.
          </p>
        </div>
        <button
          onClick={() => { setDraft(blankDraft()); setSaveError(null); setSavedAt(null) }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-[#04222a] shadow-lg shadow-cyan-500/20"
          style={{ background: 'linear-gradient(135deg, #22D3EE, #0891B2)' }}
        >
          <Plus size={16} /> New assessment
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Saved list */}
        <aside className="rounded-xl border border-white/10 bg-white/[0.03] p-3 h-fit">
          <div className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Saved assessments</div>
          {listError && <div className="px-2 py-2 text-sm text-rose-400">{listError}</div>}
          {!listError && summaries.length === 0 && (
            <div className="px-2 py-3 text-sm text-slate-500">None yet. Start a new assessment.</div>
          )}
          <ul className="flex flex-col gap-1 mt-1">
            {summaries.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => openAssessment(s.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors border ${
                    draft?.id === s.id
                      ? 'bg-cyan-400/10 border-cyan-400/40'
                      : 'border-transparent hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white truncate">{s.companyName}</span>
                    {s.status === 'complete' && <Check size={14} className="text-emerald-400 flex-none" />}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    {fmtDate(s.updatedAt)}
                    {s.platformRecommendation && s.platformRecommendation !== 'undecided' && (
                      <span className="text-cyan-400/80">· {PLATFORM_LABELS[s.platformRecommendation as PlatformLean] ?? s.platformRecommendation}</span>
                    )}
                    {s.hasReport && <span className="text-emerald-400/80">· report</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Editor */}
        <main>
          {!draft ? (
            <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-12 text-center text-slate-400">
              Select a saved assessment or start a new one.
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Company + status bar */}
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-end justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-[220px]">
                    <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-1.5">Company</label>
                    <input
                      value={draft.companyName}
                      onChange={(e) => setDraft({ ...draft, companyName: e.target.value })}
                      placeholder="Company name"
                      className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3.5 py-2.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-400/50"
                    />
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-1">Est. monthly waste</div>
                    <div className="text-2xl font-black text-cyan-400 leading-none tabular-nums">
                      ${wasteTotal.toLocaleString()}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">summed from the zones</div>
                  </div>
                </div>
              </div>

              {/* Question groups */}
              {DISCOVERY_GROUPS.map((group) => (
                <section key={group.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
                  <h2 className="text-lg font-bold text-white tracking-tight">{group.title}</h2>
                  {group.blurb && <p className="text-sm text-slate-400 mt-1 mb-4">{group.blurb}</p>}

                  <div className="flex flex-col gap-5 mt-2">
                    {group.questions.map((q) => (
                      <div key={q.id}>
                        <div className="flex items-baseline gap-2.5 mb-2">
                          <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-cyan-400 flex-none">{q.theme}</span>
                          <label className="text-[15px] font-medium text-white leading-snug">{q.prompt}</label>
                        </div>

                        {q.kind === 'choice' && q.choices ? (
                          <div className="flex flex-wrap gap-2">
                            {q.choices.map((c) => {
                              const selected = draft.answers[q.id] === c.label
                              return (
                                <button
                                  key={c.label}
                                  type="button"
                                  onClick={() => setAnswer(q.id, selected ? '' : c.label)}
                                  className={`px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
                                    selected
                                      ? 'bg-cyan-400/15 border-cyan-400/50 text-white'
                                      : 'bg-white/[0.03] border-white/10 text-slate-300 hover:border-white/25'
                                  }`}
                                >
                                  {c.label}
                                </button>
                              )
                            })}
                          </div>
                        ) : q.kind === 'longtext' ? (
                          <textarea
                            value={draft.answers[q.id] ?? ''}
                            onChange={(e) => setAnswer(q.id, e.target.value)}
                            rows={2}
                            className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3.5 py-2.5 text-[15px] text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-400/50 resize-y"
                          />
                        ) : (
                          <input
                            value={draft.answers[q.id] ?? ''}
                            onChange={(e) => setAnswer(q.id, e.target.value)}
                            className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3.5 py-2.5 text-[15px] text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-400/50"
                          />
                        )}

                        <p className="text-[12.5px] text-slate-500 mt-1.5">
                          <span className="font-semibold text-slate-400">Tells you:</span> {q.tells}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Platform suggestion + final pick, attached to the platform group */}
                  {group.platform && suggestion && (
                    <div className="mt-6 pt-5 border-t border-white/10">
                      <div className="flex items-start gap-2.5 rounded-lg bg-cyan-400/[0.06] border border-cyan-400/25 p-4">
                        <Sparkles size={16} className="text-cyan-300 flex-none mt-0.5" />
                        <div className="text-sm text-slate-200 leading-relaxed">
                          {suggestion.lean ? (
                            <>Answers so far suggest <strong className="text-white">{PLATFORM_LABELS[suggestion.lean]}</strong>{' '}
                              <span className="text-slate-400">
                                (ChatGPT {suggestion.openai} · Claude {suggestion.anthropic} · both {suggestion.both})
                              </span>. Confirm or override below.</>
                          ) : (
                            <>Answer the platform-direction questions and a suggestion will appear here.</>
                          )}
                        </div>
                      </div>

                      <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 mt-5 mb-2">Platform recommendation</label>
                      <div className="flex flex-wrap gap-2">
                        {(['openai', 'anthropic', 'both', 'undecided'] as const).map((opt) => {
                          const selected = draft.platformRecommendation === opt
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setDraft({ ...draft, platformRecommendation: opt })}
                              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                                selected
                                  ? 'bg-cyan-400/15 border-cyan-400/50 text-white'
                                  : 'bg-white/[0.03] border-white/10 text-slate-300 hover:border-white/25'
                              }`}
                            >
                              {PLATFORM_LABELS[opt]}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </section>
              ))}

              {/* Notes */}
              <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
                <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-2">Notes / next steps</label>
                <textarea
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  rows={3}
                  placeholder="Expectations set, recommended path, quick wins to scope, anything to carry into the Readiness Assessment…"
                  className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3.5 py-2.5 text-[15px] text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-400/50 resize-y"
                />
              </section>

              {/* Client share link — only once a report exists */}
              {draft.id && draft.reportGeneratedAt && (
                <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-3">Client share link</h3>
                  {draft.shareToken ? (
                    <>
                      <div className="flex gap-2 flex-wrap items-center">
                        <input
                          readOnly
                          value={shareUrl}
                          onFocus={(e) => e.currentTarget.select()}
                          className="flex-1 min-w-[240px] bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200"
                        />
                        <button
                          onClick={copyShare}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-semibold text-sm bg-white/10 text-white hover:bg-white/15"
                        >
                          {copied ? 'Copied' : 'Copy'}
                        </button>
                        <button
                          onClick={() => toggleShare(false)}
                          disabled={sharePending}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-semibold text-sm bg-rose-400/15 text-rose-300 border border-rose-400/30 hover:bg-rose-400/25 disabled:opacity-50"
                        >
                          Disable
                        </button>
                      </div>
                      <p className="text-[12px] text-slate-500 mt-2">
                        Anyone with this link can view the report — no login required. Disable to revoke access immediately.
                      </p>
                    </>
                  ) : (
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        onClick={() => toggleShare(true)}
                        disabled={sharePending}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm bg-white/10 text-white hover:bg-white/15 disabled:opacity-50"
                      >
                        {sharePending ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={15} />}
                        Create client share link
                      </button>
                      <span className="text-[12px] text-slate-500">Generates a private, revocable link clients can open without logging in.</span>
                    </div>
                  )}
                </section>
              )}

              {/* Save bar */}
              <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#0a0e14]/95 backdrop-blur p-4">
                <button
                  onClick={() => save('draft')}
                  disabled={saving || generating}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm bg-white/10 text-white hover:bg-white/15 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : null} Save draft
                </button>
                <button
                  onClick={() => save('complete')}
                  disabled={saving || generating}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm bg-white/10 text-white hover:bg-white/15 disabled:opacity-50"
                >
                  <Check size={16} /> Mark complete
                </button>
                <button
                  onClick={generateReport}
                  disabled={saving || generating}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-[#04222a] disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #22D3EE, #0891B2)' }}
                >
                  {generating ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                  {draft.reportGeneratedAt ? 'Regenerate report' : 'Generate AI Profit Report'}
                </button>
                {draft.id && draft.reportGeneratedAt && (
                  <Link
                    href={`/admin/documents/ai-playbook/discovery/${draft.id}/report`}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-400 hover:text-cyan-300"
                  >
                    Open report <ExternalLink size={14} />
                  </Link>
                )}
                {draft.status === 'complete' && (
                  <span className="text-sm text-emerald-400 font-medium inline-flex items-center gap-1.5"><Check size={14} /> Complete</span>
                )}
                {generating && <span className="text-sm text-slate-400">Generating report… (up to ~30s)</span>}
                {savedAt && !saveError && !generating && <span className="text-sm text-slate-400">Saved.</span>}
                {saveError && <span className="text-sm text-rose-400">{saveError}</span>}
                {reportError && <span className="text-sm text-rose-400">{reportError}</span>}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
