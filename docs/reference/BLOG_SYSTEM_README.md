# Automated Blog System - Triple Cities Tech

## Overview

This automated blog system generates cybersecurity and IT-focused blog posts using AI, shares them across multiple social media platforms, and includes an email-based approval workflow.

## Features

- ✅ **AI-Powered Content Generation** - Uses Claude (Anthropic) to create original blog posts
- ✅ **Multi-Source Curation** - Pulls insights from Bleeping Computer, Krebs on Security, Microsoft Security Blog, CISA, and more
- ✅ **Email Approval Workflow** - Sends drafts to kurtis@triplecitiestech.com for review
- ✅ **Social Media Automation** - Auto-posts to Facebook, Instagram, and LinkedIn
- ✅ **SEO Optimized** - Includes meta tags, schema.org markup, and keyword optimization
- ✅ **Scheduled Publishing** - Posts are scheduled for Mon/Wed/Fri at 9 AM EST
- ✅ **Trending Topic Detection** - Prioritizes timely and relevant cybersecurity news

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│               AUTOMATED BLOG WORKFLOW                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Content Curation (Daily 6 AM)                      │
│     ├── Fetch RSS feeds from trusted sources           │
│     └── Identify trending topics                       │
│                                                          │
│  2. Blog Generation (Mon/Wed/Fri 8 AM)                 │
│     ├── Select best articles                           │
│     ├── Generate blog post with Claude AI              │
│     └── Send approval email to Kurtis                  │
│                                                          │
│  3. Approval Process                                    │
│     ├── Email with preview and social media mockups    │
│     ├── Click "Approve" or "Reject"                    │
│     └── Schedule for next publishing slot              │
│                                                          │
│  4. Auto-Publishing (Every 15 min check)               │
│     ├── Publish to www.triplecitiestech.com/blog       │
│     ├── Share to Facebook, Instagram, LinkedIn         │
│     └── Send confirmation email                        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Database Schema

### BlogPost
- **id**: UUID primary key
- **title, slug, excerpt, content**: Post content
- **status**: DRAFT | PENDING_APPROVAL | APPROVED | PUBLISHED | REJECTED | ARCHIVED
- **sourceUrls**: Array of source article URLs
- **aiPrompt, aiModel**: AI generation metadata
- **approvalToken**: Unique token for approval links
- **metaTitle, metaDescription, keywords**: SEO fields
- **facebookPostId, instagramPostId, linkedinPostId**: Social media tracking
- **scheduledFor, publishedAt**: Publishing schedule
- **views, shares**: Analytics

### BlogCategory
- Categories: Cybersecurity News, IT Tips, Microsoft 365, Data Protection, Compliance

### ContentSource
- Trusted sources: Bleeping Computer, Krebs, Microsoft, CISA, etc.
- Tracks last fetch time and active status

### SocialMediaPost
- Stores social media posting results
- Tracks success/failure per platform

## API Endpoints

### Cron Jobs (Protected by BLOG_CRON_SECRET)

#### `POST /api/cron/fetch-content`
**Schedule**: Daily at 6 AM
**Purpose**: Fetch latest articles from RSS feeds
**Returns**: Article count and trending topics

```bash
curl -X POST https://www.triplecitiestech.com/api/cron/fetch-content \
  -H "Authorization: Bearer $BLOG_CRON_SECRET"
```

#### `POST /api/cron/generate-blog`
**Schedule**: Mon/Wed/Fri at 8 AM
**Purpose**: Generate blog post and send for approval
**Returns**: Blog post details and approval token

```bash
curl -X POST https://www.triplecitiestech.com/api/cron/generate-blog \
  -H "Authorization: Bearer $BLOG_CRON_SECRET"
```

#### `POST /api/cron/publish-scheduled`
**Schedule**: Every 15 minutes
**Purpose**: Publish approved posts and share to social media
**Returns**: Publishing results

```bash
curl -X POST https://www.triplecitiestech.com/api/cron/publish-scheduled \
  -H "Authorization: Bearer $BLOG_CRON_SECRET"
```

### Approval Workflow

#### `GET /api/blog/approval/[token]/preview`
Preview blog post in browser before approval

#### `GET /api/blog/approval/[token]/approve`
Approve post and schedule for publishing

#### `GET /api/blog/approval/[token]/reject?reason=...`
Reject post with optional feedback

## Environment Variables

Required variables (add to `.env`):

