import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { ensureSalesAgentTables } from '@/lib/sales-agents/ensure-tables'
import { checkCsrf } from '@/lib/security'

export const dynamic = 'force-dynamic'
// Allow up to 60s for large file uploads (default 30s might be tight for big PDFs).
export const maxDuration = 60

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

function isAdmin(role: unknown): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN'
}

// Download — staff fetch the agent's agreement.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await ensureSalesAgentTables()

  const { id } = await params
  const agreement = await prisma.agentAgreement.findUnique({
    where: { agentId: id },
    select: { fileData: true, originalFilename: true, mimeType: true, fileSize: true },
  })
  if (!agreement || !agreement.fileData || !agreement.originalFilename || !agreement.mimeType) {
    return NextResponse.json({ error: 'No uploaded agreement file on record.' }, { status: 404 })
  }

  const safeName = agreement.originalFilename.replace(/[^\x20-\x7e]/g, '_')
  const body = new Uint8Array(agreement.fileData)
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': agreement.mimeType,
      'Content-Length': String(agreement.fileSize ?? body.byteLength),
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

// Upload / replace agreement.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await ensureSalesAgentTables()

  const { id } = await params
  const agent = await prisma.salesAgent.findUnique({ where: { id }, select: { id: true } })
  if (!agent) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart upload.' }, { status: 400 })
  }
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Uploaded file is empty.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds the 10 MB limit.' }, { status: 413 })
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'Only PDF and Word documents are allowed.' }, { status: 415 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const adminEmail = session.user?.email || 'unknown'

  await prisma.agentAgreement.upsert({
    where: { agentId: id },
    create: {
      agentId: id,
      fileData: buffer,
      originalFilename: file.name.slice(0, 250),
      mimeType: file.type,
      fileSize: file.size,
      uploadedByAdminEmail: adminEmail,
    },
    update: {
      fileData: buffer,
      originalFilename: file.name.slice(0, 250),
      mimeType: file.type,
      fileSize: file.size,
      uploadedByAdminEmail: adminEmail,
      uploadedAt: new Date(),
    },
  })

  return NextResponse.json({ success: true })
}
