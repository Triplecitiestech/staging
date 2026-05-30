import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { checkCsrf } from '@/lib/security'
import { getDocBySlug, updateDoc, deleteDoc, parseDocInput } from '@/lib/documents/store'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slug } = await params
  try {
    const doc = await getDocBySlug(slug)
    if (!doc) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    return NextResponse.json({ doc })
  } catch (err) {
    console.error('[documents] get failed:', err)
    return NextResponse.json({ error: 'Failed to load document.' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slug } = await params

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const parsed = parseDocInput(raw)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const doc = await updateDoc(slug, parsed.value)
    if (!doc) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    return NextResponse.json({ doc })
  } catch (err) {
    console.error('[documents] update failed:', err)
    return NextResponse.json({ error: 'Failed to save document.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slug } = await params
  try {
    const ok = await deleteDoc(slug)
    if (!ok) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[documents] delete failed:', err)
    return NextResponse.json({ error: 'Failed to delete document.' }, { status: 500 })
  }
}
