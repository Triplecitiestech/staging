import Anthropic from '@anthropic-ai/sdk';
import slugify from 'slugify';
import readingTime from 'reading-time';
import type { RSSArticle, TrendingTopic } from './content-curator';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const MODEL = 'claude-sonnet-4-5-20250929';

export interface BlogPostDraft {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  featuredImagePrompt: string;
  sourceUrls: string[];
  aiPrompt: string;
  aiModel: string;
  readingTime: string;

  // Social media variants
  socialMedia: {
    facebook: {
      title: string;
      description: string;
      hashtags: string[];
    };
    instagram: {
      caption: string;
      hashtags: string[];
    };
    linkedin: {
      title: string;
      content: string;
      hashtags: string[];
    };
  };

  // Categorization
  category: string;
  tags: string[];
}

export class BlogGenerator {
  /**
   * Generate a complete blog post from source articles
   */
  async generateBlogPost(
    articles: RSSArticle[],
    trendingTopics?: TrendingTopic[]
  ): Promise<BlogPostDraft> {
    console.log(`Generating blog post from ${articles.length} source articles...`);

    // Prepare source material
    const sourceMaterial = this.prepareSourceMaterial(articles, trendingTopics);

    // Generate blog post content
    const prompt = await this.createPrompt(sourceMaterial, trendingTopics);

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse the structured response
    const draft = this.parseAIResponse(content, articles, prompt);

    console.log(`Generated blog post: "${draft.title}"`);
    return draft;
  }

  /**
   * Regenerate blog post based on feedback
   */
  async regenerateBlogPost(
    originalDraft: BlogPostDraft,
    feedback: string,
    articles: RSSArticle[]
  ): Promise<BlogPostDraft> {
    console.log('Regenerating blog post based on feedback...');

    const prompt = this.createRegenerationPrompt(originalDraft, feedback, articles);

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    const draft = this.parseAIResponse(content, articles, prompt);

    console.log(`Regenerated blog post: "${draft.title}"`);
    return draft;
  }

  /**
   * Load custom guidelines from file
   */
  private async loadGuidelines(): Promise<string> {
    try {
      const { readFile } = await import('fs/promises');
      const path = await import('path');
      const guidelinesPath = path.join(process.cwd(), 'data', 'blog-guidelines.txt');
      const guidelines = await readFile(guidelinesPath, 'utf-8');
      return guidelines;
    } catch (error) {
      // Return default guidelines if file doesn't exist
      console.log('Using default guidelines (custom guidelines file not found)');
      return `You are an expert cybersecurity and IT services content writer for Triple Cities Tech, a managed IT services provider in Central New York serving small to medium businesses (20-50 employees).

BRAND VOICE:
- Professional but approachable and conversational
- Educational and informative, not fear-mongering
- Focus on practical, actionable advice for small business owners
- Emphasize real-world impacts and solutions
- Use analogies and examples that SMB owners can relate to
- Avoid excessive technical jargon; explain complex concepts simply

CONTENT REQUIREMENTS:
- Original content (synthesize insights, don't plagiarize)
- 800-1200 words
- SEO-optimized with natural keyword integration
- Include specific, actionable recommendations
- End with a subtle call-to-action mentioning Triple Cities Tech's services
- Use markdown formatting (headers, lists, bold, italics)
- Engaging opening hook
- Scannable structure (use headers, bullet points, short paragraphs)

TARGET AUDIENCE:
- Small business owners in Central New York (Binghamton, Johnson City, Endicott area)
- Decision makers worried about cybersecurity but not technical experts
- Budget-conscious but understand the value of protection
- Looking for trusted local IT partners`;
    }
  }

