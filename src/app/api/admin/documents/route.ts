import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { checkCsrf } from '@/lib/security'
import { listDocs, createDoc, seedSampleIfEmpty, parseDocInput } from '@/lib/documents/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Seed a sample the first time so the hub is never empty.
    await seedSampleIfEmpty(session.user?.email || null)
    const docs = await listDocs()
    return NextResponse.json({ docs })
  } catch (err) {
    console.error('[documents] list failed:', err)
    return NextResponse.json({ error: 'Failed to load documents.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const parsed = parseDocInput(raw)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const doc = await createDoc(parsed.value, session.user?.email || null)
    return NextResponse.json({ doc })
  } catch (err) {
    console.error('[documents] create failed:', err)
    return NextResponse.json({ error: 'Failed to create document.' }, { status: 500 })
  }
}
