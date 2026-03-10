# Rent Bing — Claude Session Master Prompt

> Paste this entire prompt into a new Claude Code session to start building the Rent Bing website.

---

```
# CLAUDE.md — AI Assistant Guide for Rent Bing

> **This is the single source of truth for every Claude Code session.** Read this file first. It tells you how to behave, how to ship, and how to avoid mistakes.

---

## Core Rules — Read These First

### 1. Be autonomous. Do not ask the user to fix things you can fix yourself.
If you encounter an error — a build failure, a lint warning, a type mismatch, a broken import — diagnose it and fix it. Only escalate to the user when the problem genuinely requires information you cannot obtain (credentials, business decisions, ambiguous product requirements). "I found an error, what should I do?" is never acceptable when the error message tells you what's wrong.

### 2. Every change must be fully tested and validated before deploying.
- Run `npm run build` after every meaningful change. It must pass.
- Run `npm run lint` and fix all errors.
- Review your own `git diff` before committing — look for typos, broken imports, missing responsive classes.
- Check that UI changes work at mobile (`sm`/`md`) AND desktop (`lg`+) breakpoints by reviewing Tailwind classes.
- Every layout must use responsive grid/flex patterns.
- Completion means the feature works end-to-end, not just that it compiles.

### 3. Every completed task must be committed and pushed.
- Commit after each logical unit of work.
- Push immediately to the working branch with `git push -u origin <branch>`.
- Verify the push succeeded. Retry with exponential backoff (2s, 4s, 8s, 16s) on network failure.
- Vercel auto-deploys from every branch (preview) and from `main` (production).

### 4. When something breaks, fix it — don't report it and stop.
If `npm run build` fails, read the error, fix the code, rebuild. If a push fails, check the branch name and retry. Loop until the task is done or you hit a genuine blocker that requires user input.

### 5. Keep CLAUDE.md up to date.
When the user corrects you or you learn a new project convention, update this file so future sessions don't repeat the mistake.

---

## Project Overview

Rent Bing is a modern property management website and operational hub. It integrates with Buildium via its Open API to display properties, accept applications, and manage maintenance requests. The architecture is designed to evolve into an AI-enabled platform.

**Production URL**: https://www.rentbing.com
**Preview URL pattern**: https://<branch-name>-rentbing.vercel.app

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 15 (App Router), React 18, TypeScript (strict) |
| **Styling** | Tailwind CSS 3.4+ with custom Rent Bing theme |
| **Database** | Supabase (PostgreSQL) — Auth + DB + Storage |
| **ORM** | Prisma 7+ with connection pooling via Supabase |
| **Auth** | Supabase Auth (email/password for tenants, OAuth for admin) |
| **Email** | Resend |
| **Bot Protection** | Cloudflare Turnstile |
| **Property Management** | Buildium Open API (properties, tenants, leases, applications) |
| **AI** | Anthropic Claude API (future: chatbot, descriptions, triage) |
| **Hosting** | Vercel (auto-deploys from `main`, preview per branch) |

---

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Prisma generate + next build (MUST PASS)
npm run start        # Start production server
npm run lint         # ESLint (MUST PASS, fix all errors)
npm run test:e2e     # Playwright e2e tests (when available)
```

---

## Directory Structure

```
src/
  app/
    (marketing)/        # Public pages (home, properties, about, contact, apply)
    portal/             # Tenant portal (auth required)
    admin/              # Staff portal (admin auth)
    api/                # API route handlers
    auth/               # Supabase auth pages
  components/
    layout/             # Header, Footer, Navigation
    sections/           # Hero, Features, CTA, Testimonials
    ui/                 # Button, Card, Container, Input (variant + size systems)
    shared/             # Section, FeatureCard, PageHero
    properties/         # PropertyCard, PropertyGrid, PropertyDetail
    forms/              # ContactForm, InquiryForm, ApplicationForm, MaintenanceForm
    portal/             # Tenant dashboard components
    admin/              # Admin components
    seo/                # JSON-LD schemas, Breadcrumbs, AIMetadata
  lib/                  # Core utilities (supabase, prisma, buildium, email, security)
  config/               # Site metadata, contact config
  constants/            # Navigation, property types
  types/                # TypeScript type definitions
  utils/                # cn.ts (clsx + tailwind-merge)
  hooks/                # Custom React hooks
  middleware.ts         # Security headers, bot blocking
prisma/
  schema.prisma         # Database schema
  migrations/           # SQL migrations
tests/
  e2e/                  # Playwright tests
```

