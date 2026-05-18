/**
 * GET /api/compliance/[companyId]/policies/[policyId]/download
 *
 * Stream a policy as a Word .docx so the operator can upload it
 * anywhere the automated publish can't reach (IT Glue / My Glue,
 * third-party platforms, customer SharePoint sites we don't have
 * access to, email attachments).
 *
 * The route never returns JSON in the success OR error paths — the
 * browser saves the response under whatever filename the <a download>
 * link suggests, so a JSON error envelope becomes a "downloaded JSON"
 * file. On render failure we fall back to a plain-text `.txt` so the
 * operator at least gets the extracted policy text plus a note about
 * why the .docx couldn't be produced.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'
import { renderPolicyDocx } from '@/lib/compliance/policy-generation/docx-renderer'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function downloadName(title: string, ext: string): string {
  const safeTitle = title
    .replace(/[\/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Policy'
  return `${safeTitle}.${ext}`
}

/**
 * HTTP headers are ByteString (0-255). Policy titles can contain em
 * dashes / smart quotes / accented characters from customer source
 * documents — those crash Response creation. Returns a Content-Disposition
 * value with an ASCII fallback (`filename=`) and a UTF-8 RFC 5987
 * encoding (`filename*=`) so well-behaved browsers still see the pretty
 * name while older clients fall back to ASCII.
 */
function contentDisposition(title: string, ext: string): string {
  const pretty = downloadName(title, ext)
  const ascii = pretty
    .replace(/[‐-―]/g, '-')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[^\x20-\x7e]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(pretty)}`
}

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
    const res = await client.query<{
      title: string
      content: string
      companyName: string
      sourceBytes: Buffer | null
      sourceMimeType: string | null
      sourceFileName: string | null
    }>(
      `SELECT p.title, p.content, c."displayName" AS "companyName",
              p."sourceBytes", p."sourceMimeType", p."sourceFileName"
         FROM compliance_policies p
         JOIN companies c ON c.id = p."companyId"
        WHERE p.id = $1 AND p."companyId" = $2`,
      [policyId, companyId]
    )
    const row = res.rows[0]
    if (!row) return NextResponse.json({ error: 'Policy not found' }, { status: 404 })

    // Preferred path: the policy was imported from SharePoint and we
    // saved the original bytes. Serve those directly — byte-perfect
    // copy of the customer's source document, preserving heading
    // styles, lists, tables, branding, everything mammoth/pdf-parse
    // discarded. No re-render step, no formatting loss.
    if (row.sourceBytes && row.sourceBytes.length > 0) {
      const mime = row.sourceMimeType ?? 'application/octet-stream'
      // Derive an extension from the original file name when available
      // so the download keeps the right shape (.docx / .pdf / .txt).
      // Falls back to MIME sniffing, then to 'docx' as a final default
      // since the operator's Download button suggests Word format.
      const origExt = (row.sourceFileName ?? '').match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
      const ext = origExt
        ?? (mime.includes('wordprocessingml') ? 'docx'
          : mime.includes('pdf') ? 'pdf'
          : mime.startsWith('text/') ? 'txt'
          : 'docx')
      return new Response(new Uint8Array(row.sourceBytes.buffer, row.sourceBytes.byteOffset, row.sourceBytes.byteLength) as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Content-Disposition': contentDisposition(row.title, ext),
          'Content-Length': String(row.sourceBytes.byteLength),
          'Cache-Control': 'no-store',
        },
      })
    }

    // Strip the gnarly control characters pdf-parse / mammoth sometimes
    // leave in extracted text (form feeds, NULs, vertical tabs). The
    // docx XML packer rejects those even when wrapped in TextRun. Keep
    // \t (U+0009), \n (U+000A), \r (U+000D); drop everything else below
    // U+0020 plus DEL (U+007F) and the replacement char (U+FFFD).
    const safeContent = (row.content ?? '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/g, ' ')

    if (safeContent.trim().length === 0) {
      // No content at all — return an empty .txt with a one-line
      // explanation rather than a JSON error envelope so the browser's
      // <a download> still gets a real file.
      return new Response(
        'This policy has no content to render. Re-import or re-extract the source document.',
        {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': contentDisposition(row.title, 'txt'),
            'Cache-Control': 'no-store',
          },
        }
      )
    }

    try {
      const buf = await renderPolicyDocx(safeContent, {
        policyTitle: row.title,
        companyName: row.companyName,
        effectiveDate: new Date().toISOString().slice(0, 10),
        reviewDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        version: '1.0',
        owner: 'Triple Cities Tech (managed)',
        approvedBy: session.user.email,
      })

      return new Response(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': contentDisposition(row.title, 'docx'),
          'Content-Length': String(buf.byteLength),
          // Don't let intermediaries cache a customer-specific document.
          'Cache-Control': 'no-store',
        },
      })
    } catch (renderErr) {
      // Fall back to plain text. The operator still gets the policy
      // content + a note about why the .docx couldn't be built, instead
      // of a "downloaded JSON" file named like a Word doc.
      console.error('[compliance/policies/download] docx render failed, falling back to .txt:', renderErr)
      const message = renderErr instanceof Error ? renderErr.message : String(renderErr)
      const fallbackBody =
        `${row.title}\n${row.companyName}\n\n` +
        `(.docx render failed: ${message})\n` +
        `(The .docx packer could not handle this content. The raw extracted text is below — copy into Word manually.)\n\n` +
        `---\n\n${safeContent}`
      return new Response(fallbackBody, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': contentDisposition(row.title, 'txt'),
          'Cache-Control': 'no-store',
        },
      })
    }
  } catch (err) {
    // Genuine server error before content fetch (DB issue, auth issue).
    // Returning JSON here is correct — the browser's download dialog
    // hasn't been promised a specific file type yet.
    console.error('[compliance/policies/download] error:', err)
    return NextResponse.json(
      { error: `Failed to load policy: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
