'use client'

import React, { useState } from 'react'
import { Lock, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/utils/cn'

interface PasswordGateProps {
  companyName: string
  onAuthenticated: () => void
}

export default function PasswordGate({ companyName, onAuthenticated }: PasswordGateProps) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/onboarding/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyName,
          password,
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // Success! Do a full page reload to get authenticated content
        window.location.reload()
      } else {
        // Show error message
        setError(data.message || 'Invalid password')
        setPassword('') // Clear password field
      }
    } catch (err) {
      console.error('Authentication error:', err)
      setError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-full mb-4 shadow-lg shadow-cyan-500/50">
            <Lock className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Customer Onboarding
          </h1>
          <p className="text-gray-300">
            Enter the access password to view your onboarding status
          </p>
        </div>

        {/* Form card */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-xl border border-gray-700 p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Password input */}
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-200 mb-2">
                Access Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn(
                    'w-full px-4 py-3 pr-12 rounded-lg border-2 transition-colors text-white',
                    'focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500',
                    error
                      ? 'border-red-500 bg-red-900/20'
                      : 'border-gray-600 bg-gray-700/50'
                  )}
                  placeholder="Enter password"
                  required
                  disabled={isLoading}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-sm text-red-200">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit button */}
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white font-semibold py-3 px-6 rounded-lg shadow-lg shadow-cyan-500/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              isLoading={isLoading}
              disabled={isLoading || !password}
            >
              {isLoading ? 'Authenticating...' : 'Access Onboarding Portal'}
            </Button>
          </form>
        </div>

        {/* Help text */}
        <p className="mt-6 text-center text-sm text-gray-400">
          If you don't have the access password, please contact your account manager at Triple Cities Tech.
        </p>
      </div>
    </div>
  )
}
