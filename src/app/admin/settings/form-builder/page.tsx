import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/lib/permissions'
import { FormBuilder } from '@/components/admin/FormBuilder'

export default async function FormBuilderPage() {
  const session = await auth()
  if (!session) redirect('/admin')
  if (!hasPermission(session.user?.role, 'manage_companies')) redirect('/admin')

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Form Builder</h1>
          <p className="text-sm text-gray-400 mt-1">
            Manage global form schemas for onboarding and offboarding requests
          </p>
        </div>
        <FormBuilder />
      </div>
    </div>
  )
}
