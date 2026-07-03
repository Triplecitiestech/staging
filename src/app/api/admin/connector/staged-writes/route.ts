import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { apiOk, apiError, generateRequestId } from '@/lib/api-response'
import { listStagedWrites } from '@/lib/connector/staged-writes'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/connector/staged-writes
 *
 * Staff view of the connector's staged config writes (the human half of the
 * MCP write gate). Approve/reject happens via POST on the [id] route.
 */
export async function GET(request: NextRequest) {
  const reqId = generateRequestId()
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return apiError('Unauthorized', reqId, 401)
    }
    const status = new URL(request.url).searchParams.get('status') ?? undefined
    const writes = await listStagedWrites(status || undefined)
    return apiOk({ writes }, reqId)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load staged writes'
    return apiError(message, reqId, 500)
  }
}
