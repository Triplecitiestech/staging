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
import CustomerDashboard from './CustomerDashboard'
import OnboardingJourney, { useOnboardingJourney } from './OnboardingJourney'
import type { OnboardingData } from '@/types/onboarding'

interface OnboardingPortalProps {
  companySlug: string
  companyDisplayName?: string | null
  isAuthenticated: boolean
  onboardingData: OnboardingData | null
  projects?: unknown[] | null
}

export default function OnboardingPortal({
  companySlug,
  companyDisplayName,
  isAuthenticated,
  onboardingData: initialData,
  projects,
}: OnboardingPortalProps) {
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const { showOnboarding, completeOnboarding } = useOnboardingJourney(
    isAuthenticated ? companySlug : undefined
  )

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

      {/* Onboarding Journey overlay */}
      {isAuthenticated && showOnboarding && (
        <OnboardingJourney companySlug={companySlug} onComplete={completeOnboarding} />
      )}

      <main className="flex-1 pt-20">
        {!isAuthenticated ? (
          // Unauthenticated view - show password gate
          <PasswordGate companyName={companySlug} onAuthenticated={handleAuthenticated} />
        ) : initialData ? (
          // Authenticated view - show onboarding timeline
          <Container className="py-12 mt-4">
            {/* Header */}
            <div className="mb-8 text-center">
              <h1 className="text-5xl font-bold text-white mb-2">
                {initialData.companyDisplayName}
              </h1>
              <p className="text-2xl text-cyan-400 font-semibold">
                {projects && projects.length === 1
                  ? (projects[0] as { title: string }).title
                  : projects && projects.length > 1
                  ? 'Your Projects'
                  : 'Onboarding Program'}
              </p>
            </div>

            {/* Timeline */}
            <OnboardingTimeline
              phases={initialData.phases}
              currentPhaseId={initialData.currentPhaseId}
              companySlug={companySlug}
            />

            {/* Contact section */}
            <div className="mt-12 p-6 bg-gray-800/50 backdrop-blur-sm border border-cyan-500/30 rounded-lg shadow-lg shadow-cyan-500/10 text-center">
              <h3 className="text-lg font-bold text-cyan-400 mb-2">
                Need Help or Have Questions?
              </h3>
              <p className="text-gray-300 mb-4">
                Our team is here to assist you throughout your onboarding journey.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a href="tel:+16073417500" className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white font-semibold rounded-lg shadow-lg shadow-cyan-500/30 transition-all">
                  Call (607) 341-7500
                </a>
                <a href="mailto:support@triplecitiestech.com" className="inline-flex items-center justify-center px-6 py-3 bg-gray-700/50 hover:bg-gray-700 text-cyan-400 font-semibold rounded-lg border-2 border-cyan-500/50 hover:border-cyan-500 transition-all">
                  Email Support
                </a>
                <a href="/contact#customer-support" className="inline-flex items-center justify-center px-6 py-3 bg-gray-700/50 hover:bg-gray-700 text-emerald-400 font-semibold rounded-lg border-2 border-emerald-500/50 hover:border-emerald-500 transition-all">
                  Contact Us
                </a>
              </div>
            </div>
          </Container>
        ) : projects && (projects as unknown[]).length > 0 ? (
          // Authenticated with projects - show dashboard/projects toggle
          <Container className="py-12 mt-4">
            {/* Portal Navigation */}
            <div className="flex items-center justify-end mb-8">
              <div className="flex gap-2">
                <Button onClick={() => router.refresh()} leftIcon={<RefreshCw size={16} />} className="bg-gray-700/50 hover:bg-gray-700 text-gray-300">
                  Refresh
                </Button>
                <Button onClick={handleLogout} variant="outline" leftIcon={<LogOut size={16} />} className="border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white">
                  Log Out
                </Button>
              </div>
            </div>

            <CustomerDashboard companyName={companyDisplayName || companySlug} companySlug={companySlug} projects={projects as { id: string; title: string; projectType: string; status: string; phases: { id: string; title: string; description: string | null; status: string; customerNotes: string | null; orderIndex: number; tasks: { id: string; taskText: string; completed: boolean; orderIndex: number; status: string; notes?: string | null; autotaskTaskId?: string | null; comments?: { id: string; content: string; authorName: string; createdAt: string | Date }[] }[] }[]; createdAt: string | Date; updatedAt: string | Date }[]} />

            {/* Contact section */}
            <div className="mt-12 p-6 bg-gray-800/50 backdrop-blur-sm border border-cyan-500/30 rounded-lg shadow-lg shadow-cyan-500/10 text-center">
              <h3 className="text-lg font-bold text-cyan-400 mb-2">
                Need Help or Have Questions?
              </h3>
              <p className="text-gray-300 mb-4">
                Our team is here to assist you throughout your journey.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a href="tel:+16073417500" className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white font-semibold rounded-lg shadow-lg shadow-cyan-500/30 transition-all">
                  Call (607) 341-7500
                </a>
                <a href="mailto:support@triplecitiestech.com" className="inline-flex items-center justify-center px-6 py-3 bg-gray-700/50 hover:bg-gray-700 text-cyan-400 font-semibold rounded-lg border-2 border-cyan-500/50 hover:border-cyan-500 transition-all">
                  Email Support
                </a>
                <a href="/contact#customer-support" className="inline-flex items-center justify-center px-6 py-3 bg-gray-700/50 hover:bg-gray-700 text-emerald-400 font-semibold rounded-lg border-2 border-emerald-500/50 hover:border-emerald-500 transition-all">
                  Contact Us
                </a>
              </div>
            </div>
          </Container>
        ) : (
          // Authenticated but no projects yet
          <Container className="py-12 mt-4">
            <div className="text-center max-w-2xl mx-auto">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-cyan-500/20 to-cyan-600/20 border border-cyan-500/30 rounded-full mb-6">
                <svg className="w-10 h-10 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-white mb-4">Welcome!</h1>
              <p className="text-gray-300 text-lg mb-6">
                Your portal is being set up. Your project details will appear here once your account manager adds them.
              </p>
              <p className="text-gray-400 mb-8">
                If you have any questions, don&apos;t hesitate to reach out to our team.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a href="tel:+16073417500" className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white font-semibold rounded-lg shadow-lg shadow-cyan-500/30 transition-all">
                  Call (607) 341-7500
                </a>
                <a href="mailto:support@triplecitiestech.com" className="inline-flex items-center justify-center px-6 py-3 bg-gray-700/50 hover:bg-gray-700 text-cyan-400 font-semibold rounded-lg border-2 border-cyan-500/50 hover:border-cyan-500 transition-all">
                  Email Support
                </a>
              </div>
              <div className="mt-8 flex gap-3 justify-center">
                <Button onClick={() => router.refresh()} leftIcon={<RefreshCw size={16} />} className="bg-gray-700/50 hover:bg-gray-700 text-gray-300">
                  Refresh
                </Button>
                <Button onClick={handleLogout} variant="outline" leftIcon={<LogOut size={16} />} className="border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white">
                  Log Out
                </Button>
              </div>
            </div>
          </Container>
        )}
      </main>

      <Footer />
    </div>
  )
}
