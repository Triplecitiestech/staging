import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminShell from '@/components/admin/AdminShell'
import AdminHeader from '@/components/admin/AdminHeader'
import DiscoveryForm from '@/components/admin/documents/ai-playbook/DiscoveryForm'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'AI Profit & Readiness Assessment — TCT Admin',
  description: 'Staff-filled discovery questionnaire that steers platform selection and readiness for the AI Managed Services engagement.',
}

export default async function AiDiscoveryPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  return (
    <AdminShell>
      <AdminHeader />
      <DiscoveryForm />
    </AdminShell>
  )
}
