/**
 * GET /api/compliance/connectors?companyId=xxx — List connector states
 * POST /api/compliance/connectors — Detect/refresh connectors for a company
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getConnectors, detectConnectors } from '@/lib/compliance/engine'

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
    const connectors = await getConnectors(companyId)
    return NextResponse.json({ success: true, data: connectors })
  } catch (err) {
    console.error('[compliance] Get connectors error:', err)
    return NextResponse.json(
      { error: 'Failed to load connectors' },
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
    const body = (await request.json()) as { companyId?: string }
    if (!body.companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
    }

    const connectors = await detectConnectors(body.companyId)
    return NextResponse.json({ success: true, data: connectors })
  } catch (err) {
    console.error('[compliance] Detect connectors error:', err)
    return NextResponse.json(
      { error: 'Failed to detect connectors' },
      { status: 500 }
    )
  }
}
