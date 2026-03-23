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

      {/* Success banner */}
      {successRequestId && (
        <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-emerald-400">
            Request submitted successfully.{' '}
            <span className="font-mono text-xs text-emerald-300">ID: {successRequestId}</span>
          </p>
          <button
            onClick={() => setSuccessRequestId(null)}
            className="text-emerald-400/60 hover:text-emerald-400 text-lg leading-none ml-4"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Action cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Onboarding card */}
        <div className="bg-gray-800/50 border border-white/10 rounded-lg p-5 flex flex-col gap-4 hover:border-cyan-500/30 transition-colors duration-200">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-xl">
              ➕
            </div>
            <div>
              <h3 className="text-base font-semibold text-white mb-1">Add Employee</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Onboard a new employee to your Microsoft 365 environment — account creation,
                license assignment, and group memberships.
              </p>
            </div>
          </div>
          <button
            onClick={() => setWizardType('onboarding')}
            className="mt-auto w-full bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-all duration-200 flex items-center justify-center gap-2"
          >
            Start Request
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>

        {/* Offboarding card */}
        <div className="bg-gray-800/50 border border-white/10 rounded-lg p-5 flex flex-col gap-4 hover:border-orange-500/30 transition-colors duration-200">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-xl">
              ➖
            </div>
            <div>
              <h3 className="text-base font-semibold text-white mb-1">Remove Employee</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Offboard an employee and secure their Microsoft 365 account — block sign-in,
                handle mailbox, remove group memberships, and wipe devices.
              </p>
            </div>
          </div>
          <button
            onClick={() => setWizardType('offboarding')}
            className="mt-auto w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-all duration-200 flex items-center justify-center gap-2"
          >
            Start Request
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
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
    fetch(`/api/forms/config?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json()
          setError(data.error ?? 'Failed to load form configuration')
          return
        }
        const data = await res.json()
        setConfig(data)
      })
      .catch(() => {
        setError('Network error — please try again')
      })
      .finally(() => {
        setLoading(false)
      })
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