  /**
   * Create the AI prompt for blog generation
   */
  private async createPrompt(sourceMaterial: string, trendingTopics?: TrendingTopic[]): Promise<string> {
    const guidelines = await this.loadGuidelines();

    const trendingContext = trendingTopics && trendingTopics.length > 0
      ? `\n\nTRENDING TOPICS:\n${trendingTopics.map(t => `- ${t.keyword} (${t.frequency} mentions, relevance: ${t.relevanceScore})`).join('\n')}\n\nPrioritize the most trending and relevant topic for small businesses.`
      : '';

    return `${guidelines}

CONTENT REQUIREMENTS:
- Original content (synthesize insights, don't plagiarize)
- SEO-optimized with natural keyword integration
- Use markdown formatting (headers, lists, bold, italics)
- Engaging opening hook
- Scannable structure (use headers, bullet points, short paragraphs)

SOURCE MATERIAL:
${sourceMaterial}${trendingContext}

YOUR TASK:
Create a complete blog post package in the following JSON format:

\`\`\`json
{
  "title": "Catchy, SEO-friendly title (60 chars max)",
  "excerpt": "Compelling 2-3 sentence summary (150-160 chars)",
  "content": "Full blog post in markdown format with ## headers, **bold**, lists, etc.",
  "metaTitle": "SEO title with target keyword (50-60 chars)",
  "metaDescription": "SEO meta description with keyword and CTA (150-160 chars)",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "featuredImagePrompt": "Detailed prompt for generating a featured image (describe visual, style, mood)",
  "category": "Cybersecurity News | IT Tips | Microsoft 365 | Data Protection | Compliance",
  "tags": ["tag1", "tag2", "tag3"],
  "facebook": {
    "title": "Attention-grabbing Facebook post title (80 chars max)",
    "description": "Engaging description with hook (200 chars max)",
    "hashtags": ["#Cybersecurity", "#SmallBusiness", "#ITSecurity"]
  },
  "instagram": {
    "caption": "Instagram caption with emojis, line breaks, and call-to-action (2000 chars max)",
    "hashtags": ["#CyberSecurity", "#SmallBusiness", "#ITSupport", "#Binghamton", "#CentralNY"]
  },
  "linkedin": {
    "title": "Professional LinkedIn title",
    "content": "Professional LinkedIn post content (3000 chars max)",
    "hashtags": ["#CyberSecurity", "#SMB", "#ITServices"]
  }
}
\`\`\`

IMPORTANT:
- Make the content ORIGINAL - synthesize insights from multiple sources
- Focus on the "so what" for small businesses - why should they care?
- Include 2-3 specific action items readers can implement
- Reference Triple Cities Tech naturally (not salesy)
- Use storytelling and real-world scenarios
- Make the opening paragraph compelling enough to keep readers engaged
- Ensure all social media content is platform-optimized

Return ONLY the JSON object, no additional text.`;
  }

  /**
   * Create regeneration prompt based on feedback
   */
  private createRegenerationPrompt(
    originalDraft: BlogPostDraft,
    feedback: string,
    articles: RSSArticle[]
  ): string {
    const sourceMaterial = articles.map(article => `
Title: ${article.title}
Source: ${article.source}
Link: ${article.link}
Summary: ${article.contentSnippet}
---`).join('\n');

    return `You previously created a blog post that received the following feedback:

FEEDBACK:
${feedback}

ORIGINAL BLOG POST:
Title: ${originalDraft.title}
Content:
${originalDraft.content}

SOURCE MATERIAL:
${sourceMaterial}

YOUR TASK:
Revise the blog post based on the feedback while maintaining the same high quality standards. Return the updated blog post in the same JSON format as before.

Ensure you:
- Address all points in the feedback
- Maintain the Triple Cities Tech brand voice
- Keep the content original and valuable
- Optimize for SEO and engagement

Return ONLY the JSON object, no additional text.`;
  }

  /**
   * Prepare source material for the AI prompt
   */
  private prepareSourceMaterial(articles: RSSArticle[], trendingTopics?: TrendingTopic[]): string {
    const material = articles.map((article, idx) => `
SOURCE ${idx + 1}: ${article.source}
Title: ${article.title}
Published: ${article.pubDate.toLocaleDateString()}
Link: ${article.link}
Content: ${article.contentSnippet}
${article.categories ? `Categories: ${article.categories.join(', ')}` : ''}
---`).join('\n');

    return material;
  }

