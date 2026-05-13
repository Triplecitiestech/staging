/**
 * POST /api/migrations/customer-profile-backfill
 *
 * One-time migration that copies Customer Profile answers from the two legacy
 * stores into the canonical form_responses table:
 *
 *   policy_org_profiles.answers (JSONB)              ─┐
 *                                                     ├─→ form_responses
 *                                                     │   (company_id,
 *   compliance_customer_context.answers (JSONB array) ─┘    schema_type='customer_profile')
 *
 * Idempotent — a customer whose form_responses row already has non-empty
 * data is skipped. Safe to re-run.
 *
 * Auth: same checkSecretAuth() shared by /api/migrations/* (Authorization
 * Bearer preferred; ?secret= legacy fallback).
 *
 * Implements W4 of docs/plans/COMPLIANCE_WORKFLOW_REDESIGN.md.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkSecretAuth } from '@/lib/api-auth'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { backfillAllCustomerProfiles } from '@/lib/compliance/customer-profile-schema'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function runBackfill(request: NextRequest): Promise<NextResponse> {
  const denied = checkSecretAuth(request)
  if (denied) return denied

  await ensureComplianceTables()
  const summary = await backfillAllCustomerProfiles('migration:customer-profile-backfill')

  return NextResponse.json({
    success: true,
    ...summary,
    // Trim the per-company results to keep the response readable.
    results: summary.results.slice(0, 50),
    resultsTruncated: summary.results.length > 50,
  })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return runBackfill(request)
}

// GET supported for parity with the rest of /api/migrations/*. POST is
// preferred since a backfill mutates DB state.
export async function GET(request: NextRequest): Promise<NextResponse> {
  return runBackfill(request)
}
