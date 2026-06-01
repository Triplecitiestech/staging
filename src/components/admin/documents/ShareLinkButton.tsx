'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Link2, Loader2, Trash2 } from 'lucide-react'

/**
 * Staff-only control on the admin playbook page. Mints / shows / revokes the
 * public share link for a static document. The link itself is an unguessable
 * token — anyone holding it can view the public copy of the document without
 * logging in. This does not affect the admin route's own auth gate.
 */
export default function ShareLinkButton({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/admin/documents/share?slug=${encodeURIComponent(slug)}`, {
          signal,
          cache: 'no-store',
        })
        if (!res.ok) throw new Error('load failed')
        const data = await res.json()
        setUrl(data.link?.url ?? null)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError('Could not load the share link.')
      } finally {
        setLoading(false)
      }
    },
    [slug]
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const generate = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/documents/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      if (!res.ok) throw new Error('create failed')
      const data = await res.json()
      setUrl(data.link?.url ?? null)
    } catch {
      setError('Could not generate a link.')
    } finally {
      setBusy(false)
    }
  }

  const revoke = async () => {
    if (
      !window.confirm(
        'Revoke this public link? Anyone you shared it with will lose access immediately.'
      )
    )
      return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/documents/share?slug=${encodeURIComponent(slug)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('revoke failed')
      setUrl(null)
    } catch {
      setError('Could not revoke the link.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard unavailable — non-fatal.
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 transition-all hover:border-cyan-400/30 hover:text-cyan-300"
      >
        <Link2 size={13} /> Share
        {url && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-white/10 bg-[#0a0e14] p-4 text-left shadow-2xl">
          <div className="mb-2 text-sm font-bold text-white">Public share link</div>
          <p className="mb-3 text-xs leading-relaxed text-slate-400">
            Anyone with this link can read the playbook without logging in. It isn&apos;t indexed by
            search engines and isn&apos;t linked anywhere. Revoke it anytime to cut off access.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 size={13} className="animate-spin" /> Loading…
            </div>
          ) : url ? (
            <>
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="mb-2 w-full rounded-md border border-white/10 bg-black/40 px-2.5 py-2 font-mono text-[11px] text-cyan-200 outline-none focus:border-cyan-400/40"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copy}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-bold transition-all ${
                    copied
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20'
                  }`}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied!' : 'Copy link'}
                </button>
                <button
                  type="button"
                  onClick={revoke}
                  disabled={busy}
                  className="flex items-center justify-center gap-1.5 rounded-md border border-rose-400/30 px-3 py-1.5 text-xs font-bold text-rose-300 transition-all hover:bg-rose-500/10 disabled:opacity-50"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  Revoke
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={generate}
              disabled={busy}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-300 transition-all hover:bg-cyan-500/20 disabled:opacity-50"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
              Generate public link
            </button>
          )}

          {error && <div className="mt-2 text-xs text-rose-300">{error}</div>}
        </div>
      )}
    </div>
  )
}
