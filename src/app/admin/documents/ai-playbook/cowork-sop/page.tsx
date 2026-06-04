import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminShell from '@/components/admin/AdminShell'
import AdminHeader from '@/components/admin/AdminHeader'
import CoworkSop from '@/components/admin/documents/ai-playbook/CoworkSop'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Claude / Cowork Setup SOP — TCT Admin',
  description: 'Internal SOP for configuring Claude / Cowork so it builds AI assessment kits and reports consistently in TCT\'s voice.',
}

export default async function CoworkSopPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  return (
    <AdminShell>
      <AdminHeader />
      <CoworkSop />
    </AdminShell>
  )
}
