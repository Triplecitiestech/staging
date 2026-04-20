import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { generatePasswordToken, agentPortalUrl } from '@/lib/agent-auth'
import { sendWelcomeEmail } from '@/lib/agent-email'
import { ensureSalesAgentTables } from '@/lib/sales-agents/ensure-tables'
import { checkCsrf, isValidEmail, logSecurityEvent } from '@/lib/security'

export const dynamic = 'force-dynamic'

function isAdmin(role: unknown): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN'
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await ensureSalesAgentTables()

  const agents = await prisma.salesAgent.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      passwordHash: true, // selected only to compute hasSetPassword below
      _count: { select: { referrals: true } },
    },
  })

  return NextResponse.json({
    agents: agents.map(a => ({
      id: a.id,
      email: a.email,
      firstName: a.firstName,
      lastName: a.lastName,
      phone: a.phone,
      isActive: a.isActive,
      lastLoginAt: a.lastLoginAt,
      createdAt: a.createdAt,
      hasSetPassword: !!a.passwordHash,
      referralCount: a._count.referrals,
    })),
  })
}

export async function POST(request: NextRequest) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { firstName?: string; lastName?: string; email?: string; phone?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const firstName = (body.firstName || '').trim()
  const lastName = (body.lastName || '').trim()
  const email = (body.email || '').trim().toLowerCase()
  const phone = (body.phone || '').trim() || null

  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'First and last name are required.' }, { status: 400 })
  }
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 })
  }

  await ensureSalesAgentTables()

  const existing = await prisma.salesAgent.findUnique({ where: { email }, select: { id: true } })
  if (existing) {
    return NextResponse.json({ error: 'An agent with that email already exists.' }, { status: 409 })
  }

  const { token, expiresAt } = generatePasswordToken()
  const adminEmail = session.user?.email || null

  const agent = await prisma.salesAgent.create({
    data: {
      firstName,
      lastName,
      email,
      phone,
      passwordSetToken: token,
      passwordSetTokenExpires: expiresAt,
      createdByAdminEmail: adminEmail,
    },
    select: { id: true, email: true, firstName: true },
  })

  const setPasswordUrl = agentPortalUrl(`/agents/set-password?token=${token}`)
  const emailResult = await sendWelcomeEmail(agent.email, {
    agentName: agent.firstName,
    setPasswordUrl,
    expiresInHours: 48,
  })
  if (!emailResult.ok) {
    logSecurityEvent('agent_welcome_email_failed', { agentId: agent.id, error: emailResult.error }, 'high')
  }

  return NextResponse.json({
    success: true,
    agentId: agent.id,
    welcomeEmailSent: emailResult.ok,
    welcomeEmailError: emailResult.ok ? null : emailResult.error,
  })
}
