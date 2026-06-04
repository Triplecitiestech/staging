import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminShell from '@/components/admin/AdminShell'
import AdminHeader from '@/components/admin/AdminHeader'
import AiManagedServicesPlaybook from '@/components/admin/documents/AiManagedServicesPlaybook'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'AI Managed Services Playbook — TCT Admin',
  description:
    'How TCT packages, sells, and delivers AI as a managed service — the rules that keep the recurring fee honest and the projects profitable.',
}

export default async function AiPlaybookPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  return (
    <AdminShell>
      <AdminHeader />
      <AiManagedServicesPlaybook />
    </AdminShell>
  )
}
