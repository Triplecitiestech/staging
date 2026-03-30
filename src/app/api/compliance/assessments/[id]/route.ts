/**
 * GET  /api/compliance/assessments/[id] — Get assessment details + findings
 * POST /api/compliance/assessments/[id] — Run assessment (collect + evaluate)
 * PATCH /api/compliance/assessments/[id] — Override a finding
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  getAssessmentSummary,
  runAssessment,
  overrideFinding,
  getEvidence,
} from '@/lib/compliance/engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Evidence collection can take time

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const summary = await getAssessmentSummary(id)
    if (!summary) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
    }

    const includeEvidence = request.nextUrl.searchParams.get('evidence') === 'true'
    let evidence = null
    if (includeEvidence) {
      evidence = await getEvidence(id)
    }

    return NextResponse.json({ success: true, data: { ...summary, evidence } })
  } catch (err) {
    console.error('[compliance] Get assessment error:', err)
    return NextResponse.json(
      { error: 'Failed to load assessment' },
      { status: 500 }
    )
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const result = await runAssessment(id, session.user.email)
    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    console.error('[compliance] Run assessment error:', err)
    return NextResponse.json(
      { error: `Assessment failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // id here is the finding ID
  const { id } = await params

  try {
    const body = (await request.json()) as {
      findingId?: string
      overrideStatus?: string
      overrideReason?: string
    }

    const findingId = body.findingId ?? id
    if (!body.overrideStatus || !body.overrideReason) {
      return NextResponse.json(
        { error: 'overrideStatus and overrideReason are required' },
        { status: 400 }
      )
    }

    await overrideFinding(findingId, body.overrideStatus, body.overrideReason, session.user.email)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[compliance] Override finding error:', err)
    return NextResponse.json(
      { error: 'Failed to override finding' },
      { status: 500 }
    )
  }
}
