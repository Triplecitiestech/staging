/**
 * GET /api/compliance/[companyId]/policies/[policyId]/download
 *
 * Stream a policy as a Word .docx so the operator can upload it
 * anywhere the automated publish can't reach (IT Glue / My Glue,
 * third-party platforms, customer SharePoint sites we don't have
 * access to, email attachments).
 *
 * Same renderer the SharePoint-publish executor uses — operator
 * sees the same document either way. No customer-approval gate
 * here: this just downloads to the operator's machine, the human
 * decides what to do with it next.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'
import { renderPolicyDocx } from '@/lib/compliance/policy-generation/docx-renderer'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ companyId: string; policyId: string }> }
): Promise<NextResponse | Response> {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { companyId, policyId } = await params

  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<{ title: string; content: string; companyName: string }>(
      `SELECT p.title, p.content, c."displayName" AS "companyName"
         FROM compliance_policies p
         JOIN companies c ON c.id = p."companyId"
        WHERE p.id = $1 AND p."companyId" = $2`,
      [policyId, companyId]
    )
    const row = res.rows[0]
    if (!row) return NextResponse.json({ error: 'Policy not found' }, { status: 404 })

    // Strip the gnarly control characters pdf-parse / mammoth sometimes
    // leave in extracted text (form feeds, NULs, vertical tabs). The
    // docx XML packer throws on those — when it does, the catch block
    // below returns JSON, and the browser saves the JSON response as
    // the "downloaded .docx". Sanitize at the source instead.
    const safeContent = (row.content ?? '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/g, ' ')
    if (safeContent.trim().length === 0) {
      return NextResponse.json(
        { error: 'Policy has no content to render. Re-import or re-extract the source document.' },
        { status: 422 }
      )
    }

    const buf = await renderPolicyDocx(safeContent, {
      policyTitle: row.title,
      companyName: row.companyName,
      effectiveDate: new Date().toISOString().slice(0, 10),
      reviewDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      version: '1.0',
      owner: 'Triple Cities Tech (managed)',
      approvedBy: session.user.email,
    })

    const safeFileName = `${row.title.replace(/[\/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Policy'}.docx`

    return new Response(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${safeFileName}"`,
        'Content-Length': String(buf.byteLength),
        // Don't let intermediaries cache a customer-specific document.
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    // Log the full stack so the next operator who sees "downloaded a
    // JSON instead of a .docx" can search Vercel logs for the cause.
    // The browser still shows the saved-as-JSON file but at least we
    // can diagnose from the server side now.
    console.error('[compliance/policies/download] render failed:', err)
    return NextResponse.json(
      { error: `Failed to render policy download: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