---

## Code Conventions

**TypeScript**: Strict mode, no `any`. Interfaces for all props/params. `.ts` for utils, `.tsx` for components.

**React/Next.js**: Server components by default; add `'use client'` only when needed. PascalCase components, camelCase utilities.

**Styling**: Tailwind utility classes, mobile-first (`base` → `md:` → `lg:`). Standard grids: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`. **Every layout change must be checked at all breakpoints.**

**Path alias**: `@/*` maps to `./src/*`.

**API routes**: Try/catch pattern with `NextResponse.json`. Auth check first, validate input, run business logic, return structured response.

**Database**: Prisma schema as single source of truth. Every schema field must have a migration. No hard deletes — use status fields or `deletedAt`. camelCase column names in raw SQL must be quoted.

---

## UI Component System

### Primitives (src/components/ui/)
- **Button**: Variants (primary, secondary, outline, ghost, danger) + Sizes (sm, md, lg, xl). Supports `asChild` for Link composition, `isLoading` for loading state.
- **Card**: Variants (default, elevated, outlined, ghost) + padding options. Optional hover animation.
- **Container**: Size system (sm–xl, full) + auto-centering.
- **Input**: Consistent styling, error state, label integration.

### Shared Components (src/components/shared/)
- **Section**: Background presets + scroll animation + anchor ID.
- **PageHero**: Flexible hero with optional background image/video.
- **FeatureCard**: Icon + title + description with stagger animation.

### Section Container Pattern
```
<section className="relative py-24 overflow-hidden">
  <div className="absolute inset-0"> {/* Background */} </div>
  <div className="relative z-10 max-w-7xl mx-auto px-6"> {/* Content */} </div>
</section>
```

### Utility
- **cn()** in `src/utils/cn.ts`: `clsx` + `tailwind-merge` for safe class merging. Use in ALL components.

---

## Security Requirements

### Middleware (src/middleware.ts)
- Security headers on all routes (X-Frame-Options, HSTS, CSP, etc.)
- Block suspicious user agents
- Block SQL injection patterns in query params

### Form Protection (ALL public forms)
- Cloudflare Turnstile widget
- Server-side token verification
- Honeypot field (hidden, reject if filled)
- Minimum submission time (3 seconds)

### Content Security Policy
- Dual dev/prod CSP (dev allows unsafe-eval for hot reload, prod is strict)
- Every external resource requires explicit CSP whitelist entry

---

## SEO Requirements

### Every Page Must Have
- `metadata.ts` file with title, description, keywords, OG image, canonical URL
- Layout.tsx that imports and exports the metadata
- OG image: `/og-{page}.jpg`, 1200x630

### Root Layout Must Include
- LocalBusiness + Organization JSON-LD schemas
- AIMetadata component
- Breadcrumbs component

### Technical SEO
- Dynamic `sitemap.ts` including all property URLs
- `robots.ts` with crawl rules
- Canonical URLs (full absolute URLs, never relative)

---

## Buildium Integration

### API Client (src/lib/buildium.ts)
- Base URL: `https://api.buildium.com/v1`
- Auth: `x-buildium-client-id` + `x-buildium-client-secret` headers on every request
- Pagination: `limit` + `offset` (case-sensitive!)
- Retry: Exponential backoff (2s, 4s, 8s, 16s) on failure
- Log all API calls for debugging

### Sync Strategy
- Cron syncs Buildium → local DB (properties every 2h, tenants every 6h)
- Local DB is the fast cache for rendering
- Write-through for mutations (applications → Buildium)
- Buildium is source of truth for properties/tenants/leases

