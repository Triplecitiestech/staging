import { Metadata } from 'next';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

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
export const dynamic = 'force-dynamic';

interface PostWithRelations {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  publishedAt: Date | null;
  featuredImage: string | null;
  views: number;
  category: { name: string; slug: string } | null;
  author: { name: string } | null;
}

interface CategoryWithCount {
  id: string;
  name: string;
  slug: string;
  _count: { posts: number };
}

export default async function BlogPage() {
  // Dynamic import to prevent Prisma loading during build
  const { prisma } = await import('@/lib/prisma');

  // Check if blog system is set up
  let posts: PostWithRelations[] = [];
  let categories: CategoryWithCount[] = [];
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
  } catch {
    // Database tables don't exist, redirect to setup
    needsSetup = true;
  }

  // If blog system not set up, show setup prompt
  if (needsSetup || categories.length === 0) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto bg-gray-800/50 backdrop-blur-md border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-500/10 p-8 text-center">
              <div className="text-6xl mb-6">🚀</div>
              <h1 className="text-3xl font-bold text-white mb-4">
                Blog System Setup Required
              </h1>
              <p className="text-gray-300 mb-8">
                The automated blog system needs to be set up. This only takes 30 seconds!
              </p>
              <Link
                href="/blog/setup"
                className="inline-block bg-gradient-to-r from-cyan-500 to-cyan-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:from-cyan-400 hover:to-cyan-500 hover:shadow-lg hover:shadow-cyan-500/25 transform hover:scale-105 transition-all duration-200"
              >
                Run Automatic Setup
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 pt-20">
        <div className="container mx-auto px-4 py-12">
          {/* Header - centered like customer view */}
          <div className="mb-12 text-center">
            <h1 className="text-5xl font-bold text-white mb-2">
              Triple Cities Tech Blog
            </h1>
            <p className="text-2xl text-cyan-400 font-semibold">
              Expert insights on cybersecurity, IT management, and technology solutions
            </p>
          </div>

          {/* Blog Posts - centered layout */}
          <div className="max-w-4xl mx-auto">
            {posts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 text-lg">No blog posts yet. Check back soon!</p>
              </div>
            ) : (
              <div className="space-y-6">
                {posts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/blog/${post.slug}`}
                    className="block"
                  >
                    <article className="bg-gray-800/50 backdrop-blur-sm border border-cyan-500/30 rounded-lg shadow-lg shadow-cyan-500/10 p-8 hover:border-cyan-500/50 hover:shadow-cyan-500/20 transition-all duration-300">
                      {/* Category Badge */}
                      {post.category && (
                        <span className="inline-block bg-cyan-500/20 text-cyan-300 px-3 py-1 rounded-full text-sm font-semibold mb-4 border border-cyan-500/30">
                          {post.category.name}
                        </span>
                      )}

                      {/* Title */}
                      <h2 className="text-3xl font-bold mb-3 text-white hover:text-cyan-400 transition-colors">
                        {post.title}
                      </h2>

                      {/* Excerpt */}
                      <p className="text-gray-300 mb-4 leading-relaxed">
                        {post.excerpt}
                      </p>

                      {/* Meta Info */}
                      <div className="flex items-center gap-6 text-sm text-gray-400 pt-4 border-t border-gray-700">
                        <span>📅 {new Date(post.publishedAt!).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}</span>
                        <span>👤 {post.author?.name || 'Triple Cities Tech'}</span>
                        {post.views > 0 && <span>👁️ {post.views} views</span>}
                      </div>
                    </article>
                  </Link>
                ))}
              </div>
            )}

            {/* Contact CTA - like the customer view */}
            <div className="mt-12 p-8 bg-gray-800/50 backdrop-blur-sm border border-cyan-500/30 rounded-lg shadow-lg shadow-cyan-500/10 text-center">
              <h3 className="text-lg font-bold text-cyan-400 mb-2">
                Need IT Support or Cybersecurity Guidance?
              </h3>
              <p className="text-gray-300 mb-6">
                Our team provides comprehensive IT services and cybersecurity solutions for businesses in Central New York.
              </p>
              <Link
                href="/contact"
                className="inline-block px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg transition-colors duration-300"
              >
                Get in Touch
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
