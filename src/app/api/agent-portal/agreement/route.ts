import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAgentApi } from '@/lib/agent-auth'

export const dynamic = 'force-dynamic'

// Streams the current agent's own agreement file. Other agents (and
// unauthenticated users) cannot reach this endpoint.
export async function GET() {
  const agent = await requireAgentApi()
  if (agent instanceof NextResponse) return agent

  const agreement = await prisma.agentAgreement.findUnique({
    where: { agentId: agent.id },
    select: { fileData: true, originalFilename: true, mimeType: true, fileSize: true },
  })

  if (!agreement) {
    return NextResponse.json({ error: 'No agreement on file. Contact sales@triplecitiestech.com.' }, { status: 404 })
  }

  // Use ASCII-only fallback in Content-Disposition header to avoid encoding issues.
  const safeName = agreement.originalFilename.replace(/[^\x20-\x7e]/g, '_')
  const body = new Uint8Array(agreement.fileData)
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': agreement.mimeType,
      'Content-Length': String(agreement.fileSize),
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
