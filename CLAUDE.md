# CLAUDE.md — AI Assistant Guide for Triple Cities Tech

## Project Overview

Triple Cities Tech is a professional IT services marketing and project management platform. It is a production Next.js 15 application deployed on Vercel at https://www.triplecitiestech.com.

## Tech Stack

- **Framework**: Next.js 15 (App Router), React 18, TypeScript (strict)
- **Styling**: Tailwind CSS 3.4 with custom theme
- **Database**: PostgreSQL via Vercel Postgres, Prisma ORM 7.2
- **Auth**: NextAuth.js 5 with Microsoft Azure AD OAuth
- **Email**: Resend
- **AI**: Anthropic Claude API (blog generation)
- **Bot Protection**: Cloudflare Turnstile
- **Hosting**: Vercel (auto-deploys from `main`, region `iad1`)

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Prisma migrate deploy + next build
npm run start        # Start production server
npm run lint         # ESLint (next lint)
npm run seed         # Seed database (tsx prisma/seed.ts)
```

Build runs `prisma migrate deploy && next build`. TypeScript and ESLint must pass.

## Directory Structure

```
src/
  app/                  # Next.js App Router pages & API routes
    (marketing)/        # Public marketing pages (route group)
    admin/              # Staff portal (protected)
    api/                # 20+ API route handlers
    blog/               # AI-generated blog system
    onboarding/         # Customer onboarding portal
  components/           # React components (layout/, sections/, ui/, seo/, admin/, etc.)
  lib/                  # Core utilities (prisma, auth, blog-generator, security, etc.)
  config/               # Site metadata & contact config
  constants/            # App-wide constants
  types/                # TypeScript type definitions
  utils/                # Helpers (cn.ts for Tailwind class merging)
  hooks/                # Custom React hooks
  middleware.ts         # Security headers, suspicious request blocking
prisma/
  schema.prisma         # 500+ line schema, 30+ models
  migrations/           # Database migrations
```

## Code Conventions

**TypeScript**: Strict mode, no `any`. Interfaces for all props/params. `.ts` for utils, `.tsx` for components.

**React/Next.js**: Server components by default; add `'use client'` only when needed. PascalCase components, camelCase utilities.

**Styling**: Tailwind utility classes, mobile-first (`base` → `md:` → `lg:`). Custom colors: primary (blues/cyans), secondary (slates). Standard grids: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`.

**Path alias**: `@/*` maps to `./src/*`.

**API routes**: Try/catch pattern with `NextResponse.json`. Validate input, run business logic, return structured responses.

## Database

- Prisma schema at `prisma/schema.prisma`
- Never run `prisma migrate` directly on production — use API migration endpoints
- No hard deletes; use status fields or `deletedAt` timestamps
- `prisma generate` runs automatically on `postinstall`
- Connection pooling via PrismaPg adapter for serverless

**Key models**: StaffUser, Company, Project, Phase, PhaseTask, BlogPost, Comment, Assignment, AuditLog, Notification

**Key enums**: BlogStatus (DRAFT → PENDING_APPROVAL → APPROVED → PUBLISHED), TaskStatus (12+ statuses), Priority (LOW/MEDIUM/HIGH/URGENT)

## Authentication

- Azure AD OAuth for staff (roles: ADMIN, MANAGER, VIEWER)
- Staff users stored in `staff_users` table
- Customer portal uses separate password-based auth
- Session strategy: database-backed

## Key Features

**Blog System**: AI content generation via Claude API → Draft → Approval email → Admin review → Scheduled publish. Cron jobs in `vercel.json` handle generation (Mon/Wed/Fri 8AM), approval emails (daily noon), and publishing (every 15 min).

**Project Management**: Company → Project → Phase → PhaseTask hierarchy. Customer visibility controls, internal vs. customer-facing notes/comments, audit logging.

**Security**: Strict CSP in `next.config.js` (separate dev/prod policies). Middleware blocks suspicious user agents and SQL injection. Honeypot fields and 3-second minimum on contact form. Adding third-party scripts requires CSP header updates.

## Environment Variables

Required: `DATABASE_URL`, `PRISMA_DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_BASE_URL`

See `.env.example` for the full list including optional social media tokens.

## Git Workflow

- Develop on `claude/[description]-[sessionId]` branches
- Never push directly to `main`
- Auto-merge via GitHub Actions (`.github/workflows/auto-merge-claude.yml`)
- Commit style: imperative short summary, optional bullet-point details

## Gotchas

- **CSP is strict**: Adding any third-party resource requires updating headers in `next.config.js`
- **Serverless timeout**: 30s max for API routes (blog generation can be tight)
- **ChatGenie widget**: Must use standard `<script>` tag, not Next.js `<Script>` component
- **No test suite**: TypeScript compilation and ESLint are the quality gates
- **Production migrations**: Must use API endpoints, not Prisma CLI

## Additional Documentation

Detailed guides exist in the repo root: `PROJECT_OVERVIEW.md`, `CLAUDE_SESSION_PREFERENCES.md`, `BLOG_SYSTEM_README.md`, `AZURE_AD_SETUP.md`, `ONBOARDING_PORTAL.md`, `OLUJO_PROJECT.md`, and others.