```env
# AI
ANTHROPIC_API_KEY=sk-ant-...

# Email
RESEND_API_KEY=re_...
APPROVAL_EMAIL=kurtis@triplecitiestech.com

# Blog System
BLOG_CRON_SECRET=<generate with: openssl rand -base64 32>
NEXT_PUBLIC_BASE_URL=https://www.triplecitiestech.com

# Social Media
FACEBOOK_ACCESS_TOKEN=...
FACEBOOK_PAGE_ID=...
INSTAGRAM_ACCESS_TOKEN=...
INSTAGRAM_ACCOUNT_ID=...
LINKEDIN_ACCESS_TOKEN=...
LINKEDIN_ORG_ID=...
```

## Social Media Setup

### Facebook & Instagram

1. Create Facebook Business Page (if not exists)
2. Go to [Facebook Developers](https://developers.facebook.com)
3. Create new app → Business → Connected Experiences
4. Add **Instagram Graph API** and **Facebook Pages API**
5. Get Page Access Token from Graph API Explorer
6. Convert to long-lived token:
   ```
   https://graph.facebook.com/oauth/access_token?
   grant_type=fb_exchange_token&
   client_id={app-id}&
   client_secret={app-secret}&
   fb_exchange_token={short-lived-token}
   ```
7. Get Page ID: `https://graph.facebook.com/me/accounts?access_token={token}`
8. Connect Instagram Business account to Facebook Page
9. Get Instagram Account ID: `https://graph.facebook.com/me/accounts?fields=instagram_business_account&access_token={token}`

### LinkedIn

1. Create LinkedIn Company Page (if not exists)
2. Go to [LinkedIn Developers](https://www.linkedin.com/developers/apps)
3. Create new app → Select Company Page
4. Add **Share on LinkedIn** product
5. Under Auth tab, add redirect URL: `https://www.triplecitiestech.com/auth/linkedin/callback`
6. Generate OAuth 2.0 tokens
7. Get Organization ID from Company Page URL

## Deployment Steps

### 1. Database Migration

The database migration will be run automatically on next deploy, or you can run it manually:

```bash
npx prisma migrate dev --name add_blog_system
```

### 2. Configure Environment Variables

Add all required environment variables to Vercel:

```bash
vercel env add BLOG_CRON_SECRET
vercel env add FACEBOOK_ACCESS_TOKEN
vercel env add FACEBOOK_PAGE_ID
# ... etc
```

### 3. Deploy to Vercel

```bash
git add .
git commit -m "Add automated blog system"
git push origin main
```

Vercel will automatically deploy with cron jobs configured.

### 4. Verify Cron Jobs

1. Go to Vercel Dashboard → Project → Cron Jobs
2. Verify 3 cron jobs are active:
   - `fetch-content` (Daily at 6 AM)
   - `generate-blog` (Mon/Wed/Fri at 8 AM)
   - `publish-scheduled` (Every 15 min)

### 5. Test the System

Manually trigger cron jobs to test:

```bash
# Fetch content
curl -X POST https://www.triplecitiestech.com/api/cron/fetch-content \
  -H "Authorization: Bearer $BLOG_CRON_SECRET"

# Generate blog (will send approval email)
curl -X POST https://www.triplecitiestech.com/api/cron/generate-blog \
  -H "Authorization: Bearer $BLOG_CRON_SECRET"
```

## Approval Workflow

### Email Flow

1. **Blog Generated** → Email sent to kurtis@triplecitiestech.com
2. **Email Contains**:
   - Full blog post preview
   - Facebook preview card
   - Instagram caption preview
   - LinkedIn post preview
   - SEO metadata
   - Source attribution
3. **Actions**:
   - **Approve** → Schedules for next Mon/Wed/Fri at 9 AM
   - **Reject** → Archives post, can regenerate
   - **Edit** → Opens admin panel for manual editing

### Publishing Schedule

Posts are published on:
- **Monday** at 9 AM EST
- **Wednesday** at 9 AM EST
- **Friday** at 9 AM EST

If approved after 9 AM on a publishing day, it will be scheduled for the next available slot.

## Monitoring & Analytics

### Check Blog Status

Visit:
- **Public Blog**: https://www.triplecitiestech.com/blog
- **Admin Dashboard**: https://www.triplecitiestech.com/admin/blog (when built)

### Database Queries

```sql
-- Check pending approvals
SELECT title, status, sentForApproval
FROM blog_posts
WHERE status = 'PENDING_APPROVAL';

-- Check published posts
SELECT title, publishedAt, views, shares
FROM blog_posts
WHERE status = 'PUBLISHED'
ORDER BY publishedAt DESC;

-- Check social media posting results
SELECT bp.title, smp.platform, smp.status, smp.postedAt
FROM social_media_posts smp
JOIN blog_posts bp ON smp.blogPostId = bp.id
ORDER BY smp.createdAt DESC;
```

### View Logs

Check Vercel logs for cron job execution:

```bash
vercel logs --follow
```

## Content Sources

Current trusted sources (configured in `lib/content-curator.ts`):

1. **Bleeping Computer** - General cybersecurity news
2. **Krebs on Security** - In-depth security research
3. **Microsoft Security Blog** - Microsoft-specific updates
4. **CISA Alerts** - Government security alerts
5. **The Hacker News** - Breaking security news
6. **Dark Reading** - Enterprise security insights

## AI Content Generation

The system uses **Claude Sonnet 4.5** with carefully engineered prompts to:

- Synthesize insights from multiple sources
- Create original, non-plagiarized content
- Focus on small business concerns
- Include actionable recommendations
- Maintain Triple Cities Tech brand voice
- Generate platform-specific social media content

### Prompt Engineering

Key prompt features:
- Brand voice guidelines (professional, approachable, educational)
- Target audience specification (SMBs in Central NY)
- Content requirements (800-1200 words, SEO-optimized)
- Structured JSON output for consistency
- Multi-platform social media variants

## SEO Features

- ✅ Meta titles and descriptions
- ✅ Keyword optimization
- ✅ Schema.org Article markup
- ✅ Open Graph tags
- ✅ Twitter Card tags
- ✅ Dynamic sitemap (when implemented)
- ✅ RSS feed (when implemented)
- ✅ Internal linking
- ✅ Reading time estimation

## Troubleshooting

### Issue: No blogs being generated

**Check**:
1. Verify `ANTHROPIC_API_KEY` is set
2. Check cron job logs in Vercel
3. Ensure `BLOG_CRON_SECRET` is configured
4. Verify RSS feeds are accessible

### Issue: Approval emails not received

**Check**:
1. Verify `RESEND_API_KEY` is set
2. Check spam folder
3. Verify `APPROVAL_EMAIL` is correct
4. Check Resend dashboard for send logs

### Issue: Social media posting failed

**Check**:
1. Verify access tokens are not expired
2. Check token permissions (read_insights, pages_manage_posts, etc.)
3. Verify page/account IDs are correct
4. Check social media platform API status

### Issue: Database errors

**Check**:
1. Run `npx prisma migrate dev`
2. Verify `DATABASE_URL` is set
3. Check database connection in Vercel logs

## Future Enhancements

Planned features:
- [ ] Admin dashboard for manual blog creation
- [ ] Draft editing before approval
- [ ] AI regeneration with feedback
- [ ] Analytics dashboard
- [ ] A/B testing for titles
- [ ] Image generation (DALL-E/Midjourney)
- [ ] Video/podcast script generation
- [ ] Newsletter integration
- [ ] Guest post automation
- [ ] Backlink monitoring

## File Structure

```
├── prisma/
│   └── schema.prisma              # Blog database models
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── cron/
│   │   │   │   ├── fetch-content/route.ts    # RSS fetching
│   │   │   │   ├── generate-blog/route.ts    # AI generation
│   │   │   │   └── publish-scheduled/route.ts # Publishing
│   │   │   └── blog/
│   │   │       └── approval/[token]/
│   │   │           ├── preview/route.ts       # Preview endpoint
│   │   │           ├── approve/route.ts       # Approve endpoint
│   │   │           └── reject/route.ts        # Reject endpoint
│   │   └── blog/
│   │       ├── page.tsx                       # Blog listing
│   │       └── [slug]/page.tsx                # Individual post
│   ├── lib/
│   │   ├── content-curator.ts                 # RSS aggregation
│   │   ├── blog-generator.ts                  # AI content gen
│   │   ├── social-publisher.ts                # Social media API
│   │   └── email-templates/
│   │       └── blog-approval.tsx              # Email template
│   ├── config/
│   │   └── site.ts                            # Site config (blog: true)
│   └── constants/
│       └── data.ts                            # Navigation (added blog)
├── .env.example                               # Environment variables
└── vercel.json                                # Cron job config
```

## Cost Estimate

Monthly costs (approximate):
- **Anthropic Claude**: $5-15 (8-12 posts/month)
- **Resend**: $0 (included in free tier)
- **Facebook/Instagram**: $0 (free API)
- **LinkedIn**: $0 (free API)

**Total**: ~$5-15/month

## Support

For issues or questions:
- Check Vercel logs: `vercel logs`
- Review database: Prisma Studio `npx prisma studio`
- Contact: kurtis@triplecitiestech.com

## License

Proprietary - Triple Cities Tech
