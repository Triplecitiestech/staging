'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, RefreshCw } from 'lucide-react'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import { Container } from '@/components/ui/Container'
import { Button } from '@/components/ui/Button'
import OnboardingTimeline from './OnboardingTimeline'
import CustomerDashboard from './CustomerDashboard'
import OnboardingJourney, { useOnboardingJourney } from './OnboardingJourney'
import { HrRequestSection } from './HrRequestSection'
import type { OnboardingData } from '@/types/onboarding'

interface OnboardingPortalProps {
  companySlug: string
  companyDisplayName?: string | null
  isAuthenticated: boolean
  onboardingData: OnboardingData | null
  projects?: unknown[] | null
  userEmail?: string
  userName?: string
  userRole?: string
  isManager?: boolean
}

export default function OnboardingPortal({
  companySlug,
  companyDisplayName,
  isAuthenticated,
  onboardingData: initialData,
  projects,
  userEmail,
  userName,
  isManager,
}: OnboardingPortalProps) {
  const router = useRouter()
  const [, setIsLoggingOut] = useState(false)
  const { showOnboarding, completeOnboarding } = useOnboardingJourney(
    isAuthenticated ? companySlug : undefined
  )

  const handleLogout = async () => {
    setIsLoggingOut(true)

    try {
      const response = await fetch('/api/portal/auth/logout', {
        method: 'POST',
      })

      if (response.ok) {
        // Refresh the page — server component will redirect to SSO login
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
        {initialData ? (
          // Onboarding timeline view (legacy structured onboarding program)
          <Container className="py-12 mt-4">
            <div className="mb-8 text-center">
              <h1 className="text-5xl font-bold text-white mb-2">{initialData.companyDisplayName}</h1>
              <p className="text-2xl text-cyan-400 font-semibold">
                {projects && (projects as unknown[]).length === 1
                  ? (projects[0] as { title: string }).title
                  : projects && (projects as unknown[]).length > 1
                  ? 'Your Projects'
                  : 'Onboarding Program'}
              </p>
            </div>
            <OnboardingTimeline
              phases={initialData.phases}
              currentPhaseId={initialData.currentPhaseId}
              companySlug={companySlug}
            />
            <div className="mt-12 p-6 bg-gray-800/50 backdrop-blur-sm border border-cyan-500/30 rounded-lg shadow-lg shadow-cyan-500/10 text-center">
              <h3 className="text-lg font-bold text-cyan-400 mb-2">Need Help or Have Questions?</h3>
              <p className="text-gray-300 mb-4">Our team is here to assist you throughout your onboarding journey.</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a href="tel:+16073417500" className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white font-semibold rounded-lg shadow-lg shadow-cyan-500/30 transition-all">Call (607) 341-7500</a>
                <a href="mailto:support@triplecitiestech.com" className="inline-flex items-center justify-center px-6 py-3 bg-gray-700/50 hover:bg-gray-700 text-cyan-400 font-semibold rounded-lg border-2 border-cyan-500/50 hover:border-cyan-500 transition-all">Email Support</a>
              </div>
            </div>
          </Container>
        ) : (
          // Standard portal view — always show dashboard + HR section regardless of project count
          <Container className="py-8 mt-4">
            {/* Top-right controls */}
            <div className="flex items-center justify-end mb-6 gap-2">
              {userEmail && (
                <span className="text-sm text-gray-400 mr-2">
                  {userName || userEmail}
                </span>
              )}
              <Button onClick={() => router.refresh()} leftIcon={<RefreshCw size={16} />} className="bg-gray-700/50 hover:bg-gray-700 text-gray-300">
                Refresh
              </Button>
              <Button onClick={handleLogout} variant="outline" leftIcon={<LogOut size={16} />} className="border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white">
                Log Out
              </Button>
            </div>

            {/* Dashboard — tickets + projects (shows 0s if nothing synced yet) */}
            <CustomerDashboard
              companyName={companyDisplayName || companySlug}
              companySlug={companySlug}
              projects={(projects ?? []) as { id: string; title: string; projectType: string; status: string; phases: { id: string; title: string; description: string | null; status: string; customerNotes: string | null; orderIndex: number; tasks: { id: string; taskText: string; completed: boolean; orderIndex: number; status: string; notes?: string | null; autotaskTaskId?: string | null; comments?: { id: string; content: string; authorName: string; createdAt: string | Date }[] }[] }[]; createdAt: string | Date; updatedAt: string | Date }[]}
            />

            {/* Employee Management — always below dashboard stats */}
            <div className="mt-8">
              <HrRequestSection
                companySlug={companySlug}
                userEmail={userEmail}
                userName={userName}
                isManager={isManager}
              />
            </div>

            {/* Contact section */}
            <div className="mt-10 p-6 bg-gray-800/50 backdrop-blur-sm border border-cyan-500/30 rounded-lg shadow-lg shadow-cyan-500/10 text-center">
              <h3 className="text-lg font-bold text-cyan-400 mb-2">Need Help or Have Questions?</h3>
              <p className="text-gray-300 mb-4">Our team is here to assist you throughout your journey.</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a href="tel:+16073417500" className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white font-semibold rounded-lg shadow-lg shadow-cyan-500/30 transition-all">Call (607) 341-7500</a>
                <a href="mailto:support@triplecitiestech.com" className="inline-flex items-center justify-center px-6 py-3 bg-gray-700/50 hover:bg-gray-700 text-cyan-400 font-semibold rounded-lg border-2 border-cyan-500/50 hover:border-cyan-500 transition-all">Email Support</a>
              </div>
            </div>
          </Container>
        )}
      </main>

      <Footer />
    </div>
  )
}
