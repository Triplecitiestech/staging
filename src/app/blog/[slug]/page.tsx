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
      <main className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 pt-20">
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
          <h1 className="text-5xl font-bold text-white mb-6 leading-tight">
            {post.title}
          </h1>

          {/* Meta Info */}
          <div className="flex flex-wrap items-center gap-6 text-sm text-gray-400 mb-8 pb-8 border-b border-gray-700">
            <span>📅 {new Date(post.publishedAt!).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}</span>
            <span>👤 {post.author?.name || 'Triple Cities Tech'}</span>
            {post.views > 0 && <span>👁️ {post.views} views</span>}
          </div>

          {/* Content Card */}
          <div className="bg-gray-800/50 backdrop-blur-sm border border-cyan-500/30 rounded-lg shadow-lg shadow-cyan-500/10 p-8 mb-8">
            {/* Excerpt */}
            <div className="text-xl text-cyan-300 italic mb-8 pb-8 border-b border-gray-700">
              {post.excerpt}
            </div>

            {/* Blog Content */}
            <div className="prose prose-lg max-w-none">
              <ReactMarkdown
                components={{
                  h2: (props) => <h2 className="text-3xl font-bold mt-8 mb-4 text-white" {...props} />,
                  h3: (props) => <h3 className="text-2xl font-bold mt-6 mb-3 text-white" {...props} />,
                  p: (props) => <p className="mb-6 text-gray-300 leading-relaxed text-lg" {...props} />,
                  ul: (props) => <ul className="list-disc list-inside mb-6 space-y-2 ml-4" {...props} />,
                  ol: (props) => <ol className="list-decimal list-inside mb-6 space-y-2 ml-4" {...props} />,
                  li: (props) => <li className="text-gray-300 text-lg" {...props} />,
                  a: (props) => <a className="text-cyan-400 hover:text-cyan-300 underline" {...props} />,
                  strong: (props) => <strong className="font-bold text-white" {...props} />,
                  blockquote: (props) => (
                    <blockquote className="border-l-4 border-cyan-500 pl-6 py-2 italic my-6 text-gray-300 bg-gray-900/30" {...props} />
                  ),
                  code: (props) => <code className="bg-gray-900/50 px-2 py-1 rounded text-cyan-300 text-sm" {...props} />
                }}
              >
                {post.content}
              </ReactMarkdown>
            </div>
          </div>

          {/* Keywords/Tags */}
          {post.keywords.length > 0 && (
            <div className="mb-8">
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

          {/* Back to Blog */}
          <div className="mb-8">
            <Link
              href="/blog"
              className="text-cyan-400 hover:text-cyan-300 font-semibold"
            >
              ← Back to Blog
            </Link>
          </div>

          {/* CTA Section - like customer view */}
          <div className="mt-12 p-8 bg-gray-800/50 backdrop-blur-sm border border-cyan-500/30 rounded-lg shadow-lg shadow-cyan-500/10 text-center">
            <h3 className="text-lg font-bold text-cyan-400 mb-2">
              Need IT Support or Cybersecurity Guidance?
            </h3>
            <p className="text-gray-300 mb-6">
              Triple Cities Tech provides comprehensive IT services and cybersecurity solutions for businesses in Central New York.
            </p>
            <Link
              href="/contact"
              className="inline-block px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg transition-colors duration-300"
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
      </main>
      <Footer />
    </>
  );
}
