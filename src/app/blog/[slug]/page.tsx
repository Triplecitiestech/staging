import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

export const revalidate = 60; // ISR revalidation
export const dynamic = 'force-dynamic';

interface BlogPostPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const { slug } = await params;
    const post = await prisma.blogPost.findUnique({
      where: {
        slug: slug,
        status: 'PUBLISHED'
      },
      include: {
        category: true,
        author: true
      }
    });

    if (!post) {
      return {
        title: 'Post Not Found'
      };
    }

    return {
      title: post.metaTitle || post.title,
      description: post.metaDescription || post.excerpt,
      keywords: post.keywords.join(', '),
      openGraph: {
        title: post.metaTitle || post.title,
        description: post.metaDescription || post.excerpt,
        type: 'article',
        publishedTime: post.publishedAt?.toISOString(),
        authors: [post.author?.name || 'Triple Cities Tech'],
        tags: post.keywords
      },
      twitter: {
        card: 'summary_large_image',
        title: post.metaTitle || post.title,
        description: post.metaDescription || post.excerpt
      }
    };
  } catch (error) {
    // During build, database might not be available
    console.warn('Could not generate metadata for blog post:', error);
    return {
      title: 'Blog Post | Triple Cities Tech'
    };
  }
}

export async function generateStaticParams() {
  try {
    const { prisma } = await import('@/lib/prisma');
    const posts = await prisma.blogPost.findMany({
      where: {
        status: 'PUBLISHED'
      },
      select: {
        slug: true
      }
    });

    return posts.map((post) => ({
      slug: post.slug
    }));
  } catch (error) {
    // During build, database might not be available
    console.warn('Could not generate static params for blog posts:', error);
    return [];
  }
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { prisma } = await import('@/lib/prisma');
  const { slug } = await params;
  const post = await prisma.blogPost.findUnique({
    where: {
      slug: slug,
      status: 'PUBLISHED'
    },
    include: {
      category: true,
      tags: true,
      author: true
    }
  });

  if (!post) {
    notFound();
  }

  // Increment view count (fire and forget)
  prisma.blogPost.update({
    where: { id: post.id },
    data: {
      views: {
        increment: 1
      }
    }
  }).catch(console.error);

  // Fetch related posts
  const relatedPosts = await prisma.blogPost.findMany({
    where: {
      status: 'PUBLISHED',
      categoryId: post.categoryId,
      id: {
        not: post.id
      }
    },
    take: 3,
    orderBy: {
      publishedAt: 'desc'
    }
  });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com';
  const postUrl = `${baseUrl}/blog/${post.slug}`;

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-b from-gray-900 via-black to-gray-900">
        {/* Article Header */}
        <article className="max-w-4xl mx-auto px-4 py-12">
          {/* Category Badge */}
          {post.category && (
            <Link
              href={`/blog/category/${post.category.slug}`}
              className="inline-block bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-4 py-2 rounded-full text-sm font-semibold mb-4 hover:bg-cyan-500/30 transition-colors"
            >
              {post.category.name}
            </Link>
          )}

          {/* Title */}
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
            {post.title}
          </h1>

          {/* Meta Info */}
          <div className="flex flex-wrap items-center gap-6 text-gray-400 mb-8 pb-8 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📅</span>
            <span>{new Date(post.publishedAt!).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-2xl">👤</span>
            <span>{post.author?.name || 'Triple Cities Tech'}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-2xl">👁️</span>
            <span>{post.views} views</span>
          </div>
        </div>

          {/* Excerpt */}
          <div className="text-xl text-gray-300 italic mb-8 p-6 bg-gray-800/50 backdrop-blur-md border-l-4 border-cyan-500 rounded">
            {post.excerpt}
          </div>

          {/* Featured Image Placeholder */}
          {post.featuredImage && (
            <div className="mb-8 rounded-lg overflow-hidden">
              <div className="h-96 bg-gradient-to-r from-cyan-500 to-cyan-600" />
            </div>
          )}

          {/* Blog Content */}
          <div className="prose prose-lg max-w-none">
            <ReactMarkdown
              components={{
                h2: (props) => <h2 className="text-3xl font-bold mt-8 mb-4 text-white" {...props} />,
                h3: (props) => <h3 className="text-2xl font-bold mt-6 mb-3 text-white" {...props} />,
                p: (props) => <p className="mb-4 text-gray-300 leading-relaxed" {...props} />,
                ul: (props) => <ul className="list-disc list-inside mb-4 space-y-2" {...props} />,
                ol: (props) => <ol className="list-decimal list-inside mb-4 space-y-2" {...props} />,
                li: (props) => <li className="text-gray-300" {...props} />,
                a: (props) => <a className="text-cyan-400 hover:text-cyan-300 underline" {...props} />,
                strong: (props) => <strong className="font-bold text-white" {...props} />,
                blockquote: (props) => (
                  <blockquote className="border-l-4 border-cyan-500 pl-4 italic my-4 text-gray-300" {...props} />
                )
              }}
            >
              {post.content}
            </ReactMarkdown>
          </div>

          {/* Keywords/Tags */}
          {post.keywords.length > 0 && (
            <div className="mt-12 pt-8 border-t border-gray-700">
              <h3 className="text-sm font-semibold text-gray-400 mb-3">TAGS:</h3>
              <div className="flex flex-wrap gap-2">
                {post.keywords.map((keyword, idx) => (
                  <span
                    key={idx}
                    className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-3 py-1 rounded-full text-sm"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Social Share Buttons */}
          <div className="mt-8 pt-8 border-t border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Share this article:</h3>
          <div className="flex gap-4">
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
            >
              Facebook
            </a>
            <a
              href={`https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(postUrl)}&title=${encodeURIComponent(post.title)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-blue-700 text-white px-6 py-3 rounded-lg hover:bg-blue-800 transition-colors font-semibold"
            >
              LinkedIn
            </a>
            <a
              href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(postUrl)}&text=${encodeURIComponent(post.title)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-black text-white px-6 py-3 rounded-lg hover:bg-gray-800 transition-colors font-semibold"
            >
              Twitter
            </a>
          </div>
        </div>

          {/* CTA Section */}
          <div className="mt-12 bg-gradient-to-r from-cyan-500 to-cyan-600 text-white rounded-lg shadow-lg shadow-cyan-500/20 p-8">
            <h3 className="text-2xl font-bold mb-3">Need IT Support?</h3>
            <p className="mb-6 text-cyan-100">
              Triple Cities Tech provides comprehensive IT services and cybersecurity solutions for small businesses in Central New York.
            </p>
            <Link
              href="/contact"
              className="inline-block bg-white text-cyan-600 px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              Get in Touch
            </Link>
          </div>

        {/* Schema.org Article Markup */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Article',
              headline: post.title,
              description: post.excerpt,
              author: {
                '@type': 'Organization',
                name: 'Triple Cities Tech'
              },
              publisher: {
                '@type': 'Organization',
                name: 'Triple Cities Tech',
                logo: {
                  '@type': 'ImageObject',
                  url: `${baseUrl}/logo.png`
                }
              },
              datePublished: post.publishedAt?.toISOString(),
              dateModified: post.updatedAt.toISOString(),
              mainEntityOfPage: {
                '@type': 'WebPage',
                '@id': postUrl
              },
              keywords: post.keywords.join(', ')
            })
          }}
        />
      </article>

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <section className="bg-gray-800/30 py-12 mt-12">
            <div className="max-w-6xl mx-auto px-4">
              <h2 className="text-3xl font-bold text-white mb-8">Related Articles</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {relatedPosts.map((relatedPost) => (
                  <Link
                    key={relatedPost.id}
                    href={`/blog/${relatedPost.slug}`}
                    className="bg-gray-800/50 backdrop-blur-md border border-cyan-500/20 rounded-lg shadow-lg hover:shadow-xl hover:shadow-cyan-500/10 transition-all p-6 block"
                  >
                    <h3 className="text-xl font-bold mb-2 text-white hover:text-cyan-400 transition-colors">
                      {relatedPost.title}
                    </h3>
                    <p className="text-gray-300 line-clamp-3 mb-3">
                      {relatedPost.excerpt}
                    </p>
                    <span className="text-cyan-400 font-semibold">Read More →</span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Back to Blog */}
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Link
            href="/blog"
            className="text-cyan-400 hover:text-cyan-300 font-semibold"
          >
            ← Back to Blog
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
