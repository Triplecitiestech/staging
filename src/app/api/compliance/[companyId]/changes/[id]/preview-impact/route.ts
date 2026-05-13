/**
 * GET /api/compliance/[companyId]/changes/[id]/preview-impact
 *
 * Read-only impact preview / dry-run for a staged pending change.
 * Lists the exact users, devices, groups, etc. the action would
 * affect — surfaced in the cockpit before staff clicks /deploy.
 *
 * No side effects on the customer's tenant. Safe to call any number
 * of times. Returns the catalog metadata + the previewer's structured
 * affected-entity list, OR a clear "no live query" signal when a
 * real previewer hasn't been wired for that action yet.
 *
 * See src/lib/compliance/actions/previewers.ts and
 * docs/plans/CHANGE_MANAGEMENT_AND_REMEDIATION.md §11.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { getRemediationAction } from '@/lib/compliance/actions/catalog'
import { previewImpact, hasRealPreviewer } from '@/lib/compliance/actions/previewers'
import { loadPendingChange, withClient } from '@/lib/compliance/change-management'

export const dynamic = 'force-dynamic'

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
    const change = await withClient((client) => loadPendingChange(client, companyId, id))
    if (!change) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const action = getRemediationAction(change.actionId)
    if (!action) {
      return NextResponse.json(
        { error: `action ${change.actionId} no longer exists in catalog` },
        { status: 409 }
      )
    }

    const preview = await previewImpact({ companyId, action })

    return NextResponse.json({
      success: true,
      data: {
        change: {
          id: change.id,
          actionId: change.actionId,
          actionVersion: change.actionVersion,
          status: change.status,
        },
        action: {
          id: action.id,
          name: action.name,
          version: action.version,
          impact: action.impact,
          executorKind: action.executor.kind,
        },
        preview,
        hasRealPreviewer:
          action.executor.kind === 'automated'
            ? hasRealPreviewer(action.executor.handler)
            : false,
      },
    })
  } catch (err) {
    console.error('[compliance/changes/preview-impact] error:', err)
    return NextResponse.json({ error: 'Failed to run impact preview' }, { status: 500 })
  }
}
