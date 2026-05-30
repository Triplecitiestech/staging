'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Eye, Pencil, Plus, Trash2, Save, Loader2 } from 'lucide-react'
import BrandedDoc from '@/components/admin/documents/BrandedDoc'
import type { MarketingDoc, MarketingDocInput, DocMeta, DocCta } from '@/lib/documents/store'

type EditableDoc = MarketingDocInput

const BLANK: EditableDoc = {
  title: '',
  eyebrow: '',
  deck: '',
  body: '',
  meta: [{ k: '', v: '' }],
  cta: { heading: '', sub: '', primaryLabel: 'Back to Documents', primaryHref: '/admin/documents' },
  status: 'draft',
}

const inputCls =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/40'
const labelCls = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400'

export default function DocumentEditor({
  slug,
  initial,
}: {
  /** null = creating a new document */
  slug: string | null
  initial?: MarketingDoc
}) {
  const router = useRouter()
  const [doc, setDoc] = useState<EditableDoc>(() =>
    initial
      ? {
          title: initial.title,
          eyebrow: initial.eyebrow,
          deck: initial.deck,
          body: initial.body,
          meta: initial.meta.length ? initial.meta : [{ k: '', v: '' }],
          cta: initial.cta,
          status: initial.status,
        }
      : BLANK
  )
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof EditableDoc>(key: K, value: EditableDoc[K]) =>
    setDoc((d) => ({ ...d, [key]: value }))
  const setCta = (key: keyof DocCta, value: string) =>
    setDoc((d) => ({ ...d, cta: { ...d.cta, [key]: value } }))
  const setMeta = (i: number, field: keyof DocMeta, value: string) =>
    setDoc((d) => ({ ...d, meta: d.meta.map((m, j) => (j === i ? { ...m, [field]: value } : m)) }))
  const addMeta = () => setDoc((d) => ({ ...d, meta: [...d.meta, { k: '', v: '' }] }))
  const removeMeta = (i: number) => setDoc((d) => ({ ...d, meta: d.meta.filter((_, j) => j !== i) }))

  async function save(publish?: boolean) {
    setError(null)
    if (!doc.title.trim()) {
      setError('Add a title before saving.')
      return
    }
    setSaving(true)
    const payload: EditableDoc = publish === undefined ? doc : { ...doc, status: publish ? 'published' : 'draft' }
    try {
      const res = await fetch(slug ? `/api/admin/documents/${slug}` : '/api/admin/documents', {
        method: slug ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Save failed.')
        setSaving(false)
        return
      }
      const savedSlug = data?.doc?.slug || slug
      router.push(`/admin/documents/marketing-content/${savedSlug}`)
      router.refresh()
    } catch {
      setError('Network error while saving.')
      setSaving(false)
    }
  }

  async function remove() {
    if (!slug) return
    if (!confirm('Delete this document? This cannot be undone.')) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/documents/${slug}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error || 'Delete failed.')
        setDeleting(false)
        return
      }
      router.push('/admin/documents/marketing-content')
      router.refresh()
    } catch {
      setError('Network error while deleting.')
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950 text-slate-300">
      {/* Top bar */}
      <header className="sticky top-0 z-50 flex h-16 items-center border-b border-white/10 bg-black/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/admin/documents/marketing-content"
            className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 transition-all hover:border-cyan-400/30 hover:text-cyan-300"
          >
            <ArrowLeft size={13} /> Marketing content
          </Link>
          <div className="flex items-center gap-2">
            {/* Mobile edit/preview toggle */}
            <div className="flex rounded-lg border border-white/10 p-0.5 lg:hidden">
              <button
                type="button"
                onClick={() => setTab('edit')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${tab === 'edit' ? 'bg-cyan-500 text-[#04222a]' : 'text-slate-400'}`}
              >
                <Pencil size={12} /> Edit
              </button>
              <button
                type="button"
                onClick={() => setTab('preview')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${tab === 'preview' ? 'bg-cyan-500 text-[#04222a]' : 'text-slate-400'}`}
              >
                <Eye size={12} /> Preview
              </button>
            </div>
            {slug && (
              <button
                type="button"
                onClick={remove}
                disabled={deleting || saving}
                className="inline-flex items-center gap-1.5 rounded-md border border-rose-400/30 px-3 py-1.5 text-xs font-bold text-rose-400 transition-all hover:bg-rose-400/10 disabled:opacity-50"
              >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={() => save()}
              disabled={saving || deleting}
              className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-cyan-400 to-cyan-600 px-4 py-1.5 text-xs font-black uppercase tracking-wide text-[#04222a] shadow-lg shadow-cyan-500/20 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
          <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-sm font-medium text-rose-300">
            {error}
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-2 lg:px-8">
        {/* ── Form ── */}
        <div className={`${tab === 'edit' ? 'block' : 'hidden'} space-y-5 lg:block`}>
          <div>
            <label className={labelCls}>Title</label>
            <input
              className={inputCls}
              value={doc.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Security that watches while you sleep"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Eyebrow</label>
              <input
                className={inputCls}
                value={doc.eyebrow}
                onChange={(e) => set('eyebrow', e.target.value)}
                placeholder="Service Spotlight"
              />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select
                className={inputCls}
                value={doc.status}
                onChange={(e) => set('status', e.target.value === 'published' ? 'published' : 'draft')}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Deck / subtitle</label>
            <textarea
              className={`${inputCls} min-h-[70px]`}
              value={doc.deck}
              onChange={(e) => set('deck', e.target.value)}
              placeholder="One or two sentences that set up the piece."
            />
          </div>

          {/* Meta */}
          <div>
            <label className={labelCls}>Meta facts (hero)</label>
            <div className="space-y-2">
              {doc.meta.map((m, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className={inputCls}
                    value={m.k}
                    onChange={(e) => setMeta(i, 'k', e.target.value)}
                    placeholder="Label (e.g. Read)"
                  />
                  <input
                    className={inputCls}
                    value={m.v}
                    onChange={(e) => setMeta(i, 'v', e.target.value)}
                    placeholder="Value (e.g. ~3 min)"
                  />
                  <button
                    type="button"
                    onClick={() => removeMeta(i)}
                    className="flex-none rounded-lg border border-white/10 px-2.5 text-slate-500 hover:border-rose-400/30 hover:text-rose-400"
                    aria-label="Remove meta row"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addMeta}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:text-cyan-300"
            >
              <Plus size={13} /> Add meta fact
            </button>
          </div>

          {/* Body */}
          <div>
            <label className={labelCls}>
              Body <span className="font-normal normal-case text-slate-500">— Markdown: ## heading, **bold**, - list, &gt; quote, [link](url)</span>
            </label>
            <textarea
              className={`${inputCls} min-h-[320px] font-mono text-[13px] leading-relaxed`}
              value={doc.body}
              onChange={(e) => set('body', e.target.value)}
              placeholder={'Paste the agency draft here as Markdown.\n\n## A section heading\n\nA paragraph with **bold** and a [link](https://example.com).'}
            />
          </div>

          {/* CTA */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">Call to action (optional)</div>
            <div className="space-y-3">
              <input
                className={inputCls}
                value={doc.cta.heading}
                onChange={(e) => setCta('heading', e.target.value)}
                placeholder="CTA heading"
              />
              <textarea
                className={`${inputCls} min-h-[60px]`}
                value={doc.cta.sub}
                onChange={(e) => setCta('sub', e.target.value)}
                placeholder="CTA supporting line"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  className={inputCls}
                  value={doc.cta.primaryLabel}
                  onChange={(e) => setCta('primaryLabel', e.target.value)}
                  placeholder="Button label"
                />
                <input
                  className={inputCls}
                  value={doc.cta.primaryHref}
                  onChange={(e) => setCta('primaryHref', e.target.value)}
                  placeholder="Button link (/path or https://…)"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={() => save(true)}
              disabled={saving || deleting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-400 to-cyan-600 px-5 py-2.5 text-sm font-black uppercase tracking-wide text-[#04222a] shadow-lg shadow-cyan-500/20 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Save &amp; publish
            </button>
            <button
              type="button"
              onClick={() => save(false)}
              disabled={saving || deleting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-5 py-2.5 text-sm font-bold text-slate-300 transition-all hover:border-cyan-400/30 hover:text-cyan-200 disabled:opacity-50"
            >
              Save as draft
            </button>
          </div>
        </div>

        {/* ── Live preview ── */}
        <div className={`${tab === 'preview' ? 'block' : 'hidden'} lg:block`}>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            <Eye size={13} /> Live preview
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] ${doc.status === 'published' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400' : 'border-white/10 text-slate-500'}`}
            >
              {doc.status}
            </span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/10 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <BrandedDoc
              doc={{
                eyebrow: doc.eyebrow,
                title: doc.title,
                deck: doc.deck,
                meta: doc.meta,
                body: doc.body,
                cta: doc.cta,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
