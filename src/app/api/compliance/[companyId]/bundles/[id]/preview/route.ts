/**
 * GET /api/compliance/[companyId]/bundles/[id]/preview
 *
 * Render the customer-facing Change Bundle report as HTML. Staff uses this
 * to review what the customer will see before clicking /send.
 *
 * Returns `text/html` directly so the staff can open the URL in a new tab
 * and preview / print to PDF / save. The same HTML is used as the email
 * body when /send actually delivers.
 *
 * See docs/plans/CHANGE_MANAGEMENT_AND_REMEDIATION.md §7.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { withClient } from '@/lib/compliance/change-management'
import { buildBundleReportData } from '@/lib/compliance/bundle-report/build-data'
import { renderBundleReportHtml } from '@/lib/compliance/bundle-report/html-template'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ companyId: string; id: string }> }
): Promise<NextResponse | Response> {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { companyId, id } = await params

  await ensureComplianceTables()
  try {
    const data = await withClient((client) =>
      buildBundleReportData(client, companyId, id, session.user!.email!)
    )
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const html = renderBundleReportHtml(data)
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (err) {
    console.error('[compliance/bundles/preview] error:', err)
    return NextResponse.json({ error: 'Failed to render preview' }, { status: 500 })
  }
}
