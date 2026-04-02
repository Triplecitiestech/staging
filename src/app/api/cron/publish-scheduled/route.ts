import { NextRequest, NextResponse } from 'next/server';
import { classifyError } from '@/lib/resilience';
import { createSocialMediaPublisher, type PublishResult, type SocialMediaConfig } from '@/lib/social-publisher';
import type { BlogPostDraft } from '@/lib/blog-generator';
import { Resend } from 'resend';
import { getBaseUrl } from '@/config/site';

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
export async function GET(request: NextRequest) {
  return handlePublishScheduled(request);
}

export async function POST(request: NextRequest) {
  return handlePublishScheduled(request);
}

async function handlePublishScheduled(request: NextRequest) {
  try {
    // Dynamic import to prevent Prisma loading during build
    const { prisma } = await import('@/lib/prisma');

    // Verify cron secret (supports both Vercel's CRON_SECRET and custom BLOG_CRON_SECRET)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const blogCronSecret = process.env.BLOG_CRON_SECRET;

    if (!cronSecret && !blogCronSecret) {
      console.warn('⚠️ No cron secret configured — skipping auth check');
    } else if (authHeader) {
      const isValid =
        (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
        (blogCronSecret && authHeader === `Bearer ${blogCronSecret}`);
      if (!isValid) {
        console.error('❌ Invalid cron secret');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } else {
      console.error('❌ Missing Authorization header');
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

        // Publish to social media (load config from DB + env vars)
        const socialConfig = await loadSocialConfig(prisma);
        const { SocialMediaPublisher } = await import('@/lib/social-publisher');
        const socialPublisher = Object.keys(socialConfig).length > 0
          ? new SocialMediaPublisher(socialConfig)
          : createSocialMediaPublisher();
        const baseUrl = getBaseUrl();
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
    const classified = classifyError(error);

    // Return 200 for transient errors so Vercel doesn't flag the cron as failed
    if (classified.isTransient) {
      return NextResponse.json({
        success: false,
        transient: true,
        error: classified.message,
        errorCategory: classified.category,
      });
    }

    return NextResponse.json(
      { error: 'Failed to publish scheduled posts', details: classified.message },
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

/**
 * Load social media configuration from BlogSettings (DB) with env var fallback.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadSocialConfig(prisma: any): Promise<SocialMediaConfig> {
  const config: SocialMediaConfig = {};

  try {
    const settings = await prisma.blogSettings.findMany({
      where: {
        key: {
          in: [
            'facebook_access_token', 'facebook_page_id',
            'instagram_access_token', 'instagram_account_id',
            'linkedin_access_token', 'linkedin_org_id'
          ]
        }
      }
    });

    const map = new Map(settings.map((s: { key: string; value: string }) => [s.key, s.value]));

    const fbToken = (map.get('facebook_access_token') as string) || process.env.FACEBOOK_ACCESS_TOKEN;
    const fbPageId = (map.get('facebook_page_id') as string) || process.env.FACEBOOK_PAGE_ID;
    if (fbToken && fbPageId) {
      config.facebook = { accessToken: fbToken, pageId: fbPageId };
    }

    const igToken = (map.get('instagram_access_token') as string) || process.env.INSTAGRAM_ACCESS_TOKEN;
    const igAccountId = (map.get('instagram_account_id') as string) || process.env.INSTAGRAM_ACCOUNT_ID;
    if (igToken && igAccountId) {
      config.instagram = { accessToken: igToken, accountId: igAccountId };
    }

    const liToken = (map.get('linkedin_access_token') as string) || process.env.LINKEDIN_ACCESS_TOKEN;
    const liOrgId = (map.get('linkedin_org_id') as string) || process.env.LINKEDIN_ORG_ID;
    if (liToken && liOrgId) {
      config.linkedin = { accessToken: liToken, organizationId: liOrgId };
    }
  } catch (error) {
    console.error('Error loading social config from DB, falling back to env vars:', error);
    // Fall back to empty config (env vars will be used by createSocialMediaPublisher)
  }

  return config;
}
