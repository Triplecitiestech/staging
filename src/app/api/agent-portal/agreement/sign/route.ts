import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAgentApi } from '@/lib/agent-auth'
import { checkCsrf, checkRateLimit, logSecurityEvent } from '@/lib/security'

export const dynamic = 'force-dynamic'

// Accept the text agreement with a typed-name e-signature.
export async function POST(request: NextRequest) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf
  const rl = checkRateLimit(request)
  if (rl) return rl

  const agent = await requireAgentApi()
  if (agent instanceof NextResponse) return agent

  let body: { signedName?: string; accept?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const signedName = (body.signedName || '').trim()
  if (!signedName || signedName.length < 2) {
    return NextResponse.json({ error: 'Please type your full legal name.' }, { status: 400 })
  }
  if (signedName.length > 200) {
    return NextResponse.json({ error: 'Name is too long.' }, { status: 400 })
  }
  if (body.accept !== true) {
    return NextResponse.json({ error: 'You must check the acceptance box to sign.' }, { status: 400 })
  }

  const agreement = await prisma.agentAgreement.findUnique({
    where: { agentId: agent.id },
    select: { id: true, contentText: true, signedAt: true },
  })
  if (!agreement || !agreement.contentText) {
    return NextResponse.json({ error: 'No text agreement is pending signature.' }, { status: 404 })
  }
  if (agreement.signedAt) {
    return NextResponse.json({ error: 'This agreement has already been signed.' }, { status: 409 })
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null
  const userAgent = request.headers.get('user-agent') || null

  await prisma.agentAgreement.update({
    where: { id: agreement.id },
    data: {
      signedName,
      signedAt: new Date(),
      signedIp: ip,
      signedUserAgent: userAgent,
    },
  })

  logSecurityEvent('agent_agreement_signed', { agentId: agent.id, signedName }, 'low')

  return NextResponse.json({ success: true })
}
