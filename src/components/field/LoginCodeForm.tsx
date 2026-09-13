'use client'

import { useState } from 'react'

/** Step 2 of contractor login: the 6-digit code. */
export default function LoginCodeForm() {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsNewCode, setNeedsNewCode] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/field/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'That code didn’t work.')
        setNeedsNewCode(data.code === 'request_new_code')
        setCode('')
        setLoading(false)
        return
      }
      window.location.assign('/field')
    } catch {
      setError('Network error. Try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <p className="text-base text-slate-700">Check your email for a code and enter it below.</p>
      {error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <div>
        <label htmlFor="field-code" className="mb-2 block text-base font-medium">
          6-digit code
        </label>
        <input
          id="field-code"
          name="code"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          autoComplete="one-time-code"
          autoFocus
          required
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          disabled={loading}
          className="block min-h-16 w-full rounded-lg border border-slate-400 px-4 text-center text-3xl tracking-[0.5em] text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-60"
        />
      </div>
      <button
        type="submit"
        disabled={loading || code.length !== 6}
        className="min-h-14 w-full rounded-lg bg-slate-900 text-lg font-semibold text-white disabled:opacity-50"
      >
        {loading ? 'Checking…' : 'Open playbook'}
      </button>
      {needsNewCode && (
        <a
          href="/field/login"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-slate-400 text-base font-medium text-slate-900"
        >
          Request a new code
        </a>
      )}
    </form>
  )
}
