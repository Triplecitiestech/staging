'use client'

import { useState, useEffect, useCallback } from 'react'
import { HrRequestCards, HrRequestSummary } from './HrRequestCards'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HrRequestSectionProps {
  companySlug: string
  /** contactEmail may be pre-known (if passed from server) or undefined */
  contactEmail?: string
  /** contactName may be pre-known (if passed from server) or undefined */
  contactName?: string
}

interface VerifyResponse {
  verified: boolean
  name?: string
  role?: string
  message?: string
}

type SectionState =
  | 'idle'           // Haven't tried to verify yet
  | 'prompting'      // Showing the email input modal
  | 'verifying'      // API call in-flight
  | 'denied'         // API returned 403 / not a manager
  | 'verified'       // Manager verified, showing cards

// ---------------------------------------------------------------------------
// Session storage key
// ---------------------------------------------------------------------------

function storageKey(slug: string) {
  return `hr_manager_${slug}`
}

interface StoredManager {
  email: string
  name: string
  role: string
}

// ---------------------------------------------------------------------------
// Helper: email input modal
// ---------------------------------------------------------------------------

function VerifyModal({
  onVerify,
  onCancel,
  verifying,
  error,
}: {
  onVerify: (email: string) => void
  onCancel: () => void
  verifying: boolean
  error: string | null
}) {
  const [email, setEmail] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    onVerify(trimmed)
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !verifying) onCancel()
      }}
    >
      <div className="bg-gray-900 border border-white/10 rounded-xl w-full max-w-md shadow-2xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-white">Verify Manager Access</h2>
            <p className="text-xs text-gray-500 mt-0.5">Enter your email to access employee management</p>
          </div>
          {!verifying && (
            <button
              onClick={onCancel}
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors duration-150"
              aria-label="Cancel"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Your Email Address
              <span className="text-red-400 ml-1">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourcompany.com"
              disabled={verifying}
              autoFocus
              className={`w-full bg-gray-800/50 border text-white rounded-lg px-4 py-3 focus:outline-none placeholder-gray-500 text-sm transition-colors duration-150 ${
                error
                  ? 'border-red-500/50 focus:border-red-500'
                  : 'border-white/10 focus:border-cyan-500/50'
              }`}
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <p className="text-xs text-gray-500 leading-relaxed">
            Only contacts designated as Client Managers can access employee management features.
            Your email will be verified against your company&apos;s contact list.
          </p>

          <button
            type="submit"
            disabled={!email.trim() || verifying}
            className="w-full bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-4 py-3 text-sm transition-all duration-200 flex items-center justify-center gap-2"
          >
            {verifying ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Verifying...
              </>
            ) : (
              'Verify Access'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main HrRequestSection
// ---------------------------------------------------------------------------

export function HrRequestSection({
  companySlug,
  contactEmail: initialEmail,
  contactName: initialName,
}: HrRequestSectionProps) {
  const [sectionState, setSectionState] = useState<SectionState>('idle')
  const [verifiedEmail, setVerifiedEmail] = useState<string>(initialEmail ?? '')
  const [verifiedName, setVerifiedName]   = useState<string>(initialName ?? '')
  const [verifyError, setVerifyError]     = useState<string | null>(null)
  const [recentRequests, setRecentRequests] = useState<HrRequestSummary[]>([])
  const [loadingRequests, setLoadingRequests] = useState(false)

  // ----- Check sessionStorage on mount -----
  useEffect(() => {
    if (typeof window === 'undefined') return

    // If email was passed from server, skip verification UI
    if (initialEmail) {
      setSectionState('verified')
      setVerifiedEmail(initialEmail)
      setVerifiedName(initialName ?? '')
      return
    }

    try {
      const stored = sessionStorage.getItem(storageKey(companySlug))
      if (stored) {
        const parsed: StoredManager = JSON.parse(stored)
        setVerifiedEmail(parsed.email)
        setVerifiedName(parsed.name)
        setSectionState('verified')
      }
    } catch {
      // Ignore parse errors
    }
  }, [companySlug, initialEmail, initialName])

  // ----- Load recent requests when verified -----
  const loadRequests = useCallback(async () => {
    if (sectionState !== 'verified') return
    if (!verifiedEmail || !companySlug) return
    setLoadingRequests(true)
    try {
      const params = new URLSearchParams({ companySlug, email: verifiedEmail })
      const res = await fetch(`/api/hr/requests?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setRecentRequests(data.requests ?? [])
      }
    } catch {
      // Silently fail — not critical
    } finally {
      setLoadingRequests(false)
    }
  }, [sectionState, verifiedEmail, companySlug])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  // ----- Verify manager email -----
  async function handleVerify(email: string) {
    setSectionState('verifying')
    setVerifyError(null)

    try {
      const res = await fetch('/api/hr/verify-manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companySlug, email }),
      })

      const data: VerifyResponse = await res.json()

      if (res.status === 429) {
        setVerifyError('Too many verification attempts. Please try again later.')
        setSectionState('prompting')
        return
      }

      if (!res.ok || !data.verified) {
        setVerifyError(
          data.message ?? 'This email is not authorized for employee management requests.'
        )
        setSectionState('denied')
        return
      }

      // Store in sessionStorage for this browser session
      const manager: StoredManager = {
        email,
        name: data.name ?? email,
        role: data.role ?? 'CLIENT_MANAGER',
      }
      try {
        sessionStorage.setItem(storageKey(companySlug), JSON.stringify(manager))
      } catch {
        // sessionStorage unavailable — that's fine
      }

      setVerifiedEmail(email)
      setVerifiedName(data.name ?? email)
      setSectionState('verified')
    } catch {
      setVerifyError('Verification failed. Please check your connection and try again.')
      setSectionState('prompting')
    }
  }

  function handleRequestSubmitted(_requestId: string) {
    // Refresh the recent requests list after a short delay
    // (give the background processor a moment to start)
    setTimeout(() => loadRequests(), 1500)
  }

  // ----- Render -----

  if (sectionState === 'idle') {
    return (
      <div className="mb-8">
        <div className="bg-gray-800/50 border border-white/10 rounded-lg p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white">Employee Management</p>
              <p className="text-xs text-gray-500">Manager access required</p>
            </div>
          </div>
          <button
            onClick={() => setSectionState('prompting')}
            className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-all duration-200 flex items-center gap-2"
          >
            Request Employee Changes
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  if (sectionState === 'denied') {
    return (
      <div className="mb-8">
        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-red-400">Access Denied</p>
              <p className="text-xs text-gray-500">{verifyError ?? 'This email is not authorized for employee management. Contact your TCT representative.'}</p>
            </div>
          </div>
          <button
            onClick={() => { setVerifyError(null); setSectionState('prompting') }}
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors duration-150 flex-shrink-0"
          >
            Try different email
          </button>
        </div>
      </div>
    )
  }

  if (sectionState === 'verified') {
    return (
      <>
        {loadingRequests && recentRequests.length === 0 ? (
          <div className="mb-8 space-y-4">
            <div className="h-6 bg-gray-700/40 rounded w-48 animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-800/50 border border-white/10 rounded-lg h-40 animate-pulse" />
              <div className="bg-gray-800/50 border border-white/10 rounded-lg h-40 animate-pulse" />
            </div>
          </div>
        ) : (
          <HrRequestCards
            companySlug={companySlug}
            contactRole="CLIENT_MANAGER"
            contactEmail={verifiedEmail}
            contactName={verifiedName}
            recentRequests={recentRequests}
            onRequestSubmitted={handleRequestSubmitted}
          />
        )}
      </>
    )
  }

  // 'prompting' or 'verifying'
  return (
    <>
      <div className="mb-8">
        <div className="bg-gray-800/50 border border-white/10 rounded-lg p-5 flex items-center justify-between opacity-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white">Employee Management</p>
              <p className="text-xs text-gray-500">Verifying manager access...</p>
            </div>
          </div>
        </div>
      </div>

      <VerifyModal
        onVerify={handleVerify}
        onCancel={() => setSectionState('idle')}
        verifying={sectionState === 'verifying'}
        error={verifyError}
      />
    </>
  )
}
