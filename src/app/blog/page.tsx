import { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';

export const metadata: Metadata = {
  title: 'Blog | Triple Cities Tech - Cybersecurity & IT Insights',
  description: 'Expert insights on cybersecurity, IT management, and technology solutions for small businesses in Central New York.',
  openGraph: {
    title: 'Blog | Triple Cities Tech',
    description: 'Expert insights on cybersecurity, IT management, and technology solutions for small businesses.',
    type: 'website'
  }
};

export const revalidate = 60; // Revalidate every 60 seconds (ISR)

export default async function BlogPage() {
  // Check if blog system is set up
  let posts: any[] = [];
  let categories: any[] = [];
  let needsSetup = false;

  try {
    // Fetch published blog posts
    posts = await prisma.blogPost.findMany({
      where: {
        status: 'PUBLISHED'
      },
      include: {
        category: true,
        author: true
      },
      orderBy: {
        publishedAt: 'desc'
      },
      take: 20
    });

    // Fetch categories for sidebar
    categories = await prisma.blogCategory.findMany({
      include: {
        _count: {
          select: {
            posts: {
              where: {
                status: 'PUBLISHED'
              }
            }
          }
        }
      }
    });
  } catch (error) {
    // Database tables don't exist, redirect to setup
    needsSetup = true;
  }

  // If blog system not set up, show setup prompt
  if (needsSetup || categories.length === 0) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-indigo-700 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-2xl p-8 text-center">
            <div className="text-6xl mb-6">🚀</div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Blog System Setup Required
            </h1>
            <p className="text-gray-600 mb-8">
              The automated blog system needs to be set up. This only takes 30 seconds!
            </p>
            <a
              href="/blog/setup"
              className="inline-block bg-gradient-to-r from-purple-600 to-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:shadow-lg transform hover:scale-105 transition-all duration-200"
            >
              Run Automatic Setup
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-purple-600 to-blue-600 text-white py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Triple Cities Tech Blog
            </h1>
            <p className="text-xl md:text-2xl text-purple-100">
              Expert insights on cybersecurity, IT management, and technology solutions for small businesses
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Blog Posts */}
          <div className="lg:col-span-2">
            {posts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-600 text-lg">No blog posts yet. Check back soon!</p>
              </div>
            ) : (
              <div className="space-y-8">
                {posts.map((post) => (
                  <article
                    key={post.id}
                    className="bg-white rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden"
                  >
                    {/* Featured Image Placeholder */}
                    {post.featuredImage && (
                      <div className="h-64 bg-gradient-to-r from-purple-500 to-blue-500" />
                    )}

                    <div className="p-6">
                      {/* Category Badge */}
                      {post.category && (
                        <Link
                          href={`/blog/category/${post.category.slug}`}
                          className="inline-block bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-semibold mb-3 hover:bg-purple-200 transition-colors"
                        >
                          {post.category.name}
                        </Link>
                      )}

                      {/* Title */}
                      <h2 className="text-2xl md:text-3xl font-bold mb-3 text-gray-900 hover:text-purple-600 transition-colors">
                        <Link href={`/blog/${post.slug}`}>
                          {post.title}
                        </Link>
                      </h2>

                      {/* Excerpt */}
                      <p className="text-gray-600 mb-4 line-clamp-3">
                        {post.excerpt}
                      </p>

                      {/* Meta Info */}
                      <div className="flex items-center justify-between text-sm text-gray-500">
                        <div className="flex items-center gap-4">
                          <span>📅 {new Date(post.publishedAt!).toLocaleDateString()}</span>
                          <span>👤 {post.author?.name || 'Triple Cities Tech'}</span>
                        </div>

                        <Link
                          href={`/blog/${post.slug}`}
                          className="text-purple-600 font-semibold hover:text-purple-700 transition-colors"
                        >
                          Read More →
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-8">
            {/* Categories */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold mb-4 text-gray-900">Categories</h3>
              <ul className="space-y-2">
                {categories.map((category) => (
                  <li key={category.id}>
                    <Link
                      href={`/blog/category/${category.slug}`}
                      className="flex items-center justify-between text-gray-700 hover:text-purple-600 transition-colors"
                    >
                      <span>{category.name}</span>
                      <span className="bg-gray-200 text-gray-700 px-2 py-1 rounded text-xs">
                        {category._count.posts}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Newsletter Signup (Optional) */}
            <div className="bg-gradient-to-br from-purple-600 to-blue-600 text-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold mb-3">Stay Updated</h3>
              <p className="mb-4 text-purple-100">
                Get the latest cybersecurity insights delivered to your inbox.
              </p>
              <Link
                href="/contact"
                className="block w-full bg-white text-purple-600 text-center py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Contact Us
              </Link>
            </div>

            {/* Recent Posts */}
            {posts.length > 3 && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-xl font-bold mb-4 text-gray-900">Recent Posts</h3>
                <ul className="space-y-3">
                  {posts.slice(0, 5).map((post) => (
                    <li key={post.id}>
                      <Link
                        href={`/blog/${post.slug}`}
                        className="text-gray-700 hover:text-purple-600 transition-colors line-clamp-2"
                      >
                        {post.title}
                      </Link>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(post.publishedAt!).toLocaleDateString()}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}
