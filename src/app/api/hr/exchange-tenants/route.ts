/**
 * Per-tenant Exchange automation enablement registry (exo_tenant_config).
 *
 * Operator-facing, secret-authed (checkSecretAuth — MIGRATION_SECRET/
 * CRON_SECRET Bearer). Used by the enablement runbook
 * (docs/runbooks/EXO_AUTOMATION_ENABLEMENT.md) from PowerShell:
 *
 *   GET  /api/hr/exchange-tenants            — list tenants + enablement state
 *   POST /api/hr/exchange-tenants            — upsert { companySlug, organizationDomain, enabled, tenantId?, notes?, enabledBy? }
 *   POST /api/hr/exchange-tenants?action=probe — dispatch a read-only probe
 *        job for { companySlug }; the callback stores the result on the row.
 *
 * tenantId defaults from companies.m365_tenant_id so the registry can never
 * silently diverge from the M365 integration's tenant mapping.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkSecretAuth } from '@/lib/api-auth'
import { getPool } from '@/lib/db-pool'
import {
  checkExchangeAutomationAvailability,
  dispatchExchangeJob,
  listExchangeTenantConfigs,
  upsertExchangeTenantConfig,
} from '@/lib/exchange-online'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = checkSecretAuth(request)
  if (denied) return denied
  try {
    const tenants = await listExchangeTenantConfigs()
    return NextResponse.json({ success: true, killSwitchEnabled: process.env.EXO_AUTOMATION_ENABLED === 'true', tenants })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = checkSecretAuth(request)
  if (denied) return denied

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const companySlug = typeof body.companySlug === 'string' ? body.companySlug.trim() : ''
  if (!companySlug) {
    return NextResponse.json({ error: 'companySlug is required' }, { status: 400 })
  }

  try {
    if (request.nextUrl.searchParams.get('action') === 'probe') {
      const availability = await checkExchangeAutomationAvailability(companySlug)
      if (!availability.available) {
        return NextResponse.json({ error: `Cannot probe: ${availability.reason}`, code: availability.code }, { status: 409 })
      }
      const dispatch = await dispatchExchangeJob({
        jobType: 'probe',
        companySlug,
        tenantConfig: availability.config,
      })
      if (!dispatch.ok) {
        return NextResponse.json({ error: `Probe dispatch failed: ${dispatch.error}`, jobId: dispatch.jobId }, { status: 502 })
      }
      return NextResponse.json({
        success: true,
        jobId: dispatch.jobId,
        azureJobIds: dispatch.azureJobIds,
        note: 'Probe dispatched — re-run GET in ~2-5 minutes and check lastProbeAt/lastProbeResult on the tenant row.',
      })
    }

    const organizationDomain = typeof body.organizationDomain === 'string' ? body.organizationDomain.trim().toLowerCase() : ''
    const enabled = body.enabled === true
    if (!organizationDomain || !organizationDomain.endsWith('.onmicrosoft.com')) {
      return NextResponse.json(
        { error: 'organizationDomain is required and must be the tenant primary .onmicrosoft.com domain (Connect-ExchangeOnline -Organization)' },
        { status: 400 },
      )
    }

    const pool = getPool()
    const companyRes = await pool.query<{ id: string; m365_tenant_id: string | null }>(
      `SELECT id, m365_tenant_id FROM companies WHERE slug = $1`,
      [companySlug],
    )
    if (companyRes.rows.length === 0) {
      return NextResponse.json({ error: `Unknown company slug: ${companySlug}` }, { status: 404 })
    }
    const tenantId =
      (typeof body.tenantId === 'string' && body.tenantId.trim()) || companyRes.rows[0].m365_tenant_id
    if (!tenantId) {
      return NextResponse.json(
        { error: 'No tenantId provided and companies.m365_tenant_id is not set — complete the M365 onboarding first or pass tenantId explicitly' },
        { status: 400 },
      )
    }

    const config = await upsertExchangeTenantConfig({
      companyId: companyRes.rows[0].id,
      companySlug,
      tenantId,
      organizationDomain,
      enabled,
      enabledBy: typeof body.enabledBy === 'string' ? body.enabledBy : undefined,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
    })
    return NextResponse.json({ success: true, tenant: config })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
