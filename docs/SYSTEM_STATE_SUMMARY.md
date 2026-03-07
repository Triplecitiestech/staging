# System State Summary

> Last updated: 2026-03-07
> Branch: `claude/review-engineering-standards-os6Ab`
> Latest commit: `9ad6a12`

This document captures the current state of the Triple Cities Tech platform for session continuity. See `docs/ARCHITECTURE.md` for architectural diagrams and flow charts.

---

## Major Features Implemented

### 1. Public Marketing Site
Static and server-rendered pages at the root route group `src/app/(marketing)/`. Includes home, about, contact, services, industries (4 verticals), support, payment portal, and MSA pages. Contact form has Cloudflare Turnstile, honeypot field, rate limiting, and 3-second timing check.

### 2. Admin Dashboard
Staff-only portal at `/admin/*` with Azure AD OAuth (NextAuth 5). Role-based access (ADMIN, MANAGER, VIEWER). Features include:
- Project management (Company > Project > Phase > Task, 3-level subtask nesting)
- AI project assistant (Claude-powered chat for generating phases/tasks)
- Blog CMS with AI content generation, approval workflow, scheduled publishing
- Marketing campaign system with audience targeting (per-company + Autotask Contact Action Groups)
- Autotask sync panel (multi-step sync orchestration)
- Company/contact management
- Notification and audit log systems
- Demo mode toggle (Contoso Industries synthetic data)
- Test failure debugging dashboard at `/admin/debug/failures`

### 3. Customer Onboarding Portal
Per-company portal at `/onboarding/[companyName]` with password-based auth (separate from Azure AD). Features:
- Phase-by-phase onboarding timeline
- First-time guided tour (OnboardingJourney, 5 steps)
- Project dashboard with task visibility controls
- Ticket timeline from Autotask (external notes only)
- Customer ticket reply capability
- Demo company (`contoso-industries`) with synthetic data

### 4. AI Blog System
Fully automated content pipeline:
- Content curation from RSS feeds (`src/lib/content-curator.ts`)
- AI generation via Claude Sonnet (`src/lib/blog-generator.ts`)
- Approval email workflow via Resend
- Scheduled publishing (Vercel cron: generate MWF 8AM, approval daily noon, publish every 15min)
- Rich editor with AI suggestions in admin

### 5. Autotask PSA Integration
Two-way sync (with caveats) between Autotask REST API v1.0 and the local database:
- **Pull (works)**: Companies, projects, phases, tasks, contacts, notes
- **Push (works)**: Notes (POST TaskNotes), time entries (POST TimeEntries), project status (PATCH Projects)
- **Push (broken)**: Task status PATCH returns 404 on all entity paths for this instance. UI shows orange warning when sync fails.
- Multi-step sync endpoint with pagination (5 projects/page, 60s timeout)
- Deduplication via `?step=merge`
- Key files: `src/lib/autotask.ts`, `src/app/api/autotask/trigger/route.ts`

### 6. Playwright Testing Infrastructure
End-to-end testing setup with:
- Playwright config for Chromium + iPhone 13 (mobile)
- Custom failure reporter that writes JSON + markdown summaries
- Browserbase SDK integration for remote browser testing via CDP
- 30+ test specs covering public pages, admin auth, API security, responsive layout, forbidden colors
- Test commands: `npm run test:e2e`, `npm run test:e2e:ui`

### 7. AI Self-Healing Debugging Workflow
Infrastructure for capturing and analyzing test failures:
- Rule-based debug summary generator (`src/lib/test-failure-capture.ts`)
- File-based storage in `test-results/failures/`
- CLI tool (`npm run debug:failures`) for offline review
- Admin dashboard at `/admin/debug/failures` with stat cards, filterable list, detail panel, status workflow
- API routes for failure ingestion, listing, and status updates (raw SQL, no Prisma model dependency)
- Database table `test_failures` created via migration endpoint

---

## Architecture Overview

### Backend Services
| Service | Location | Purpose |
|---------|----------|---------|
| Next.js App Router | `src/app/` | All pages and API routes (100+ routes) |
| Prisma ORM | `prisma/schema.prisma` | PostgreSQL access (30+ models) |
| NextAuth 5 | `src/auth.ts` | Azure AD OAuth, session management |
| Autotask Client | `src/lib/autotask.ts` | REST API client with retry/fallback |
| Blog Generator | `src/lib/blog-generator.ts` | Claude AI content generation |
| Content Curator | `src/lib/content-curator.ts` | RSS feed aggregation |
| Security Module | `src/lib/security.ts` | Rate limiting, input sanitization, CSRF |
| Error Logger | `src/lib/error-logger.ts` | Centralized error capture with dedup |
| Server Logger | `src/lib/server-logger.ts` | Structured request logging |

