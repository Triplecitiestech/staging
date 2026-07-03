import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { apiOk, apiError, generateRequestId } from '@/lib/api-response'
import { hasPermission } from '@/lib/permissions'
import { resolveStagedWrite } from '@/lib/connector/staged-writes'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/connector/staged-writes/[id]  { action: 'approve' | 'reject' }
 *
 * The HUMAN approval step of the connector's config-write gate. Requires a
 * staff session with the system_settings permission — the connector's MCP
 * OAuth token cannot reach this endpoint, which is what makes the gate
 * structural rather than a convention.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const reqId = generateRequestId()
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role) {
      return apiError('Unauthorized', reqId, 401)
    }
    if (!hasPermission(session.user.role, 'system_settings', session.user.permissionOverrides)) {
      return apiError('Forbidden: system_settings permission required to approve config writes', reqId, 403)
    }

    const { id } = await params
    const body = (await request.json().catch(() => ({}))) as { action?: string }
    if (body.action !== 'approve' && body.action !== 'reject') {
      return apiError("action must be 'approve' or 'reject'", reqId, 400)
    }

    const result = await resolveStagedWrite(id, body.action, session.user.email)
    return apiOk(result, reqId)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update staged write'
    return apiError(message, reqId, message.includes('not found') ? 404 : 400)
  }
}
