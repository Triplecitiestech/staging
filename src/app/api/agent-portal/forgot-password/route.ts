import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generatePasswordToken, agentPortalUrl } from '@/lib/agent-auth'
import { sendResetEmail } from '@/lib/agent-email'
import { ensureSalesAgentTables } from '@/lib/sales-agents/ensure-tables'
import { checkCsrf, checkRateLimit, logSecurityEvent } from '@/lib/security'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf
  const rl = checkRateLimit(request, { strict: true })
  if (rl) return rl

  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  const email = (body.email || '').trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'Email is required.' }, { status: 400 })

  await ensureSalesAgentTables()

  // Always respond identically — never confirm whether the email exists.
  const agent = await prisma.salesAgent.findUnique({
    where: { email },
    select: { id: true, firstName: true, isActive: true },
  })

  if (agent && agent.isActive) {
    const { token, expiresAt } = generatePasswordToken()
    await prisma.salesAgent.update({
      where: { id: agent.id },
      data: { passwordSetToken: token, passwordSetTokenExpires: expiresAt },
    })
    const resetUrl = agentPortalUrl(`/agents/set-password?token=${token}`)
    const result = await sendResetEmail(email, {
      agentName: agent.firstName,
      resetUrl,
      expiresInHours: 48,
    })
    if (!result.ok) {
      logSecurityEvent('agent_reset_email_failed', { email, error: result.error }, 'high')
    }
  } else {
    logSecurityEvent('agent_reset_unknown_email', { email }, 'low')
  }

  return NextResponse.json({
    success: true,
    message: 'If an account exists for that email, a reset link has been sent.',
  })
}
