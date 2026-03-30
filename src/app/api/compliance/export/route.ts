/**
 * GET /api/compliance/export?assessmentId=xxx — Export assessment as CSV
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { exportAssessmentCsv, getAssessment } from '@/lib/compliance/engine'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const assessmentId = request.nextUrl.searchParams.get('assessmentId')
  if (!assessmentId) {
    return NextResponse.json({ error: 'assessmentId is required' }, { status: 400 })
  }

  try {
    const assessment = await getAssessment(assessmentId)
    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
    }

    const csv = await exportAssessmentCsv(assessmentId)

    const filename = `compliance-${assessment.frameworkId}-${new Date().toISOString().split('T')[0]}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('[compliance] Export error:', err)
    return NextResponse.json(
      { error: 'Failed to export assessment' },
      { status: 500 }
    )
  }
}
