'use client'

import { useState } from 'react'

/**
 * Step 1 of contractor login: email only. The server answers identically for
 * enrolled and unknown emails, so this form always advances to the code screen.
 */
export default function LoginEmailForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/field/login/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.status === 429) {
        setError('Too many code requests from this connection. Try again in an hour.')
        setLoading(false)
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(typeof data.error === 'string' ? data.error : 'Something went wrong. Try again.')
        setLoading(false)
        return
      }
      window.location.assign('/field/login/code')
    } catch {
      setError('Network error. Try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate={false}>
      {error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <div>
        <label htmlFor="field-email" className="mb-2 block text-base font-medium">
          Email
        </label>
        <input
          id="field-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          className="block min-h-14 w-full rounded-lg border border-slate-400 px-4 text-lg text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-60"
        />
      </div>
      <button
        type="submit"
        disabled={loading || email.trim().length === 0}
        className="min-h-14 w-full rounded-lg bg-slate-900 text-lg font-semibold text-white disabled:opacity-50"
      >
        {loading ? 'Sending…' : 'Send me a code'}
      </button>
    </form>
  )
}
