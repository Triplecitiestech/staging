import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAgentApi } from '@/lib/agent-auth'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const agent = await requireAgentApi()
  if (agent instanceof NextResponse) return agent

  const { id } = await params

  // CRITICAL: enforce ownership at the query level — agent_id MUST match the
  // current session, not just the UI hiding other rows.
  const referral = await prisma.salesReferral.findFirst({
    where: { id, agentId: agent.id },
    include: {
      statusHistory: {
        orderBy: { changedAt: 'desc' },
        select: { id: true, oldStatus: true, newStatus: true, changedAt: true, note: true, changedByType: true },
      },
    },
  })

  if (!referral) return NextResponse.json({ error: 'Referral not found.' }, { status: 404 })

  // Strip internal admin notes — agents must never see them.
  const { internalAdminNotes: _hidden, ...safe } = referral
  void _hidden
  return NextResponse.json({ referral: safe })
}
