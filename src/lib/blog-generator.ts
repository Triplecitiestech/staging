import Anthropic from '@anthropic-ai/sdk';
import slugify from 'slugify';
import readingTime from 'reading-time';
import type { RSSArticle, TrendingTopic } from './content-curator';
import { trackAnthropicCall } from './api-usage-tracker';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const MODEL = 'claude-sonnet-4-6';

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

/**
 * Topic categories for diverse blog content.
 * Each category has example topics and a writing angle.
 */
const TOPIC_CATEGORIES = [
  {
    name: 'Cybersecurity News',
    weight: 2,
    angles: ['breaking threat analysis', 'what SMBs should do now', 'lessons from recent breaches']
  },
  {
    name: 'IT Tips & Productivity',
    weight: 2,
    angles: ['hidden features in everyday tools', 'workflow automation ideas', 'time-saving tech tips']
  },
  {
    name: 'Business Continuity',
    weight: 1,
    angles: ['disaster recovery planning', 'backup strategies', 'real-world outage stories']
  },
  {
    name: 'Compliance & Regulations',
    weight: 1,
    angles: ['new regulations for SMBs', 'audit preparation', 'industry-specific compliance']
  },
  {
    name: 'Remote Work & Hybrid',
    weight: 1,
    angles: ['secure remote work setups', 'collaboration tools', 'managing remote IT']
  },
  {
    name: 'Employee Security Awareness',
    weight: 1,
    angles: ['training your team', 'common mistakes', 'building a security culture']
  },
  {
    name: 'Cloud & Microsoft 365',
    weight: 2,
    angles: ['migration tips', 'M365 features you\'re not using', 'cloud cost management']
  },
  {
    name: 'Industry Spotlight',
    weight: 1,
    angles: ['construction IT challenges', 'healthcare compliance', 'professional services tech', 'nonprofit IT strategies']
  },
  {
    name: 'Operational Efficiency',
    weight: 1,
    angles: ['automating repetitive tasks', 'IT budgeting for SMBs', 'vendor management']
  },
  {
    name: 'Onboarding & Offboarding',
    weight: 1,
    angles: ['secure employee onboarding', 'offboarding checklists', 'access management']
  }
];

/**
 * Writing style variations to avoid repetitive structures.
 */
const WRITING_STYLES = [
  { style: 'narrative', instruction: 'Tell a story. Open with a realistic scenario of a small business owner facing a challenge, then guide them to the solution. Use "you" language.' },
  { style: 'listicle', instruction: 'Write as a numbered list article (e.g., "7 Ways to..."). Each point should be actionable and self-contained. Use bold headers for each point.' },
  { style: 'myth-busting', instruction: 'Frame the post around common misconceptions. Use a "Myth vs. Reality" structure. Challenge assumptions the reader might hold.' },
  { style: 'how-to-guide', instruction: 'Write as a step-by-step guide. Use numbered steps with clear instructions. Include a "What you\'ll need" section and expected outcomes.' },
  { style: 'interview-style', instruction: 'Write as if answering questions from a business owner. Use a Q&A format with practical, direct answers. Conversational tone.' },
  { style: 'case-study', instruction: 'Build the post around a hypothetical (but realistic) case study. Describe the problem, the approach, and the outcome. Use specific but fictional details.' },
  { style: 'comparison', instruction: 'Compare two or more approaches, tools, or strategies. Use a balanced analysis with pros and cons. Help the reader decide which is right for them.' },
  { style: 'deep-dive', instruction: 'Take a single concept and explain it thoroughly. Break down technical concepts with analogies. Written for a curious non-technical audience.' }
];

/**
 * Opening hook variations to avoid repetitive starts.
 */
const OPENING_HOOKS = [
  'Start with a surprising statistic or fact that challenges assumptions.',
  'Open with a brief real-world incident or news event that happened recently.',
  'Begin with a direct question that the reader is likely asking themselves.',
  'Start with a bold, slightly provocative statement about the topic.',
  'Open with a relatable "day in the life" moment that connects to the topic.',
  'Begin with a brief analogy from everyday life that illustrates the concept.',
  'Start with "Here\'s what most people get wrong about..." framing.',
  'Open by painting a picture of what success looks like after implementing the advice.'
];

