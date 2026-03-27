'use client'

import { useState, useEffect } from 'react'
import { FormRenderer, type MergedFormConfig } from './FormRenderer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HrRequestCardsProps {
  companySlug: string
  contactRole: string
  contactEmail: string
  contactName: string
  onRequestSubmitted?: (requestId: string) => void
}

// ---------------------------------------------------------------------------
// HrRequestCards component
// ---------------------------------------------------------------------------

export function HrRequestCards({
  companySlug,
  contactRole,
  contactEmail,
  contactName,
  onRequestSubmitted,
}: HrRequestCardsProps) {
  const [wizardType, setWizardType] = useState<'onboarding' | 'offboarding' | null>(null)
  const [successRequestId, setSuccessRequestId] = useState<string | null>(null)

  // Auto-dismiss success toast after 5 seconds
  useEffect(() => {
    if (!successRequestId) return
    const timer = setTimeout(() => setSuccessRequestId(null), 5000)
    return () => clearTimeout(timer)
  }, [successRequestId])

  // Only CLIENT_MANAGER contacts see this section
  if (contactRole !== 'CLIENT_MANAGER') return null

  function handleSuccess(requestId: string) {
    setWizardType(null)
    setSuccessRequestId(requestId)
    onRequestSubmitted?.(requestId)
  }

  return (
    <div className="mb-8">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">Employee Management</h2>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            Manager Access Only
          </span>
        </div>
      </div>

      {/* Success toast — fixed position so it doesn't shift layout */}
      {successRequestId && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-500/15 border border-emerald-500/30 backdrop-blur-sm rounded-lg px-4 py-3 flex items-center gap-3 shadow-lg shadow-black/30 animate-in slide-in-from-bottom-4">
          <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-emerald-400">
            Request submitted. You&apos;ll receive a confirmation email shortly.
          </p>
          <button
            onClick={() => setSuccessRequestId(null)}
            className="text-emerald-400/60 hover:text-emerald-400 text-lg leading-none ml-2"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Action cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {/* Onboarding card */}
        <button
          onClick={() => setWizardType('onboarding')}
          className="group bg-gray-800/50 border border-white/10 rounded-lg p-4 flex items-center gap-3 hover:border-cyan-500/40 hover:bg-gray-800/70 transition-all duration-200 text-left"
        >
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <svg className="w-4.5 h-4.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white">New Employee</h3>
            <p className="text-xs text-gray-500 truncate">Set up email and cloud access</p>
          </div>
          <svg className="w-4 h-4 text-gray-600 group-hover:text-cyan-400 ml-auto flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Offboarding card */}
        <button
          onClick={() => setWizardType('offboarding')}
          className="group bg-gray-800/50 border border-white/10 rounded-lg p-4 flex items-center gap-3 hover:border-rose-500/40 hover:bg-gray-800/70 transition-all duration-200 text-left"
        >
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <svg className="w-4.5 h-4.5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white">Departing Employee</h3>
            <p className="text-xs text-gray-500 truncate">Deactivate account and remove access</p>
          </div>
          <svg className="w-4 h-4 text-gray-600 group-hover:text-rose-400 ml-auto flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Form renderer overlay — loads config from question engine API */}
      {wizardType && (
        <FormRendererLoader
          type={wizardType}
          companySlug={companySlug}
          contactEmail={contactEmail}
          contactName={contactName}
          onClose={() => setWizardType(null)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FormRendererLoader — fetches config then renders FormRenderer
// ---------------------------------------------------------------------------

function FormRendererLoader({
  type,
  companySlug,
  contactEmail,
  contactName,
  onClose,
  onSuccess,
}: {
  type: 'onboarding' | 'offboarding'
  companySlug: string
  contactEmail: string
  contactName: string
  onClose: () => void
  onSuccess: (requestId: string) => void
}) {
  const [config, setConfig] = useState<MergedFormConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams({
      companySlug,
      type,
      email: contactEmail,
    })
    const url = `/api/forms/config?${params.toString()}`

    // Retry up to 2 times on failure (cold-start DB connections can fail intermittently)
    async function fetchWithRetry(attempt = 0): Promise<void> {
      try {
        const res = await fetch(url)
        if (!res.ok) {
          // Server returned an error — retry on 500s
          if (res.status >= 500 && attempt < 2) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
            return fetchWithRetry(attempt + 1)
          }
          const data = await res.json()
          setError(data.error ?? 'Failed to load form configuration')
          return
        }
        const data = await res.json()
        setConfig(data)
      } catch {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
          return fetchWithRetry(attempt + 1)
        }
        setError('Network error — please try again')
      }
    }

    fetchWithRetry().finally(() => setLoading(false))
  }, [companySlug, type, contactEmail])

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="bg-gray-900 border border-white/10 rounded-xl p-8 text-center max-w-sm">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-300">Loading form configuration...</p>
        </div>
      </div>
    )
  }

  if (error || !config) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="bg-gray-900 border border-white/10 rounded-xl p-8 text-center max-w-sm">
          <p className="text-sm text-red-400 mb-4">{error ?? 'Failed to load form'}</p>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white">
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <FormRenderer
      config={config}
      companySlug={companySlug}
      submitterEmail={contactEmail}
      submitterName={contactName}
      onSubmit={onSuccess}
      onClose={onClose}
    />
  )
}
