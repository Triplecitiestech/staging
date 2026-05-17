/**
 * POST /api/compliance/[companyId]/policies/[policyId]/refetch-source
 *
 * Re-pull a policy's source bytes from SharePoint and re-extract its
 * text. Lets the operator refresh a policy that was edited in SharePoint
 * since the original import without having to delete + re-import the
 * whole thing. Also populates sourceBytes for policies that were imported
 * before the byte-preservation feature shipped (provided we have a
 * sourcePointer to chase).
 *
 * Body: { reanalyze?: boolean }
 *   - reanalyze=true (default false) triggers the AI analyzer too, in
 *     case the source has materially changed. Adds time to the response
 *     but keeps the analysis fresh.
 *
 * 422 when the policy has no sourcePointer (was imported pre-feature
 * via pasted text, generated via AI, or imported before this column
 * existed). Operator must delete + re-import to enable re-sync for
 * those legacy rows.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import {
  fetchSharePointFileText,
  fetchSharePointFileTextByUrl,
} from '@/lib/compliance/policy-generation/sharepoint-fetch'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface SourcePointer {
  driveId?: string
  itemId?: string
  webUrl?: string
  fileName?: string
  mimeType?: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string; policyId: string }> }
) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { companyId, policyId } = await params

  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<{
      id: string
      title: string
      sourcePointer: SourcePointer | null
    }>(
      `SELECT id, title, "sourcePointer"
         FROM compliance_policies
        WHERE id = $1 AND "companyId" = $2`,
      [policyId, companyId]
    )
    const row = res.rows[0]
    if (!row) return NextResponse.json({ error: 'Policy not found' }, { status: 404 })

    const ptr = row.sourcePointer
    if (!ptr || (!ptr.driveId && !ptr.webUrl)) {
      return NextResponse.json(
        {
          error:
            'No SharePoint source pointer is stored for this policy — likely a pasted / generated policy ' +
            'or one imported before source tracking was added. Delete and re-import via the SharePoint scan ' +
            'to enable Re-sync.',
        },
        { status: 422 }
      )
    }

    // Prefer by-id path (one Graph call). Fall back to URL when this is
    // a legacy URL-only pointer.
    let fetched
    try {
      if (ptr.driveId && ptr.itemId) {
        fetched = await fetchSharePointFileText(companyId, {
          driveId: ptr.driveId,
          itemId: ptr.itemId,
          fileName: ptr.fileName,
        })
      } else if (ptr.webUrl) {
        fetched = await fetchSharePointFileTextByUrl(companyId, ptr.webUrl)
      } else {
        // Type-narrowing safety; the early-return above should preclude this.
        return NextResponse.json({ error: 'Source pointer has no usable identifier.' }, { status: 422 })
      }
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to re-fetch from SharePoint: ${err instanceof Error ? err.message : String(err)}` },
        { status: 502 }
      )
    }

    // Refresh content + bytes + metadata. Update sourcePointer too so
    // the file name + mime type stay in sync with what we just pulled.
    const updatedPointer: SourcePointer = {
      ...ptr,
      fileName: fetched.fileName,
      mimeType: fetched.mimeType,
    }
    await client.query(
      `UPDATE compliance_policies
          SET content = $1,
              "sourceBytes" = $2,
              "sourceMimeType" = $3,
              "sourceFileName" = $4,
              "sourcePointer" = $5::jsonb,
              "updatedAt" = NOW()
        WHERE id = $6`,
      [
        fetched.text,
        fetched.bytes,
        fetched.mimeType,
        fetched.fileName,
        JSON.stringify(updatedPointer),
        policyId,
      ]
    )

    return NextResponse.json({
      success: true,
      fileName: fetched.fileName,
      byteSize: fetched.byteSize,
      textChars: fetched.text.length,
      truncated: fetched.truncated,
    })
  } catch (err) {
    console.error('[compliance/policies/refetch-source] error:', err)
    return NextResponse.json(
      { error: `Failed to re-sync from SharePoint: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
