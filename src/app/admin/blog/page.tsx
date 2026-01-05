import Link from 'next/link'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import DeleteBlogPostButton from '@/components/admin/DeleteBlogPostButton'

export default async function BlogManagementPage() {
  const session = await auth()
  if (!session) {
    redirect('/admin')
  }

  const { prisma } = await import('@/lib/prisma')

  // Fetch blog posts with all statuses
  const [allPosts, draftPosts, pendingPosts, publishedPosts, blogCategories] = await Promise.all([
    prisma.blogPost.count(),
    prisma.blogPost.count({ where: { status: 'DRAFT' } }),
    prisma.blogPost.count({ where: { status: 'PENDING_APPROVAL' } }),
    prisma.blogPost.count({ where: { status: 'PUBLISHED' } }),
    prisma.blogCategory.count()
  ])

  const posts = await prisma.blogPost.findMany({
    include: {
      category: true,
      author: true
    },
    orderBy: {
      updatedAt: 'desc'
    }
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PUBLISHED': return 'bg-green-500/20 text-green-300 border-green-500/30'
      case 'PENDING_APPROVAL': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
      case 'APPROVED': return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
      case 'DRAFT': return 'bg-slate-500/20 text-slate-300 border-slate-500/30'
      case 'REJECTED': return 'bg-red-500/20 text-red-300 border-red-500/30'
      default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Blog Management</h2>
          <p className="text-slate-400">Manage your blog posts, categories, and content</p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-12">
          <div className="bg-gradient-to-br from-cyan-600/20 to-cyan-500/10 backdrop-blur-sm border border-cyan-500/30 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-cyan-300 font-semibold">Total Posts</p>
              <span className="text-3xl">📝</span>
            </div>
            <p className="text-3xl font-bold text-white">{allPosts}</p>
          </div>

          <div className="bg-gradient-to-br from-green-600/20 to-green-500/10 backdrop-blur-sm border border-green-500/30 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-green-300 font-semibold">Published</p>
              <span className="text-3xl">✅</span>
            </div>
            <p className="text-3xl font-bold text-white">{publishedPosts}</p>
          </div>

          <div className="bg-gradient-to-br from-yellow-600/20 to-yellow-500/10 backdrop-blur-sm border border-yellow-500/30 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-yellow-300 font-semibold">Pending</p>
              <span className="text-3xl">⏳</span>
            </div>
            <p className="text-3xl font-bold text-white">{pendingPosts}</p>
          </div>

          <div className="bg-gradient-to-br from-slate-600/20 to-slate-500/10 backdrop-blur-sm border border-slate-500/30 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-slate-300 font-semibold">Drafts</p>
              <span className="text-3xl">📄</span>
            </div>
            <p className="text-3xl font-bold text-white">{draftPosts}</p>
          </div>

          <div className="bg-gradient-to-br from-purple-600/20 to-purple-500/10 backdrop-blur-sm border border-purple-500/30 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-purple-300 font-semibold">Categories</p>
              <span className="text-3xl">🏷️</span>
            </div>
            <p className="text-3xl font-bold text-white">{blogCategories}</p>
          </div>
        </div>

        {/* Blog Posts Table */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
          <div className="p-6 border-b border-white/10">
            <h3 className="text-xl font-semibold text-white">All Blog Posts</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Title</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Views</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Updated</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {posts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                      No blog posts found. The automated system will generate posts Mon/Wed/Fri at 8 AM EST.
                    </td>
                  </tr>
                ) : (
                  posts.map((post) => (
                    <tr key={post.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="max-w-md">
                          <Link
                            href={`/admin/blog/${post.id}/edit`}
                            className="text-cyan-400 hover:text-cyan-300 font-medium line-clamp-2"
                          >
                            {post.title}
                          </Link>
                          <p className="text-sm text-slate-400 mt-1 line-clamp-1">{post.excerpt}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-300">
                          {post.category?.name || 'Uncategorized'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(post.status)}`}>
                          {post.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-300">{post.views}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-300">
                          {new Date(post.updatedAt).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {post.status === 'PUBLISHED' && (
                            <Link
                              href={`/blog/${post.slug}`}
                              target="_blank"
                              className="text-sm text-slate-400 hover:text-cyan-400 transition-colors"
                              title="View on site"
                            >
                              👁️
                            </Link>
                          )}
                          <Link
                            href={`/admin/blog/${post.id}/edit`}
                            className="text-sm text-slate-400 hover:text-cyan-400 transition-colors"
                            title="Edit"
                          >
                            ✏️
                          </Link>
                          <DeleteBlogPostButton postId={post.id} postTitle={post.title} />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <a
              href="/api/cron/generate-blog"
              target="_blank"
              className="flex items-center gap-3 p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/20 transition-colors"
            >
              <span className="text-2xl">🤖</span>
              <div>
                <p className="font-medium text-cyan-300">Generate New Post</p>
                <p className="text-xs text-slate-400">Trigger AI blog generation</p>
              </div>
            </a>

            <Link
              href="/blog"
              target="_blank"
              className="flex items-center gap-3 p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg hover:bg-purple-500/20 transition-colors"
            >
              <span className="text-2xl">🌐</span>
              <div>
                <p className="font-medium text-purple-300">View Public Blog</p>
                <p className="text-xs text-slate-400">See what visitors see</p>
              </div>
            </Link>

            <Link
              href="/api/blog/setup/verify"
              target="_blank"
              className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-lg hover:bg-green-500/20 transition-colors"
            >
              <span className="text-2xl">🔍</span>
              <div>
                <p className="font-medium text-green-300">Verify Setup</p>
                <p className="text-xs text-slate-400">Check system configuration</p>
              </div>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
