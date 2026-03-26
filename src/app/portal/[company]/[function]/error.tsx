'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Portal Error]', error)
  }, [error])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-6">
      <div className="text-center max-w-lg">
        <h1 className="text-4xl font-bold text-white mb-4">Something went wrong</h1>
        <p className="text-slate-400 mb-8">
          We&apos;re having trouble loading the customer portal. This is usually temporary — please try again.
        </p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={reset}
            className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/portal"
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
          >
            Back to Portal
          </Link>
        </div>
      </div>
    </div>
  )
}
