import { redirect } from 'next/navigation'
import { getPortalSession } from '@/lib/portal-session'
import { AuthenticatedFormPage } from '../AuthenticatedFormPage'

export const dynamic = 'force-dynamic'

export default async function OnboardingFormPage({
  params,
}: {
  params: Promise<{ companySlug: string }>
}) {
  const { companySlug } = await params
  const session = await getPortalSession()

  // No session or wrong company → redirect to M365 login
  if (!session || session.companySlug !== companySlug) {
    const returnTo = `/forms/${companySlug}/onboarding`
    redirect(`/api/portal/auth/login?company=${encodeURIComponent(companySlug)}&returnTo=${encodeURIComponent(returnTo)}`)
  }

  // Only managers can submit HR forms
  if (!session.isManager) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-900 border border-white/10 rounded-xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Manager Access Required</h1>
          <p className="text-gray-400 text-sm">
            Only authorized managers can submit employee onboarding requests. Please contact your manager or Triple Cities Tech for assistance.
          </p>
          <p className="text-xs text-gray-500 mt-3">Signed in as {session.email}</p>
        </div>
      </div>
    )
  }

  return (
    <AuthenticatedFormPage
      companySlug={companySlug}
      formType="onboarding"
      email={session.email}
      name={session.name}
    />
  )
}
