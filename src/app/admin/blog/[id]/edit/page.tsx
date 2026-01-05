import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import BlogPostEditor from '@/components/admin/BlogPostEditor'

interface BlogPostEditPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function BlogPostEditPage({ params }: BlogPostEditPageProps) {
  try {
    const session = await auth()
    if (!session) {
      redirect('/admin')
    }

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
      notFound()
    }

    // Serialize post data for client component (convert Dates to strings)
    const serializedPost = {
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      status: post.status,
      metaTitle: post.metaTitle,
      metaDescription: post.metaDescription,
      keywords: post.keywords,
      views: post.views,
      publishedAt: post.publishedAt?.toISOString() || null,
      scheduledFor: post.scheduledFor?.toISOString() || null,
      sentForApproval: post.sentForApproval?.toISOString() || null,
      approvedAt: post.approvedAt?.toISOString() || null,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      category: post.category ? {
        id: post.category.id,
        name: post.category.name,
      } : null,
      tags: post.tags.map(tag => ({
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
      })),
      author: post.author ? {
        id: post.author.id,
        name: post.author.name,
        email: post.author.email,
      } : null
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
        <AdminHeader />
        <BlogPostEditor post={serializedPost} />
      </div>
    )
  } catch (error) {
    console.error('Blog post edit page error:', error)
    console.error('Error details:', JSON.stringify(error, null, 2))
    throw error
  }
}
