'use client'

import { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class AdminErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AdminErrorBoundary] Uncaught error:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    })
  }

  render() {
    if (this.state.hasError) {
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
            {this.state.error && (
              <p className="text-sm text-red-400/80 bg-red-500/10 rounded px-3 py-2 mb-6 font-mono break-all">
                {this.state.error.message}
              </p>
            )}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => window.location.reload()}
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

    return this.props.children
  }
}
