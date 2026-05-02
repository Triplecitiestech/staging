/**
 * GET  /api/compliance/customer-context?companyId=xxx — Load per-customer environment context
 * POST /api/compliance/customer-context — Save per-customer environment context
 *
 * Stores customer-specific environment details (remote access type, on-prem
 * servers, BYOD policy, custom apps, compliance scope) that affect which
 * controls are applicable during assessments. Previously these were stored
 * MSP-wide in compliance_msp_setup — now they're per-customer.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'

export const dynamic = 'force-dynamic'

export interface CustomerContextAnswer {
  questionId: string
  value: string
}

const CUSTOMER_ENV_QUESTIONS = [
  {
    id: 'remote_access',
    category: 'Customer Environment',
    question: 'How does this customer access corporate resources remotely?',
    options: [
      { value: 'cloud_only', label: 'Cloud-only — no VPN needed' },
      { value: 'vpn_required', label: 'VPN required for on-prem resources' },
      { value: 'hybrid', label: 'Hybrid — some cloud, some VPN' },
    ],
  },
  {
    id: 'on_prem_servers',
    category: 'Customer Environment',
    question: 'Does this customer have on-premises servers?',
    options: [
      { value: 'no_servers', label: 'No — fully cloud' },
      { value: 'yes_bcdr', label: 'Yes — with BCDR backup' },
      { value: 'yes_mixed', label: 'Yes — mixed backup' },
    ],
  },
  {
    id: 'custom_apps',
    category: 'Customer Environment',
    question: 'Does this customer develop custom software?',
    options: [
      { value: 'no', label: 'No — standard business software only' },
      { value: 'yes', label: 'Yes — custom development' },
    ],
  },
  {
    id: 'byod_policy',
    category: 'Customer Environment',
    question: 'What is this customer\'s BYOD policy?',
    options: [
      { value: 'company_owned', label: 'Company-owned devices only' },
      { value: 'byod_managed', label: 'BYOD allowed with MDM' },
      { value: 'byod_unmanaged', label: 'BYOD with no management' },
    ],
  },
  {
    id: 'scope_endpoints',
    category: 'Compliance Scope',
    question: 'What endpoints are in scope for compliance?',
    options: [
      { value: 'all_managed', label: 'All managed endpoints' },
      { value: 'workstations_only', label: 'Workstations only' },
      { value: 'workstations_servers', label: 'Workstations + servers' },
      { value: 'custom', label: 'Custom scope' },
    ],
  },
  {
    id: 'scope_users',
    category: 'Compliance Scope',
    question: 'Which user accounts are in scope?',
    options: [
      { value: 'all_licensed', label: 'All licensed M365 users' },
      { value: 'employees_only', label: 'Full-time employees only' },
      { value: 'all_including_shared', label: 'All including shared/service accounts' },
    ],
  },
  {
    id: 'scope_backup',
    category: 'Compliance Scope',
    question: 'What data is in scope for backup compliance?',
    options: [
      { value: 'servers_m365', label: 'Servers + M365 data' },
      { value: 'm365_only', label: 'M365 data only (cloud-only)' },
      { value: 'servers_only', label: 'Servers only' },
      { value: 'all_data', label: 'All data including endpoint backup' },
    ],
  },
  {
    id: 'scope_incident_response',
    category: 'Compliance Scope',
    question: 'Who handles incident response for this customer?',
    options: [
      { value: 'tct_handles', label: 'TCT handles all IR' },
      { value: 'shared', label: 'Shared responsibility' },
      { value: 'customer_internal', label: 'Customer has internal IR team' },
    ],
  },
]

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = request.nextUrl.searchParams.get('companyId')
  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  }

  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS compliance_customer_context (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "companyId" TEXT NOT NULL UNIQUE,
        answers JSONB NOT NULL DEFAULT '[]',
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedBy" TEXT
      )
    `)

    const res = await client.query<{ answers: CustomerContextAnswer[] }>(
      `SELECT answers FROM compliance_customer_context WHERE "companyId" = $1`,
      [companyId]
    )

    return NextResponse.json({
      success: true,
      data: {
        questions: CUSTOMER_ENV_QUESTIONS,
        answers: res.rows[0]?.answers ?? [],
      },
    })
  } catch (err) {
    console.error('[compliance/customer-context] GET error:', err)
    return NextResponse.json({ error: 'Failed to load customer context' }, { status: 500 })
  } finally {
    client.release()
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as { companyId?: string; answers?: CustomerContextAnswer[] }
    if (!body.companyId || !body.answers) {
      return NextResponse.json({ error: 'companyId and answers required' }, { status: 400 })
    }

    const pool = getPool()
    const client = await pool.connect()
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS compliance_customer_context (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "companyId" TEXT NOT NULL UNIQUE,
          answers JSONB NOT NULL DEFAULT '[]',
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedBy" TEXT
        )
      `)

      await client.query(
        `INSERT INTO compliance_customer_context ("companyId", answers, "updatedAt", "updatedBy")
         VALUES ($1, $2::jsonb, NOW(), $3)
         ON CONFLICT ("companyId")
         DO UPDATE SET answers = $2::jsonb, "updatedAt" = NOW(), "updatedBy" = $3`,
        [body.companyId, JSON.stringify(body.answers), session.user.email]
      )

      return NextResponse.json({ success: true })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[compliance/customer-context] POST error:', err)
    return NextResponse.json({ error: 'Failed to save customer context' }, { status: 500 })
  }
}
