import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import { checkCsrf } from '@/lib/security'
import { ensureFormLinkColumns } from '@/lib/form-links'

const pool = getPool()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------------------------------------------------------------------------
// POST /api/forms/links/[token]/used — Mark a form link consumed
//
// Called by FormLinkPortal after a successful /api/hr/submit. Sets
// form_links.used_at (single-use enforcement) and form_links.request_id —
// the link between the tokenized link (and, for Thread links, the chat
// ticket in source_meta) and the hr_request whose processing creates the
// Autotask ticket. Token → request_id → hr_requests.autotask_ticket_id is
// the traceability chain for merging chat tickets with Autotask tickets.
//
// Body: { requestId } — must be an existing hr_request belonging to the
// same company as the link. Idempotent for the same requestId; a second
// submission attempting to consume an already-used link gets 409.
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  const csrfBlocked = checkCsrf(request)
  if (csrfBlocked) return csrfBlocked

  const { token } = await params
  if (!token) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 })
  }

  let body: { requestId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const requestId =
    typeof body.requestId === 'string' ? body.requestId.trim().toLowerCase() : ''
  if (!UUID_RE.test(requestId)) {
    return NextResponse.json({ error: 'requestId must be a valid request ID' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await ensureFormLinkColumns(client)

    const linkRes = await client.query<{
      id: string
      company_id: string
      used_at: string | null
      request_id: string | null
    }>(
      `SELECT id, company_id, used_at, request_id FROM form_links WHERE token = $1 LIMIT 1`,
      [token]
    )
    if (linkRes.rows.length === 0) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 })
    }
    const link = linkRes.rows[0]

    // The hr_request must exist and belong to the link's company — otherwise
    // anyone with the URL could burn tokens or attach foreign requests.
    const reqRes = await client.query<{ company_id: string }>(
      `SELECT company_id FROM hr_requests WHERE id = $1 LIMIT 1`,
      [requestId]
    )
    if (reqRes.rows.length === 0) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }
    if (reqRes.rows[0].company_id !== link.company_id) {
      return NextResponse.json({ error: 'Request does not belong to this link' }, { status: 403 })
    }

    if (link.used_at) {
      // Idempotent for the request that consumed it; conflict for any other.
      if (link.request_id === requestId) {
        return NextResponse.json({ success: true, alreadyMarked: true })
      }
      return NextResponse.json({ error: 'Link has already been used' }, { status: 409 })
    }

    const updateRes = await client.query(
      `UPDATE form_links SET used_at = NOW(), request_id = $2::uuid
       WHERE token = $1 AND used_at IS NULL`,
      [token, requestId]
    )

    if (updateRes.rowCount === 0) {
      // Raced with another consumer between the SELECT and the UPDATE.
      const recheck = await client.query<{ request_id: string | null }>(
        `SELECT request_id FROM form_links WHERE token = $1 LIMIT 1`,
        [token]
      )
      if (recheck.rows[0]?.request_id === requestId) {
        return NextResponse.json({ success: true, alreadyMarked: true })
      }
      return NextResponse.json({ error: 'Link has already been used' }, { status: 409 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[forms/links/used] Error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to mark link as used' }, { status: 500 })
  } finally {
    client.release()
  }
}
