'use client'

import { useState, useEffect } from 'react'

export default function DemoModeToggle() {
  const [enabled, setEnabled] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setEnabled(localStorage.getItem('admin-demo-mode') === 'true')
  }, [])

  const toggle = () => {
    const next = !enabled
    localStorage.setItem('admin-demo-mode', next ? 'true' : 'false')
    setEnabled(next)
    // Reload the page to apply demo mode across all components
    window.location.reload()
  }

  if (!mounted) return null

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
        enabled
          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30'
          : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
      }`}
      title={enabled ? 'Demo Mode ON - Click to disable' : 'Enable Demo Mode'}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
      {enabled ? 'Demo Mode' : 'Demo'}
    </button>
  )
}
