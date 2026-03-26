import { redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{ company: string }>
}

/**
 * /portal/[company] → redirect to /portal/[company]/dashboard
 * This ensures users always land on the dashboard by default.
 */
export default async function PortalCompanyPage({ params }: PageProps) {
  const { company } = await params
  redirect(`/portal/${company.toLowerCase().trim()}/dashboard`)
}
