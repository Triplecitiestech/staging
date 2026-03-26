'use client'

import { HrRequestCards } from './HrRequestCards'

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
            <p className="text-sm font-medium text-white">Employee Changes</p>
            <p className="text-xs text-gray-500">Only managers can add or remove employees. Ask your manager if you need access.</p>
          </div>
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
    />
  )
}
