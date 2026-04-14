import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/pto/coverage/[token]
 *
 * Public endpoint (auth is the unguessable token). Returns the coverage
 * request details so the teammate can review before accepting or declining.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'Invalid coverage link' }, { status: 400 })
  }

  try {
    const req = await prisma.timeOffRequest.findFirst({
      where: { coverageToken: token },
      select: {
        id: true,
        employeeName: true,
        employeeEmail: true,
        kind: true,
        startDate: true,
        endDate: true,
        totalHours: true,
        notes: true,
        status: true,
        coverageStaffName: true,
        coverageStaffEmail: true,
        coverageResponse: true,
        coverageRespondedAt: true,
        coverageResponseNotes: true,
      },
    })
    if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
      id: req.id,
      employeeName: req.employeeName,
      employeeEmail: req.employeeEmail,
      kind: req.kind,
      startDate: toYmd(req.startDate),
      endDate: toYmd(req.endDate),
      totalHours: Number(req.totalHours),
      notes: req.notes,
      status: req.status,
      coverageStaffName: req.coverageStaffName,
      coverageStaffEmail: req.coverageStaffEmail,
      coverageResponse: req.coverageResponse,
      coverageRespondedAt: req.coverageRespondedAt?.toISOString() ?? null,
      coverageResponseNotes: req.coverageResponseNotes,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lookup failed' },
      { status: 500 }
    )
  }
}

function toYmd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
