import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { checkCsrf } from '@/lib/security'
import { getActiveShareLink, createShareLink, revokeShareLink } from '@/lib/documents/share-links'

export const dynamic = 'force-dynamic'

// Allow-list of static documents that may be shared via a public link. Add slugs
// here deliberately — this set is what decides what a share token can expose.
const SHAREABLE_SLUGS = new Set(['secure-boot-playbook'])

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com').replace(/\/$/, '')
}

function publicUrl(slug: string, token: string): string {
  return `${baseUrl()}/documents/${slug}?key=${token}`
}

/** Resolve the requested slug from query (?slug=) or POST body, and allow-list it. */
function readSlug(request: NextRequest, body?: unknown): string | null {
  const fromQuery = request.nextUrl.searchParams.get('slug')
  const fromBody =
    body && typeof body === 'object' && typeof (body as { slug?: unknown }).slug === 'string'
      ? (body as { slug: string }).slug
      : null
  const slug = fromQuery ?? fromBody
  if (!slug || !SHAREABLE_SLUGS.has(slug)) return null
  return slug
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const slug = readSlug(request)
  if (!slug) return NextResponse.json({ error: 'Unknown document.' }, { status: 400 })

  try {
    const link = await getActiveShareLink(slug)
    return NextResponse.json({
      link: link ? { url: publicUrl(link.slug, link.token), createdAt: link.createdAt } : null,
    })
  } catch (err) {
    console.error('[documents/share] get failed:', err)
    return NextResponse.json({ error: 'Failed to load share link.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    // Body is optional — slug may be supplied via the query string instead.
  }

  const slug = readSlug(request, body)
  if (!slug) return NextResponse.json({ error: 'Unknown document.' }, { status: 400 })

  try {
    const link = await createShareLink(slug, session.user?.email ?? null)
    return NextResponse.json({
      link: { url: publicUrl(link.slug, link.token), createdAt: link.createdAt },
    })
  } catch (err) {
    console.error('[documents/share] create failed:', err)
    return NextResponse.json({ error: 'Failed to create share link.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const slug = readSlug(request)
  if (!slug) return NextResponse.json({ error: 'Unknown document.' }, { status: 400 })

  try {
    const revoked = await revokeShareLink(slug)
    return NextResponse.json({ success: true, revoked })
  } catch (err) {
    console.error('[documents/share] revoke failed:', err)
    return NextResponse.json({ error: 'Failed to revoke share link.' }, { status: 500 })
  }
}
