import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, validatePasswordStrength } from '@/lib/agent-auth'
import { createAgentSession, setAgentSessionCookie } from '@/lib/agent-session'
import { ensureSalesAgentTables } from '@/lib/sales-agents/ensure-tables'
import { checkCsrf, checkRateLimit, logSecurityEvent } from '@/lib/security'

export const dynamic = 'force-dynamic'

// Validate a token without consuming it (used to gate the set-password page).
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ valid: false, error: 'Missing token.' }, { status: 400 })

  await ensureSalesAgentTables()

  const agent = await prisma.salesAgent.findUnique({
    where: { passwordSetToken: token },
    select: { id: true, email: true, firstName: true, passwordSetTokenExpires: true, isActive: true },
  })
  if (!agent || !agent.passwordSetTokenExpires || agent.passwordSetTokenExpires.getTime() < Date.now()) {
    return NextResponse.json({ valid: false, error: 'This link has expired or is invalid.' }, { status: 400 })
  }
  if (!agent.isActive) {
    return NextResponse.json({ valid: false, error: 'Account is deactivated.' }, { status: 403 })
  }
  return NextResponse.json({ valid: true, email: agent.email, firstName: agent.firstName })
}

export async function POST(request: NextRequest) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf
  const rl = checkRateLimit(request, { strict: true })
  if (rl) return rl

  let body: { token?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  const token = body.token || ''
  const password = body.password || ''

  if (!token) return NextResponse.json({ error: 'Token is required.' }, { status: 400 })
  const pwError = validatePasswordStrength(password)
  if (pwError) return NextResponse.json({ error: pwError }, { status: 400 })

  await ensureSalesAgentTables()

  const agent = await prisma.salesAgent.findUnique({
    where: { passwordSetToken: token },
    select: { id: true, passwordSetTokenExpires: true, isActive: true },
  })
  if (!agent || !agent.passwordSetTokenExpires || agent.passwordSetTokenExpires.getTime() < Date.now()) {
    logSecurityEvent('agent_set_password_invalid_token', {}, 'medium')
    return NextResponse.json({ error: 'This link has expired or is invalid.' }, { status: 400 })
  }
  if (!agent.isActive) {
    return NextResponse.json({ error: 'Account is deactivated.' }, { status: 403 })
  }

  const hash = await hashPassword(password)
  await prisma.salesAgent.update({
    where: { id: agent.id },
    data: {
      passwordHash: hash,
      passwordSetToken: null,
      passwordSetTokenExpires: null,
      lastLoginAt: new Date(),
    },
  })

  // Auto sign-in after setting password
  const sessionToken = createAgentSession(agent.id)
  await setAgentSessionCookie(sessionToken)

  // Send the agent to their agreement first if one is waiting for signature.
  const agreement = await prisma.agentAgreement.findUnique({
    where: { agentId: agent.id },
    select: { contentText: true, signedAt: true },
  })
  const needsToSign = !!(agreement?.contentText && !agreement.signedAt)

  return NextResponse.json({
    success: true,
    redirectTo: needsToSign ? '/agents/agreement' : '/agents/dashboard',
  })
}
