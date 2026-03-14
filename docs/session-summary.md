# Session Summary

> Last updated: 2026-03-14
> Branch: `claude/load-project-context-64BuJ`
> Latest commit: `81ea52f`
> Previous summary: `docs/SYSTEM_STATE_SUMMARY.md` (2026-03-07)

---

## Current Architecture

Triple Cities Tech is a Next.js 15 App Router application deployed on Vercel (iad1) with four major surface areas:

### 1. Public Marketing Site
- Route group `src/app/(marketing)/` — home, about, contact, services, industries, support, payment, MSA
- `/schedule` page with embedded Calendly widget (all scheduling links routed internally)
- `/blog` with AI-generated content, SEO optimization, dynamic sitemap/robots.txt
- Cloudflare Turnstile + honeypot + rate limiting on contact form

### 2. Admin Dashboard (`/admin/*`)
- Azure AD OAuth via NextAuth 5 (roles: ADMIN, MANAGER, VIEWER)
- **Project management**: Company → Project → Phase → Task hierarchy with Autotask sync
- **Blog CMS**: AI generation → approval email → scheduled publish (cron-driven)
- **Marketing campaigns**: Audience targeting (per-company + Autotask Contact Action Groups), content visibility system, AI refinement, delivery modes with magic link tokens
- **Reporting & Analytics**: Real-time queries from raw ticket tables, AI assistant with conversational history, business review PDF generation, SLA metrics aligned with Autotask agreements, company-specific deep dives
- **SOC Analyst Agent**: AI-driven security alert triage with human approval workflow, OSINT prompts, action plans, merge recommendations, trend analysis, AI-generated rules, ticket-centric dashboard
- **Platform monitoring**: System health dashboard, Autotask sync logs, AI usage tracking, threshold alerts, historical DB response time graph
- **Staff permissions**: Role-based permission levels (`src/lib/permissions.ts`)
- **Customer invite system**: Portal roles, impersonation, invite tracking
- **Demo mode**: Contoso Industries synthetic data for safe presentations
- **Test failure dashboard**: `/admin/debug/failures` with status workflow

### 3. Customer Portal (`/onboarding/[companyName]`)
- Password-based auth (separate from Azure AD)
- Smart ticket sorting, metrics, chat CTA
- Ticket timeline from Autotask (external notes only) with reply capability
- First-time guided onboarding journey (5 steps, skippable)
- Health score display, ticket notes/time entries

### 4. API Layer (`src/app/api/`)
- 100+ route handlers
- Autotask multi-step sync with pagination (5 projects/page, 60s timeout)
- Self-healing reporting pipeline: auto-creates missing tables before jobs run
- Fire-and-forget self-chaining backfill for sync jobs
- Unified ticket type system with adapters across all views
- MCP server for direct database and API access (`mcp-server/`)

### Technology Stack
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router), React 18, TypeScript strict |
| Styling | Tailwind CSS 3.4, custom theme (forbidden: yellow/amber/orange) |
| Database | PostgreSQL (Vercel Postgres), Prisma ORM 7.2 |
| Auth | NextAuth.js 5 + Azure AD OAuth |
| Email | Resend |
| AI | Anthropic Claude API (blog gen, project chat, SOC analysis, report assistant) |
| PSA | Autotask REST API (two-way sync with caveats) |
| Bot protection | Cloudflare Turnstile |
| Testing | Playwright (Chromium + iPhone 13), Browserbase for remote |
| Hosting | Vercel (auto-deploy from main, preview from branches) |

---

## Recent Changes (Since 2026-03-07)

### Major Features Added
1. **SOC Analyst Agent** — Full AI-driven security alert triage system with: ticket ingestion from Autotask, AI classification/severity, human approval workflow, OSINT prompts, action plans, merge recommendations, activity feed, trend analysis, AI-generated rules, Approve All button, cleanup endpoint, reprocess capability
2. **Reporting overhaul** — Rebuilt to use real-time queries from raw Ticket tables; added AI assistant with full conversation history, business review PDF (professional design, downloadable), SLA metrics aligned with Autotask agreement, auto-chaining backfill, self-healing pipeline
3. **Platform monitoring dashboard** — System health cards on admin home, Autotask sync logs page, AI usage tracking, threshold alerts, historical DB response time graph
4. **Unified ticket system** — Shared ticket types, adapters, API endpoints, and components integrated across all views (admin, SOC, customer portal, reporting)
5. **Marketing enhancements** — Content visibility system, AI refinement, audience improvements, delivery modes with magic link tokens, manual audience support, campaign fixes (connection pool, enum types, recipient counts)
6. **Customer portal improvements** — Smart ticket sorting, improved metrics, chat CTA, staff permission levels, customer invite/impersonate system with portal roles
7. **Staff permissions** — New `src/lib/permissions.ts` (290 lines) with role-based permission levels
8. **Scheduling page** — `/schedule` with embedded Calendly widget, all external links routed internally
9. **Comprehensive e2e tests** — 30+ Playwright specs covering admin, public, portal, blog, marketing, SOC, Autotask, API health, auth, forbidden colors, responsive viewports, security
10. **MCP server** — Direct database and API access tool for development/debugging

