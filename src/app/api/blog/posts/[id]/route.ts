import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

// Ensure missing columns exist before any Prisma queries (including auth session callback)
async function ensureSchema() {
  try {
    const { prisma } = await import('@/lib/prisma')
    await prisma.$executeRawUnsafe(`ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "autotaskResourceId" TEXT`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "campaignId" TEXT`)
  } catch {
    // Columns may already exist — proceed anyway
  }
}

/**
 * GET /api/blog/posts/[id]
 * Get a single blog post
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSchema()
    const { id } = await params
    const { prisma } = await import('@/lib/prisma')

    const post = await prisma.blogPost.findUnique({
      where: { id },
      include: {
        category: true,
        tags: true,
        author: true
      }
    })

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    return NextResponse.json({ post })
  } catch (error) {
    console.error('Error fetching post:', error)
    return NextResponse.json(
      { error: 'Failed to fetch post' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/blog/posts/[id]
 * Update a blog post
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSchema()
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!['ADMIN', 'MANAGER'].includes(session.user?.role as string)) {
      return NextResponse.json({ error: 'Forbidden: requires ADMIN or MANAGER role' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const { prisma } = await import('@/lib/prisma')

    const post = await prisma.blogPost.update({
      where: { id },
      data: {
        title: body.title,
        excerpt: body.excerpt,
        content: body.content,
        metaTitle: body.metaTitle,
        metaDescription: body.metaDescription,
        keywords: body.keywords
      }
    })

    return NextResponse.json({ success: true, post })
  } catch (error) {
    console.error('Error updating post:', error)
    return NextResponse.json(
      { error: 'Failed to update post' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/blog/posts/[id]
 * Delete a blog post
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSchema()
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!['ADMIN', 'MANAGER'].includes(session.user?.role as string)) {
      return NextResponse.json({ error: 'Forbidden: requires ADMIN or MANAGER role' }, { status: 403 })
    }

    const { id } = await params
    const { prisma } = await import('@/lib/prisma')

    // Disconnect many-to-many relations (tags) before deleting
    await prisma.blogPost.update({
      where: { id },
      data: { tags: { set: [] } }
    })

    await prisma.blogPost.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting post:', error)
    return NextResponse.json(
      { error: 'Failed to delete post' },
      { status: 500 }
    )
  }
}
