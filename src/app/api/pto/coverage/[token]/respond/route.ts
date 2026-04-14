import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notifyCoverageResponse } from '@/lib/pto/service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/pto/coverage/[token]/respond
 * Body: { response: 'accepted' | 'declined', notes?: string }
 *
 * Public endpoint authorised by the unguessable coverage token. Records
 * the covering teammate's answer and notifies HR.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'Invalid coverage link' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const response = typeof body?.response === 'string' ? body.response.toLowerCase() : null
  if (response !== 'accepted' && response !== 'declined') {
    return NextResponse.json(
      { error: 'response must be "accepted" or "declined"' },
      { status: 400 }
    )
  }
  const notes = typeof body?.notes === 'string' ? body.notes.slice(0, 2000) : null

  try {
    const existing = await prisma.timeOffRequest.findFirst({
      where: { coverageToken: token },
      select: { id: true, coverageResponse: true, employeeName: true, coverageStaffName: true },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (existing.coverageResponse && existing.coverageResponse !== 'pending') {
      return NextResponse.json(
        { error: `This coverage request was already ${existing.coverageResponse}.` },
        { status: 409 }
      )
    }

    const updated = await prisma.timeOffRequest.update({
      where: { id: existing.id },
      data: {
        coverageResponse: response,
        coverageRespondedAt: new Date(),
        coverageResponseNotes: notes,
      },
    })
    await prisma.timeOffAuditLog.create({
      data: {
        requestId: existing.id,
        actorEmail: 'coverage-link',
        actorName: existing.coverageStaffName ?? null,
        action: response === 'accepted' ? 'coverage_accepted' : 'coverage_declined',
        details: { notes } as never,
      },
    })

    // Fire-and-forget HR notification
    notifyCoverageResponse(existing.id).catch((err) =>
      console.error('[pto] notifyCoverageResponse failed:', err)
    )

    return NextResponse.json({ ok: true, response, status: updated.status })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to record response' },
      { status: 500 }
    )
  }
}
