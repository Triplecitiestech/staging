/**
 * POST /api/admin/companies/[id]/sync-contacts
 *
 * Sync Autotask contacts for ONE company. Faster than the global Pipeline
 * Status "Sync Contacts" job (which iterates every Autotask-linked company
 * and can exceed Vercel's 60s function ceiling). This per-company variant
 * is what the onboarding wizard uses in Step 1.
 *
 * Requires admin session auth.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { syncAutotaskContacts } from '@/lib/autotask-contact-sync'

export const dynamic = 'force-dynamic'
// One company's contacts should comfortably finish well under 30s even with
// hundreds of contacts (one Autotask call + N upserts).
export const maxDuration = 30

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const result = await syncAutotaskContacts({ companyId: id })
    return NextResponse.json({
      success: true,
      created: result.created,
      updated: result.updated,
      companiesProcessed: result.companiesProcessed,
      errors: result.errors.length > 0 ? result.errors : undefined,
      durationMs: result.durationMs,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[admin/companies/sync-contacts] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
