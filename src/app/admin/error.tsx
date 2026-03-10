'use client'

import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-red-500/30 rounded-lg p-8 text-center">
        <div className="flex justify-center mb-4">
          <AlertTriangle size={48} className="text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
        <p className="text-slate-400 mb-4">
          An unexpected error occurred in the admin dashboard.
        </p>
        {error?.message && (
          <p className="text-sm text-red-400/80 bg-red-500/10 rounded px-3 py-2 mb-6 font-mono break-all">
            {error.message}
          </p>
        )}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg transition-all font-medium"
          >
            <RefreshCw size={16} />
            Try Again
          </button>
          <a
            href="/admin"
            className="flex items-center gap-2 px-4 py-2 border border-white/20 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-all"
          >
            <Home size={16} />
            Dashboard
          </a>
        </div>
      </div>
    </div>
  )
}
