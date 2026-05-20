import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { canAccessCfoDashboard } from '@/lib/cfo/access'

// Server-side gate for the entire /admin/cfo segment. Runs before any child
// page renders, so the dashboard is never reachable without passing both the
// authenticated-staff check AND the CFO access check (allowlist OR Entra group).
export default async function CfoLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/auth/signin')

  const allowed = await canAccessCfoDashboard(session)
  if (!allowed) redirect('/admin')

  return <>{children}</>
}
