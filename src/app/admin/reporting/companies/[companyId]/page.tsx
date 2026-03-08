import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import CompanyDetail from '@/components/reporting/CompanyDetail'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function CompanyDetailPage({ params }: Props) {
  const session = await auth()
  if (!session) {
    redirect('/admin')
  }

  const { companyId } = await params

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <CompanyDetail companyId={companyId} />
      </main>
    </div>
  )
}
