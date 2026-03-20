'use client'

import { useState, useEffect } from 'react'
import { FormRenderer, MergedFormConfig } from '@/components/onboarding/FormRenderer'

interface FormLinkPortalProps {
  token: string
  companySlug: string
  type: string
  preFill?: Record<string, unknown>
}

export function FormLinkPortal({ token, companySlug, type, preFill }: FormLinkPortalProps) {
  const [config, setConfig] = useState<MergedFormConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [step, setStep] = useState<'identify' | 'form'>('identify')

  const loadConfig = async () => {
    if (!email) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ companySlug, type, email })
      const res = await fetch(`/api/forms/config?${params.toString()}`)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to load form')
        return
      }
      const data = await res.json()
      setConfig(data)
      setStep('form')
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (reqId: string) => {
    setRequestId(reqId)
    setSubmitted(true)

    // Mark the link as used
    try {
      await fetch(`/api/forms/links/${token}/used`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: reqId }),
      })
    } catch {
      // Non-critical
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-900 border border-white/10 rounded-xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Request Submitted</h1>
          <p className="text-gray-400 text-sm">
            Your {type} request has been submitted successfully. We&apos;ll get started right away.
          </p>
          {requestId && (
            <p className="text-xs text-gray-500 mt-3 font-mono">Request ID: {requestId}</p>
          )}
        </div>
      </div>
    )
  }

  if (step === 'identify') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-900 border border-white/10 rounded-xl p-8">
          <h1 className="text-xl font-bold text-white mb-2 text-center capitalize">
            {type} Request
          </h1>
          <p className="text-gray-400 text-sm text-center mb-6">
            Please identify yourself to continue.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Your Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Your Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <button
              onClick={loadConfig}
              disabled={!email || !name || loading}
              className="w-full bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-all"
            >
              {loading ? 'Loading...' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading form...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <FormRenderer
        config={config}
        companySlug={companySlug}
        submitterEmail={email}
        submitterName={name}
        preFill={preFill}
        onSubmit={handleSubmit}
        onClose={() => setStep('identify')}
      />
    </div>
  )
}
