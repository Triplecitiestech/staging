/**
 * GET   /api/compliance/[companyId]/changes/[id] — read one pending change
 * PATCH /api/compliance/[companyId]/changes/[id] — edit text fields (drafted/bundled only)
 *
 * Lifecycle transitions live on sub-routes:
 *   POST /abandon, /communicate, /deploy, /rollback
 *
 * See docs/plans/CHANGE_MANAGEMENT_AND_REMEDIATION.md §6.1.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import {
  loadPendingChange,
  withClient,
  writeAudit,
} from '@/lib/compliance/change-management'

export const dynamic = 'force-dynamic'

interface PatchBody {
  customerImpactSummary?: string
  internalNotes?: string | null
  linkedFindingIds?: string[]
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ companyId: string; id: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { companyId, id } = await params

  await ensureComplianceTables()
  try {
    const row = await withClient((client) => loadPendingChange(client, companyId, id))
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true, data: row })
  } catch (err) {
    console.error('[compliance/changes/:id] GET error:', err)
    return NextResponse.json({ error: 'Failed to read pending change' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string; id: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { companyId, id } = await params

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  await ensureComplianceTables()
  try {
    const result = await withClient(async (client) => {
      const current = await loadPendingChange(client, companyId, id)
      if (!current) return { notFound: true as const }
      if (current.status !== 'drafted' && current.status !== 'bundled') {
        return { illegalState: true as const, status: current.status }
      }

      const nextImpact =
        body.customerImpactSummary !== undefined
          ? body.customerImpactSummary.trim()
          : current.customerImpactSummary
      if (!nextImpact) {
        return { illegalState: true as const, status: current.status, reason: 'customerImpactSummary must be non-empty' }
      }

      await client.query(
        `UPDATE compliance_pending_changes
         SET "customerImpactSummary" = $1,
             "internalNotes" = $2,
             "linkedFindingIds" = $3::jsonb,
             "updatedAt" = NOW()
         WHERE id = $4`,
        [
          nextImpact,
          body.internalNotes !== undefined ? body.internalNotes : current.internalNotes,
          JSON.stringify(body.linkedFindingIds ?? current.linkedFindingIds ?? []),
          id,
        ]
      )
      await writeAudit(client, {
        companyId,
        action: 'pending_change.updated',
        actor: session.user.email!,
        details: { id, fieldsChanged: Object.keys(body) },
      })
      return { ok: true as const }
    })

    if ('notFound' in result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if ('illegalState' in result) {
      return NextResponse.json(
        { error: result.reason ?? `cannot edit a pending change in status "${result.status}"` },
        { status: 409 }
      )
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[compliance/changes/:id] PATCH error:', err)
    return NextResponse.json({ error: 'Failed to update pending change' }, { status: 500 })
  }
}
