import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAgentApi } from '@/lib/agent-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const agent = await requireAgentApi()
  if (agent instanceof NextResponse) return agent
  const agreement = await prisma.agentAgreement.findUnique({
    where: { agentId: agent.id },
    select: { originalFilename: true, uploadedAt: true },
  })
  return NextResponse.json({
    agent: {
      id: agent.id,
      email: agent.email,
      firstName: agent.firstName,
      lastName: agent.lastName,
    },
    agreement,
  })
}
