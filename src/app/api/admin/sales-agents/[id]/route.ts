import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { checkCsrf } from '@/lib/security'

export const dynamic = 'force-dynamic'

function isAdmin(role: unknown): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN'
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const agent = await prisma.salesAgent.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      createdByAdminEmail: true,
      passwordHash: true,
      passwordSetTokenExpires: true,
    },
  })
  if (!agent) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 })

  const agreement = await prisma.agentAgreement.findUnique({
    where: { agentId: id },
    select: { id: true, originalFilename: true, mimeType: true, fileSize: true, uploadedAt: true, uploadedByAdminEmail: true },
  })

  const referrals = await prisma.salesReferral.findMany({
    where: { agentId: id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, businessName: true, contactName: true, status: true, createdAt: true, updatedAt: true },
  })

  return NextResponse.json({
    agent: {
      id: agent.id,
      email: agent.email,
      firstName: agent.firstName,
      lastName: agent.lastName,
      phone: agent.phone,
      isActive: agent.isActive,
      lastLoginAt: agent.lastLoginAt,
      createdAt: agent.createdAt,
      createdByAdminEmail: agent.createdByAdminEmail,
      hasSetPassword: !!agent.passwordHash,
      pendingTokenExpires: agent.passwordHash ? null : agent.passwordSetTokenExpires,
    },
    agreement,
    referrals,
  })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  let body: { isActive?: boolean; phone?: string; firstName?: string; lastName?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive
  if (typeof body.phone === 'string') data.phone = body.phone.trim() || null
  if (typeof body.firstName === 'string' && body.firstName.trim()) data.firstName = body.firstName.trim()
  if (typeof body.lastName === 'string' && body.lastName.trim()) data.lastName = body.lastName.trim()

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 })
  }

  const updated = await prisma.salesAgent.update({
    where: { id },
    data,
    select: { id: true, isActive: true },
  })

  return NextResponse.json({ success: true, agent: updated })
}