### Frontend Modules
| Module | Location | Purpose |
|--------|----------|---------|
| Marketing Pages | `src/app/(marketing)/` | Public site |
| Admin Portal | `src/app/admin/` | Staff dashboard |
| Customer Portal | `src/app/onboarding/` | Per-company portal |
| Blog | `src/app/blog/` | Public blog + admin CMS |
| Admin Components | `src/components/admin/` | Dashboard widgets, sync panel, AI chat |
| Onboarding Components | `src/components/onboarding/` | Portal, dashboard, timeline, password gate |
| UI Components | `src/components/ui/` | Shared UI primitives |
| SEO Components | `src/components/seo/` | JSON-LD structured data, breadcrumbs |

### External Integrations
| Integration | Purpose | Auth Method |
|-------------|---------|-------------|
| Autotask PSA | Company/project/task sync | API key + integration code |
| Anthropic Claude | AI chat, blog generation, content editing | API key |
| Resend | Email delivery (contact form, approval, campaigns) | API key |
| Cloudflare Turnstile | Bot protection on forms | Site key + secret |
| Azure AD | Staff authentication | OAuth 2.0 (PKCE) |
| Browserbase | Remote browser testing | API key + project ID |

### Internal Tools
| Tool | Location | Purpose |
|------|----------|---------|
| Failure Reporter | `tests/e2e/failure-reporter.ts` | Captures Playwright failure artifacts |
| Debug CLI | `scripts/debug-failures.ts` | Offline failure review |
| Failure Dashboard | `/admin/debug/failures` | Web UI for failure triage |
| Demo Mode | `src/lib/demo-mode.ts` | Synthetic data for presentations |

---

## Data Model Overview

### Core Hierarchy
```
StaffUser (staff auth, roles: ADMIN/MANAGER/VIEWER)
  |
Company (slug, displayName, passwordHash, autotaskCompanyId?)
  ├── CompanyContact (name, email, phone, autotaskContactId?)
  └── Project (title, status, projectType, autotaskProjectId?)
       ├── Phase (title, status, owner, orderIndex, autotaskPhaseId?)
       │    ├── PhaseTask (taskText, status, priority, dueDate, parentTaskId?, autotaskTaskId?)
       │    ├── Comment (content, isInternal flag for customer visibility)
       │    └── Assignment (assignedTo, assignedBy)
       └── AuditLog (action, details, performedBy)
```

### Supporting Models
- **BlogPost**: AI-generated articles with status workflow (DRAFT > PENDING_APPROVAL > APPROVED > PUBLISHED)
- **BlogCategory, BlogSource, BlogGuideline**: Blog system configuration
- **Notification**: In-app notifications for staff
- **AutotaskSyncLog**: Sync history (type, counts, errors, duration)
- **MarketingCampaign, MarketingAudience**: Campaign management with targeting
- **TestFailure**: E2e test failure records (created via raw SQL, not Prisma-managed table)
- **ErrorLog**: Client and server error capture with deduplication

### Key Enums
- **TaskStatus**: 12 values (NOT_STARTED through CUSTOMER_NOTE_ADDED)
- **PhaseStatus**: 7 values (NOT_STARTED through COMPLETE)
- **ProjectStatus**: ACTIVE, COMPLETED, ON_HOLD, CANCELLED
- **Priority**: LOW, MEDIUM, HIGH, URGENT
- **StaffRole**: ADMIN, MANAGER, VIEWER

---

## Testing and Debugging Infrastructure

### Playwright E2E Tests
- **Config**: `playwright.config.ts` — Chromium + iPhone 13 projects
- **Test specs**: `tests/e2e/` — 30+ tests covering navigation, auth, API security, responsive layout, forbidden colors, data leak prevention
- **Browserbase**: Remote browser testing via `tests/e2e/browserbase.setup.ts` using CDP connection
- **Commands**: `npm run test:e2e` (headless), `npm run test:e2e:ui` (interactive)

### Failure Capture Pipeline
```
Playwright test fails
  -> Custom reporter (tests/e2e/failure-reporter.ts)
    -> Writes JSON + markdown to test-results/failures/
    -> Optionally POST to /api/test-failures/ingest (CI mode)
  -> Debug summary generated (src/lib/test-failure-capture.ts)
    -> Rule-based pattern analysis (timeout, auth, 500, hydration, Prisma errors)
    -> Confidence scoring (high/medium/low)
    -> Impacted file identification
```

### Admin Failure Dashboard
- **URL**: `/admin/debug/failures`
- **Features**: Stat cards, status filtering, detail panel with error/stack/AI summary, status workflow (open > investigating > fixed > wont_fix > duplicate)
- **Migration**: `POST /api/test-failures/migrate` with Bearer MIGRATION_SECRET
- **API**: `GET /api/test-failures` (list), `PATCH /api/test-failures` (update status), `POST /api/test-failures/ingest` (CI ingestion)

### Error Logging
- Client errors captured via `POST /api/errors` (public, no auth — intentional for client-side reporting)
- Server errors via `src/lib/error-logger.ts` with deduplication
- Admin view at error dashboard endpoints

