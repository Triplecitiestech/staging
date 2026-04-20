import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { ensureSalesAgentTables } from '@/lib/sales-agents/ensure-tables'
import { checkCsrf } from '@/lib/security'

export const dynamic = 'force-dynamic'

const MAX_TEXT_LENGTH = 100_000 // generous — long-form legal text is fine, 100kb cap

function isAdmin(role: unknown): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN'
}

// Save or update the agreement text content for an agent. Replacing the
// text clears any prior e-signature — the agent must re-sign.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await ensureSalesAgentTables()

  const { id } = await params
  let body: { contentText?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const contentText = typeof body.contentText === 'string' ? body.contentText : ''
  if (!contentText.trim()) {
    return NextResponse.json({ error: 'Agreement text cannot be empty.' }, { status: 400 })
  }
  if (contentText.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: `Agreement text exceeds the ${MAX_TEXT_LENGTH} character limit.` }, { status: 400 })
  }

  const agent = await prisma.salesAgent.findUnique({ where: { id }, select: { id: true } })
  if (!agent) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 })

  const adminEmail = session.user?.email || 'unknown'

  // Check whether text actually changed — if unchanged, don't invalidate a signature
  const existing = await prisma.agentAgreement.findUnique({
    where: { agentId: id },
    select: { contentText: true, signedAt: true },
  })

  const textChanged = !existing || existing.contentText !== contentText

  await prisma.agentAgreement.upsert({
    where: { agentId: id },
    create: {
      agentId: id,
      contentText,
      uploadedByAdminEmail: adminEmail,
    },
    update: {
      contentText,
      // Replacing text invalidates any prior e-signature + any uploaded file.
      // Admin is explicitly swapping in a new text-based agreement.
      ...(textChanged ? {
        fileData: null,
        originalFilename: null,
        mimeType: null,
        fileSize: null,
        signedName: null,
        signedAt: null,
        signedIp: null,
        signedUserAgent: null,
      } : {}),
      uploadedByAdminEmail: adminEmail,
    },
  })

  return NextResponse.json({
    success: true,
    signatureInvalidated: textChanged && !!existing?.signedAt,
  })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await ensureSalesAgentTables()

  const { id } = await params
  await prisma.agentAgreement.deleteMany({ where: { agentId: id } })
  return NextResponse.json({ success: true })
}
