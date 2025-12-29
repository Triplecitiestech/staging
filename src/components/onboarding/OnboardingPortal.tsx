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
  isAuthenticated: initialAuth,
  onboardingData: initialData,
}: OnboardingPortalProps) {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(initialAuth)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleAuthenticated = () => {
    // Refresh the page to get the authenticated data from the server
    router.refresh()
    setIsAuthenticated(true)
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)

    try {
      const response = await fetch('/api/onboarding/logout', {
        method: 'POST',
      })

      if (response.ok) {
        // Refresh the page to clear the authenticated state
        router.refresh()
        setIsAuthenticated(false)
      }
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 via-white to-cyan-50">
      <Header />

      <main className="flex-1">
        {!isAuthenticated ? (
          // Unauthenticated view - show password gate
          <PasswordGate companyName={companySlug} onAuthenticated={handleAuthenticated} />
        ) : initialData ? (
          // Authenticated view - show onboarding timeline
          <Container className="py-12">
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
          // Error state (should not happen, but just in case)
          <Container className="py-12">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 mb-4">Error Loading Data</h1>
              <p className="text-gray-600 mb-6">
                We couldn't load your onboarding information. Please try refreshing the page.
              </p>
              <Button onClick={() => router.refresh()}>
                Refresh Page
              </Button>
            </div>
          </Container>
        )}
      </main>

      <Footer />
    </div>
  )
}