### Key Endpoints
- `GET /v1/rentals` — Properties
- `GET /v1/rentals/{id}/units` — Units
- `GET /v1/leases/tenants` — Tenants
- `GET /v1/leases` — Leases
- `POST /v1/leases/tenants` — Create tenant
- Applicant endpoints for rental applications

---

## Environment Variables

```bash
# Database (Supabase)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=                         # Supabase pooled connection for Prisma

# Buildium API
BUILDIUM_API_CLIENT_ID=
BUILDIUM_API_SECRET=
BUILDIUM_API_BASE_URL=https://api.buildium.com/v1

# Email (Resend)
RESEND_API_KEY=
RESEND_FROM_EMAIL=
NEXT_PUBLIC_CONTACT_EMAIL=

# Bot Protection
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

# Public
NEXT_PUBLIC_BASE_URL=https://www.rentbing.com

# Cron & Admin
CRON_SECRET=
MIGRATION_SECRET=

# AI (Future)
ANTHROPIC_API_KEY=
```

---

## Git Workflow

- Develop on `claude/[description]-[sessionId]` branches
- Never push directly to `main`
- Auto-merge via GitHub Actions (claude/** → main)
- Commit style: imperative short summary, optional bullet details
- **Commit and push after every completed logical unit** — do not batch

---

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

---

## Implementation Phases

We are building this project in 6 phases. Complete each phase fully before moving to the next.

### Phase 1 — Foundation & Infrastructure
Next.js project, Tailwind theme, Supabase setup, Prisma schema, UI primitives, middleware, CLAUDE.md, GitHub + Vercel deployment pipeline, health check endpoint.

### Phase 2 — Public Marketing Site
Homepage, About, Contact, Properties (placeholder), Header, Footer, SEO foundation (metadata, JSON-LD, sitemap, robots), contact form with Turnstile + email.

### Phase 3 — Forms & Lead Capture
Rental inquiry form, multi-step rental application form, maintenance request form, admin inbox for leads and applications.

### Phase 4 — Buildium Integration
API client, property sync (cron), tenant/lease sync, dynamic property pages with real data, application write-through to Buildium, sync status dashboard.

### Phase 5 — Operational Tooling
Tenant portal (dashboard, maintenance, documents), admin enhancements (maintenance queue, communications, reporting), notification system, e2e tests.

### Phase 6 — AI Workflow Integration
AI property descriptions, maintenance triage, chatbot, communication drafts, analytics, activity logging.

---

## Prerequisites Checklist (Verify Before Coding)

Before writing any code in a new session, confirm:
- [ ] `npm run build` passes
- [ ] `npm run lint` passes with zero errors
- [ ] Git branch is correct (`claude/[description]-[sessionId]`)
- [ ] Environment variables are set (check with `/api/verify-config` or `/api/admin/system-health`)
- [ ] You've read this CLAUDE.md completely

---

## Gotchas

- **Every Prisma schema field MUST have a migration** — without a migration, queries crash with "column does not exist"
- **Buildium API pagination params are case-sensitive** — `limit` and `offset` (lowercase only)
- **Buildium requires Premium plan** ($375+/month) — API won't work on lower tiers
- **Supabase connection string** — use the pooled connection URL for Prisma in serverless environments
- **overflow-hidden clips absolute dropdowns** — use `min-w-0` with `truncate` instead
- **useState does not auto-sync with props** — add `useEffect` to keep them in sync when props change
- **Mobile matters** — every UI change must account for sm/md/lg breakpoints
- **CSP is strict** — adding any third-party resource requires updating headers in next.config.js
- **Serverless timeout**: 30s max for API routes, 60s for cron jobs

---

## Self-Improvement Protocol

When the user corrects a mistake or a session reveals a new convention:
1. Fix the immediate issue
2. Add the lesson to this CLAUDE.md under the appropriate section (or Gotchas)
3. Commit the CLAUDE.md update alongside the fix
```

---

**Usage**: Copy everything between the triple backticks above into a fresh CLAUDE.md file in a new repository. Then start a Claude Code session in that repository — Claude will read the CLAUDE.md and follow all conventions automatically.
