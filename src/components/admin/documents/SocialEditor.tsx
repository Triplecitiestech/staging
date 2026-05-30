'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Eye, Pencil, Plus, Trash2, Save, Loader2, ChevronUp, ChevronDown, Scissors } from 'lucide-react'
import SocialPosts from '@/components/admin/documents/SocialPosts'
import {
  SOCIAL_PLATFORMS,
  splitDumpIntoPosts,
  postCharCount,
  platformInfo,
  EMPTY_POST,
  type SocialDoc,
  type SocialDocInput,
  type SocialPost,
} from '@/lib/documents/social-types'

const inputCls =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/40'
const labelCls = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400'

const BLANK: SocialDocInput = { title: '', deck: '', posts: [{ ...EMPTY_POST }], status: 'draft' }

export default function SocialEditor({ slug, initial }: { slug: string | null; initial?: SocialDoc }) {
  const router = useRouter()
  const [doc, setDoc] = useState<SocialDocInput>(() =>
    initial
      ? { title: initial.title, deck: initial.deck, posts: initial.posts.length ? initial.posts : [{ ...EMPTY_POST }], status: initial.status }
      : BLANK
  )
  const [rawDump, setRawDump] = useState('')
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setPost = (i: number, field: keyof SocialPost, value: string) =>
    setDoc((d) => ({ ...d, posts: d.posts.map((p, j) => (j === i ? { ...p, [field]: value } : p)) }))
  const addPost = () => setDoc((d) => ({ ...d, posts: [...d.posts, { ...EMPTY_POST }] }))
  const removePost = (i: number) => setDoc((d) => ({ ...d, posts: d.posts.filter((_, j) => j !== i) }))
  const movePost = (i: number, dir: -1 | 1) =>
    setDoc((d) => {
      const j = i + dir
      if (j < 0 || j >= d.posts.length) return d
      const posts = [...d.posts]
      ;[posts[i], posts[j]] = [posts[j], posts[i]]
      return { ...d, posts }
    })

  function splitDump() {
    const parsed = splitDumpIntoPosts(rawDump)
    if (parsed.length === 0) {
      setError('Nothing to split — paste raw copy first (separate posts with a blank line or ---).')
      return
    }
    setError(null)
    setDoc((d) => {
      // Drop a single leading empty post so a fresh dump fills cleanly.
      const base = d.posts.length === 1 && !d.posts[0].body.trim() && !d.posts[0].hashtags.trim() ? [] : d.posts
      return { ...d, posts: [...base, ...parsed] }
    })
    setRawDump('')
  }

  async function save(publish?: boolean) {
    setError(null)
    if (!doc.title.trim()) {
      setError('Add a campaign title before saving.')
      return
    }
    setSaving(true)
    const payload: SocialDocInput = publish === undefined ? doc : { ...doc, status: publish ? 'published' : 'draft' }
    try {
      const res = await fetch(slug ? `/api/admin/documents/social/${slug}` : '/api/admin/documents/social', {
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
      router.push(`/admin/documents/social/${savedSlug}`)
      router.refresh()
    } catch {
      setError('Network error while saving.')
      setSaving(false)
    }
  }

  async function remove() {
    if (!slug) return
    if (!confirm('Delete this social dump? This cannot be undone.')) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/documents/social/${slug}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error || 'Delete failed.')
        setDeleting(false)
        return
      }
      router.push('/admin/documents/social')
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
            href="/admin/documents/social"
            className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 transition-all hover:border-cyan-400/30 hover:text-cyan-300"
          >
            <ArrowLeft size={13} /> Social
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-white/10 p-0.5 lg:hidden">
              <button type="button" onClick={() => setTab('edit')} className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${tab === 'edit' ? 'bg-cyan-500 text-[#04222a]' : 'text-slate-400'}`}>
                <Pencil size={12} /> Edit
              </button>
              <button type="button" onClick={() => setTab('preview')} className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${tab === 'preview' ? 'bg-cyan-500 text-[#04222a]' : 'text-slate-400'}`}>
                <Eye size={12} /> Preview
              </button>
            </div>
            {slug && (
              <button type="button" onClick={remove} disabled={deleting || saving} className="inline-flex items-center gap-1.5 rounded-md border border-rose-400/30 px-3 py-1.5 text-xs font-bold text-rose-400 transition-all hover:bg-rose-400/10 disabled:opacity-50">
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Delete
              </button>
            )}
            <button type="button" onClick={() => save()} disabled={saving || deleting} className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-cyan-400 to-cyan-600 px-4 py-1.5 text-xs font-black uppercase tracking-wide text-[#04222a] shadow-lg shadow-cyan-500/20 transition-transform hover:-translate-y-0.5 disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
          <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-sm font-medium text-rose-300">{error}</div>
        </div>
      )}

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-2 lg:px-8">
        {/* Form */}
        <div className={`${tab === 'edit' ? 'block' : 'hidden'} space-y-5 lg:block`}>
          <div>
            <label className={labelCls}>Campaign title</label>
            <input className={inputCls} value={doc.title} onChange={(e) => setDoc((d) => ({ ...d, title: e.target.value }))} placeholder="Secure Boot 2026 — awareness push" />
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div>
              <label className={labelCls}>Summary (optional)</label>
              <textarea className={`${inputCls} min-h-[60px]`} value={doc.deck} onChange={(e) => setDoc((d) => ({ ...d, deck: e.target.value }))} placeholder="What this set is for." />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select className={inputCls} value={doc.status} onChange={(e) => setDoc((d) => ({ ...d, status: e.target.value === 'published' ? 'published' : 'draft' }))}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>

          {/* Raw dump → split */}
          <div className="rounded-xl border border-cyan-400/30 bg-cyan-400/[0.04] p-4">
            <label className={labelCls}>Paste raw copy from the agency</label>
            <textarea
              className={`${inputCls} min-h-[100px] font-mono text-[13px]`}
              value={rawDump}
              onChange={(e) => setRawDump(e.target.value)}
              placeholder={'Paste the whole dump here, then Split.\nSeparate posts with a blank line or a line of ---.'}
            />
            <button type="button" onClick={splitDump} className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-cyan-400/40 px-3 py-1.5 text-xs font-bold text-cyan-300 transition-all hover:bg-cyan-400/10">
              <Scissors size={13} /> Split into posts
            </button>
          </div>

          {/* Posts */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className={labelCls}>Posts ({doc.posts.length})</span>
              <button type="button" onClick={addPost} className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:text-cyan-300">
                <Plus size={13} /> Add post
              </button>
            </div>
            {doc.posts.map((post, i) => {
              const info = platformInfo(post.platform)
              const count = postCharCount(post)
              const over = info.limit > 0 && count > info.limit
              return (
                <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <select className={`${inputCls} max-w-[150px]`} value={post.platform} onChange={(e) => setPost(i, 'platform', e.target.value)}>
                      {SOCIAL_PLATFORMS.map((p) => (
                        <option key={p.key} value={p.key}>{p.label}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-semibold tabular-nums ${over ? 'text-rose-400' : 'text-slate-500'}`}>
                        {count}{info.limit > 0 ? `/${info.limit}` : ''}
                      </span>
                      <button type="button" onClick={() => movePost(i, -1)} disabled={i === 0} className="rounded border border-white/10 p-1 text-slate-500 hover:text-cyan-300 disabled:opacity-30" aria-label="Move up"><ChevronUp size={13} /></button>
                      <button type="button" onClick={() => movePost(i, 1)} disabled={i === doc.posts.length - 1} className="rounded border border-white/10 p-1 text-slate-500 hover:text-cyan-300 disabled:opacity-30" aria-label="Move down"><ChevronDown size={13} /></button>
                      <button type="button" onClick={() => removePost(i)} className="rounded border border-white/10 p-1 text-slate-500 hover:border-rose-400/30 hover:text-rose-400" aria-label="Remove post"><Trash2 size={13} /></button>
                    </div>
                  </div>
                  <textarea className={`${inputCls} min-h-[110px]`} value={post.body} onChange={(e) => setPost(i, 'body', e.target.value)} placeholder="Post copy…" />
                  <input className={`${inputCls} mt-2`} value={post.hashtags} onChange={(e) => setPost(i, 'hashtags', e.target.value)} placeholder="#hashtags (optional)" />
                  <input className={`${inputCls} mt-2`} value={post.note} onChange={(e) => setPost(i, 'note', e.target.value)} placeholder="Internal note (optional, not published)" />
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <button type="button" onClick={() => save(true)} disabled={saving || deleting} className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-400 to-cyan-600 px-5 py-2.5 text-sm font-black uppercase tracking-wide text-[#04222a] shadow-lg shadow-cyan-500/20 transition-transform hover:-translate-y-0.5 disabled:opacity-50">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Save &amp; publish
            </button>
            <button type="button" onClick={() => save(false)} disabled={saving || deleting} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-5 py-2.5 text-sm font-bold text-slate-300 transition-all hover:border-cyan-400/30 hover:text-cyan-200 disabled:opacity-50">
              Save as draft
            </button>
          </div>
        </div>

        {/* Live preview */}
        <div className={`${tab === 'preview' ? 'block' : 'hidden'} lg:block`}>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            <Eye size={13} /> Live preview
            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${doc.status === 'published' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400' : 'border-white/10 text-slate-500'}`}>{doc.status}</span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/10 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <SocialPosts doc={{ title: doc.title, deck: doc.deck, posts: doc.posts }} />
          </div>
        </div>
      </div>
    </div>
  )
}
