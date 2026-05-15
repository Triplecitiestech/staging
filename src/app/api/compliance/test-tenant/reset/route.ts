/**
 * POST /api/compliance/test-tenant/reset
 *
 * Wipes compliance + onboarding state for a TEST TENANT so the operator can
 * re-onboard from a clean slate. Hard-gated:
 *   - Requires SUPER_ADMIN session.
 *   - Target company must have `isTestTenant = true` (real customers can
 *     never be reset by this endpoint).
 *   - Caller must echo the company slug in the request body
 *     (`confirmSlug`) — no one-click destruction.
 *
 * What gets wiped (Company row is preserved with id + slug + displayName
 * + autotaskCompanyId intact so the wizard starts at step 1):
 *   - All compliance_* rows for the company
 *   - All policy_* rows for the company
 *   - form_responses (customer profile)
 *   - integration_credentials (encrypted creds + access log)
 *   - CompanyContact rows (so invites re-run)
 *   - M365 columns reset (tenantId/clientId/secret cleared, mode → 'legacy',
 *     status → 'not_configured')
 *   - onboarding_completed_at, invited_at, invite_count cleared
 *   - compliancePortalEnabled flipped back to false
 *
 * The isTestTenant flag is preserved so the company stays a test tenant
 * after reset.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Tables that have a `companyId` column. Listed children-first where
// possible; explicit deletes give us a per-table row count for the audit
// response. Some descendant tables (compliance_findings,
// compliance_change_bundle_items, compliance_policy_analyses) are NOT
// listed because they FK to a parent table with ON DELETE CASCADE — the
// cascade wipes them when their parent goes. compliance_webhook_events
// is intentionally excluded (its "customerId" is the partner's external
// customer ID, not our Company.id; it's a global event log).
const COMPANY_SCOPED_TABLES = [
  // Compliance subsystem
  'compliance_audit_log',
  'compliance_finding_dispositions',
  'compliance_attestations',
  'compliance_change_bundles', // CASCADE → compliance_change_bundle_items
  'compliance_pending_changes',
  'compliance_policies', // CASCADE → compliance_policy_analyses
  'compliance_evidence',
  'compliance_assessments', // CASCADE → compliance_findings
  'compliance_platform_mappings',
  'compliance_company_tools',
  'compliance_customer_context',
  'compliance_connectors',
  // Policy / intake / customer profile
  'policy_intake_answers',
  'policy_org_profiles',
  'policy_generation_records',
  'policy_versions',
  // (form_responses is handled separately below — uses snake_case company_id)
  // Integration credentials (encrypted secrets store)
  'integration_credential_access_log',
  'integration_credentials',
] as const

interface ResetBody {
  companyId?: string
  confirmSlug?: string
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — SUPER_ADMIN required' }, { status: 403 })
  }

  let body: ResetBody = {}
  try {
    body = (await request.json()) as ResetBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const companyId = (body.companyId || '').trim()
  const confirmSlug = (body.confirmSlug || '').trim()
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }
  if (!confirmSlug) {
    return NextResponse.json({ error: 'confirmSlug is required' }, { status: 400 })
  }

  const pool = getPool()
  const client = await pool.connect()
  try {
    // Verify the company is flagged as a test tenant AND the confirmation
    // slug matches. This is the only safety gate — no real customer can
    // ever be reset via this endpoint.
    const companyRes = await client.query<{
      id: string
      slug: string
      displayName: string
      isTestTenant: boolean
    }>(
      `SELECT id, slug, "displayName", "isTestTenant"
         FROM companies
        WHERE id = $1`,
      [companyId]
    )
    if (companyRes.rowCount === 0) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }
    const company = companyRes.rows[0]
    if (!company.isTestTenant) {
      return NextResponse.json(
        { error: 'Refusing to reset — company is not flagged isTestTenant=true' },
        { status: 403 }
      )
    }
    if (company.slug !== confirmSlug) {
      return NextResponse.json(
        { error: `Slug confirmation does not match (expected "${company.slug}")` },
        { status: 400 }
      )
    }

    // Pre-check which tables actually exist in this database. We can't try
    // {} catch per-DELETE inside a transaction — a missing table errors,
    // poisons the BEGIN block, and every subsequent statement is rejected
    // with "current transaction is aborted." So enumerate first and only
    // delete from tables we know exist.
    const allCandidates = [
      ...COMPANY_SCOPED_TABLES,
      'form_responses', // snake_case company_id, special-cased below
      'company_contacts', // also has "companyId"
    ]
    const existingRes = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [allCandidates]
    )
    const existingTables = new Set(existingRes.rows.map((r) => r.table_name))

    // Run the wipe in a transaction.
    await client.query('BEGIN')
    const wiped: Array<{ table: string; rows: number; skipped?: string }> = []
    for (const table of COMPANY_SCOPED_TABLES) {
      if (!existingTables.has(table)) {
        wiped.push({ table, rows: 0, skipped: 'table does not exist' })
        continue
      }
      const r = await client.query(
        `DELETE FROM ${table} WHERE "companyId" = $1`,
        [companyId]
      )
      wiped.push({ table, rows: r.rowCount ?? 0 })
    }

    // form_responses uses snake_case company_id (not "companyId").
    if (existingTables.has('form_responses')) {
      const r = await client.query(
        `DELETE FROM form_responses WHERE company_id = $1`,
        [companyId]
      )
      wiped.push({ table: 'form_responses', rows: r.rowCount ?? 0 })
    } else {
      wiped.push({ table: 'form_responses', rows: 0, skipped: 'table does not exist' })
    }

    // Contacts — so invites re-run cleanly during re-onboard.
    if (existingTables.has('company_contacts')) {
      const contactsRes = await client.query(
        `DELETE FROM company_contacts WHERE "companyId" = $1`,
        [companyId]
      )
      wiped.push({ table: 'company_contacts', rows: contactsRes.rowCount ?? 0 })
    }

    // Reset the M365 + onboarding state on the company row itself. Some
    // columns (e.g. invited_at, invite_count) are only present when the
    // raw-SQL migration route has run — in environments where Prisma's
    // schema generated the table directly they may not exist. Check
    // information_schema and only SET columns that are actually present.
    const colsRes = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'companies'`
    )
    const companyCols = new Set(colsRes.rows.map((r) => r.column_name))
    const setPairs: string[] = []
    const addSet = (col: string, value: string) => {
      if (companyCols.has(col)) setPairs.push(`${col} = ${value}`)
    }
    addSet('m365_tenant_id', 'NULL')
    addSet('m365_client_id', 'NULL')
    addSet('m365_client_secret', 'NULL')
    addSet('m365_verified_at', 'NULL')
    addSet('m365_setup_status', `'not_configured'`)
    addSet('m365_consent_mode', `'legacy'`)
    addSet('m365_consent_granted_at', 'NULL')
    addSet('onboarding_completed_at', 'NULL')
    addSet('invited_at', 'NULL')
    addSet('invite_count', '0')
    if (companyCols.has('compliancePortalEnabled')) setPairs.push(`"compliancePortalEnabled" = FALSE`)
    setPairs.push(`"updatedAt" = NOW()`)
    const resetRes = await client.query(
      `UPDATE companies SET ${setPairs.join(', ')} WHERE id = $1`,
      [companyId]
    )

    await client.query('COMMIT')

    return NextResponse.json({
      success: true,
      company: { id: company.id, slug: company.slug, displayName: company.displayName },
      wiped,
      companyResetRowCount: resetRes.rowCount ?? 0,
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[compliance/test-tenant/reset] failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  } finally {
    client.release()
  }
}
