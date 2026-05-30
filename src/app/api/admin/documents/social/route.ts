import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { checkCsrf } from '@/lib/security'
import { listSocialDocs, createSocialDoc, seedSampleSocialIfEmpty, parseSocialInput } from '@/lib/documents/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await seedSampleSocialIfEmpty(session.user?.email || null)
    const docs = await listSocialDocs()
    return NextResponse.json({ docs })
  } catch (err) {
    console.error('[documents:social] list failed:', err)
    return NextResponse.json({ error: 'Failed to load social dumps.' }, { status: 500 })
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

  const parsed = parseSocialInput(raw)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const doc = await createSocialDoc(parsed.value, session.user?.email || null)
    return NextResponse.json({ doc })
  } catch (err) {
    console.error('[documents:social] create failed:', err)
    return NextResponse.json({ error: 'Failed to create social dump.' }, { status: 500 })
  }
}
