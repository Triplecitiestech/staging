import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminShell from '@/components/admin/AdminShell'
import AdminHeader from '@/components/admin/AdminHeader'
import AupTemplate from '@/components/admin/documents/ai-playbook/AupTemplate'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'AI Acceptable Use Policy — TCT Admin',
  description: 'Deployable AI Acceptable Use Policy template, included in managed AI services and set up during governance.',
}

export default async function AupPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  return (
    <AdminShell>
      <AdminHeader />
      <AupTemplate />
    </AdminShell>
  )
}
