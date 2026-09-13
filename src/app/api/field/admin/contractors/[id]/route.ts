// PATCH /api/field/admin/contractors/[id]  { active: boolean } — staff-only.
// Deactivating deletes the contractor's sessions immediately and closes any
// open code; reactivating restores login (they request a fresh code).

import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { apiError, apiOk, generateRequestId } from '@/lib/api-response'
import { checkCsrf } from '@/lib/security'
import { getContractorById, isMissingTableError, setContractorActive, writeAudit } from '@/lib/field/store'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const reqId = generateRequestId()
  const csrf = checkCsrf(request)
  if (csrf) return csrf
  const session = await auth()
  const actor = session?.user?.email
  if (!actor) return apiError('Unauthorized', reqId, 401)

  const { id } = await context.params
  if (!id || id.length > 64) return apiError('Invalid contractor id', reqId, 400)

  let body: { active?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    return apiError('Invalid request body', reqId, 400)
  }
  if (typeof body.active !== 'boolean') return apiError('`active` must be a boolean', reqId, 400)

  try {
    const existing = await getContractorById(id)
    if (!existing) return apiError('Contractor not found', reqId, 404)

    const updated = await setContractorActive(id, body.active)
    if (!updated) return apiError('Contractor not found', reqId, 404)

    await writeAudit({
      actorType: 'staff',
      actorId: actor,
      event: body.active ? 'contractor_reactivated' : 'contractor_deactivated',
      meta: { contractorId: id, email: updated.email, previouslyActive: existing.active },
    })

    return apiOk({ contractor: { id: updated.id, active: updated.active, deactivatedAt: updated.deactivatedAt?.toISOString() ?? null } }, reqId)
  } catch (err) {
    if (isMissingTableError(err)) return apiError('The field_* tables do not exist yet. POST /api/migrations/run first.', reqId, 503, 'not_configured')
    console.error('[field] admin update failed:', err instanceof Error ? err.message : String(err))
    return apiError('Failed to update contractor', reqId, 500)
  }
}
