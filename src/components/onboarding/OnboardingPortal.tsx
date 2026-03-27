'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, RefreshCw } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Button } from '@/components/ui/Button'
import OnboardingTimeline from './OnboardingTimeline'
import CustomerDashboard from './CustomerDashboard'
import OnboardingJourney, { useOnboardingJourney } from './OnboardingJourney'
import type { OnboardingData } from '@/types/onboarding'
import { useDemoMode } from '@/components/admin/DemoModeProvider'

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
  dbDegraded?: boolean
  portalFunction?: string
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
  dbDegraded,
}: OnboardingPortalProps) {
  const router = useRouter()
  const demo = useDemoMode()
  const { showOnboarding, completeOnboarding } = useOnboardingJourney(
    isAuthenticated ? companySlug : undefined
  )

  const displayName = demo.company(companyDisplayName || companySlug)

  const handleLogout = () => {
    // Clear cookie via POST, then redirect to portal splash
    fetch('/api/portal/auth/logout', { method: 'POST' })
      .finally(() => {
        window.location.replace('/portal')
      })
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950 relative">
      {/* Ambient grid overlay */}
      <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      {/* Portal header bar */}
      <header className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-white tracking-tight">TCT</span>
            {isAuthenticated && userEmail && (
              <span className="text-sm text-gray-400">Logged in as: {demo.person(userName || userEmail)}</span>
            )}
          </div>
          {isAuthenticated && (
            <div className="flex items-center gap-2">
              <Button onClick={() => router.refresh()} leftIcon={<RefreshCw size={16} />} className="bg-gray-700/50 hover:bg-gray-700 text-gray-300">
                Refresh
              </Button>
              <Button onClick={handleLogout} variant="outline" leftIcon={<LogOut size={16} />} className="border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white">
                Log Out
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Onboarding Journey overlay */}
      {isAuthenticated && showOnboarding && (
        <OnboardingJourney companySlug={companySlug} onComplete={completeOnboarding} />
      )}

      <main className="flex-1">
        {dbDegraded && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
            <div className="bg-slate-800/80 border border-cyan-500/30 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-sm text-slate-300">
                Some data may be temporarily unavailable. Your portal is loading in limited mode.
              </p>
              <button
                onClick={() => router.refresh()}
                className="flex items-center gap-1.5 text-sm text-cyan-400 hover:text-cyan-300 font-medium whitespace-nowrap"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          </div>
        )}
        {initialData ? (
          // Onboarding timeline view (legacy structured onboarding program)
          <Container className="py-12 mt-4">
            <div className="mb-8 text-center">
              <h1 className="text-5xl font-bold text-white mb-2">{demo.company(initialData.companyDisplayName)}</h1>
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
            <div className="mt-8 px-4 py-3 bg-gray-800/50 border border-cyan-500/20 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-sm text-gray-300">Need help? Reach out to our team.</p>
              <div className="flex gap-3">
                <a href="tel:+16073417500" className="text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors">Call (607) 341-7500</a>
                <a href="mailto:support@triplecitiestech.com" className="text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors">Email Support</a>
              </div>
            </div>
          </Container>
        ) : (
          // Standard portal view — always show dashboard + HR section regardless of project count
          <Container className="py-8 mt-4">
            {/* Dashboard — stats + employee management + tickets + projects */}
            <CustomerDashboard
              companyName={displayName}
              companySlug={companySlug}
              projects={(projects ?? []) as { id: string; title: string; projectType: string; status: string; phases: { id: string; title: string; description: string | null; status: string; customerNotes: string | null; orderIndex: number; tasks: { id: string; taskText: string; completed: boolean; orderIndex: number; status: string; notes?: string | null; autotaskTaskId?: string | null; comments?: { id: string; content: string; authorName: string; createdAt: string | Date }[] }[] }[]; createdAt: string | Date; updatedAt: string | Date }[]}
              userEmail={userEmail}
              userName={userName}
              isManager={isManager}
            />
          </Container>
        )}
      </main>
    </div>
  )
}
