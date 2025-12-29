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

  // Check if company exists (for 404 handling)
  if (!companyExists(companySlug)) {
    redirect('/404')
  }

  // Check authentication
  const authenticatedCompany = await getAuthenticatedCompany()
  const isAuthenticated = authenticatedCompany === companySlug

  // Get onboarding data only if authenticated
  const onboardingData = isAuthenticated ? getOnboardingData(companySlug) : null

  return (
    <OnboardingPortal
      companySlug={companySlug}
      isAuthenticated={isAuthenticated}
      onboardingData={onboardingData}
    />
  )
}