export class BlogGenerator {
  /**
   * Generate a complete blog post from source articles
   */
  async generateBlogPost(
    articles: RSSArticle[],
    trendingTopics?: TrendingTopic[],
    recentTitles?: string[]
  ): Promise<BlogPostDraft> {
    console.log(`Generating blog post from ${articles.length} source articles...`);

    // Prepare source material
    const sourceMaterial = this.prepareSourceMaterial(articles, trendingTopics);

    // Select random writing style and opening hook for variety
    const writingStyle = WRITING_STYLES[Math.floor(Math.random() * WRITING_STYLES.length)];
    const openingHook = OPENING_HOOKS[Math.floor(Math.random() * OPENING_HOOKS.length)];

    // Select a topic category (weighted random)
    const topicCategory = this.selectTopicCategory(trendingTopics);

    // Generate blog post content
    const prompt = await this.createPrompt(sourceMaterial, trendingTopics, writingStyle, openingHook, topicCategory, recentTitles);

    const response = await trackAnthropicCall('blog-generation', MODEL, () =>
      anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        temperature: 0.8,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    );

    const content = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse the structured response
    const draft = this.parseAIResponse(content, articles, prompt);

    console.log(`Generated blog post: "${draft.title}" [${writingStyle.style}]`);
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

    const response = await trackAnthropicCall('blog-regeneration', MODEL, () =>
      anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        temperature: 0.8,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    );

    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    const draft = this.parseAIResponse(content, articles, prompt);

    console.log(`Regenerated blog post: "${draft.title}"`);
    return draft;
  }

  /**
   * Select a topic category using weighted random selection
   */
  private selectTopicCategory(trendingTopics?: TrendingTopic[]): typeof TOPIC_CATEGORIES[0] {
    // If there's a strong trending topic, bias toward Cybersecurity News
    if (trendingTopics && trendingTopics.length > 0 && trendingTopics[0].relevanceScore > 10) {
      // 50% chance to go with cybersecurity, 50% chance to pick another category for variety
      if (Math.random() < 0.5) {
        return TOPIC_CATEGORIES[0]; // Cybersecurity News
      }
    }

    const totalWeight = TOPIC_CATEGORIES.reduce((sum, cat) => sum + cat.weight, 0);
    let random = Math.random() * totalWeight;

    for (const category of TOPIC_CATEGORIES) {
      random -= category.weight;
      if (random <= 0) return category;
    }

    return TOPIC_CATEGORIES[0];
  }

  /**
   * Load custom guidelines from database
   */
  private async loadGuidelines(): Promise<string> {
    try {
      const { prisma } = await import('@/lib/prisma');
      const setting = await prisma.blogSettings.findUnique({
        where: { key: 'ai_guidelines' }
      });

      if (setting?.value) {
        return setting.value;
      }

      console.log('Using default guidelines (custom guidelines not found in database)');
      return this.getDefaultGuidelines();
    } catch (error) {
      console.error('Error loading guidelines from database:', error);
      return this.getDefaultGuidelines();
    }
  }

  private getDefaultGuidelines(): string {
    return `You are an expert IT services and technology content writer for Triple Cities Tech, a managed IT services provider in Central New York serving small to medium businesses (20-200 employees).

BRAND VOICE:
- Professional but conversational, like a knowledgeable friend who happens to be an IT expert
- Educational and empowering, never fear-mongering or condescending
- Focus on practical, actionable advice that a non-technical business owner can implement
- Use real-world analogies and concrete examples that resonate with SMB decision-makers
- Occasionally use humor or cultural references when appropriate
- Avoid jargon without explanation; when you must use a technical term, briefly define it

TARGET AUDIENCE:
- Small and mid-sized business owners/managers in Central New York (Binghamton, Johnson City, Endicott, and surrounding Triple Cities area)
- Decision makers who care about security and efficiency but are not technical experts
- Budget-conscious leaders who need to understand ROI of IT investments
- Industries: construction, healthcare, professional services, nonprofits, manufacturing, legal, accounting`;
  }