### Key Bug Fixes
- Silent catch bug in Autotask cron sync phase/task fetching
- Prisma 'column does not exist' errors (migration `20260310000000_add_missing_columns`)
- Customer portal 404 (DB errors swallowed in `companyExists`)
- Admin dashboard crash (client component layout wrapper)
- SOC: JSON truncation, 504 timeouts, TicketNotes 404, toUpperCase crashes
- Reporting: empty data, API user filtering, resolution averages, business review zeros
- Blog post visibility filter
- Audience creation connection pool exhaustion, TEXT vs enum type mismatch
- Company detail page and projects page crashes

### Infrastructure Changes
- Cron auth switched to Vercel Authorization header (removed literal secrets from paths)
- Migration endpoint improved for Vercel serverless compatibility
- Sync default bumped to 180 days
- Batch processing + time-aware pipeline to fix sync timeouts
- Orange added to forbidden colors list
- Dynamic sitemap/robots.txt replacing static files

---

## Key Design Decisions

1. **Real-time reporting over pre-aggregated** — Reporting queries raw Ticket tables directly rather than maintaining aggregation tables, with self-healing table creation and batched backfill to manage Vercel timeouts.

2. **SOC human-in-the-loop** — AI classifies and recommends actions but requires human approval before any automated response. Approve All for batch processing, per-ticket detail for manual review.

3. **Unified ticket types** — Single `UnifiedTicket` type with adapters (`src/lib/tickets/adapters.ts`) so all views (admin, SOC, portal, reporting) consume the same data shape.

4. **Self-chaining sync** — Backfill jobs auto-trigger the next batch server-side (fire-and-forget) so a single URL invocation runs all sync jobs to completion without timeout issues.

5. **Permission system** — Centralized `src/lib/permissions.ts` rather than ad-hoc role checks in each route. Three staff roles (ADMIN, MANAGER, VIEWER) with granular feature permissions.

6. **MCP server for dev access** — Direct database queries and API calls during development sessions, avoiding manual curl/Invoke-RestMethod commands.

7. **Forbidden orange** — Added `orange-*` to forbidden Tailwind classes because on dark backgrounds it renders visually as amber/gold. Use rose/red/violet instead.

---

## Outstanding Tasks

### High Priority
- **E2e test suite maintenance** — Tests should be run before every push; some may need updates after recent SOC/reporting changes
- **SOC agent production hardening** — Rate limiting on AI calls, error recovery for partial failures, monitoring for false positive rates
- **Reporting backfill completion** — Ensure all companies have full historical data synced

### Medium Priority
- **CSP violation reporting** — Add `report-uri` / `report-to` endpoint
- **Remove setup pages** — `/admin/setup` and `/admin/run-migration` have no session auth guard (API calls require MIGRATION_SECRET, but pages render)
- **Blog setup page access** — `/blog/setup` is publicly accessible
- **Admin route role checks** — Several routes check for session existence but not specific role
- **TestFailure Prisma model cleanup** — Model exists in schema but all queries use raw SQL

### Low Priority / Technical Debt
- Pre-existing lint warnings (~10 unused variables across blog/social/onboarding)
- `'unsafe-inline'` in production CSP script-src (needed for Next.js)
- `CRON_SECRET` vs `AUTOTASK_SYNC_SECRET` naming inconsistency
- Centralized structured logging beyond current server-logger

### Discussed But Not Yet Implemented
- Advanced automated debugging (auto-issue creation from test failures, AI-generated PR drafts)
- Additional Playwright tests for login flows, form submissions, Autotask sync verification
- Olujo brand awareness CRM project integration
