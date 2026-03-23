'use client'

import { useState, useEffect } from 'react'
import { FormRenderer, MergedFormConfig } from '@/components/onboarding/FormRenderer'

interface AuthenticatedFormPageProps {
  companySlug: string
  formType: 'onboarding' | 'offboarding'
  email: string
  name: string
}

export function AuthenticatedFormPage({ companySlug, formType, email, name }: AuthenticatedFormPageProps) {
  const [config, setConfig] = useState<MergedFormConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [requestId, setRequestId] = useState<string | null>(null)

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const params = new URLSearchParams({ companySlug, type: formType, email })
        const res = await fetch(`/api/forms/config?${params.toString()}`)
        if (!res.ok) {
          const data = await res.json()
          setError(data.error ?? 'Failed to load form configuration')
          return
        }
        const data = await res.json()
        setConfig(data)
      } catch {
        setError('Network error — please try again')
      } finally {
        setLoading(false)
      }
    }
    loadConfig()
  }, [companySlug, formType, email])

  const handleSubmit = (reqId: string) => {
    setRequestId(reqId)
    setSubmitted(true)
  }

  const handleSubmitAnother = () => {
    setSubmitted(false)
    setRequestId(null)
    setLoading(true)
    setError(null)
    // Re-fetch config to get fresh M365 data
    const params = new URLSearchParams({ companySlug, type: formType, email })
    fetch(`/api/forms/config?${params.toString()}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load form')
        return res.json()
      })
      .then(data => setConfig(data))
      .catch(() => setError('Failed to reload form'))
      .finally(() => setLoading(false))
  }

  if (submitted) {
    const label = formType === 'onboarding' ? 'Onboarding' : 'Offboarding'
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
            Your {label.toLowerCase()} request has been submitted successfully. We&apos;ll get started right away.
          </p>
          {requestId && (
            <p className="text-xs text-gray-500 mt-3 font-mono">Request ID: {requestId}</p>
          )}
          <button
            onClick={handleSubmitAnother}
            className="mt-6 px-6 py-2.5 text-sm font-semibold bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white rounded-lg transition-all"
          >
            Submit Another {label} Request
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-400 text-sm">Loading form...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-900 border border-red-500/20 rounded-xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Unable to Load Form</h1>
          <p className="text-gray-400 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (!config) return null

  return (
    <div className="min-h-screen bg-gray-950">
      <FormRenderer
        config={config}
        companySlug={companySlug}
        submitterEmail={email}
        submitterName={name}
        onSubmit={handleSubmit}
        onClose={handleSubmitAnother}
      />
    </div>
  )
}