  /**
   * Fetch recent blog post titles to avoid repetition
   */
  private async getRecentTitles(): Promise<string[]> {
    try {
      const { prisma } = await import('@/lib/prisma');
      const recentPosts = await prisma.blogPost.findMany({
        where: {
          status: { in: ['PUBLISHED', 'APPROVED', 'PENDING_APPROVAL'] }
        },
        select: { title: true, keywords: true },
        orderBy: { createdAt: 'desc' },
        take: 15
      });

      return recentPosts.map(p => p.title);
    } catch {
      return [];
    }
  }

  /**
   * Create the AI prompt for blog generation
   */
  private async createPrompt(
    sourceMaterial: string,
    trendingTopics: TrendingTopic[] | undefined,
    writingStyle: typeof WRITING_STYLES[0],
    openingHook: string,
    topicCategory: typeof TOPIC_CATEGORIES[0],
    recentTitles?: string[]
  ): Promise<string> {
    const guidelines = await this.loadGuidelines();
    const fetchedRecentTitles = recentTitles || await this.getRecentTitles();

    const trendingContext = trendingTopics && trendingTopics.length > 0
      ? `\n\nTRENDING TOPICS (use as inspiration, not as the only topic):\n${trendingTopics.slice(0, 3).map(t => `- ${t.keyword} (${t.frequency} mentions)`).join('\n')}`
      : '';

    const recentTitlesContext = fetchedRecentTitles.length > 0
      ? `\n\nRECENT POSTS (DO NOT write about the same topics — be different):\n${fetchedRecentTitles.map(t => `- ${t}`).join('\n')}`
      : '';

    const angleChoice = topicCategory.angles[Math.floor(Math.random() * topicCategory.angles.length)];

    return `${guidelines}

CONTENT CATEGORY: ${topicCategory.name}
ANGLE: ${angleChoice}

WRITING STYLE: ${writingStyle.style.toUpperCase()}
${writingStyle.instruction}

OPENING HOOK APPROACH:
${openingHook}

CONTENT REQUIREMENTS:
- Original content — synthesize insights from sources into something new and valuable
- 900-1400 words
- SEO-optimized with natural keyword integration (never stuff keywords)
- Use markdown formatting: ## headers for main sections, **bold** for emphasis, bullet lists for key points
- Include 2-4 specific, actionable recommendations the reader can implement this week
- End with a natural, non-salesy mention of Triple Cities Tech (varied — don't always use the same CTA format)
- Make the post genuinely useful — a reader should learn something concrete

STRUCTURE REQUIREMENTS:
- Do NOT start with "In today's digital landscape" or "In an increasingly connected world" or similar cliches
- Do NOT use the phrase "cyber threats" or "threat landscape" more than once
- Vary your paragraph lengths — mix short punchy paragraphs with longer explanatory ones
- Use at least one concrete example, analogy, or mini-scenario
- Include at least one surprising fact, statistic, or counterintuitive insight

SOURCE MATERIAL (use as research context, not for direct copying):
${sourceMaterial}${trendingContext}${recentTitlesContext}

YOUR TASK:
Create a blog post in the following JSON format. Include platform-specific social media content — each platform should have DIFFERENT content tailored to its audience and format:

\`\`\`json
{
  "title": "Engaging, specific title (avoid generic phrasing, max 70 chars)",
  "excerpt": "Compelling 2-3 sentence summary that makes the reader want to click (150-160 chars)",
  "content": "Full blog post in markdown (900-1400 words)",
  "metaTitle": "SEO title with primary keyword (50-60 chars)",
  "metaDescription": "SEO meta description with keyword and value proposition (120-155 chars, NEVER exceed 155)",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "featuredImagePrompt": "Descriptive prompt for a professional blog header image",
  "category": "${topicCategory.name}",
  "tags": ["tag1", "tag2", "tag3"],
  "facebook": {
    "title": "Attention-grabbing Facebook headline",
    "description": "Conversational Facebook post text (2-3 sentences, include a question to drive engagement)",
    "hashtags": ["#Hashtag1", "#Hashtag2", "#Hashtag3"]
  },
  "instagram": {
    "caption": "Instagram caption with personality (use line breaks, emojis sparingly, storytelling approach, max 300 chars before hashtags)",
    "hashtags": ["#Hashtag1", "#Hashtag2", "#Hashtag3", "#Hashtag4", "#Hashtag5"]
  },
  "linkedin": {
    "title": "Professional LinkedIn headline",
    "content": "LinkedIn post with professional tone (thought-leadership style, include a key insight or takeaway, 2-4 sentences)",
    "hashtags": ["#Hashtag1", "#Hashtag2", "#Hashtag3"]
  }
}
\`\`\`

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
Revise the blog post based on the feedback while maintaining high quality. Return the updated blog post in the same JSON format as before, including platform-specific social media content.

Ensure you:
- Address all points in the feedback
- Maintain the Triple Cities Tech brand voice
- Keep the content original and valuable
- Optimize for SEO and engagement
- Generate unique social media content for each platform

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
        metaDescription: (parsed.metaDescription || parsed.excerpt || '').length > 160
          ? (parsed.metaDescription || parsed.excerpt || '').substring(0, 157) + '...'
          : (parsed.metaDescription || parsed.excerpt || ''),
        keywords: parsed.keywords || [],
        featuredImagePrompt: parsed.featuredImagePrompt || `Professional blog header image for "${parsed.title}"`,
        sourceUrls: sourceArticles.map(a => a.link),
        aiPrompt: prompt,
        aiModel: MODEL,
        readingTime: stats.text,
        category: parsed.category || 'IT Tips & Productivity',
        tags: parsed.tags || [],
        socialMedia: {
          facebook: {
            title: parsed.facebook?.title || parsed.title,
            description: parsed.facebook?.description || parsed.excerpt,
            hashtags: parsed.facebook?.hashtags || ['#SmallBusiness', '#ITTips']
          },
          instagram: {
            caption: parsed.instagram?.caption || this.createDefaultInstagramCaption(parsed.title, parsed.excerpt),
            hashtags: parsed.instagram?.hashtags || ['#SmallBusiness', '#ITSupport', '#TechTips']
          },
          linkedin: {
            title: parsed.linkedin?.title || parsed.title,
            content: parsed.linkedin?.content || parsed.excerpt,
            hashtags: parsed.linkedin?.hashtags || ['#ITServices', '#SMB']
          }
        }
      };
    } catch (error) {
      console.error('Error parsing AI response:', error);
      console.error('AI Response (first 500 chars):', aiResponse.substring(0, 500));
      throw new Error('Failed to parse AI-generated blog post');
    }
  }

  /**
   * Create default Instagram caption if not provided by AI
   */
  private createDefaultInstagramCaption(title: string, excerpt: string): string {
    return `${title}

${excerpt}

Read the full article on our blog (link in bio)

#SmallBusiness #ITSupport #TechTips #TripleCitiesTech #CentralNY`;
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
    if (draft.content.length > 15000) {
      errors.push('Content is too long (maximum 15000 characters)');
    }

    // SEO validation
    if (!draft.metaDescription || draft.metaDescription.length < 80) {
      errors.push('Meta description is too short (minimum 80 characters)');
    }
    if (draft.metaDescription.length > 160) {
      errors.push('Meta description is too long (maximum 160 characters)');
    }

    if (!draft.keywords || draft.keywords.length < 3) {
      errors.push('Need at least 3 keywords');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Singleton instance
export const blogGenerator = new BlogGenerator();
