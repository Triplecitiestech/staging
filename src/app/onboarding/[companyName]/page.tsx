import React from 'react'
import { redirect } from 'next/navigation'
import { getAuthenticatedCompany } from '@/lib/onboarding-session'
import { getOnboardingData, companyExists } from '@/lib/onboarding-data'
import OnboardingPortal from '@/components/onboarding/OnboardingPortal'
import { Metadata } from 'next'

interface PageProps {
  params: Promise<{ companyName: string }>
}

// Generate metadata for SEO (but keep it vague for security)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return {
    title: 'Customer Onboarding | Triple Cities Tech',
    description: 'Track your onboarding progress with Triple Cities Tech',
    robots: {
      index: false, // Don't index these pages
      follow: false,
    },
  }
}

export default async function OnboardingPage({ params }: PageProps) {
  const { companyName } = await params
  const companySlug = companyName.toLowerCase().trim()

  console.log('[Onboarding Page] Company slug:', companySlug)

  // Check if company exists (for 404 handling)
  const exists = companyExists(companySlug)
  console.log('[Onboarding Page] Company exists:', exists)

  if (!exists) {
    redirect('/404')
  }

  // Check authentication
  const authenticatedCompany = await getAuthenticatedCompany()
  const isAuthenticated = authenticatedCompany === companySlug
  console.log('[Onboarding Page] Authenticated company:', authenticatedCompany)
  console.log('[Onboarding Page] Is authenticated:', isAuthenticated)

  // Get onboarding data only if authenticated
  const onboardingData = isAuthenticated ? getOnboardingData(companySlug) : null
  console.log('[Onboarding Page] Onboarding data loaded:', onboardingData !== null)
  console.log('[Onboarding Page] Onboarding data:', onboardingData)

  return (
    <OnboardingPortal
      companySlug={companySlug}
      isAuthenticated={isAuthenticated}
      onboardingData={onboardingData}
    />
  )
}
