import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminShell from '@/components/admin/AdminShell'
import AdminHeader from '@/components/admin/AdminHeader'
import RoiCalculator from '@/components/admin/documents/ai-playbook/RoiCalculator'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'AI ROI Calculator — TCT Admin',
  description: 'Put a number on the AI opportunity — time saved becomes labor dollars, netted against tool and service cost.',
}

export default async function RoiPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  return (
    <AdminShell>
      <AdminHeader />
      <RoiCalculator />
    </AdminShell>
  )
}
