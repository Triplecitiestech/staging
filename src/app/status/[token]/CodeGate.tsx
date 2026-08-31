'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Second gate in front of the Wilmar status page: a 6-digit code, checked
// server-side and remembered via a plain marker cookie. Deliberately simple
// — see src/lib/wilmar-status-code.ts. Reuses the page's dark/cyan visual
// language (glows, font-mono eyebrow, cyan accents) rather than inventing a
// new look for one form.
export default function WilmarCodeGate({ token }: { token: string }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/wilmar-status-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, code }),
      })

      if (response.ok) {
        // Cookie is set; re-render the server component so it now passes
        // the gate and fetches the live status data.
        router.refresh()
      } else {
        setError('Incorrect code, try again.')
        setCode('')
      }
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-black text-white/90">
      <div className="relative mx-auto flex min-h-screen max-w-[1120px] items-center justify-center overflow-hidden px-4 py-10 sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-56 -top-80 h-[760px] w-[760px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.16) 0%, rgba(34,211,238,0) 68%)' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-96 -left-64 h-[820px] w-[820px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.14) 0%, rgba(168,85,247,0) 68%)' }}
        />

        <div className="relative flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-cyan-400">
            Triple Cities Tech
          </span>

          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-black tracking-tight text-white/90 sm:text-2xl">
              Enter your access code
            </h1>
            <p className="text-sm text-white/70">
              Enter the 6-digit code you were given to view this page.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex w-full flex-col items-center gap-4">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="off"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="------"
              disabled={isSubmitting}
              required
              aria-label="6-digit access code"
              className="w-full rounded-lg border border-white/15 bg-white/[0.06] px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-white/90 outline-none focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/30"
            />

            {error && <p className="text-sm text-red-300">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting || code.length !== 6}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-cyan-400/45 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-300 transition-opacity disabled:opacity-40"
            >
              {isSubmitting ? 'Checking…' : 'View status'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