### Quality Gates
- `npm run build` (Prisma generate + Next.js build) — must pass
- `npm run lint` (ESLint) — must pass, no errors
- No formal test suite beyond Playwright; build + lint are the primary gates

---

## Known Issues and Technical Debt

### Security (Addressed This Session)
1. ~~Middleware query param filter was non-functional~~ — Fixed (forEach return bug)
2. ~~Sensitive logging in onboarding auth~~ — Fixed (removed password/session logs)
3. ~~Timing-safe comparison leaked length~~ — Fixed (now uses crypto.timingSafeEqual)
4. ~~Password length logged in auth API~~ — Fixed
5. ~~/api/autotask/status publicly accessible~~ — Fixed (added auth)

### Security (Remaining Low-Risk)
- `/admin/setup` and `/admin/run-migration` pages have no session auth guard (client components). API calls they make require MIGRATION_SECRET. These should be deleted after initial setup.
- `'unsafe-inline'` in production CSP script-src — needed for Next.js
- `CRON_SECRET` vs `AUTOTASK_SYNC_SECRET` naming inconsistency in env vars
- No CSP violation reporting (`report-uri` / `report-to`)

### Technical Debt
- **No formal test suite**: Build + lint are the only automated quality gates. Playwright tests exist but can't run in all environments (browser download required).
- **TestFailure Prisma model unused**: The `TestFailure` model exists in `prisma/schema.prisma` but all queries use raw SQL to avoid Prisma client generation dependency. Could remove the model or switch to using it when migration is applied.
- **Blog setup page accessible without auth**: `/blog/setup` is public (calls protected API endpoints, but page renders).
- **Some API routes lack role checks**: Several admin routes check `auth()` (session exists) but don't verify role (ADMIN vs VIEWER). Low risk since all staff are trusted.
- **Pre-existing lint warnings**: ~10 unused variable warnings across blog-generator, content-curator, social-publisher, onboarding components.

---

## Upcoming Work

### Discussed But Not Implemented
1. **Autotask Reporting & Analytics** — Dashboards for sync health, task completion rates, SLA tracking
2. **Advanced Reporting Dashboards** — Project velocity, team workload, customer engagement metrics
3. **Automated Debugging Improvements** — Auto-issue creation from test failures, AI-generated PR drafts
4. **Additional Playwright Tests** — Login flows, form submissions, Autotask sync verification, blog publishing
5. **CSP Violation Reporting** — Add `report-uri` endpoint to capture and log CSP violations
6. **Centralized Logging** — Replace console.log/error with structured logging service (beyond current server-logger)

---

## Key Areas of the Codebase

### Must-Understand Files
| File | Why It Matters |
|------|----------------|
| `CLAUDE.md` | AI assistant guide — conventions, gotchas, workflow |
| `prisma/schema.prisma` | 30+ models, all enums, all relationships |
| `src/auth.ts` | NextAuth config, Azure AD, role provisioning |
| `src/middleware.ts` | Security headers, bot blocking, suspicious param filtering |
| `src/lib/autotask.ts` | Autotask REST client, entity queries, status mappers |
| `src/app/api/autotask/trigger/route.ts` | Multi-step sync orchestrator (~800 lines) |
| `src/lib/security.ts` | Rate limiting, input sanitization, CSRF, request validation |
| `src/lib/onboarding-data.ts` | Customer portal data layer, password validation |
| `src/lib/onboarding-session.ts` | Signed cookie session management |

### Key Directories
| Directory | Contents |
|-----------|----------|
| `src/app/api/` | 100+ API route handlers |
| `src/app/admin/` | Admin portal pages |
| `src/components/admin/` | Admin-specific components |
| `src/components/onboarding/` | Customer portal components |
| `src/components/sections/` | Marketing page sections |
| `src/lib/` | Core utilities (auth, Prisma, security, AI, logging) |
| `tests/e2e/` | Playwright test specs + infrastructure |
| `docs/` | Architecture, standards, workflows, runbook |

### Documentation Index
| Document | Purpose |
|----------|---------|
| `CLAUDE.md` | AI session guide (read first) |
| `ENGINEERING_STANDARDS.md` | Mandatory engineering standards and QA process |
| `QA_STANDARDS.md` | QA checklist and validation report template |
| `docs/ARCHITECTURE.md` | System architecture with flow diagrams |
| `docs/UI_STANDARDS.md` | Approved colors, forbidden colors, design patterns |
| `docs/DEBUGGING_WORKFLOW.md` | AI self-healing debugging process |
| `docs/CLAUDE_SESSION_START.md` | Session startup checklist |
| `AUTOTASK_SYNC.md` | Autotask integration deep dive |
| `ONBOARDING_PORTAL.md` | Customer portal documentation |
| `BLOG_SYSTEM_README.md` | Blog generation system |
