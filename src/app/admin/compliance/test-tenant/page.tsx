/**
 * /admin/compliance/test-tenant — TCT-only control panel for test tenants.
 *
 * Lists every company with `isTestTenant = true`, and provides:
 *   - A "Reset to clean slate" action per row (requires slug confirmation)
 *   - A search box to flag/unflag any company as a test tenant
 *
 * Hard-gated to SUPER_ADMIN. Destructive actions are visually isolated
 * from real-customer workflow pages by living on a dedicated route.
 */

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminHeader from '@/components/admin/AdminHeader'
import { getPool } from '@/lib/db-pool'
import TestTenantManager from '@/components/compliance/TestTenantManager'

export const dynamic = 'force-dynamic'

interface CompanyRow {
  id: string
  slug: string
  displayName: string
  isTestTenant: boolean
  m365SetupStatus: string | null
  m365ConsentMode: string | null
  onboardingCompletedAt: string | null
}

export default async function TestTenantPage() {
  const session = await auth()
  if (!session?.user) redirect('/admin')
  if (session.user.role !== 'SUPER_ADMIN') redirect('/admin/compliance')

  const [testTenants, recentCompanies] = await Promise.all([
    loadTestTenants(),
    loadRecentCompanies(),
  ])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-cyan-400 uppercase tracking-wider">
            <Link href="/admin/compliance" className="hover:text-cyan-300">Compliance</Link>
            <span aria-hidden>›</span>
            <span className="text-slate-500">Test tenants</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mt-1">
            Test Tenants
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Companies flagged as test tenants can be wiped + re-onboarded from
            scratch. Resetting clears compliance data, M365 consent, customer
            profile, contacts, and onboarding state — but keeps the Company
            row, slug, and Autotask link so the wizard starts at step 1.
          </p>
        </div>

        <div className="bg-rose-950/30 border border-rose-500/30 rounded-xl p-4 text-sm text-rose-200">
          <p className="font-semibold mb-1">Destructive operation</p>
          <p className="text-rose-200/80">
            Reset cannot be undone. It deletes every compliance assessment,
            finding, policy, change bundle, audit log row, connector, and
            customer-facing form response for the target tenant. Only
            companies with <code className="text-rose-100">isTestTenant = true</code> can be
            targeted. Requires SUPER_ADMIN and an exact slug confirmation.
          </p>
        </div>

        <TestTenantManager testTenants={testTenants} recentCompanies={recentCompanies} />
      </main>
    </div>
  )
}

async function loadTestTenants(): Promise<CompanyRow[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<CompanyRow>(
      `SELECT id, slug, "displayName", "isTestTenant",
              m365_setup_status AS "m365SetupStatus",
              m365_consent_mode AS "m365ConsentMode",
              onboarding_completed_at::text AS "onboardingCompletedAt"
         FROM companies
        WHERE "isTestTenant" = TRUE
        ORDER BY "displayName" ASC`
    )
    return res.rows
  } catch (err) {
    console.error('[compliance/test-tenant] loadTestTenants failed', err)
    return []
  } finally {
    client.release()
  }
}

async function loadRecentCompanies(): Promise<CompanyRow[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<CompanyRow>(
      `SELECT id, slug, "displayName", "isTestTenant",
              m365_setup_status AS "m365SetupStatus",
              m365_consent_mode AS "m365ConsentMode",
              onboarding_completed_at::text AS "onboardingCompletedAt"
         FROM companies
        ORDER BY "updatedAt" DESC
        LIMIT 50`
    )
    return res.rows
  } catch (err) {
    console.error('[compliance/test-tenant] loadRecentCompanies failed', err)
    return []
  } finally {
    client.release()
  }
}
