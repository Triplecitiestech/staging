# Triple Cities Tech Website - Project Overview

**Repository**: Triplecitiestech/staging
**Domain**: https://www.triplecitiestech.com
**Stack**: Next.js 15 (App Router), TypeScript, Prisma, PostgreSQL, Tailwind CSS
**Deployment**: Vercel (auto-deploy from `main` branch)
**Development Branch**: `claude/*` branches (session-specific)

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Key Technologies](#key-technologies)
3. [Core Features](#core-features)
4. [Database & CMS](#database--cms)
5. [Authentication & Security](#authentication--security)
6. [API Routes](#api-routes)
7. [Admin Portal](#admin-portal)
8. [Customer Portals](#customer-portals)
9. [Blog System](#blog-system)
10. [Project Management](#project-management)
11. [Third-Party Integrations](#third-party-integrations)
12. [Content Security Policy](#content-security-policy)
13. [Development Workflow](#development-workflow)

---

## Project Structure

```
/src
├── app/                    # Next.js App Router pages
│   ├── (marketing)/       # Public marketing pages
│   ├── admin/             # Admin dashboard & tools
│   ├── api/               # API routes
│   ├── blog/              # Public blog pages
│   └── layout.tsx         # Root layout with global scripts
├── components/            # React components
│   ├── layout/           # Header, Footer, Navigation
│   ├── shared/           # Reusable UI components
│   ├── seo/              # SEO components (breadcrumbs, etc.)
│   └── ui/               # Base UI primitives
├── lib/                   # Utilities and configurations
│   ├── prisma.ts         # Prisma client singleton
│   ├── auth.ts           # NextAuth configuration
│   └── services/         # Business logic services
└── constants/            # App-wide constants

/prisma
├── schema.prisma         # Database schema
└── migrations/           # Database migrations

/public
├── logo/                 # Brand assets
├── herobg.webp          # Hero background image
└── [other static assets]
```

---

## Key Technologies

### Frontend
- **Next.js 15**: React framework with App Router
- **TypeScript**: Strict mode enabled
- **Tailwind CSS**: Utility-first styling
- **Lucide React**: Icon library

### Backend
- **Prisma ORM**: Database abstraction layer
- **PostgreSQL**: Production database (via Vercel Postgres)
- **NextAuth.js**: Authentication framework
- **Resend**: Email service provider

### Deployment & Infrastructure
- **Vercel**: Hosting, serverless functions, cron jobs
- **Cloudflare Turnstile**: Bot protection on forms
- **Vercel Speed Insights**: Performance monitoring

---

## Core Features

### Public Website
1. **Home Page** (`/`): Hero, services overview, testimonials, CTA sections
2. **Services** (`/services`): IT service offerings with detailed descriptions
3. **Industries** (`/industries`): Industry-specific solutions and case studies
4. **About** (`/about`): Company information, team, mission
5. **Contact** (`/contact`): Contact form with Turnstile protection, support options
6. **Blog** (`/blog`): AI-generated blog with approval workflow
7. **Live Chat** (`/livechat`): ChatGenie/Thread integration page
8. **MyGlue** (`/myglue`): Password manager tutorial videos for clients

### Support Pages
- `/support`: Customer support portal link
- `/contact`: Multi-channel support (live chat, email, phone, portals)

---

## Database & CMS

### Database Schema (Prisma)

#### Core Models
- **User**: Admin users, authentication
- **BlogPost**: AI-generated blog posts with approval workflow
- **Project**: Client project tracking
- **Phase**: Project phase definitions
- **PhaseTask**: Granular tasks within phases
- **ApprovalToken**: Email approval tokens for blog posts

#### Blog Post Statuses
1. `DRAFT` - Newly generated, pending approval
2. `PENDING_APPROVAL` - Approval email sent
3. `APPROVED` - Approved, waiting for scheduled publish time
4. `PUBLISHED` - Live on the blog
5. `REJECTED` - Rejected by admin

### Migrations
- Manual migrations via API endpoints (`/api/blog/setup/migrate`, `/api/projects/setup/migrate`)
- Used when Prisma schema changes need to be applied to production

---

## Authentication & Security

### NextAuth Configuration
- **Provider**: Credentials provider (username/password)
- **Session**: JWT-based sessions
- **Admin Access**: Protected routes under `/admin/*`

### Content Security Policy (CSP)
- Strict CSP headers configured in `next.config.js`
- Allows: YouTube, ChatGenie/Thread, Cloudflare, Vercel, Google Fonts
- Blocks: Inline scripts (except with unsafe-inline for specific needs)

### Bot Protection
- Cloudflare Turnstile on contact form
- Honeypot fields for spam prevention
- Form submission time checks (minimum 3 seconds)

---

## API Routes

### Blog Management
- `POST /api/blog/generate` - Generate new blog post with AI
- `GET /api/blog/generate-now` - Trigger generation manually
- `GET /api/blog/approval/[token]/approve` - Approve blog post via email
- `GET /api/blog/approval/[token]/reject` - Reject blog post via email
- `POST /api/blog/publish/[id]` - Publish approved blog post

### Cron Jobs (Vercel)
- `/api/cron/generate-blog` - Auto-generate blog posts (Mon/Wed/Fri 8am)
- `/api/cron/send-approval-emails` - Send approval emails (daily 12pm, 24h before publish)
- `/api/cron/publish-scheduled` - Publish approved posts (every 15 min)

### Contact & Forms
- `POST /api/contact` - Contact form submission with Turnstile verification

### Project Management
- `GET /api/projects/setup/migrate` - Run database migrations for project schema

---

## Admin Portal

**Base Path**: `/admin`

### Pages
- `/admin` - Dashboard with quick access to all admin tools
- `/admin/blog` - Blog post management (view, edit, publish, delete)
- `/admin/projects` - Project list and creation
- `/admin/projects/[slug]` - Individual project dashboard
- `/admin/projects/olujo-plan` - Olujo project phase plan
- `/admin/projects/olujo-docs/*` - Olujo SOPs and documentation
- `/admin/preview/[slug]` - Customer-facing project portal preview

### Access Control
- All `/admin/*` routes protected by NextAuth
- Requires valid user session to access

---

## Customer Portals

### External Portals
1. **Support Portal**: https://triplecitiestech.itclientportal.com/
   - Ticketing, documentation, training resources
2. **Payment Portal**: https://triplecitiestech.connectboosterportal.com/
   - Invoice viewing, secure payments

### Internal Customer Previews
- `/admin/preview/[slug]` - Read-only project views for customers
- Shows project phases, tasks, progress, documents

---

## Blog System

### AI-Powered Content Generation
- **RSS Sources**: TechCrunch, The Verge, Ars Technica, Wired, ZDNet
- **Content Curator**: Selects trending articles, analyzes topics
- **Blog Generator**: Claude AI generates posts with custom tone/style
- **Image Generation**: Generates hero images with DALL-E 3

### Approval Workflow
1. **Generation**: Post created in `DRAFT` status
2. **Approval Email**: Sent 24h before scheduled publish time
3. **Admin Review**: Click approve/reject link in email
4. **Scheduled Publishing**: Cron job publishes approved posts at scheduled time

### Blog Post Structure
- Title, slug, excerpt, content (MDX)
- Hero image, tags, SEO metadata
- Scheduled publish time
- AI-generated tone tracking (professional, informative, etc.)

---

## Project Management

### Olujo Project (Brand Awareness CRM)
**Overview**: Brand awareness campaign CRM for Olujo Tequila

**Key Personnel**:
- **Adam**: Executive Owner (Olujo)
- **Kellan**: Operations Lead (Olujo - day-to-day)
- **Kurtis**: Technical Lead (Triple Cities Tech)

**Phases** (8 total):
1. Alignment & Governance
2. Sales & Awareness Playbook
3. Hiring & Onboarding Pipeline
4. Data Acquisition (Leads)
5. CRM Build (MVP)
6. Pilot Launch (NY & FL)
7. Scale Up & Expand Markets
8. Purchase Tracking & Commission Processing

**Documentation**:
- `/admin/projects/olujo-plan` - Full phase plan
- `/admin/projects/olujo-docs/executive-summary` - Project summary
- `/admin/projects/olujo-docs/call-handling` - Call handling SOP
- `/admin/projects/olujo-docs/crm-handling` - CRM usage SOP
- `/admin/projects/olujo-docs/hiring-guidelines` - Contractor hiring
- `/admin/projects/olujo-docs/contractor-agreement` - Contractor terms
- `/admin/projects/olujo-docs/purchase-tracking` - Commission processing

---

## Third-Party Integrations

### ChatGenie (Thread)
- **Purpose**: Live chat widget for customer support
- **App ID**: `3de45b0b-6349-42fa-a1d7-5a299b4c5ab2`
- **Integration**: Script tag in `layout.tsx`, CSP allows messenger domain
- **Pages**: Widget appears site-wide, dedicated `/livechat` landing page

### Resend (Email)
- **Purpose**: Transactional emails (blog approval, contact forms)
- **API Key**: Stored in `RESEND_API_KEY` environment variable
- **From Address**: Configured in service

### Cloudflare Turnstile
- **Purpose**: Bot protection on contact form
- **Site Key**: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- **Secret Key**: `TURNSTILE_SECRET_KEY`

### YouTube
- **Purpose**: Embedded tutorial videos on MyGlue page
- **CSP**: YouTube domains allowed in `frame-src`

---

## Content Security Policy

**Location**: `next.config.js` → `headers()` function

### Allowed Sources
- **Scripts**: `'self'`, `'unsafe-inline'`, Vercel, Cloudflare, ChatGenie
- **Styles**: `'self'`, `'unsafe-inline'`, Google Fonts
- **Fonts**: `'self'`, Google Fonts
- **Images**: `'self'`, `data:`, `blob:`, `https:` (all HTTPS images)
- **Media**: `'self'`, `blob:`, Cloudflare R2
- **Frames**: Cloudflare Turnstile, ChatGenie, YouTube
- **Connect**: `'self'`, Vercel, Cloudflare, ChatGenie API

### Key Directives
- `frame-ancestors 'none'` - Prevents clickjacking
- `object-src 'none'` - Blocks Flash/Java applets
- `upgrade-insecure-requests` - Forces HTTPS (production only)

---

## Development Workflow

### Branching Strategy
- **Main Branch**: `main` (auto-deploys to production)
- **Development Branches**: `claude/*` (session-specific, named with session ID)
- **Naming Convention**: `claude/[description]-[sessionId]`

### Commit Guidelines
- Use descriptive commit messages
- Reference issue numbers when applicable
- Group related changes in single commits

### Deployment
1. **Automatic**: Pushes to `main` auto-deploy via Vercel
2. **Preview**: All branches get Vercel preview deployments
3. **Environment Variables**: Managed in Vercel dashboard

### Environment Variables
**Required**:
- `DATABASE_URL` - PostgreSQL connection string
- `NEXTAUTH_SECRET` - NextAuth JWT secret
- `NEXTAUTH_URL` - App base URL
- `RESEND_API_KEY` - Email service API key
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` - Admin login
- `TURNSTILE_SECRET_KEY` - Cloudflare Turnstile secret
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` - Turnstile public key

**Optional**:
- `OPENAI_API_KEY` - For AI blog generation
- `ANTHROPIC_API_KEY` - For Claude AI features

---

## Common Tasks

### Adding a New Page
1. Create file in `/src/app/[route]/page.tsx`
2. Import `Header`, `Footer`, `Breadcrumbs` components
3. Add page to sitemap if public
4. Update navigation if needed

### Updating Database Schema
1. Modify `/prisma/schema.prisma`
2. Create migration: `npx prisma migrate dev --name [description]`
3. For production: Create API migration endpoint or use Vercel CLI

### Adding a Blog Post Manually
1. Go to `/admin/blog`
2. Use "Generate New Post" button, or
3. Insert directly into database via Prisma Studio

### Modifying CSP
1. Edit `/next.config.js` → `headers()` function
2. Update both dev and production CSP arrays
3. Test thoroughly (CSP errors can break functionality)

---

## Known Issues & Quirks

### Blog System
- **Timeouts**: AI generation can timeout on Vercel (30s limit for serverless)
- **Workaround**: Manual generation endpoint splits work into smaller chunks

### ChatGenie Widget
- Must use standard `<script>` tag, not Next.js `<Script>` component
- Widget only shows for anonymous users when loaded correctly

### Database Migrations
- Production migrations must be run via API endpoints (no CLI access)
- Always test migrations on preview deployments first

---

## Future Enhancements

### Planned Features
- [ ] Enhanced project management with Gantt charts
- [ ] Client portal user authentication
- [ ] Real-time project updates via webhooks
- [ ] Advanced analytics dashboard
- [ ] Multi-language support

### Technical Debt
- [ ] Refactor blog generation to use queue system (avoid timeouts)
- [ ] Add comprehensive test coverage
- [ ] Implement proper error monitoring (Sentry, etc.)
- [ ] Optimize image loading and performance

---

## Contact & Support

**Development Lead**: Kurtis (Triple Cities Tech)
**Repository**: https://github.com/Triplecitiestech/staging
**Production URL**: https://www.triplecitiestech.com

For questions about this codebase, refer to `/CLAUDE_SESSION_PREFERENCES.md` for AI assistant workflow guidelines.
