/**
 * Campaign Content Generator
 *
 * Uses Claude API to generate blog/article content for communication campaigns.
 * Builds on the existing blog generation system but with campaign-specific prompts.
 */

import Anthropic from '@anthropic-ai/sdk';
import slugify from 'slugify';
import { trackAnthropicCall } from '@/lib/api-usage-tracker';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const MODEL = 'claude-sonnet-4-6';

export interface CampaignContentDraft {
  title: string;
  slug: string;
  excerpt: string;
  content: string; // Markdown
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  emailSubject: string;
  emailPreviewText: string;
  category: string;
  tags: string[];
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  CYBERSECURITY_ALERT: 'Cybersecurity Alert',
  SERVICE_UPDATE: 'Service Update',
  MAINTENANCE_NOTICE: 'Maintenance Notice',
  VENDOR_NOTICE: 'Vendor / Software Notice',
  BEST_PRACTICE: 'Best Practice / Educational Article',
  COMPANY_ANNOUNCEMENT: 'Company Announcement',
  GENERAL_COMMUNICATION: 'General Customer Communication',
};

const CONTENT_TYPE_TONES: Record<string, string> = {
  CYBERSECURITY_ALERT: 'urgent but calm, emphasizing practical steps customers should take immediately',
  SERVICE_UPDATE: 'informative and positive, highlighting improvements and benefits',
  MAINTENANCE_NOTICE: 'clear and practical, providing exact timelines and impact details',
  VENDOR_NOTICE: 'educational, explaining what changed and how it affects the customer',
  BEST_PRACTICE: 'friendly and educational, with actionable tips they can implement',
  COMPANY_ANNOUNCEMENT: 'professional and warm, building trust and relationship',
  GENERAL_COMMUNICATION: 'professional but approachable, clear and concise',
};

export async function generateCampaignContent(
  contentType: string,
  topic: string,
  audienceName: string,
): Promise<CampaignContentDraft> {
  const typeLabel = CONTENT_TYPE_LABELS[contentType] || 'Customer Communication';
  const tone = CONTENT_TYPE_TONES[contentType] || CONTENT_TYPE_TONES.GENERAL_COMMUNICATION;

  // Load custom guidelines if available
  let guidelines = '';
  try {
    const { prisma } = await import('@/lib/prisma');
    const setting = await prisma.blogSettings.findUnique({
      where: { key: 'ai_guidelines' },
    });
    if (setting?.value) {
      guidelines = setting.value;
    }
  } catch {
    // Use defaults if DB unavailable
  }

  const baseGuidelines = guidelines || `You are an expert IT services content writer for Triple Cities Tech, a managed IT services provider in Central New York serving small to medium businesses (20-50 employees).

BRAND VOICE:
- Professional but approachable and conversational
- Educational and informative, not fear-mongering
- Focus on practical, actionable advice for small business owners
- Emphasize real-world impacts and solutions
- Use analogies and examples that SMB owners can relate to
- Avoid excessive technical jargon; explain complex concepts simply`;

  const prompt = `${baseGuidelines}

COMMUNICATION TYPE: ${typeLabel}
TARGET AUDIENCE: ${audienceName}
TONE: ${tone}

TOPIC/PROMPT FROM STAFF:
${topic}

YOUR TASK:
Create a customer communication article that will be:
1. Published as a blog/news post on the Triple Cities Tech website
2. Sent as an email notification to the target audience with a link to the full post

Generate the content in the following JSON format:

\`\`\`json
{
  "title": "Clear, descriptive title (60 chars max)",
  "excerpt": "Compelling 2-3 sentence summary (150-160 chars)",
  "content": "Full article in markdown (600-1200 words). Use ## headers, **bold**, lists. Include actionable takeaways.",
  "metaTitle": "SEO title with target keyword (50-60 chars)",
  "metaDescription": "SEO meta description (150-160 chars)",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "emailSubject": "Email subject line that drives opens (50-70 chars)",
  "emailPreviewText": "Email preview/preheader text (90-130 chars)",
  "category": "One of: Cybersecurity News, IT Tips, Microsoft 365, Data Protection, Compliance, Company News, Service Updates",
  "tags": ["tag1", "tag2", "tag3"]
}
\`\`\`

REQUIREMENTS:
- Content must be original and valuable to the reader
- Include 2-3 specific, actionable recommendations
- Reference Triple Cities Tech naturally (not salesy)
- Email subject should create urgency/relevance without being clickbait
- The excerpt should work as the email body intro
- Content should be scannable with headers, bullets, and short paragraphs

Return ONLY the JSON object, no additional text.`;

  const response = await trackAnthropicCall('campaign-generation', MODEL, () =>
    anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    })
  );

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Parse JSON response
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr.trim());
  } catch {
    throw new Error(`Failed to parse AI response as JSON. Raw response: ${text.substring(0, 500)}`);
  }

  const title = (parsed.title as string) || topic;
  const slug = slugify(title, { lower: true, strict: true }).substring(0, 100);

  return {
    title,
    slug,
    excerpt: (parsed.excerpt as string) || '',
    content: (parsed.content as string) || '',
    metaTitle: (parsed.metaTitle as string) || title,
    metaDescription: (parsed.metaDescription as string) || (parsed.excerpt as string) || '',
    keywords: (parsed.keywords as string[]) || [],
    emailSubject: (parsed.emailSubject as string) || `${typeLabel}: ${title}`,
    emailPreviewText: (parsed.emailPreviewText as string) || (parsed.excerpt as string) || '',
    category: (parsed.category as string) || 'Company News',
    tags: (parsed.tags as string[]) || [],
  };
}
