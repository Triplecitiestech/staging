/**
 * GET /api/compliance/[companyId]/recommended-frameworks
 *
 * Returns the list of compliance frameworks this customer should be assessed
 * against, derived from their Customer Profile (explicit picks + inferred
 * recommendations based on regulatory scope flags and industry).
 *
 * Read-only. The cockpit calls this when surfacing "frameworks to assess
 * this customer against".
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { recommendFrameworksForCompany } from '@/lib/compliance/framework-recommender'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { companyId } = await params
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }
  try {
    const recommendations = await recommendFrameworksForCompany(companyId)
    return NextResponse.json({
      success: true,
      data: recommendations,
      count: recommendations.length,
    })
  } catch (err) {
    console.error('[compliance/recommended-frameworks] error:', err)
    return NextResponse.json({ error: 'Failed to compute recommendations' }, { status: 500 })
  }
}
