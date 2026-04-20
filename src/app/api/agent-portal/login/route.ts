import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPassword } from '@/lib/agent-auth'
import { createAgentSession, setAgentSessionCookie } from '@/lib/agent-session'
import { checkCsrf, checkRateLimit, logSecurityEvent } from '@/lib/security'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf
  const rl = checkRateLimit(request, { strict: true })
  if (rl) return rl

  let body: { email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const email = (body.email || '').trim().toLowerCase()
  const password = body.password || ''

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }

  // Always look up + run a hash compare to keep response time uniform whether
  // the email exists or not — avoids leaking which addresses are registered.
  const agent = await prisma.salesAgent.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, isActive: true },
  })

  const dummyHash = '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali'
  const hash = agent?.passwordHash || dummyHash
  const ok = await verifyPassword(password, hash)

  if (!agent || !agent.passwordHash || !ok) {
    logSecurityEvent('agent_login_failed', { email }, 'medium')
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  }
  if (!agent.isActive) {
    logSecurityEvent('agent_login_inactive', { email, agentId: agent.id }, 'medium')
    return NextResponse.json({ error: 'This account has been deactivated. Contact sales@triplecitiestech.com.' }, { status: 403 })
  }

  const token = createAgentSession(agent.id)
  await setAgentSessionCookie(token)
  await prisma.salesAgent.update({
    where: { id: agent.id },
    data: { lastLoginAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
