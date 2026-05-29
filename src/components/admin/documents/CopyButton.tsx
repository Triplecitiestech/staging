'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/**
 * Copy-to-clipboard button used by branded documents (ticket templates,
 * PowerShell components, etc.). Shows a transient "Copied!" state.
 */
export default function CopyButton({
  text,
  label = 'Copy',
  className = '',
  variant = 'light',
}: {
  text: string
  label?: string
  className?: string
  variant?: 'light' | 'dark'
}) {
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text.trim())
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard unavailable — non-fatal.
    }
  }

  const base =
    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap border'
  const palette = copied
    ? 'bg-emerald-500 border-emerald-500 text-white'
    : variant === 'dark'
      ? 'bg-transparent border-white/15 text-slate-400 hover:border-cyan-500 hover:text-cyan-300 hover:bg-cyan-500/10'
      : 'bg-white border-slate-300 text-slate-700 hover:border-cyan-500 hover:text-cyan-700 hover:bg-cyan-50'

  return (
    <button type="button" onClick={onCopy} className={`${base} ${palette} ${className}`}>
      {copied ? <Check size={13} /> : <Copy size={13} />}
      <span>{copied ? 'Copied!' : label}</span>
    </button>
  )
}
