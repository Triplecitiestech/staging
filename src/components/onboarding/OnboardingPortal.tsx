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
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #f0f4f8 0%, #d9e8f5 50%, #e0f2fe 100%)' }}>
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
                <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-600 to-cyan-800 bg-clip-text text-transparent mb-2">
                  {initialData.companyDisplayName} Onboarding
                </h1>
                <p className="text-gray-600">
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
            <div className="mt-12 p-6 bg-gradient-to-br from-cyan-50 to-cyan-100 border border-cyan-200 rounded-lg">
              <h3 className="text-lg font-bold text-cyan-900 mb-2">
                Need Help or Have Questions?
              </h3>
              <p className="text-cyan-800 mb-4">
                Our team is here to assist you throughout your onboarding journey.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href="tel:+16073417500"
                  className="inline-flex items-center justify-center px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Call (607) 341-7500
                </a>
                <a
                  href="mailto:info@triplecitiestech.com"
                  className="inline-flex items-center justify-center px-6 py-3 bg-white hover:bg-gray-50 text-cyan-700 font-semibold rounded-lg border-2 border-cyan-600 transition-colors"
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
              <h1 className="text-2xl font-bold text-gray-900 mb-4">Configuration Issue</h1>
              <p className="text-gray-600 mb-4">
                Authentication was successful, but we couldn't load your onboarding data.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-left">
                <p className="text-sm text-amber-900 font-semibold mb-2">Possible causes:</p>
                <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                  <li>Company data not configured in server database</li>
                  <li>Company slug mismatch: <code className="bg-amber-100 px-2 py-0.5 rounded">{companySlug}</code></li>
                  <li>Server configuration error</li>
                </ul>
              </div>
              <div className="flex gap-3 justify-center flex-wrap">
                <Button onClick={() => router.refresh()} leftIcon={<RefreshCw size={16} />}>
                  Refresh Page
                </Button>
                <Button onClick={handleLogout} variant="outline" leftIcon={<LogOut size={16} />}>
                  Log Out
                </Button>
              </div>
              <p className="text-sm text-gray-500 mt-6">
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
