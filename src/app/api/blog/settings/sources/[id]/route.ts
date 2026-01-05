import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/blog/settings/sources/[id]
 * Update a content source
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { prisma } = await import('@/lib/prisma')

    const source = await prisma.contentSource.update({
      where: { id },
      data: {
        isActive: body.isActive,
        name: body.name,
        url: body.url,
        rssFeedUrl: body.rssFeedUrl,
        fetchFrequency: body.fetchFrequency
      }
    })

    return NextResponse.json({ success: true, source })
  } catch (error) {
    console.error('Error updating content source:', error)
    return NextResponse.json(
      { error: 'Failed to update content source' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/blog/settings/sources/[id]
 * Delete a content source
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { prisma } = await import('@/lib/prisma')

    await prisma.contentSource.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting content source:', error)
    return NextResponse.json(
      { error: 'Failed to delete content source' },
      { status: 500 }
    )
  }
}
