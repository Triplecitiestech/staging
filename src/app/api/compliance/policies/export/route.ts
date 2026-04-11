/**
 * GET /api/compliance/policies/export — Download a policy or bundle
 *
 * Query params:
 *   companyId  — required
 *   policySlug — single policy download
 *   bundle     — if "true", download all approved/draft policies as zip-like concatenation
 *   format     — 'html' | 'markdown' (default: html)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'
import { renderPolicyHtml } from '@/lib/compliance/policy-generation/export'
import { getCatalogItem } from '@/lib/compliance/policy-generation/catalog'
import type { PolicyDocumentMetadata } from '@/lib/compliance/policy-generation/types'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = request.nextUrl.searchParams.get('companyId')
  const policySlug = request.nextUrl.searchParams.get('policySlug')
  const isBundle = request.nextUrl.searchParams.get('bundle') === 'true'
  const format = request.nextUrl.searchParams.get('format') ?? 'html'

  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  if (!policySlug && !isBundle) {
    return NextResponse.json({ error: 'policySlug or bundle=true is required' }, { status: 400 })
  }

  const pool = getPool()
  const client = await pool.connect()

  try {
    // Get company name
    const companyRes = await client.query<{ displayName: string }>(
      `SELECT "displayName" FROM companies WHERE id = $1`, [companyId]
    )
    const companyName = companyRes.rows[0]?.displayName ?? 'Unknown'

    if (policySlug && !isBundle) {
      // Single policy download
      const policyRes = await client.query<{
        content: string; policySlug: string; version: number;
        generatedBy: string; generatedAt: string; approvedBy: string | null
      }>(
        `SELECT pv.content, pv."policySlug", pv.version, pv."generatedBy", pv."generatedAt", pv."approvedBy"
         FROM policy_versions pv
         WHERE pv."companyId" = $1 AND pv."policySlug" = $2
         ORDER BY pv.version DESC LIMIT 1`,
        [companyId, policySlug]
      )

      if (policyRes.rows.length === 0) {
        // Fallback: try compliance_policies table
        const fallback = await client.query<{ content: string; title: string }>(
          `SELECT cp.content, cp.title FROM policy_generation_records pgr
           JOIN compliance_policies cp ON cp.id = pgr."policyId"
           WHERE pgr."companyId" = $1 AND pgr."policySlug" = $2`,
          [companyId, policySlug]
        )
        if (fallback.rows.length === 0) {
          return NextResponse.json({ error: 'Policy not found' }, { status: 404 })
        }
        return servePolicy(fallback.rows[0].content, fallback.rows[0].title, companyName, format)
      }

      const row = policyRes.rows[0]
      const catalog = getCatalogItem(row.policySlug)
      const title = catalog?.name ?? row.policySlug

      return servePolicy(row.content, title, companyName, format, row.version, row.approvedBy)
    }

    // Bundle download — all generated policies
    const allPolicies = await client.query<{
      content: string; policySlug: string; version: number; approvedBy: string | null
    }>(
      `SELECT DISTINCT ON ("policySlug") pv.content, pv."policySlug", pv.version, pv."approvedBy"
       FROM policy_versions pv
       WHERE pv."companyId" = $1
       ORDER BY pv."policySlug", pv.version DESC`,
      [companyId]
    )

    if (allPolicies.rows.length === 0) {
      return NextResponse.json({ error: 'No policies found for this company' }, { status: 404 })
    }

    if (format === 'markdown') {
      // Concatenate all policies as Markdown
      const bundle = allPolicies.rows.map((row) => {
        const catalog = getCatalogItem(row.policySlug)
        const title = catalog?.name ?? row.policySlug
        return `---\n\n# ${title}\n\n${row.content}\n\n`
      }).join('\n\n---\n\n')

      return new NextResponse(bundle, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${slugify(companyName)}-policy-bundle.md"`,
        },
      })
    }

    // HTML bundle — single HTML document with all policies
    const sections = allPolicies.rows.map((row) => {
      const catalog = getCatalogItem(row.policySlug)
      const title = catalog?.name ?? row.policySlug
      const metadata: PolicyDocumentMetadata = {
        policyTitle: title,
        companyName,
        effectiveDate: new Date().toISOString().split('T')[0],
        reviewDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        version: `${row.version}.0`,
        owner: '',
        approvedBy: row.approvedBy ?? '',
      }
      return renderPolicyHtml(row.content, metadata)
    })

    // Wrap in a combined document
    const bundleHtml = `<!DOCTYPE html>
<html><head>
<title>${companyName} — Policy Bundle</title>
<style>
  .page-break { page-break-before: always; }
  body { margin: 0; padding: 0; }
  iframe { display: none; }
</style>
</head><body>
${sections.map((s, i) => i > 0 ? `<div class="page-break"></div>\n${s}` : s).join('\n')}
</body></html>`

    return new NextResponse(bundleHtml, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${slugify(companyName)}-policy-bundle.html"`,
      },
    })
  } catch (err) {
    console.error('[compliance/policies/export] GET error:', err)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  } finally {
    client.release()
  }
}

function servePolicy(
  content: string, title: string, companyName: string,
  format: string, version?: number, approvedBy?: string | null
): NextResponse {
  const metadata: PolicyDocumentMetadata = {
    policyTitle: title,
    companyName,
    effectiveDate: new Date().toISOString().split('T')[0],
    reviewDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    version: version ? `${version}.0` : '1.0',
    owner: '',
    approvedBy: approvedBy ?? '',
  }

  const filename = `${slugify(companyName)}-${slugify(title)}`

  if (format === 'markdown') {
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.md"`,
      },
    })
  }

  // HTML with print-ready styling
  const html = renderPolicyHtml(content, metadata)
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.html"`,
    },
  })
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
