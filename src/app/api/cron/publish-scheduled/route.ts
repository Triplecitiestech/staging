import { NextRequest, NextResponse } from 'next/server';
import { createSocialMediaPublisher, type PublishResult } from '@/lib/social-publisher';
import type { BlogPostDraft } from '@/lib/blog-generator';
import { Resend } from 'resend';

// Disable static generation for this API route
export const dynamic = 'force-dynamic';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Cron endpoint to publish scheduled blog posts
 * Triggered every 15 minutes via Vercel Cron
 *
 * POST /api/cron/publish-scheduled
 * Authorization: Bearer <BLOG_CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  try {
    // Dynamic import to prevent Prisma loading during build
    const { prisma } = await import('@/lib/prisma');

    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const secret = process.env.BLOG_CRON_SECRET;

    if (!secret) {
      console.warn('⚠️ BLOG_CRON_SECRET not configured');
    } else if (authHeader !== `Bearer ${secret}`) {
      console.error('❌ Invalid cron secret');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('📅 Checking for scheduled blog posts...');

    // Find posts that are approved and scheduled for publishing
    const postsToPublish = await prisma.blogPost.findMany({
      where: {
        status: 'APPROVED',
        scheduledFor: {
          lte: new Date()
        }
      },
      include: {
        category: true,
        tags: true
      }
    });

    if (postsToPublish.length === 0) {
      console.log('✅ No posts scheduled for publishing');
      return NextResponse.json({
        success: true,
        published: 0
      });
    }

    console.log(`📝 Found ${postsToPublish.length} posts to publish`);

    const results = [];

    for (const post of postsToPublish) {
      try {
        console.log(`🚀 Publishing: "${post.title}"`);

        // Update status to PUBLISHED
        await prisma.blogPost.update({
          where: { id: post.id },
          data: {
            status: 'PUBLISHED',
            publishedAt: new Date()
          }
        });

        // Publish to social media
        const socialPublisher = createSocialMediaPublisher();
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com';
        const blogUrl = `${baseUrl}/blog/${post.slug}`;
        const imageUrl = post.featuredImage || undefined;

        // Convert DB post to BlogPostDraft format for social publisher
        const blogDraft: BlogPostDraft = {
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt,
          content: post.content,
          metaTitle: post.metaTitle || post.title,
          metaDescription: post.metaDescription || post.excerpt,
          keywords: post.keywords,
          featuredImagePrompt: '',
          sourceUrls: post.sourceUrls,
          aiPrompt: post.aiPrompt || '',
          aiModel: post.aiModel || '',
          readingTime: '5 min read',
          category: post.category?.name || 'Cybersecurity News',
          tags: post.tags.map(t => t.name),
          socialMedia: {
            facebook: {
              title: post.title,
              description: post.excerpt,
              hashtags: ['#Cybersecurity', '#SmallBusiness', '#ITSecurity']
            },
            instagram: {
              caption: `${post.title}\n\n${post.excerpt}\n\nRead more at triplecitiestech.com/blog 🔗`,
              hashtags: ['#CyberSecurity', '#SmallBusiness', '#ITSupport']
            },
            linkedin: {
              title: post.title,
              content: post.excerpt,
              hashtags: ['#CyberSecurity', '#SMB', '#ITServices']
            }
          }
        };

        const socialResults = await socialPublisher.publishToAll(blogDraft, blogUrl, imageUrl);

        console.log(`📱 Social media results:`, socialResults);

        // Store social media post IDs
        const updates: Record<string, string | null> = {};

        for (const result of socialResults) {
          if (result.success && result.postId) {
            // Store in SocialMediaPost table
            await prisma.socialMediaPost.create({
              data: {
                blogPostId: post.id,
                platform: result.platform,
                platformId: result.postId,
                content: JSON.stringify(blogDraft.socialMedia),
                imageUrl: imageUrl,
                status: 'posted',
                postedAt: new Date()
              }
            });

            // Update blog post with platform-specific IDs
            if (result.platform === 'facebook') {
              updates.facebookPostId = result.postId;
            } else if (result.platform === 'instagram') {
              updates.instagramPostId = result.postId;
            } else if (result.platform === 'linkedin') {
              updates.linkedinPostId = result.postId;
            } else if (result.platform === 'twitter') {
              updates.twitterPostId = result.postId;
            }
          } else {
            // Log failed social media posts
            await prisma.socialMediaPost.create({
              data: {
                blogPostId: post.id,
                platform: result.platform,
                platformId: null,
                content: JSON.stringify(blogDraft.socialMedia),
                imageUrl: imageUrl,
                status: 'failed',
                error: result.error
              }
            });
          }
        }

        if (Object.keys(updates).length > 0) {
          await prisma.blogPost.update({
            where: { id: post.id },
            data: updates
          });
        }

        // Send confirmation email
        if (resend && post.approvedBy) {
          try {
            await resend.emails.send({
              from: 'Triple Cities Tech Blog <blog@triplecitiestech.com>',
              to: post.approvedBy,
              subject: `✅ Blog Post Published: "${post.title}"`,
              html: generatePublishedEmailHtml(post, blogUrl, socialResults),
              text: generatePublishedEmailText(post, blogUrl, socialResults)
            });

            console.log(`✉️ Confirmation email sent to ${post.approvedBy}`);
          } catch (emailError) {
            console.error('Failed to send confirmation email:', emailError);
          }
        }

        results.push({
          id: post.id,
          title: post.title,
          slug: post.slug,
          published: true,
          url: blogUrl,
          socialMedia: socialResults
        });

        console.log(`✅ Successfully published: "${post.title}"`);
      } catch (error) {
        console.error(`❌ Failed to publish "${post.title}":`, error);

        results.push({
          id: post.id,
          title: post.title,
          published: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      success: true,
      published: results.filter(r => r.published).length,
      failed: results.filter(r => !r.published).length,
      results
    });
  } catch (error) {
    console.error('❌ Error in publish-scheduled cron:', error);

    return NextResponse.json(
      {
        error: 'Failed to publish scheduled posts',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

interface PublishedPostData {
  title: string;
}

function generatePublishedEmailHtml(post: PublishedPostData, blogUrl: string, socialResults: PublishResult[]): string {
  const successfulPosts = socialResults.filter(r => r.success);

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: white; padding: 30px; border: 1px solid #ddd; border-radius: 0 0 8px 8px; }
    .btn { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; margin: 10px 5px; }
    .success { color: #28a745; }
    .platform { display: inline-block; padding: 4px 12px; background: #e7f3ff; color: #0066cc; border-radius: 20px; margin: 5px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Blog Post Published!</h1>
    </div>
    <div class="content">
      <h2>${post.title}</h2>
      <p><strong>Status:</strong> <span class="success">Published</span></p>
      <p><strong>URL:</strong> <a href="${blogUrl}">${blogUrl}</a></p>

      <h3>Social Media:</h3>
      <div>
        ${successfulPosts.map(p => `
          <span class="platform">${p.platform}: ${p.postUrl ? `<a href="${p.postUrl}">View</a>` : 'Posted'}</span>
        `).join('')}
      </div>

      <p style="margin-top: 30px;">
        <a href="${blogUrl}" class="btn">View Blog Post</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

function generatePublishedEmailText(post: PublishedPostData, blogUrl: string, socialResults: PublishResult[]): string {
  const successfulPosts = socialResults.filter(r => r.success);

  return `
BLOG POST PUBLISHED!

Title: ${post.title}
URL: ${blogUrl}

Social Media:
${successfulPosts.map(p => `- ${p.platform}: ${p.postUrl || 'Posted'}`).join('\n')}

---
Triple Cities Tech Blog System
  `;
}
