'use client'

import { useState, FormEvent } from 'react'

export default function PortalRootPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid work email address.')
      return
    }

    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/portal/auth/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })

      const data = await res.json()

      if (data.redirect) {
        // Redirect to M365 login (login_hint pre-fills the email)
        window.location.href = data.redirect
        return
      }

      if (data.error) {
        setError(data.error)
        setLoading(false)
        return
      }

      setError('Something went wrong. Please try again.')
      setLoading(false)
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950">
      {/* Header */}
      <header className="py-6 px-6">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <span className="text-xl font-bold text-white tracking-tight">TCT</span>
          <span className="text-sm text-slate-400 hidden sm:inline">Triple Cities Tech</span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="max-w-md w-full text-center">
          {/* Logo / Brand mark */}
          <div className="mb-8">
            <div className="w-16 h-16 mx-auto bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-cyan-500/20">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Triple Cities Tech Support Portal</h1>
            <p className="text-slate-400 text-base leading-relaxed">
              Sign in with your work email to access your company&apos;s support portal.
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-900/30 border border-red-500/30 text-red-300 rounded-lg px-4 py-3 mb-4 text-sm text-left">
              {error}
            </div>
          )}

          {/* Email form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="text-left">
              <label htmlFor="portal-email" className="block text-sm font-medium text-slate-400 mb-1.5">
                Work Email
              </label>
              <input
                id="portal-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoFocus
                className="w-full px-4 py-3 bg-slate-800/80 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 text-base"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-3 w-full px-6 py-3.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-cyan-500/20 text-base disabled:opacity-60"
            >
              {loading ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 23 23" fill="currentColor">
                  <path d="M0 0h11v11H0zM12 0h11v11H12zM0 12h11v11H0zM12 12h11v11H12z" />
                </svg>
              )}
              {loading ? 'Signing in...' : 'Sign in with Microsoft 365'}
            </button>
          </form>

          <p className="mt-4 text-xs text-slate-500">
            We use your email to find your company portal. Microsoft 365 will be pre-filled with your address.
          </p>
        </div>
      </main>
    </div>
  )
}
