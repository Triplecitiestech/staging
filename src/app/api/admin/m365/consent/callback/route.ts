/**
 * GET /api/admin/m365/consent/callback
 *
 * Microsoft Entra redirects here after a customer admin grants (or
 * declines) consent to TCT's multi-tenant app registration. Documented
 * callback parameters:
 *   - tenant=<customerTenantId>
 *   - admin_consent=True | False
 *   - state=<our-signed-state>
 *   - On error: error=<code>&error_description=<text>
 *
 * On success: flip the company's m365_consent_mode to 'multi_tenant',
 * stamp m365_tenant_id and m365_consent_granted_at, and redirect back to
 * the onboarding wizard.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyState } from '@/lib/portal-session'
import { getPool } from '@/lib/db-pool'

const pool = getPool()

const ADMIN_CONSENT_STATE_FLOW = 'admin_consent'
const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes

function redirectToWizard(baseUrl: string, companyId: string, query: Record<string, string>): NextResponse {
  const params = new URLSearchParams(query)
  return NextResponse.redirect(
    `${baseUrl}/admin/companies/${companyId}/onboard?${params.toString()}`
  )
}

function redirectToAdminWithError(baseUrl: string, message: string): NextResponse {
  const params = new URLSearchParams({ m365_consent_error: message })
  return NextResponse.redirect(`${baseUrl}/admin?${params.toString()}`)
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com'

  const stateParam = request.nextUrl.searchParams.get('state') ?? ''
  const tenant = request.nextUrl.searchParams.get('tenant') ?? ''
  const adminConsent = request.nextUrl.searchParams.get('admin_consent') ?? ''
  const errorCode = request.nextUrl.searchParams.get('error')
  const errorDesc = request.nextUrl.searchParams.get('error_description')

  // Always validate state first — without a valid state we don't know which
  // company this consent belongs to, and we can't safely act on the request.
  const state = verifyState(stateParam)
  if (!state) {
    return redirectToAdminWithError(
      baseUrl,
      'Invalid or expired consent state. Please retry from the onboarding wizard.'
    )
  }

  if (state.flow !== ADMIN_CONSENT_STATE_FLOW || typeof state.companyId !== 'string') {
    return redirectToAdminWithError(baseUrl, 'Unexpected consent state. Please retry from the onboarding wizard.')
  }

  if (typeof state.issuedAt !== 'number' || Date.now() - state.issuedAt > STATE_TTL_MS) {
    return redirectToWizard(baseUrl, state.companyId, {
      step: '2',
      m365_consent_error: 'Consent link expired. Please click "Connect Microsoft 365" again.',
    })
  }

  const companyId: string = state.companyId

  if (errorCode) {
    return redirectToWizard(baseUrl, companyId, {
      step: '2',
      m365_consent_error: `${errorCode}: ${errorDesc ?? 'Microsoft returned an error.'}`,
    })
  }

  if (adminConsent !== 'True') {
    return redirectToWizard(baseUrl, companyId, {
      step: '2',
      m365_consent_error: 'Consent was declined. The customer admin must click Accept on the Microsoft consent page.',
    })
  }

  if (!tenant) {
    return redirectToWizard(baseUrl, companyId, {
      step: '2',
      m365_consent_error: 'Microsoft did not return a tenant ID. Please retry.',
    })
  }

  const client = await pool.connect()
  try {
    // Block double-binding: if some other company already claimed this tenant,
    // refuse to overwrite — the operator needs to investigate.
    const conflict = await client.query<{ id: string; "displayName": string }>(
      `SELECT id, "displayName" FROM companies
       WHERE m365_tenant_id = $1 AND id <> $2 LIMIT 1`,
      [tenant, companyId]
    )
    if (conflict.rows.length > 0) {
      return redirectToWizard(baseUrl, companyId, {
        step: '2',
        m365_consent_error:
          `Tenant ${tenant} is already linked to a different company (${conflict.rows[0].displayName}). ` +
          `If you intended to move the connection, contact engineering — overwriting would orphan that company's integration.`,
      })
    }

    await client.query(
      `UPDATE companies
       SET m365_tenant_id          = $1,
           m365_consent_mode       = 'multi_tenant',
           m365_consent_granted_at = NOW(),
           m365_setup_status       = 'verified',
           m365_verified_at        = NOW(),
           "updatedAt"             = NOW()
       WHERE id = $2`,
      [tenant, companyId]
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[admin/m365/consent/callback] DB error:', msg)
    return redirectToWizard(baseUrl, companyId, {
      step: '2',
      m365_consent_error: 'Failed to record consent in the database. Please try again.',
    })
  } finally {
    client.release()
  }

  return redirectToWizard(baseUrl, companyId, {
    step: '3',
    m365_consent_success: '1',
  })
}
