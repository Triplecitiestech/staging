import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { Pool } from 'pg'
import AdminHeader from '@/components/admin/AdminHeader'
import TechOnboardingWizard from '@/components/admin/TechOnboardingWizard'

export const dynamic = 'force-dynamic'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
})

export default async function TechOnboardingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session) redirect('/admin')

  const { id } = await params

  const client = await pool.connect()
  let company: {
    id: string
    slug: string
    displayName: string
    contactEmail: string | null
    autotaskCompanyId: string | null
    m365_tenant_id: string | null
    m365_client_id: string | null
    m365_client_secret_set: boolean
    m365_setup_status: string | null
    m365_verified_at: string | null
    onboarding_completed_at: string | null
  } | null = null

  try {
    const res = await client.query(
      `SELECT id, slug, "displayName", "contactEmail", "autotaskCompanyId",
              m365_tenant_id, m365_client_id,
              CASE WHEN m365_client_secret IS NOT NULL AND m365_client_secret != '' THEN true ELSE false END AS m365_client_secret_set,
              m365_setup_status, m365_verified_at, onboarding_completed_at
       FROM companies WHERE id = $1 LIMIT 1`,
      [id]
    )

    if (res.rows.length === 0) notFound()

    const row = res.rows[0]
    company = {
      id:                      row.id,
      slug:                    row.slug,
      displayName:             row.displayName,
      contactEmail:            row.contactEmail,
      autotaskCompanyId:       row.autotaskCompanyId,
      m365_tenant_id:          row.m365_tenant_id,
      m365_client_id:          row.m365_client_id,
      m365_client_secret_set:  row.m365_client_secret_set,
      m365_setup_status:       row.m365_setup_status ?? 'not_configured',
      m365_verified_at:        row.m365_verified_at ? new Date(row.m365_verified_at).toISOString() : null,
      onboarding_completed_at: row.onboarding_completed_at ? new Date(row.onboarding_completed_at).toISOString() : null,
    }
  } finally {
    client.release()
  }

  if (!company) notFound()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <TechOnboardingWizard company={company} />
      </main>
    </div>
  )
}
