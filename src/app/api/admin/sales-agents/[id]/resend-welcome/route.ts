import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { generatePasswordToken, agentPortalUrl } from '@/lib/agent-auth'
import { sendWelcomeEmail } from '@/lib/agent-email'
import { checkCsrf } from '@/lib/security'

export const dynamic = 'force-dynamic'

function isAdmin(role: unknown): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN'
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const agent = await prisma.salesAgent.findUnique({
    where: { id },
    select: { id: true, email: true, firstName: true, isActive: true },
  })
  if (!agent) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 })
  if (!agent.isActive) return NextResponse.json({ error: 'Agent is deactivated.' }, { status: 400 })

  const { token, expiresAt } = generatePasswordToken()
  await prisma.salesAgent.update({
    where: { id: agent.id },
    data: {
      passwordSetToken: token,
      passwordSetTokenExpires: expiresAt,
      // Force a fresh password set — invalidates any prior password if the
      // admin is intentionally re-onboarding the agent.
      passwordHash: null,
    },
  })

  const setPasswordUrl = agentPortalUrl(`/agents/set-password?token=${token}`)
  const result = await sendWelcomeEmail(agent.email, {
    agentName: agent.firstName,
    setPasswordUrl,
    expiresInHours: 48,
  })

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 502 })
  }

  return NextResponse.json({ success: true })
}
