'use client'

import { useState, useEffect, useCallback } from 'react'
import { HrRequestCards, HrRequestSummary } from './HrRequestCards'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HrRequestSectionProps {
  companySlug: string
  /** SSO user email from portal session */
  userEmail?: string
  /** SSO user name from portal session */
  userName?: string
  /** Whether the SSO user is a manager (CLIENT_MANAGER or isPrimary) */
  isManager?: boolean
}

// ---------------------------------------------------------------------------
// Main HrRequestSection
// ---------------------------------------------------------------------------

export function HrRequestSection({
  companySlug,
  userEmail,
  userName,
  isManager,
}: HrRequestSectionProps) {
  const [recentRequests, setRecentRequests] = useState<HrRequestSummary[]>([])
  const [loadingRequests, setLoadingRequests] = useState(false)

  // ----- Load recent requests when manager -----
  const loadRequests = useCallback(async () => {
    if (!isManager || !userEmail || !companySlug) return
    setLoadingRequests(true)
    try {
      const params = new URLSearchParams({ companySlug, email: userEmail })
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
  }, [isManager, userEmail, companySlug])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  function handleRequestSubmitted(_requestId: string) {
    // Refresh the recent requests list after a short delay
    setTimeout(() => loadRequests(), 1500)
  }

  // ----- Not a manager — show a message -----
  if (!isManager) {
    return (
      <div className="mb-8">
        <div className="bg-gray-800/50 border border-white/10 rounded-lg p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gray-700/50 border border-white/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-white">Employee Management</p>
            <p className="text-xs text-gray-500">Contact your company manager for employee change access.</p>
          </div>
        </div>
      </div>
    )
  }

  // ----- Manager — show HR request cards -----
  if (loadingRequests && recentRequests.length === 0) {
    return (
      <div className="mb-8 space-y-4">
        <div className="h-6 bg-gray-700/40 rounded w-48 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-800/50 border border-white/10 rounded-lg h-40 animate-pulse" />
          <div className="bg-gray-800/50 border border-white/10 rounded-lg h-40 animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <HrRequestCards
      companySlug={companySlug}
      contactRole="CLIENT_MANAGER"
      contactEmail={userEmail ?? ''}
      contactName={userName ?? ''}
      recentRequests={recentRequests}
      onRequestSubmitted={handleRequestSubmitted}
    />
  )
}
