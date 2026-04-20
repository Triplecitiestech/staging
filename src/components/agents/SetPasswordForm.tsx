'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Props { token: string }

export default function SetPasswordForm({ token }: Props) {
  const router = useRouter()
  const [validating, setValidating] = useState(true)
  const [tokenValid, setTokenValid] = useState(false)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [agentEmail, setAgentEmail] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const ctrl = new AbortController()
    ;(async () => {
      try {
        const res = await fetch(`/api/agent-portal/set-password?token=${encodeURIComponent(token)}`, { signal: ctrl.signal })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok && data.valid) {
          setTokenValid(true)
          setAgentEmail(data.email || null)
        } else {
          setTokenError(data.error || 'This link has expired or is invalid.')
        }
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return
        setTokenError('Could not verify reset link. Try again.')
      } finally {
        if (!cancelled) setValidating(false)
      }
    })()
    return () => { cancelled = true; ctrl.abort() }
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/agent-portal/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not set password.')
        setSubmitting(false)
        return
      }
      router.push('/agents/dashboard')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.')
      setSubmitting(false)
    }
  }

  if (validating) {
    return <div className="text-sm text-slate-300">Verifying your link…</div>
  }
  if (!tokenValid) {
    return (
      <div className="space-y-4">
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-md text-sm text-red-300">
          {tokenError}
        </div>
        <p className="text-sm text-slate-300">
          Reply to your welcome email and ask for a new link, or use the{' '}
          <Link href="/agents/forgot-password" className="text-cyan-400 hover:text-cyan-300">forgot password</Link> form.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {agentEmail && (
        <div className="text-sm text-slate-300">
          Setting password for <strong className="text-white">{agentEmail}</strong>
        </div>
      )}
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-md text-sm text-red-300">
          {error}
        </div>
      )}
      <div>
        <label htmlFor="pw" className="block text-sm font-medium text-slate-200 mb-2">New password</label>
        <input
          id="pw"
          type="password"
          required
          autoComplete="new-password"
          minLength={12}
          value={password}
          onChange={e => setPassword(e.target.value)}
          disabled={submitting}
          className="w-full px-3 py-2 bg-slate-900/50 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 disabled:opacity-50"
          placeholder="At least 12 characters"
        />
        <p className="text-xs text-slate-400 mt-1">
          Must be 12+ characters and include at least three of: lowercase, uppercase, number, symbol.
        </p>
      </div>
      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-slate-200 mb-2">Confirm password</label>
        <input
          id="confirm"
          type="password"
          required
          autoComplete="new-password"
          minLength={12}
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          disabled={submitting}
          className="w-full px-3 py-2 bg-slate-900/50 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 disabled:opacity-50"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg transition-all disabled:opacity-50 font-medium"
      >
        {submitting ? 'Setting password…' : 'Set password & sign in'}
      </button>
    </form>
  )
}
