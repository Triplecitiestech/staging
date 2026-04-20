import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { ensureSalesAgentTables } from '@/lib/sales-agents/ensure-tables'
import { checkCsrf } from '@/lib/security'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = new Set([
  'SUBMITTED', 'CONTACTED', 'PROPOSAL_SENT', 'SIGNED',
  'MONTH_1_PAID', 'MONTH_2_PAID', 'COMMISSION_DUE', 'COMMISSION_PAID',
  'LOST', 'NOT_A_FIT',
])

function isAdmin(role: unknown): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN'
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await ensureSalesAgentTables()

  const { id } = await params
  const referral = await prisma.salesReferral.findUnique({
    where: { id },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
      statusHistory: { orderBy: { changedAt: 'desc' } },
    },
  })
  if (!referral) return NextResponse.json({ error: 'Referral not found.' }, { status: 404 })

  return NextResponse.json({
    referral: {
      ...referral,
      contractMonthlyValue: referral.contractMonthlyValue ? referral.contractMonthlyValue.toString() : null,
    },
  })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await ensureSalesAgentTables()

  const { id } = await params
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const existing = await prisma.salesReferral.findUnique({
    where: { id },
    select: { id: true, status: true },
  })
  if (!existing) return NextResponse.json({ error: 'Referral not found.' }, { status: 404 })

  const data: Record<string, unknown> = {}
  let statusChanged: { from: string; to: string; note?: string } | null = null

  if (typeof body.status === 'string') {
    if (!VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ error: 'Invalid status value.' }, { status: 400 })
    }
    if (body.status !== existing.status) {
      data.status = body.status
      statusChanged = { from: existing.status, to: body.status, note: typeof body.statusNote === 'string' ? body.statusNote : undefined }
    }
  }
  if (typeof body.internalAdminNotes === 'string') {
    data.internalAdminNotes = body.internalAdminNotes.slice(0, 10000)
  }
  if (body.contractMonthlyValue !== undefined) {
    if (body.contractMonthlyValue === null || body.contractMonthlyValue === '') {
      data.contractMonthlyValue = null
    } else {
      const n = Number(body.contractMonthlyValue)
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: 'Contract monthly value must be a non-negative number.' }, { status: 400 })
      }
      data.contractMonthlyValue = n
    }
  }
  if (body.commissionDueDate !== undefined) {
    data.commissionDueDate = body.commissionDueDate ? new Date(body.commissionDueDate as string) : null
  }
  if (body.commissionPaidDate !== undefined) {
    data.commissionPaidDate = body.commissionPaidDate ? new Date(body.commissionPaidDate as string) : null
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 })
  }

  const adminEmail = session.user?.email || 'unknown'

  await prisma.$transaction(async tx => {
    await tx.salesReferral.update({ where: { id }, data })
    if (statusChanged) {
      await tx.salesReferralStatusHistory.create({
        data: {
          referralId: id,
          oldStatus: statusChanged.from as never,
          newStatus: statusChanged.to as never,
          changedByType: 'admin',
          changedByIdentifier: adminEmail,
          note: statusChanged.note || null,
        },
      })
    }
  })

  return NextResponse.json({ success: true })
}
