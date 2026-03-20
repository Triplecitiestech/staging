import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import { getTenantCredentialsBySlug, createGraphClient } from '@/lib/graph'

// ---------------------------------------------------------------------------
// Raw pg pool — for manager auth check
// ---------------------------------------------------------------------------

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
})

// ---------------------------------------------------------------------------
// GET /api/hr/m365-data?companySlug=<slug>&email=<email>
//
// Returns live M365 tenant data for the given company:
//   - licenses      (subscribed SKUs with available counts)
//   - securityGroups
//   - distributionLists
//   - m365Groups    (Teams + group-connected SharePoint)
//   - sharepointSites
//   - users         (for "clone permissions from" picker)
//
// Requires the requesting email to be an active CLIENT_MANAGER for the company.
// The company must have M365 credentials configured by a TCT technician first.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const companySlug = searchParams.get('companySlug')?.toLowerCase().trim() ?? ''
  const email       = searchParams.get('email')?.toLowerCase().trim() ?? ''

  if (!companySlug) {
    return NextResponse.json({ error: 'companySlug is required' }, { status: 400 })
  }
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  // 1. Verify requesting email is an active manager
  const pgClient = await pool.connect()
  try {
    const companyRes = await pgClient.query<{ id: string }>(
      `SELECT id FROM companies WHERE slug = $1 LIMIT 1`,
      [companySlug]
    )
    if (companyRes.rows.length === 0) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const companyId = companyRes.rows[0].id

    const contactRes = await pgClient.query<{ customerRole: string; isPrimary: boolean }>(
      `SELECT "customerRole", "isPrimary"
       FROM company_contacts
       WHERE "companyId" = $1 AND LOWER(email) = $2 AND "isActive" = true
       LIMIT 1`,
      [companyId, email]
    )

    if (contactRes.rows.length === 0) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const contact = contactRes.rows[0]
    if (contact.customerRole !== 'CLIENT_MANAGER' && !contact.isPrimary) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } finally {
    pgClient.release()
  }

  // 2. Load tenant credentials
  const creds = await getTenantCredentialsBySlug(companySlug)

  if (!creds) {
    // Not an error — tenant just hasn't been configured yet
    return NextResponse.json(
      {
        configured: false,
        message: 'Microsoft 365 integration has not been configured for this company yet. Contact your TCT technician.',
      },
      { status: 200 }
    )
  }

  // 3. Call Graph API — fetch all data types in parallel
  const graph = createGraphClient(creds)

  try {
    const [licenses, securityGroups, distributionLists, m365Groups, sharepointSites, users] =
      await Promise.allSettled([
        graph.getLicenseSkus(),
        graph.getSecurityGroups(),
        graph.getDistributionLists(),
        graph.getM365Groups(),
        graph.getSharePointSites(),
        graph.getUsers(),
      ])

    const safeValue = <T>(result: PromiseSettledResult<T>, fallback: T): T =>
      result.status === 'fulfilled' ? result.value : fallback

    return NextResponse.json({
      configured: true,
      licenses:          safeValue(licenses, []),
      securityGroups:    safeValue(securityGroups, []),
      distributionLists: safeValue(distributionLists, []),
      m365Groups:        safeValue(m365Groups, []),
      sharepointSites:   safeValue(sharepointSites, []),
      users:             safeValue(users, []),
      // Surface any partial failures as warnings (non-breaking)
      warnings: [
        licenses.status          === 'rejected' ? `Licenses: ${licenses.reason}` : null,
        securityGroups.status    === 'rejected' ? `Security groups: ${securityGroups.reason}` : null,
        distributionLists.status === 'rejected' ? `Distribution lists: ${distributionLists.reason}` : null,
        m365Groups.status        === 'rejected' ? `M365 groups: ${m365Groups.reason}` : null,
        sharepointSites.status   === 'rejected' ? `SharePoint sites: ${sharepointSites.reason}` : null,
        users.status             === 'rejected' ? `Users: ${users.reason}` : null,
      ].filter(Boolean),
    }, { status: 200 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[hr/m365-data] Graph error:', msg)

    // Token / auth failure
    if (msg.includes('AADSTS') || msg.includes('token')) {
      return NextResponse.json(
        {
          configured: true,
          error: 'Microsoft 365 authentication failed. The app registration credentials may be invalid or the app may need to be re-consented.',
          detail: msg,
        },
        { status: 502 }
      )
    }

    return NextResponse.json(
      { configured: true, error: 'Failed to load Microsoft 365 data. Please try again.', detail: msg },
      { status: 500 }
    )
  }
}
