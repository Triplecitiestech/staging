import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { getSocialDocBySlug } from '@/lib/documents/store'
import { renderSocialCard, deriveHeadline, parseCardSize } from '@/lib/documents/social-card'

export const dynamic = 'force-dynamic'

/** Branded social card PNG for one post of a social dump. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { slug } = await params
  const { searchParams } = new URL(request.url)
  const i = Math.max(0, parseInt(searchParams.get('i') || '0', 10) || 0)
  const size = parseCardSize(searchParams.get('size'))

  const doc = await getSocialDocBySlug(slug)
  if (!doc || !doc.posts[i]) return new Response('Not found', { status: 404 })

  const post = doc.posts[i]
  return renderSocialCard({ headline: deriveHeadline(post.note, post.body), size })
}
