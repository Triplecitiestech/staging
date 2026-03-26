import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ companyName: string }>
}

/**
 * Legacy redirect: /onboarding/[companyName] → /portal/[companyName]/dashboard
 * Preserves backward compatibility for existing portal URLs and bookmarks.
 */
export default async function OnboardingPage({ params }: PageProps) {
  const { companyName } = await params
  const companySlug = companyName.toLowerCase().trim()
  redirect(`/portal/${companySlug}/dashboard`)
}
