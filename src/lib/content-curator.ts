import Parser from 'rss-parser';
import { htmlToText } from 'html-to-text';

export interface RSSArticle {
  title: string;
  link: string;
  pubDate: Date;
  content: string;
  contentSnippet: string;
  source: string;
  author?: string;
  categories?: string[];
}

// Trusted news sources covering cybersecurity, IT, and business technology.
// Organized by category for diverse topic selection.
export const DEFAULT_SOURCES = [
  // Cybersecurity
  {
    name: 'Bleeping Computer',
    url: 'https://www.bleepingcomputer.com',
    rssFeedUrl: 'https://www.bleepingcomputer.com/feed/',
    category: 'Cybersecurity News'
  },
  {
    name: 'The Hacker News',
    url: 'https://thehackernews.com',
    rssFeedUrl: 'https://feeds.feedburner.com/TheHackersNews',
    category: 'Cybersecurity News'
  },
  {
    name: 'Krebs on Security',
    url: 'https://krebsonsecurity.com',
    rssFeedUrl: 'https://krebsonsecurity.com/feed/',
    category: 'Cybersecurity News'
  }
];

export class ContentCurator {
  private parser: Parser;

  constructor() {
    this.parser = new Parser({
      timeout: 8000,
      headers: {
        'User-Agent': 'Triple Cities Tech Blog Aggregator/1.0',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      }
    });
  }

  /**
   * Fetch articles from a single RSS feed
   */
  async fetchFromSource(source: typeof DEFAULT_SOURCES[0]): Promise<RSSArticle[]> {
    try {
      console.log(`Fetching RSS feed from ${source.name}...`);
      const feed = await this.parser.parseURL(source.rssFeedUrl);

      const articles: RSSArticle[] = feed.items.map(item => ({
        title: item.title || 'Untitled',
        link: item.link || source.url,
        pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
        content: this.cleanContent(item.content || item['content:encoded'] || ''),
        contentSnippet: item.contentSnippet || this.cleanContent(item.content || '').substring(0, 300),
        source: source.name,
        author: item.creator || item.author || source.name,
        categories: item.categories || [source.category]
      }));

      console.log(`Fetched ${articles.length} articles from ${source.name}`);
      return articles;
    } catch (error) {
      console.error(`Error fetching from ${source.name}:`, error);
      return [];
    }
  }

  /**
   * Fetch articles from all active sources
   */
  async fetchAllSources(sources = DEFAULT_SOURCES): Promise<RSSArticle[]> {
    const promises = sources.map(source => this.fetchFromSource(source));
    const results = await Promise.allSettled(promises);

    const allArticles = results
      .filter(result => result.status === 'fulfilled')
      .flatMap(result => (result as PromiseFulfilledResult<RSSArticle[]>).value);

    // Sort by publication date (newest first)
    allArticles.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

    return allArticles;
  }

  /**
   * Fetch recent articles (last N days)
   */
  async fetchRecentArticles(daysBack: number = 7): Promise<RSSArticle[]> {
    const allArticles = await this.fetchAllSources();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    return allArticles.filter(article => article.pubDate >= cutoffDate);
  }

  /**
   * Find trending topics by analyzing article titles and content
   */
  async identifyTrendingTopics(daysBack: number = 3): Promise<TrendingTopic[]> {
    const articles = await this.fetchRecentArticles(daysBack);
    return this.analyzeTrendingTopics(articles);
  }

