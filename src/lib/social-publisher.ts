import type { BlogPostDraft } from './blog-generator';

export interface SocialMediaConfig {
  facebook?: {
    accessToken: string;
    pageId: string;
  };
  instagram?: {
    accessToken: string;
    accountId: string;
  };
  linkedin?: {
    accessToken: string;
    organizationId: string;
  };
  twitter?: {
    apiKey: string;
    apiSecret: string;
    accessToken: string;
    accessSecret: string;
  };
}

export interface PublishResult {
  platform: string;
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}

export class SocialMediaPublisher {
  private config: SocialMediaConfig;

  constructor(config: SocialMediaConfig) {
    this.config = config;
  }

  /**
   * Publish to all configured platforms
   */
  async publishToAll(
    blogPost: BlogPostDraft,
    blogUrl: string,
    imageUrl?: string
  ): Promise<PublishResult[]> {
    const results: PublishResult[] = [];

    // Publish to each platform in parallel
    const promises: Promise<PublishResult>[] = [];

    if (this.config.facebook) {
      promises.push(this.publishToFacebook(blogPost, blogUrl, imageUrl));
    }

    if (this.config.instagram) {
      promises.push(this.publishToInstagram(blogPost, blogUrl, imageUrl));
    }

    if (this.config.linkedin) {
      promises.push(this.publishToLinkedIn(blogPost, blogUrl, imageUrl));
    }

    if (this.config.twitter) {
      promises.push(this.publishToTwitter(blogPost, blogUrl, imageUrl));
    }

    const settledResults = await Promise.allSettled(promises);

    settledResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          platform: 'unknown',
          success: false,
          error: result.reason?.message || 'Unknown error'
        });
      }
    });

    return results;
  }

  /**
   * Publish to Facebook Page
   */
  async publishToFacebook(
    blogPost: BlogPostDraft,
    blogUrl: string,
    imageUrl?: string
  ): Promise<PublishResult> {
    try {
      if (!this.config.facebook) {
        throw new Error('Facebook config not provided');
      }

      const { accessToken, pageId } = this.config.facebook;
      const { facebook } = blogPost.socialMedia;

      // Create post content
      const message = `${facebook.title}

${facebook.description}

Read more: ${blogUrl}

${facebook.hashtags.join(' ')}`;

      // Use Facebook Graph API v18.0
      const endpoint = `https://graph.facebook.com/v18.0/${pageId}/feed`;

      const body: Record<string, string> = {
        message,
        link: blogUrl,
        access_token: accessToken
      };

      // If image URL provided, use it
      if (imageUrl) {
        body.picture = imageUrl;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Facebook API error');
      }

      const data = await response.json();

      return {
        platform: 'facebook',
        success: true,
        postId: data.id,
        postUrl: `https://www.facebook.com/${data.id}`
      };
    } catch (error) {
      console.error('Facebook publish error:', error);
      return {
        platform: 'facebook',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Publish to Instagram (Business Account)
   */
  async publishToInstagram(
    blogPost: BlogPostDraft,
    blogUrl: string,
    imageUrl?: string
  ): Promise<PublishResult> {
    try {
      if (!this.config.instagram) {
        throw new Error('Instagram config not provided');
      }

      const { accessToken, accountId } = this.config.instagram;
      const { instagram } = blogPost.socialMedia;

      // Instagram requires an image URL for posts
      if (!imageUrl) {
        return {
          platform: 'instagram',
          success: false,
          error: 'Image URL required for Instagram posts'
        };
      }

      // Step 1: Create container
      const createEndpoint = `https://graph.facebook.com/v18.0/${accountId}/media`;

      const caption = `${instagram.caption}

Read more at triplecitiestech.com/blog 🔗

${instagram.hashtags.join(' ')}`;

      const createResponse = await fetch(createEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image_url: imageUrl,
          caption: caption.substring(0, 2200), // Instagram limit
          access_token: accessToken
        })
      });

      if (!createResponse.ok) {
        const error = await createResponse.json();
        throw new Error(error.error?.message || 'Instagram create container error');
      }

      const createData = await createResponse.json();
      const creationId = createData.id;

      // Step 2: Publish container
      const publishEndpoint = `https://graph.facebook.com/v18.0/${accountId}/media_publish`;

      const publishResponse = await fetch(publishEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          creation_id: creationId,
          access_token: accessToken
        })
      });

      if (!publishResponse.ok) {
        const error = await publishResponse.json();
        throw new Error(error.error?.message || 'Instagram publish error');
      }

      const publishData = await publishResponse.json();

      return {
        platform: 'instagram',
        success: true,
        postId: publishData.id,
        postUrl: `https://www.instagram.com/p/${publishData.id}/`
      };
    } catch (error) {
      console.error('Instagram publish error:', error);
      return {
        platform: 'instagram',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Publish to LinkedIn (Organization page)
   */
  async publishToLinkedIn(
    blogPost: BlogPostDraft,
    blogUrl: string,
    imageUrl?: string
  ): Promise<PublishResult> {
    try {
      if (!this.config.linkedin) {
        throw new Error('LinkedIn config not provided');
      }

      const { accessToken, organizationId } = this.config.linkedin;
      const { linkedin } = blogPost.socialMedia;

      // Use LinkedIn Share API v2
      const endpoint = 'https://api.linkedin.com/v2/ugcPosts';

      const content = `${linkedin.content}

Read the full article: ${blogUrl}

${linkedin.hashtags.join(' ')}`;

      const body = {
        author: `urn:li:organization:${organizationId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: content.substring(0, 3000) // LinkedIn limit
            },
            shareMediaCategory: imageUrl ? 'IMAGE' : 'ARTICLE',
            media: [
              {
                status: 'READY',
                description: {
                  text: linkedin.title
                },
                originalUrl: blogUrl,
                ...(imageUrl && {
                  media: imageUrl,
                  title: {
                    text: linkedin.title
                  }
                })
              }
            ]
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'LinkedIn API error');
      }

      const data = await response.json();
      const postId = data.id;

      return {
        platform: 'linkedin',
        success: true,
        postId,
        postUrl: `https://www.linkedin.com/feed/update/${postId}/`
      };
    } catch (error) {
      console.error('LinkedIn publish error:', error);
      return {
        platform: 'linkedin',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Publish to Twitter (X)
   */
  async publishToTwitter(
    blogPost: BlogPostDraft,
    blogUrl: string,
    imageUrl?: string
  ): Promise<PublishResult> {
    try {
      if (!this.config.twitter) {
        throw new Error('Twitter config not provided');
      }

      // Create a concise tweet
      const tweetText = `${blogPost.title}

${blogPost.excerpt.substring(0, 150)}...

Read more: ${blogUrl}

#CyberSecurity #SmallBusiness`;

      // Note: Twitter API v2 implementation would go here
      // For now, return a placeholder
      return {
        platform: 'twitter',
        success: false,
        error: 'Twitter integration not yet implemented'
      };
    } catch (error) {
      console.error('Twitter publish error:', error);
      return {
        platform: 'twitter',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Test all social media connections
   */
  async testConnections(): Promise<{ platform: string; connected: boolean; error?: string }[]> {
    const results: { platform: string; connected: boolean; error?: string }[] = [];

    // Test Facebook
    if (this.config.facebook) {
      try {
        const response = await fetch(
          `https://graph.facebook.com/v18.0/me?access_token=${this.config.facebook.accessToken}`
        );
        results.push({
          platform: 'facebook',
          connected: response.ok
        });
      } catch (error) {
        results.push({
          platform: 'facebook',
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Test Instagram
    if (this.config.instagram) {
      try {
        const response = await fetch(
          `https://graph.facebook.com/v18.0/${this.config.instagram.accountId}?fields=id,username&access_token=${this.config.instagram.accessToken}`
        );
        results.push({
          platform: 'instagram',
          connected: response.ok
        });
      } catch (error) {
        results.push({
          platform: 'instagram',
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Test LinkedIn
    if (this.config.linkedin) {
      try {
        const response = await fetch('https://api.linkedin.com/v2/me', {
          headers: {
            'Authorization': `Bearer ${this.config.linkedin.accessToken}`
          }
        });
        results.push({
          platform: 'linkedin',
          connected: response.ok
        });
      } catch (error) {
        results.push({
          platform: 'linkedin',
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }
}

/**
 * Create social media publisher from environment variables
 */
export function createSocialMediaPublisher(): SocialMediaPublisher {
  const config: SocialMediaConfig = {};

  if (process.env.FACEBOOK_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ID) {
    config.facebook = {
      accessToken: process.env.FACEBOOK_ACCESS_TOKEN,
      pageId: process.env.FACEBOOK_PAGE_ID
    };
  }

  if (process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_ACCOUNT_ID) {
    config.instagram = {
      accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
      accountId: process.env.INSTAGRAM_ACCOUNT_ID
    };
  }

  if (process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_ORG_ID) {
    config.linkedin = {
      accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
      organizationId: process.env.LINKEDIN_ORG_ID
    };
  }

  if (
    process.env.TWITTER_API_KEY &&
    process.env.TWITTER_API_SECRET &&
    process.env.TWITTER_ACCESS_TOKEN &&
    process.env.TWITTER_ACCESS_SECRET
  ) {
    config.twitter = {
      apiKey: process.env.TWITTER_API_KEY,
      apiSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET
    };
  }

  return new SocialMediaPublisher(config);
}
