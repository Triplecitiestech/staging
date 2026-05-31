'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2 } from 'lucide-react'

/**
 * Per-card controls to generate / regenerate / clear the AI background image.
 * The card <img> re-fetches (cache-busted) after a change so the new picture
 * (with the code-rendered text on top) shows immediately.
 */
export default function CardImageControls({
  slug,
  index,
  hasImage,
  configured,
  onChanged,
}: {
  slug: string
  index: number
  hasImage: boolean
  configured: boolean
  onChanged: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/documents/social/${slug}/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Generation failed.')
        setBusy(false)
        return
      }
      onChanged()
      router.refresh()
    } catch {
      setError('Network error.')
    }
    setBusy(false)
  }

  async function clear() {
    setBusy(true)
    setError(null)
    try {
      await fetch(`/api/admin/documents/social/${slug}/generate-image?index=${index}`, { method: 'DELETE' })
      onChanged()
      router.refresh()
    } catch {
      setError('Network error.')
    }
    setBusy(false)
  }

  if (!configured) {
    return (
      <span className="text-xs text-slate-500">
        AI image generation not configured (set OPENAI_API_KEY).
      </span>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={generate}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/30 px-3 py-1.5 text-xs font-bold text-cyan-400 transition-all hover:bg-cyan-400/10 disabled:opacity-50"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        {hasImage ? 'Regenerate AI image' : 'Generate AI image'}
      </button>
      {hasImage && !busy && (
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-400 transition-all hover:border-rose-400/30 hover:text-rose-400"
        >
          Use gradient
        </button>
      )}
      {error && <span className="text-xs text-rose-400">{error}</span>}
    </div>
  )
}
