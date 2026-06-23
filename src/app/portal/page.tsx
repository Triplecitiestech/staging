'use client'

import { useState } from 'react'
import Image from 'next/image'

export default function PortalRootPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid work email address.')
      return
    }
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/portal/auth/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()

      if (data.redirect) {
        window.location.href = data.redirect
      } else if (data.error) {
        setError(data.error)
        setLoading(false)
      } else {
        setError('Something went wrong. Please try again.')
        setLoading(false)
      }
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950">
      {/* Top brand bar — clear, persistent Triple Cities Tech identity */}
      <header className="border-b border-white/5 bg-black/30 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="https://www.triplecitiestech.com" className="flex items-center gap-3 group">
            <Image
              src="/logo/tctlogo.webp"
              alt="Triple Cities Tech"
              width={40}
              height={40}
              className="w-10 h-10 object-contain"
              priority
            />
            <div className="leading-tight">
              <p className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
                Triple Cities Tech
              </p>
              <p className="text-[11px] text-slate-400 uppercase tracking-widest">
                Customer Support Portal
              </p>
            </div>
          </a>
          <a
            href="https://www.triplecitiestech.com"
            className="hidden sm:inline-block text-xs text-slate-400 hover:text-cyan-300 transition-colors"
          >
            ← Back to triplecitiestech.com
          </a>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-md w-full text-center">
          {/* Logo / Brand mark */}
          <div className="mb-8">
            <div className="w-20 h-20 mx-auto flex items-center justify-center mb-6">
              <Image
                src="/logo/tctlogo.webp"
                alt="Triple Cities Tech"
                width={80}
                height={80}
                className="w-full h-full object-contain"
                priority
              />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Customer Support Portal</h1>
            <p className="text-slate-400 text-base leading-relaxed">
              Enter your work email to sign in with Microsoft 365.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="text-left">
              <label htmlFor="email" className="block text-sm font-medium text-slate-400 mb-1.5">
                Work Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoFocus
                className="w-full px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 text-base"
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
              {loading ? 'Redirecting to Microsoft...' : 'Sign in with Microsoft 365'}
            </button>
          </form>

          <p className="mt-6 text-xs text-slate-500">
            We&apos;ll find your company and redirect you to your organization&apos;s Microsoft sign-in.
          </p>

          <p className="mt-4 text-xs text-slate-500 leading-relaxed">
            Don&apos;t have access to the new portal yet? Use our{' '}
            <a
              href="https://triplecitiestech.itclientportal.com/ClientPortal/Login.aspx"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 underline"
            >
              legacy portal
            </a>{' '}
            or email{' '}
            <a
              href="mailto:support@triplecitiestech.com"
              className="text-cyan-400 hover:text-cyan-300 underline"
            >
              support@triplecitiestech.com
            </a>
            .
          </p>
        </div>
      </main>

      <footer className="border-t border-white/5 bg-black/20">
        <div className="max-w-5xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <p>&copy; {new Date().getFullYear()} Triple Cities Tech. All rights reserved.</p>
          <p>
            Need help? <a href="mailto:support@triplecitiestech.com" className="text-cyan-400 hover:text-cyan-300">support@triplecitiestech.com</a>
            <span className="mx-2 text-slate-700">·</span>
            <a href="tel:6073417500" className="text-cyan-400 hover:text-cyan-300">607-341-7500</a>
          </p>
        </div>
      </footer>
    </div>
  )
}
