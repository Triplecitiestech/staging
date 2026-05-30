import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { checkCsrf } from '@/lib/security'
import { getSocialDocBySlug, updateSocialDoc, deleteSocialDoc, parseSocialInput } from '@/lib/documents/store'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slug } = await params
  try {
    const doc = await getSocialDocBySlug(slug)
    if (!doc) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    return NextResponse.json({ doc })
  } catch (err) {
    console.error('[documents:social] get failed:', err)
    return NextResponse.json({ error: 'Failed to load social dump.' }, { status: 500 })
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

  const parsed = parseSocialInput(raw)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const doc = await updateSocialDoc(slug, parsed.value)
    if (!doc) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    return NextResponse.json({ doc })
  } catch (err) {
    console.error('[documents:social] update failed:', err)
    return NextResponse.json({ error: 'Failed to save social dump.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slug } = await params
  try {
    const ok = await deleteSocialDoc(slug)
    if (!ok) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[documents:social] delete failed:', err)
    return NextResponse.json({ error: 'Failed to delete social dump.' }, { status: 500 })
  }
}
