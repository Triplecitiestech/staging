'use client'

import { useEffect } from 'react'

/**
 * Captures unhandled errors and promise rejections
 * and reports them to the error logging API.
 */
export default function GlobalErrorReporter() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'unhandled',
          message: event.message || 'Unhandled error',
          stack: event.error?.stack,
          path: window.location.pathname,
          metadata: { filename: event.filename, lineno: event.lineno, colno: event.colno },
        }),
      }).catch(() => {})
    }

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'unhandled',
          message: reason instanceof Error ? reason.message : String(reason),
          stack: reason instanceof Error ? reason.stack : undefined,
          path: window.location.pathname,
          metadata: { type: 'unhandledrejection' },
        }),
      }).catch(() => {})
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  return null
}
