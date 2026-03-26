'use client'

import { useState, useEffect } from 'react'

interface OnboardingJourneyProps {
  companySlug: string
  onComplete: () => void
}

const STEPS = [
  {
    title: 'Welcome to Your Portal',
    description: 'This is your dedicated customer portal, which is your primary interface with Triple Cities Technology.',
    icon: (
      <svg className="w-12 h-12 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    title: 'Your Dashboard',
    description: 'Your dashboard shows your projects, support tickets, and action items at a glance. Click on any item to see more details.',
    icon: (
      <svg className="w-12 h-12 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
      </svg>
    ),
  },
  {
    title: 'Support Tickets',
    description: 'View your support tickets, see the full communication history, and reply directly. Your replies are sent to our team instantly.',
    icon: (
      <svg className="w-12 h-12 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
      </svg>
    ),
  },
  {
    title: 'Employee Changes',
    description: 'Managers can submit requests for new employees (onboarding) and departing employees (offboarding) directly from the portal.',
    icon: (
      <svg className="w-12 h-12 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
      </svg>
    ),
  },
  {
    title: 'You\'re All Set!',
    description: 'Need help? Call us at (607) 341-7500 or email support@triplecitiestech.com.',
    icon: (
      <svg className="w-12 h-12 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
]

export default function OnboardingJourney({ companySlug, onComplete }: OnboardingJourneyProps) {
  const [currentStep, setCurrentStep] = useState(0)

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  const handleSkip = () => {
    handleComplete()
  }

  const handleComplete = () => {
    // Store completion in localStorage
    localStorage.setItem(`onboarding-complete-${companySlug}`, 'true')
    onComplete()
  }

  const step = STEPS[currentStep]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-gray-800">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-cyan-600 transition-all duration-500"
            style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-8 text-center">
          <div className="flex justify-center mb-6">
            {step.icon}
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">{step.title}</h2>
          <p className="text-gray-400 leading-relaxed">{step.description}</p>
        </div>

        {/* Step indicator */}
        <div className="flex justify-center gap-2 pb-4">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentStep ? 'bg-cyan-500' : i < currentStep ? 'bg-cyan-800' : 'bg-gray-700'
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-8 pb-8">
          <button
            onClick={handleSkip}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleNext}
            className="px-6 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-lg transition-colors text-sm"
          >
            {currentStep === STEPS.length - 1 ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Hook to check if onboarding has been completed for a company
 */
export function useOnboardingJourney(companySlug?: string) {
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    if (!companySlug) return
    const completed = localStorage.getItem(`onboarding-complete-${companySlug}`)
    if (!completed) {
      setShowOnboarding(true)
    }
  }, [companySlug])

  const completeOnboarding = () => {
    setShowOnboarding(false)
  }

  return { showOnboarding, completeOnboarding }
}
