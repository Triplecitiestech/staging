import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { ensureSalesAgentTables } from '@/lib/sales-agents/ensure-tables'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

function isAdmin(role: unknown): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN'
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await ensureSalesAgentTables()

  const sp = request.nextUrl.searchParams
  const agentId = sp.get('agentId') || undefined
  const status = sp.get('status') || undefined
  const fromStr = sp.get('from')
  const toStr = sp.get('to')

  const where: Prisma.SalesReferralWhereInput = {}
  if (agentId) where.agentId = agentId
  if (status) where.status = status as Prisma.SalesReferralWhereInput['status']
  if (fromStr || toStr) {
    where.createdAt = {}
    if (fromStr) (where.createdAt as { gte?: Date }).gte = new Date(fromStr)
    if (toStr) (where.createdAt as { lte?: Date }).lte = new Date(toStr)
  }

  const referrals = await prisma.salesReferral.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      businessName: true,
      contactName: true,
      contactEmail: true,
      status: true,
      contractMonthlyValue: true,
      createdAt: true,
      updatedAt: true,
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  })

  return NextResponse.json({
    referrals: referrals.map(r => ({
      ...r,
      contractMonthlyValue: r.contractMonthlyValue ? r.contractMonthlyValue.toString() : null,
    })),
  })
}
