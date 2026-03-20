import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/lib/permissions'
import { Pool } from 'pg'
import { CustomerFormConfig } from '@/components/admin/CustomerFormConfig'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 3,
})

export default async function CustomerFormConfigPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session) redirect('/admin')
  if (!hasPermission(session.user?.role, 'manage_companies')) redirect('/admin')

  const { id: companyId } = await params

  const client = await pool.connect()
  let company: { id: string; displayName: string; slug: string } | null = null
  try {
    const res = await client.query<{ id: string; displayName: string; slug: string }>(
      `SELECT id, "displayName", slug FROM companies WHERE id = $1`,
      [companyId]
    )
    company = res.rows[0] ?? null
  } finally {
    client.release()
  }

  if (!company) redirect('/admin/companies')

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <a href="/admin/companies" className="hover:text-gray-300">Companies</a>
            <span>/</span>
            <a href={`/admin/companies/${companyId}`} className="hover:text-gray-300">{company.displayName}</a>
            <span>/</span>
            <span className="text-gray-300">Form Config</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Form Configuration</h1>
          <p className="text-sm text-gray-400 mt-1">
            Customize onboarding and offboarding forms for {company.displayName}
          </p>
        </div>
        <CustomerFormConfig companyId={companyId} companyName={company.displayName} />
      </div>
    </div>
  )
}
