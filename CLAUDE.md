# CLAUDE.md — AI Assistant Guide for Triple Cities Tech

> **This is the single source of truth for every Claude Code session.** Read this file first. It tells you how to behave, how to ship, and how to avoid mistakes.

---

## Core Rules — Read These First

### 1. Be autonomous. Do not ask the user to fix things you can fix yourself.
If you encounter an error — a build failure, a lint warning, a type mismatch, a broken import — diagnose it and fix it. Only escalate to the user when the problem genuinely requires information you cannot obtain (credentials, business decisions, ambiguous product requirements). "I found an error, what should I do?" is never acceptable when the error message tells you what's wrong.

### 2. Every change must be tested before deploying.
- Run `npm run build` after every meaningful change. It must pass.
- Run `npm run lint` and fix all errors.
- Review your own `git diff` before committing — look for typos, broken imports, missing responsive classes.
- Check that UI changes work at mobile (`sm`/`md`) AND desktop (`lg`+) breakpoints by reviewing Tailwind classes. Every layout must use responsive grid/flex patterns.

### 3. Every completed task must be committed and pushed.
- Commit after each logical unit of work.
- Push immediately to the working branch with `git push -u origin <branch>`.
- Verify the push succeeded. Retry with exponential backoff (2s, 4s, 8s, 16s) on network failure.
- Vercel auto-deploys from every branch (preview) and from `main` (production). After push, confirm the deployment will trigger.

### 4. After deployment, verify the live result.
- If you have access to fetch the preview URL, check it.
- If not, tell the user exactly what to verify and on which URL.
- Call out any changes that affect mobile layout specifically — the user expects desktop AND mobile to work.

### 5. When something breaks, fix it — don't report it and stop.
If `npm run build` fails, read the error, fix the code, rebuild. If a push fails, check the branch name and retry. If a migration is needed, create it. Loop until the task is done or you hit a genuine blocker that requires user input.

### 6. Keep CLAUDE.md up to date.
When the user corrects you or you learn a new project convention, update this file so future sessions don't repeat the mistake. Add it under the appropriate section or add a new Gotcha.

---

## Project Overview

Triple Cities Tech is a professional IT services marketing and project management platform. Production Next.js 15 app deployed on Vercel at https://www.triplecitiestech.com.

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
npm run build        # Prisma migrate deploy + next build (MUST PASS)
npm run start        # Start production server
npm run lint         # ESLint (MUST PASS, fix all errors)
npm run seed         # Seed database (tsx prisma/seed.ts)
```

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

**Styling**: Tailwind utility classes, mobile-first (`base` → `md:` → `lg:`). Custom colors: primary (blues/cyans), secondary (slates). Standard grids: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`. **Every layout change must be checked at all breakpoints.**

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
- **Commit and push after every completed logical unit** — do not batch

## Task Workflow — Ship Cycle

Every change follows this cycle. Do not skip steps.

```
1. Plan      → Use plan mode for complex tasks. Break into subtasks.
2. Implement → Make the code changes.
3. Verify    → Run `npm run build` && `npm run lint`. Fix any failures.
4. Review    → `git diff` — check for responsive issues, missing types, regressions.
5. Commit    → Descriptive message, imperative mood.
6. Push      → `git push -u origin <branch>`. Confirm success.
7. Confirm   → Tell user what deployed and what to verify on preview/prod.
```

If step 3 fails, go back to step 2. Do not proceed to step 5 with a broken build.

## Subagent Usage

Use subagents (`"use subagents"` in prompts) for:
- Searching the codebase broadly (Explore agent)
- Running parallel independent tasks
- Keeping the main context window clean during large refactors

## Self-Improvement Protocol

When the user corrects a mistake or a session reveals a new convention:
1. Fix the immediate issue
2. Add the lesson to this `CLAUDE.md` under the appropriate section (or Gotchas)
3. Commit the CLAUDE.md update alongside the fix

This ensures the same mistake never happens twice across sessions.

## Gotchas

- **CSP is strict**: Adding any third-party resource requires updating headers in `next.config.js`
- **Serverless timeout**: 30s max for API routes (blog generation can be tight)
- **ChatGenie widget**: Must use standard `<script>` tag, not Next.js `<Script>` component
- **No test suite**: `npm run build` and `npm run lint` are the quality gates — always run both
- **Production migrations**: Must use API endpoints, not Prisma CLI
- **Mobile matters**: Every UI change must account for `sm`/`md`/`lg` breakpoints. Never ship desktop-only layouts.

## Additional Documentation

Detailed guides in the repo root — read these when working on specific features:
- `CLAUDE_SESSION_PREFERENCES.md` — Full session workflow and communication preferences
- `PROJECT_OVERVIEW.md` — Comprehensive architecture reference
- `BLOG_SYSTEM_README.md` — AI blog generation system
- `OLUJO_PROJECT.md` — Olujo brand awareness CRM project
- `ONBOARDING_PORTAL.md` — Customer onboarding portal
- `AZURE_AD_SETUP.md` — Microsoft OAuth configuration
- `CONTENT_EDITING_GUIDE.md`, `SPAM_PROTECTION.md`, `DATABASE_SETUP.md`, and others
