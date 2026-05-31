import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { checkCsrf } from '@/lib/security'
import { getSocialDocBySlug, saveCardBackground, deleteCardBackground } from '@/lib/documents/store'
import { generateAdBackground, isImageGenConfigured } from '@/lib/documents/image-gen'
import { deriveCardCopy } from '@/lib/documents/social-card'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Generate (and cache) a textless AI background for one social post, or for all
 * posts when no index is given. Body: { index?: number }. The headline text is
 * still rendered on top by the card route — this only makes the picture.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isImageGenConfigured()) {
    return NextResponse.json(
      { error: 'Image generation is not configured. Set OPENAI_API_KEY in the environment.' },
      { status: 503 }
    )
  }

  const { slug } = await params
  const doc = await getSocialDocBySlug(slug)
  if (!doc) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  let body: { index?: number } = {}
  try {
    body = await request.json()
  } catch {
    /* no body = all posts */
  }

  const indexes =
    typeof body.index === 'number' && body.index >= 0 && body.index < doc.posts.length
      ? [body.index]
      : doc.posts.map((_, i) => i)

  const generated: number[] = []
  const failed: { index: number; error: string }[] = []

  for (const i of indexes) {
    const post = doc.posts[i]
    const { headline } = deriveCardCopy(post.note, post.body)
    try {
      const img = await generateAdBackground({ headline, hint: headline })
      await saveCardBackground(slug, i, img.b64, img.mime)
      generated.push(i)
    } catch (err) {
      failed.push({ index: i, error: (err as Error).message })
    }
  }

  if (generated.length === 0) {
    return NextResponse.json({ error: failed[0]?.error || 'Generation failed.', failed }, { status: 502 })
  }
  return NextResponse.json({ generated, failed })
}

/** Remove a generated background (revert that card to the gradient). */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slug } = await params
  const { searchParams } = new URL(request.url)
  const i = parseInt(searchParams.get('index') || '', 10)
  if (Number.isNaN(i)) return NextResponse.json({ error: 'index is required.' }, { status: 400 })

  await deleteCardBackground(slug, i)
  return NextResponse.json({ success: true })
}