  /**
   * Analyze trending topics from a pre-fetched set of articles (no network calls)
   */
  private analyzeTrendingTopics(articles: RSSArticle[]): TrendingTopic[] {
    // Extract keywords from titles and content
    const keywordFrequency = new Map<string, number>();
    const articlesByKeyword = new Map<string, RSSArticle[]>();

    // Broader keyword list covering IT, security, productivity, and business tech
    const trackKeywords = [
      // Cybersecurity
      'ransomware', 'phishing', 'malware', 'breach', 'vulnerability',
      'zero-day', 'exploit', 'hack', 'attack', 'security',
      // Microsoft & Cloud
      'microsoft', 'windows', 'azure', 'office 365', 'm365',
      'teams', 'sharepoint', 'copilot', 'onedrive',
      // Infrastructure
      'backup', 'disaster recovery', 'mfa', 'authentication',
      'firewall', 'vpn', 'endpoint', 'patch', 'update',
      // Business & Compliance
      'gdpr', 'compliance', 'data protection', 'encryption',
      'hipaa', 'pci', 'audit', 'regulation',
      // Productivity & Operations
      'remote work', 'hybrid', 'automation', 'ai', 'artificial intelligence',
      'productivity', 'collaboration', 'cloud migration', 'saas',
      // Industry
      'small business', 'smb', 'healthcare', 'construction', 'manufacturing'
    ];

    articles.forEach(article => {
      const text = `${article.title} ${article.contentSnippet}`.toLowerCase();

      trackKeywords.forEach(keyword => {
        if (text.includes(keyword)) {
          keywordFrequency.set(keyword, (keywordFrequency.get(keyword) || 0) + 1);

          if (!articlesByKeyword.has(keyword)) {
            articlesByKeyword.set(keyword, []);
          }
          articlesByKeyword.get(keyword)!.push(article);
        }
      });
    });

    // Convert to trending topics array
    const trendingTopics: TrendingTopic[] = Array.from(keywordFrequency.entries())
      .filter(([, count]) => count >= 2) // Lowered threshold for broader coverage
      .map(([keyword, count]) => ({
        keyword,
        frequency: count,
        articles: articlesByKeyword.get(keyword)!.slice(0, 5),
        relevanceScore: this.calculateRelevanceScore(keyword, count, articles.length)
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    return trendingTopics.slice(0, 10);
  }

  /**
   * Select best articles for blog content generation.
   * Uses diversity-aware selection to avoid always picking the same trending topic.
   */
  async selectArticlesForBlog(options: {
    maxArticles?: number;
    daysBack?: number;
    preferTrending?: boolean;
  } = {}): Promise<{ articles: RSSArticle[]; trendingTopics: TrendingTopic[] }> {
    const { maxArticles = 5, daysBack = 5, preferTrending = true } = options;

    // Fetch all articles once
    const allArticles = await this.fetchRecentArticles(daysBack);

    // Analyze trending topics
    let trendingTopics: TrendingTopic[] = [];
    if (preferTrending) {
      trendingTopics = this.analyzeTrendingTopics(allArticles);
    }

    let selectedArticles: RSSArticle[] = [];

    if (preferTrending && trendingTopics.length > 0) {
      // Pick from top 3 trending topics randomly for diversity (not always #1)
      const topTopics = trendingTopics.slice(0, Math.min(3, trendingTopics.length));
      const selectedTopic = topTopics[Math.floor(Math.random() * topTopics.length)];
      selectedArticles = selectedTopic.articles.slice(0, maxArticles);

      console.log(`Selected ${selectedArticles.length} articles about: ${selectedTopic.keyword} (from ${topTopics.length} top topics)`);
    } else {
      // Select most recent high-quality articles
      selectedArticles = allArticles
        .filter(article => this.isHighQuality(article))
        .slice(0, maxArticles);

      console.log(`Selected ${selectedArticles.length} recent articles`);
    }

    return { articles: selectedArticles, trendingTopics };
  }

  /**
   * Clean HTML content and extract plain text
   */
  private cleanContent(html: string): string {
    if (!html) return '';

    const text = htmlToText(html, {
      wordwrap: false,
      selectors: [
        { selector: 'a', options: { ignoreHref: true } },
        { selector: 'img', format: 'skip' }
      ]
    });

    // Remove excessive whitespace
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Check if article is high quality
   */
  private isHighQuality(article: RSSArticle): boolean {
    if (article.contentSnippet.length < 100) return false;

    const daysOld = (Date.now() - article.pubDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld > 7) return false;

    const lowQualityIndicators = ['sponsored', 'advertisement', 'press release'];
    const text = `${article.title} ${article.contentSnippet}`.toLowerCase();
    if (lowQualityIndicators.some(indicator => text.includes(indicator))) {
      return false;
    }

    return true;
  }

  /**
   * Calculate relevance score for a topic
   */
  private calculateRelevanceScore(keyword: string, frequency: number, totalArticles: number): number {
    let score = frequency;

    // Boost for SMB-relevant topics
    const smbRelevantKeywords = [
      'small business', 'smb', 'microsoft', 'office 365', 'm365',
      'backup', 'ransomware', 'phishing', 'mfa', 'compliance',
      'remote work', 'ai', 'productivity', 'teams', 'copilot'
    ];

    if (smbRelevantKeywords.some(k => keyword.includes(k))) {
      score *= 1.5;
    }

    // Normalize by total articles
    score = (score / totalArticles) * 100;

    return Math.round(score * 100) / 100;
  }
}

export interface TrendingTopic {
  keyword: string;
  frequency: number;
  articles: RSSArticle[];
  relevanceScore: number;
}

// Singleton instance
export const contentCurator = new ContentCurator();
