import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/blog/settings/sources
 * Create a new content source
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, url, rssFeedUrl, isActive } = await request.json()

    if (!name || !rssFeedUrl) {
      return NextResponse.json(
        { error: 'Name and RSS feed URL are required' },
        { status: 400 }
      )
    }

    const { prisma } = await import('@/lib/prisma')

    const source = await prisma.contentSource.create({
      data: {
        name,
        url: url || rssFeedUrl,
        rssFeedUrl,
        isActive: isActive ?? true,
        fetchFrequency: 'daily'
      }
    })

    return NextResponse.json({
      success: true,
      source: {
        id: source.id,
        name: source.name,
        url: source.url,
        rssFeedUrl: source.rssFeedUrl || '',
        apiEndpoint: source.apiEndpoint || '',
        isActive: source.isActive,
        lastFetched: source.lastFetched?.toISOString() || null,
        fetchFrequency: source.fetchFrequency
      }
    })
  } catch (error) {
    console.error('Error creating content source:', error)
    return NextResponse.json(
      { error: 'Failed to create content source' },
      { status: 500 }
    )
  }
}
