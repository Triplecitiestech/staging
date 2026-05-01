/**
 * GET /api/compliance?companyId=xxx — Compliance dashboard for a company
 * POST /api/compliance — Create a new assessment
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  getComplianceDashboard,
  createAssessment,
  detectConnectors,
} from '@/lib/compliance/engine'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import type { FrameworkId } from '@/lib/compliance/types'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = request.nextUrl.searchParams.get('companyId')
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  try {
    // Ensure tables exist once, then detect connectors
    await ensureComplianceTables()
    await detectConnectors(companyId)
    const dashboard = await getComplianceDashboard(companyId)
    return NextResponse.json({ success: true, data: dashboard })
  } catch (err) {
    console.error('[compliance] Dashboard error:', err)
    return NextResponse.json(
      { error: 'Failed to load compliance dashboard' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      companyId?: string
      frameworkId?: string
    }

    if (!body.companyId || !body.frameworkId) {
      return NextResponse.json(
        { error: 'companyId and frameworkId are required' },
        { status: 400 }
      )
    }

    const validFrameworks: FrameworkId[] = ['cis-v8', 'cis-v8-ig1', 'cis-v8-ig2', 'cis-v8-ig3', 'cmmc-l1']
    if (!validFrameworks.includes(body.frameworkId as FrameworkId)) {
      return NextResponse.json(
        { error: `Invalid frameworkId. Supported: ${validFrameworks.join(', ')}` },
        { status: 400 }
      )
    }

    const assessmentId = await createAssessment(
      body.companyId,
      body.frameworkId as FrameworkId,
      session.user.email
    )

    return NextResponse.json({ success: true, assessmentId })
  } catch (err) {
    console.error('[compliance] Create assessment error:', err)
    return NextResponse.json(
      { error: 'Failed to create assessment' },
      { status: 500 }
    )
  }
}
