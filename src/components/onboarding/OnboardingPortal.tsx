'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, RefreshCw } from 'lucide-react'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import { Container } from '@/components/ui/Container'
import { Button } from '@/components/ui/Button'
import PasswordGate from './PasswordGate'
import OnboardingTimeline from './OnboardingTimeline'
import type { OnboardingData } from '@/types/onboarding'

interface OnboardingPortalProps {
  companySlug: string
  isAuthenticated: boolean
  onboardingData: OnboardingData | null
}

export default function OnboardingPortal({
  companySlug,
  isAuthenticated,
  onboardingData: initialData,
}: OnboardingPortalProps) {
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleAuthenticated = () => {
    // Refresh the page to get the authenticated data from the server
    // Don't update local state - let the server component handle it with the new cookie
    router.refresh()
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)

    try {
      const response = await fetch('/api/onboarding/logout', {
        method: 'POST',
      })

      if (response.ok) {
        // Refresh the page to clear the authenticated state
        // Let the server component handle the state with the cleared cookie
        router.refresh()
      }
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-900 via-black to-gray-900">
      <Header />

      <main className="flex-1 pt-20">
        {!isAuthenticated ? (
          // Unauthenticated view - show password gate
          <PasswordGate companyName={companySlug} onAuthenticated={handleAuthenticated} />
        ) : initialData ? (
          // Authenticated view - show onboarding timeline
          <Container className="py-12 mt-4">
            {/* Header with logout */}
            <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-cyan-500 bg-clip-text text-transparent mb-2">
                  {initialData.companyDisplayName} Onboarding
                </h1>
                <p className="text-gray-300">
                  Last updated: {new Date(initialData.lastUpdated).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => router.refresh()}
                  variant="outline"
                  className="border-cyan-600 text-cyan-600 hover:bg-cyan-50"
                  leftIcon={<RefreshCw size={16} />}
                >
                  Refresh
                </Button>
                <Button
                  onClick={handleLogout}
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-50"
                  isLoading={isLoggingOut}
                  leftIcon={!isLoggingOut ? <LogOut size={16} /> : undefined}
                >
                  Log Out
                </Button>
              </div>
            </div>

            {/* Timeline */}
            <OnboardingTimeline
              phases={initialData.phases}
              currentPhaseId={initialData.currentPhaseId}
            />

            {/* Contact section */}
            <div className="mt-12 p-6 bg-gray-800/50 backdrop-blur-sm border border-cyan-500/30 rounded-lg shadow-lg shadow-cyan-500/10">
              <h3 className="text-lg font-bold text-cyan-400 mb-2">
                Need Help or Have Questions?
              </h3>
              <p className="text-gray-300 mb-4">
                Our team is here to assist you throughout your onboarding journey.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href="tel:+16073417500"
                  className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white font-semibold rounded-lg shadow-lg shadow-cyan-500/30 transition-all"
                >
                  Call (607) 341-7500
                </a>
                <a
                  href="mailto:info@triplecitiestech.com"
                  className="inline-flex items-center justify-center px-6 py-3 bg-gray-700/50 hover:bg-gray-700 text-cyan-400 font-semibold rounded-lg border-2 border-cyan-500/50 hover:border-cyan-500 transition-all"
                >
                  Email Support
                </a>
              </div>
            </div>
          </Container>
        ) : (
          // Error state - authenticated but no data
          <Container className="py-12 mt-4">
            <div className="text-center max-w-2xl mx-auto">
              <div className="mb-6 text-6xl">⚠️</div>
              <h1 className="text-2xl font-bold text-white mb-4">Configuration Issue</h1>
              <p className="text-gray-300 mb-4">
                Authentication was successful, but we couldn't load your onboarding data.
              </p>
              <div className="bg-amber-900/20 border border-amber-500/50 rounded-lg p-4 mb-6 text-left">
                <p className="text-sm text-amber-300 font-semibold mb-2">Possible causes:</p>
                <ul className="text-sm text-amber-200 space-y-1 list-disc list-inside">
                  <li>Company data not configured in server database</li>
                  <li>Company slug mismatch: <code className="bg-amber-500/20 px-2 py-0.5 rounded">{companySlug}</code></li>
                  <li>Server configuration error</li>
                </ul>
              </div>
              <div className="flex gap-3 justify-center flex-wrap">
                <Button onClick={() => router.refresh()} leftIcon={<RefreshCw size={16} />} className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700">
                  Refresh Page
                </Button>
                <Button onClick={handleLogout} variant="outline" leftIcon={<LogOut size={16} />} className="border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white">
                  Log Out
                </Button>
              </div>
              <p className="text-sm text-gray-400 mt-6">
                If this issue persists, please contact your Triple Cities Tech account manager.
              </p>
            </div>
          </Container>
        )}
      </main>

      <Footer />
    </div>
  )
}
