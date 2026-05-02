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

  // === Access & Authorization (CMMC AC.1.2) ===
  {
    id: 'access_role_based',
    category: 'Access & Authorization',
    question: 'Is access to business applications restricted by role/job function, or do all users have equal access?',
    options: [
      { value: 'role_restricted', label: 'Role-based — restricted by job function' },
      { value: 'partial', label: 'Some apps role-restricted, others open' },
      { value: 'all_equal', label: 'All users have equal access' },
    ],
  },
  {
    id: 'restricted_apps',
    category: 'Access & Authorization',
    question: 'Which key business applications have role-restricted access? (free text — accounting, ERP, HR systems, etc.)',
    options: [
      { value: 'noted', label: 'Restricted apps noted in tech-support follow-up notes' },
      { value: 'none', label: 'None — all users have equal access to all apps' },
    ],
  },
  {
    id: 'standard_user_admin_rights',
    category: 'Access & Authorization',
    question: 'Do standard (non-IT) employees have local administrator privileges on their devices?',
    options: [
      { value: 'no', label: 'No — admin rights restricted to IT staff' },
      { value: 'mixed', label: 'Mixed — some users have local admin' },
      { value: 'yes', label: 'Yes — most users have local admin' },
    ],
  },

  // === Physical Security (CMMC PE.1, PE.2) ===
  {
    id: 'physical_access_control',
    category: 'Physical Security',
    question: 'Is physical access to your office, server room, and IT equipment restricted to authorized personnel?',
    options: [
      { value: 'restricted_locked', label: 'Yes — locked office + locked server room/cabinet' },
      { value: 'restricted_partial', label: 'Office locked, but network equipment in shared area' },
      { value: 'open', label: 'Open office — minimal physical restrictions' },
    ],
  },
  {
    id: 'physical_access_method',
    category: 'Physical Security',
    question: 'How is physical access controlled?',
    options: [
      { value: 'badge_keycard', label: 'Badge / keycard system' },
      { value: 'key_locks', label: 'Key locks (physical keys)' },
      { value: 'combination', label: 'Combination locks' },
      { value: 'mixed', label: 'Mixed — different methods for different areas' },
      { value: 'none', label: 'No formal access control' },
    ],
  },
  {
    id: 'visitor_escort',
    category: 'Physical Security',
    question: 'Are visitors escorted by an employee at all times?',
    options: [
      { value: 'always', label: 'Yes — visitors always escorted' },
      { value: 'restricted_areas', label: 'Escorted in restricted areas only' },
      { value: 'no', label: 'No formal escort policy' },
    ],
  },
  {
    id: 'visitor_log',
    category: 'Physical Security',
    question: 'Do you maintain a visitor log?',
    options: [
      { value: 'yes', label: 'Yes — visitor log maintained' },
      { value: 'no', label: 'No visitor log' },
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