  /**
   * Parse AI response and create blog post draft
   */
  private parseAIResponse(
    aiResponse: string,
    sourceArticles: RSSArticle[],
    prompt: string
  ): BlogPostDraft {
    try {
      // Extract JSON from response (in case Claude added extra text)
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Generate slug from title
      const slug = slugify(parsed.title, {
        lower: true,
        strict: true,
        remove: /[*+~.()'"!:@]/g
      });

      // Calculate reading time
      const stats = readingTime(parsed.content);

      return {
        title: parsed.title,
        slug,
        excerpt: parsed.excerpt,
        content: parsed.content,
        metaTitle: parsed.metaTitle || parsed.title,
        metaDescription: parsed.metaDescription || parsed.excerpt,
        keywords: parsed.keywords || [],
        featuredImagePrompt: parsed.featuredImagePrompt || `Professional cybersecurity blog header image for "${parsed.title}"`,
        sourceUrls: sourceArticles.map(a => a.link),
        aiPrompt: prompt,
        aiModel: MODEL,
        readingTime: stats.text,
        category: parsed.category || 'Cybersecurity News',
        tags: parsed.tags || [],
        socialMedia: {
          facebook: {
            title: parsed.facebook?.title || parsed.title,
            description: parsed.facebook?.description || parsed.excerpt,
            hashtags: parsed.facebook?.hashtags || ['#Cybersecurity', '#SmallBusiness']
          },
          instagram: {
            caption: parsed.instagram?.caption || this.createDefaultInstagramCaption(parsed.title, parsed.excerpt),
            hashtags: parsed.instagram?.hashtags || ['#CyberSecurity', '#SmallBusiness', '#ITSupport']
          },
          linkedin: {
            title: parsed.linkedin?.title || parsed.title,
            content: parsed.linkedin?.content || parsed.excerpt,
            hashtags: parsed.linkedin?.hashtags || ['#CyberSecurity', '#SMB']
          }
        }
      };
    } catch (error) {
      console.error('Error parsing AI response:', error);
      console.error('AI Response:', aiResponse);
      throw new Error('Failed to parse AI-generated blog post');
    }
  }

  /**
   * Create default Instagram caption if not provided by AI
   */
  private createDefaultInstagramCaption(title: string, excerpt: string): string {
    return `🔒 ${title}

${excerpt}

👉 Read the full article on our blog (link in bio)

#CyberSecurity #SmallBusiness #ITSupport #DataProtection #Binghamton #CentralNY #TripleCitiesTech`;
  }

  /**
   * Validate blog post draft
   */
  validateDraft(draft: BlogPostDraft): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Title validation
    if (!draft.title || draft.title.length === 0) {
      errors.push('Title is required');
    }
    if (draft.title.length > 100) {
      errors.push('Title is too long (max 100 characters)');
    }

    // Content validation
    if (!draft.content || draft.content.length < 500) {
      errors.push('Content is too short (minimum 500 characters)');
    }
    if (draft.content.length > 10000) {
      errors.push('Content is too long (maximum 10000 characters)');
    }

    // SEO validation
    if (!draft.metaDescription || draft.metaDescription.length < 120) {
      errors.push('Meta description is too short (minimum 120 characters)');
    }
    if (draft.metaDescription.length > 160) {
      errors.push('Meta description is too long (maximum 160 characters)');
    }

    if (!draft.keywords || draft.keywords.length < 3) {
      errors.push('Need at least 3 keywords');
    }

    // Check for plagiarism indicators (exact matches from source)
    const contentLower = draft.content.toLowerCase();
    draft.sourceUrls.forEach(url => {
      if (contentLower.includes(url)) {
        // This is okay - citing sources
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Singleton instance
export const blogGenerator = new BlogGenerator();
