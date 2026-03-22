# CLAUDE.md — AI Assistant Guide for Triple Cities Tech

> **This is the single source of truth for every Claude Code session.** Read this file first. It tells you how to behave, how to ship, and how to avoid mistakes.

**Start every session by reading, in order:**
1. `docs/architecture.md` — System architecture, data flows, integration diagrams
2. `docs/system-map.md` — Codebase map: which files own which subsystem
3. `docs/data-model.md` — Database schema, entity relationships, data flows
4. `docs/session-summary.md` — Current state, recent changes, key decisions
5. `docs/current-tasks.md` — Active development work and outstanding items

**Use for implementation and testing rules:**
- `docs/coding-standards.md` — Engineering standards, QA process, ship cycle
- `docs/qa-standards.md` — QA checklist, validation report template, severity levels

**Supporting documentation** (read when working on specific features):
- Documents under `/docs/plans/`, `/docs/reference/`, or `/docs/archive/` are supporting material
- They should NOT override architecture decisions unless explicitly referenced
- See the Additional Documentation section below for the full index

---

## Core Rules — Read These First

### 1. Be autonomous. Do not ask the user to fix things you can fix yourself.
If you encounter an error — a build failure, a lint warning, a type mismatch, a broken import — diagnose it and fix it. Only escalate to the user when the problem genuinely requires information you cannot obtain (credentials, business decisions, ambiguous product requirements). "I found an error, what should I do?" is never acceptable when the error message tells you what's wrong.

### 2. Every change must be fully tested and validated before deploying.
- Run `npm run build` after every meaningful change. It must pass.
- Run `npm run lint` and fix all errors.
- **Run `npm run test:e2e` on every deploy/change.** The e2e test suite covers ALL systems (admin pages, public pages, customer portal, blog, marketing, SOC, Autotask sync, API health). Every test must pass before pushing. If a test fails, fix the root cause before proceeding.
- Review your own `git diff` before committing — look for typos, broken imports, missing responsive classes.
- Check that UI changes work at mobile (`sm`/`md`) AND desktop (`lg`+) breakpoints by reviewing Tailwind classes. Every layout must use responsive grid/flex patterns.
- **Full QA is mandatory** — see `docs/coding-standards.md` and `docs/qa-standards.md` for the complete process.
- Completion means the feature works end-to-end, not just that it compiles.

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

## Duplicate Prevention Rules

Before implementing any feature or adding any module:

1. **Search the repository first.** Use grep/glob to find existing implementations of the functionality you are about to build.
2. **Reuse or extend existing modules** whenever possible. This codebase has 100+ API routes, 20+ reporting modules, and 30+ component directories — the feature you need may already exist.
3. **Do not create parallel implementations** of existing systems. There must be exactly one Autotask client, one Prisma client, one permission system, one ticket adapter, etc.
4. **Do not create new files** unless there is a clear architectural reason that the functionality cannot live in an existing file.
5. **If similar functionality already exists**, extend it, refactor it, or explain to the user why a new implementation is necessary before proceeding.

Violating these rules creates maintenance burden and divergent behavior. When in doubt, read the Source of Truth Rules below.

---

## Source of Truth Rules

These are the authoritative modules for each subsystem. Claude must use these — never create duplicate clients, alternate service layers, or replacement adapters unless there is explicit architectural justification approved by the user.

| Subsystem | Authoritative Module | Notes |
|-----------|---------------------|-------|
| Autotask API client | `src/lib/autotask.ts` | All Autotask REST calls go through this client |
| Prisma / Database | `src/lib/prisma.ts` | Singleton PrismaClient with PrismaPg adapter |
| Security utilities | `src/lib/security.ts` | Rate limiting, input sanitization, CSRF |
| Staff permissions | `src/lib/permissions.ts` | Role-based access control (SUPER_ADMIN, ADMIN, BILLING_ADMIN, TECHNICIAN) |
| Unified ticket system | `src/lib/tickets/` | Adapters, types, and utils consumed by all ticket views |
| SOC engine | `src/lib/soc/` | Engine, correlation, rules, prompts, types |
| Reporting engine | `src/lib/reporting/` | 20+ modules: sync, aggregation, analytics, health score, SLA, etc. |
| Blog generation | `src/lib/blog-generator.ts` | AI content generation via Claude API |
| Demo mode | `src/lib/demo-mode.ts` | Contoso Industries demo data |
| Error logging | `src/lib/error-logger.ts` | Centralized error logging to ErrorLog model |
| API usage tracking | `src/lib/api-usage-tracker.ts` | Tracks AI/email/API usage to ApiUsageLog |
| Customer portal data | `src/lib/onboarding-data.ts` | Portal data loading |
| Customer portal auth | `src/lib/onboarding-session.ts` | Portal session management |

**Rule**: If you need functionality that one of these modules provides, import and use it. If it needs to be extended, extend the existing module. Do not create `autotask-v2.ts`, `prisma-new.ts`, `security-utils.ts`, or similar parallel files.

---

## Implementation Guardrail

Before writing any code for a new feature or change, Claude must:

1. **Inspect the existing subsystem** — Read the relevant source-of-truth modules and related files to understand current behavior.
2. **Explain how the requested work fits** into the existing architecture. If the change crosses subsystem boundaries, identify which modules are affected.
3. **Confirm whether the feature already exists** in full or in part. If it does, state what exists and propose extending it rather than rebuilding.
4. **Prefer extending existing systems over rebuilding them.** Refactoring is acceptable when it improves the existing module; replacement requires explicit user approval.

This guardrail prevents wasted work and architectural drift. Skip it only for trivial changes (typo fixes, single-line config changes).

---

## File Creation Policy

- **Prefer modifying existing files** over creating new ones. Most changes belong in an existing module, component, or route handler.
- **Do not create `*-v2`, `*-new`, `*-alt`, or parallel utility files.** If the existing file needs improvement, improve it in place.
- **Only create new files** when separation is architecturally justified — e.g., a genuinely new subsystem, a new API route for a new resource, or a new component that has no logical home in existing files.
- When creating a new file, explain why it cannot live in an existing file.

---

## Project Overview

Triple Cities Tech is a professional IT services marketing and project management platform. Production Next.js 15 app deployed on Vercel at https://www.triplecitiestech.com.

## Tech Stack

- **Framework**: Next.js 15 (App Router), React 18, TypeScript (strict)
- **Styling**: Tailwind CSS 3.4 with custom theme
- **Database**: PostgreSQL via Vercel Postgres, Prisma ORM 7.2
- **Auth**: NextAuth.js 5 with Microsoft Azure AD OAuth
- **Email**: Resend
- **AI**: Anthropic Claude API (blog generation, SOC analysis, report assistant, project chat)
- **PSA Integration**: Autotask PSA REST API (company/project/task/ticket sync)
- **Bot Protection**: Cloudflare Turnstile
- **Hosting**: Vercel (auto-deploys from `main`, region `iad1`)
- **Charts**: Recharts (AreaChart for trends)

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Prisma migrate deploy + next build (MUST PASS)
npm run start        # Start production server
npm run lint         # ESLint (MUST PASS, fix all errors)
npm run seed         # Seed database (tsx prisma/seed.ts)
npm run test:e2e     # Playwright e2e tests (run when UI/API changes)
npm run test:e2e:ui  # Playwright with interactive UI
npm run debug:failures  # Review e2e test failure summaries
# Browserbase remote testing (against deployed preview):
# BROWSERBASE_API_KEY=xxx BROWSERBASE_PROJECT_ID=xxx PLAYWRIGHT_BASE_URL=https://preview.vercel.app npm run test:e2e
```

## Directory Structure

```
src/
  app/                  # Next.js App Router pages & API routes
    (marketing)/        # Public marketing pages (route group)
    admin/              # Staff portal (protected)
      soc/              # SOC Analyst Agent dashboard, config, rules, incidents
      reporting/        # Reporting & analytics (dashboard, business reviews, technicians)
      monitoring/       # Platform monitoring dashboard
      marketing/        # Campaign management
    api/                # 100+ API route handlers
      soc/              # 11 SOC endpoints (tickets, incidents, rules, trends, etc.)
      reports/          # 17 reporting endpoints (dashboard, business review, analytics, etc.)
      autotask/         # Autotask sync (trigger, status)
    blog/               # AI-generated blog system
    onboarding/         # Customer onboarding portal
    schedule/           # Calendly scheduling page
  components/
    admin/              # Dashboard widgets, sync panel, AI chat
    soc/                # SOC dashboard, config, rules manager, incident detail, flowchart
    reporting/          # Report dashboard, charts, AI assistant, business review, health
    tickets/            # Shared ticket table, detail, priority badge, SLA indicator, timeline
    onboarding/         # Customer portal, dashboard, journey, password gate
    sections/           # Marketing page sections
    ui/                 # Shared UI primitives
    seo/                # JSON-LD structured data, breadcrumbs
  lib/
    soc/                # SOC engine, correlation, rules, prompts, types, IP extractor
    reporting/          # 20+ modules: aggregation, analytics, backfill, health score, SLA, etc.
    tickets/            # Unified ticket adapters and utils
    permissions.ts      # Role-based staff permission system
    autotask.ts         # Autotask REST API client
    security.ts         # Rate limiting, input sanitization, CSRF
    blog-generator.ts   # AI content generation
    demo-mode.ts        # Contoso Industries demo data
  config/               # Site metadata & contact config
  constants/            # App-wide constants
  types/                # TypeScript type definitions
  utils/                # Helpers (cn.ts for Tailwind class merging)
  hooks/                # Custom React hooks
  middleware.ts         # Security headers, suspicious request blocking
prisma/
  schema.prisma         # 1300+ line schema, 35+ models (see docs/data-model.md)
  migrations/           # Database migrations
tests/
  e2e/                  # 30+ Playwright test specs
```

## Code Conventions

**TypeScript**: Strict mode, no `any`. Interfaces for all props/params. `.ts` for utils, `.tsx` for components.

**React/Next.js**: Server components by default; add `'use client'` only when needed. PascalCase components, camelCase utilities.

**Styling**: Tailwind utility classes, mobile-first (`base` → `md:` → `lg:`). Custom colors: primary (blues/cyans), secondary (slates). Standard grids: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`. **Every layout change must be checked at all breakpoints.**

**Forbidden Colors**: NEVER use yellow, amber, gold, brown, or mustard Tailwind classes (`yellow-*`, `amber-*`, `brown-*`, gold-like colors) anywhere in the UI. **Also avoid `orange-*` classes** — on this site's dark backgrounds, Tailwind's `orange-500/400` renders visually as amber/gold. Use `violet`, `rose`, `red`, `cyan`, `blue`, `green`, or `emerald` instead. This applies to backgrounds, text, borders, gradients, and any other styling. See `docs/UI_STANDARDS.md` for approved alternatives.

**Path alias**: `@/*` maps to `./src/*`.

**API routes**: Try/catch pattern with `NextResponse.json`. Validate input, run business logic, return structured responses.

## Database

- Prisma schema at `prisma/schema.prisma`
- Never run `prisma migrate` directly on production — use API migration endpoints
- No hard deletes; use status fields or `deletedAt` timestamps
- `prisma generate` runs automatically on `postinstall`
- Connection pooling via PrismaPg adapter for serverless

**Key models**: StaffUser, Company, CompanyContact, Project, Phase, PhaseTask, BlogPost, Comment, Assignment, AuditLog, Notification, AutotaskSyncLog, MarketingCampaign, MarketingAudience, ErrorLog

**Key enums**: BlogStatus (DRAFT → PENDING_APPROVAL → APPROVED → PUBLISHED → REJECTED), TaskStatus (12+ statuses), Priority (LOW/MEDIUM/HIGH/URGENT), PhaseStatus (NOT_STARTED → SCHEDULED → IN_PROGRESS → COMPLETE), ProjectStatus (ACTIVE/COMPLETED/ON_HOLD/CANCELLED)

**Reporting tables** (created via migration endpoint, not Prisma-managed): `report_tickets`, `report_time_entries`, `report_ticket_notes`, `report_aggregations`, `report_schedules`, `report_targets`. Self-healing: `src/lib/reporting/ensure-tables.ts` auto-creates missing tables before jobs run.

## Authentication

- Azure AD OAuth for staff (roles: SUPER_ADMIN, ADMIN, BILLING_ADMIN, TECHNICIAN)
- Staff users stored in `staff_users` table
- Customer portal uses separate password-based auth
- Session strategy: database-backed

## Key Features

**Blog System**: AI content generation via Claude API → Draft → Approval email → Admin review → Scheduled publish. Cron jobs in `vercel.json` handle generation (Mon/Wed/Fri 8AM), approval emails (daily noon), and publishing (every 15 min).

**Project Management**: Company → Project → Phase → PhaseTask hierarchy. Customer visibility controls, internal vs. customer-facing notes/comments, audit logging.

**Autotask PSA Integration**: Syncs companies, projects, phases, tasks, contacts, and notes from Autotask into the local DB. See `AUTOTASK_SYNC.md` for full details.

**SOC Analyst Agent**: AI-driven security alert triage system at `/admin/soc/*`. Ingests tickets from Autotask, classifies severity via Claude AI, generates action plans with OSINT prompts, supports human approval workflow before any automated response. Key files: `src/lib/soc/` (engine, correlation, rules, prompts), `src/app/api/soc/` (11 endpoints), `src/components/soc/` (dashboard, config, rules manager, incident detail). Features: trend analysis, AI-generated rules, Approve All for batch processing, merge recommendations, activity feed.

**Reporting & Analytics**: Real-time reporting at `/admin/reporting/*` built on raw ticket data from Autotask. AI assistant with conversational history, downloadable business review PDFs, SLA metrics aligned with Autotask agreements, technician performance reports, company health scores. Self-healing pipeline auto-creates missing tables. Self-chaining backfill runs all sync jobs without timeout. Key files: `src/lib/reporting/` (20+ modules), `src/app/api/reports/` (17 endpoints), `src/components/reporting/` (18 components).

**Unified Ticket System**: Shared `UnifiedTicket` type with adapters (`src/lib/tickets/adapters.ts`) consumed by all views (admin, SOC, customer portal, reporting). Shared components in `src/components/tickets/` (table, detail, priority badge, SLA indicator, timeline).

**Staff Permissions**: Centralized role-based permissions at `src/lib/permissions.ts`. Four roles (SUPER_ADMIN, ADMIN, BILLING_ADMIN, TECHNICIAN) with granular feature-level checks.

**Marketing Campaigns**: Audience targeting (per-company + Autotask Contact Action Groups + manual), content visibility system, AI content refinement, delivery modes with magic link tokens. Pages at `/admin/marketing/*`.

**Platform Monitoring**: System health dashboard on admin home page with Autotask sync logs, AI usage tracking, threshold alerts, and historical DB response time graph.

**Security**: Strict CSP in `next.config.js` (separate dev/prod policies). Middleware blocks suspicious user agents and SQL injection. Honeypot fields and 3-second minimum on contact form. Adding third-party scripts requires CSP header updates.

## Environment Variables

Required: `DATABASE_URL`, `PRISMA_DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_BASE_URL`

Autotask: `AUTOTASK_API_USERNAME`, `AUTOTASK_API_SECRET`, `AUTOTASK_API_INTEGRATION_CODE`, `AUTOTASK_API_BASE_URL`, `MIGRATION_SECRET`

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

## Session Reset Workflow

When ending a session or preparing for a new one, follow these steps:

1. **Update `docs/session-summary.md`** — Record what was built, key decisions made, and any outstanding work
2. **Update `docs/current-tasks.md`** — Add new tasks discovered, mark completed ones, remove stale items
3. **Commit and push** all changes to the working branch
4. **Start new session** — The new session will reload context using the bootstrap docs (architecture → system-map → data-model → session-summary → current-tasks)

This ensures session continuity even when context is lost between sessions.

---

## Autotask Integration — Key Knowledge

This is the **primary external data source** for companies, projects, phases, and tasks. The owner considers Autotask data authoritative. See `AUTOTASK_SYNC.md` for full docs.

**Sync endpoint**: `GET /api/autotask/trigger?secret=MIGRATION_SECRET&step=<step>`

**Steps** (run in order):
1. `cleanup` — delete AT-synced companies with no projects
2. `companies` — sync companies that have projects in Autotask
3. `projects&page=1` — sync projects with phases, tasks, descriptions, notes (5/page, paginated)
4. `contacts` — sync contacts (auto-creates table if missing)
5. `merge` — deduplicate companies (keeps AT-synced, absorbs non-AT duplicates)
6. `resync&page=1` — re-fetch phases+tasks for existing AT projects (fixes empty phases)
7. `diagnose` — show raw API response for debugging

**Critical bugs fixed (do NOT reintroduce)**:
- **Never silently catch phase/task API errors** — the original code had `try { } catch { /* no phases */ }` which hid all failures and made it look like projects had no data. Always report errors.
- **Task status values must be distinct** — Autotask uses picklist values: 1=New, 4=In Progress, 5=Complete, 7=Waiting Customer. The old code had both IN_PROGRESS and COMPLETE mapped to `5`, so tasks never showed as complete.
- **Prisma column names are camelCase** — raw SQL must use quoted camelCase (`"companyId"`, `"displayName"`, `"autotaskCompanyId"`), NOT snake_case. Prisma has no `@map` on these fields.
- **company_contacts table may not exist** — the contacts sync auto-creates it via raw SQL if missing. Don't bail out with "run migration first".

**Key files**:
- `src/lib/autotask.ts` — API client, types, status mappers
- `src/app/api/autotask/trigger/route.ts` — multi-step sync endpoint
- `src/app/api/autotask/status/route.ts` — sync history viewer

**Data flow**: Autotask → AutotaskClient (REST API) → syncCompany/syncProject/syncPhase/syncTask → Prisma models

## Gotchas

- **Proactive error checking**: After making changes, actively look for potential errors — check browser console output, test API endpoints with edge cases, verify state sync between components (useState must sync with prop changes via useEffect), and confirm that absolute-positioned dropdowns aren't clipped by parent overflow. Don't wait for the user to find bugs. Log and fix them.
- **useState does not auto-sync with props**: When using `useState(prop)`, the state only initializes on mount. If the prop changes (e.g., via `router.refresh()`), add `useEffect(() => setState(prop), [prop])` to keep them in sync. This applies to all components that receive data as props and store it locally.
- **overflow-hidden clips absolute dropdowns**: Never use `overflow-hidden` on a parent element that contains an absolute-positioned dropdown (like AssignmentPicker, CommentThread, DueDatePicker). Use `min-w-0` with `truncate` for text overflow instead.
- **Progress should use status, not `completed` boolean**: Task completion is tracked via status (REVIEWED_AND_DONE, NOT_APPLICABLE, ITG_DOCUMENTED), not the legacy `completed` boolean field.
- **CSP is strict**: Adding any third-party resource requires updating headers in `next.config.js`
- **Serverless timeout**: 30s max for API routes (blog generation can be tight)
- **ChatGenie widget**: Must use standard `<script>` tag, not Next.js `<Script>` component
- **Quality gates**: `npm run build`, `npm run lint`, and `npm run test:e2e` are the quality gates — always run all three before pushing
- **Production migrations**: Must use API endpoints, not Prisma CLI
- **Mobile matters**: Every UI change must account for `sm`/`md`/`lg` breakpoints. Never ship desktop-only layouts.
- **Autotask API has multiple entity paths**: Tasks can be at `Projects/{id}/Tasks`, `ProjectTasks`, or `Tasks`. Phases can be at `Projects/{id}/Phases` or `Phases`. The client tries multiple paths with fallbacks.
- **Autotask task status values are instance-specific**: Use the `?step=diagnose` endpoint to see actual picklist values for the customer's Autotask instance. Don't hardcode assumptions.
- **Duplicate companies**: When Autotask syncs companies, it can create duplicates of companies that already existed in the local DB. Use `?step=merge` to deduplicate (keeps AT-synced company, moves projects from non-AT duplicate).
- **Empty phases after sync**: If phases show up empty, the task API likely failed silently. Use `?step=resync` to re-fetch and also check `?step=diagnose` for API errors. The resync step also cleans up genuinely empty phases and updates phase statuses based on task completion.
- **maxDuration 60**: The Autotask trigger route uses `maxDuration = 60` (60s Vercel function timeout) since sync can be slow. Page size is 5 projects per request to stay within timeout.
- **Autotask write-back: PATCH vs POST**: Task status PATCH returns 404 on all 3 entity paths (`Projects/{id}/Tasks`, `ProjectTasks`, `Tasks`) for this Autotask instance. However, notes (POST `TaskNotes`) and time entries (POST `TimeEntries`) work fine. The task PATCH API (`/api/tasks/[id]`) returns `autotaskSyncFailed: true` when the write-back fails so the UI can warn the admin.
- **E2e test failures generate debug summaries**: When Playwright tests fail, the custom reporter writes structured JSON + markdown summaries to `test-results/failures/`. Run `npm run debug:failures` to review. See `docs/DEBUGGING_WORKFLOW.md` for the full Claude debugging process. A fix is never confirmed until the previously failing test passes.
- **forEach return does NOT stop execution**: `array.forEach(cb)` ignores return values inside the callback. If you need early return (e.g., to send an HTTP error response), use a `for` loop or `Array.from().some()`. The middleware had this bug for query param filtering — it was completely non-functional until fixed.
- **Never log auth details**: Do not use `console.log` for password validation results, session tokens, signing keys, company slugs in auth context, or env variable names related to credentials. These appear in Vercel function logs which are accessible to anyone with Vercel dashboard access.
- **Admin test failure dashboard**: Available at `/admin/debug/failures`.
- **Every Prisma schema field MUST have a migration**: Never add a field to `schema.prisma` without a corresponding migration SQL. Without a migration, any Prisma query without an explicit `select` will crash with "column does not exist". Runtime `ALTER TABLE` hacks in API routes are not sufficient — they only run when that specific endpoint is called, not when other pages query the same model. The migration `20260310000000_add_missing_columns` fixed a batch of these.
- **Run e2e tests on every change**: `npm run test:e2e` covers all systems. Tests are in `tests/e2e/` and include: admin page health, public page rendering, customer portal, blog system, marketing system, SOC system, Autotask sync, API health, auth enforcement, forbidden colors, responsive viewports, and security checks. Always run before pushing. Requires the `test_failures` table (run migration via `POST /api/test-failures/migrate` with Bearer MIGRATION_SECRET).
- **Reporting tables are NOT Prisma-managed**: The reporting system uses raw SQL tables (`report_tickets`, `report_time_entries`, etc.) created via migration endpoint. `src/lib/reporting/ensure-tables.ts` auto-creates them if missing. Don't try to add these to Prisma schema.
- **SOC tables are NOT Prisma-managed**: SOC uses raw SQL tables (`soc_incidents`, `soc_activities`, `soc_config`, `soc_rules`) created via `/api/soc/bootstrap` or `/api/soc/migrate`. Same pattern as reporting.
- **Self-chaining backfill**: The reporting sync uses fire-and-forget self-chaining — one API call triggers the next batch server-side. A single URL invocation runs all jobs to completion. Don't add polling or retry logic on top.
- **Cron auth uses Vercel Authorization header**: Cron endpoints authenticate via `Authorization: Bearer <CRON_SECRET>` header (set by Vercel automatically). Don't use secret in query params or URL paths.
- **Connection pool exhaustion**: Creating audiences or other bulk operations can exhaust the connection pool. Use explicit `$disconnect()` or connection-aware patterns for batch operations.
- **HR routes use raw pg, NEVER Prisma**: All routes under `src/app/api/hr/` use `new Pool({ connectionString: process.env.DATABASE_URL })`. Do not switch them to Prisma — it caused 500s. Always pass `companySlug` in the request body (POST) or query params (GET).
- **M365 routes use raw pg**: `src/app/api/admin/companies/[id]/m365/route.ts` uses raw pg. Column `updatedAt` must be quoted: `"updatedAt" = NOW()` — NOT `updated_at`.
- **M365 columns are snake_case in DB**: The 6 M365 columns (`m365_tenant_id`, `m365_client_id`, etc.) use `@map()` in Prisma schema and ARE snake_case in PostgreSQL. All other Company fields are camelCase in the DB.
- **Prisma schema + raw SQL migration must stay in sync**: Any column added via raw SQL migration must also be added to `prisma/schema.prisma`. Otherwise Prisma will throw `column (not available) does not exist` on any query touching that table. When adding schema fields, also check for `select` clauses in server components that pass data to components typed as the full Prisma model — those selects need the new fields too.
- **JSONB columns need ::jsonb cast in raw pg**: When inserting a JSON.stringify() string into a jsonb column via raw pg, use `$1::jsonb` not `$1`.
- **Tech onboarding wizard**: At `/admin/companies/[id]/onboard`. Step 1 = Autotask sync (run from Pipeline Status page). Step 2 = M365 app registration creds. Step 3 = test connection. Step 4 = mark complete + share portal URL.

## Customer Portal Architecture

The customer portal is at `/onboarding/[companyName]`. Key components:
- **OnboardingPortal** — Main container. `isAuthenticated` is always `true` (password gate removed 2026-03-20)
- **CustomerDashboard** — Primary dashboard with projects, tickets, stats, smart ticket sorting, metrics, chat CTA
- **HrRequestSection** — Employee Management card. Rendered below CustomerDashboard. Gated by manager email verify (not password)
- **HrRequestCards** — Action cards + FormRendererLoader. Loads config from `/api/forms/config`, renders FormRenderer (schema-driven)
- **FormRenderer** — Schema-driven step-by-step wizard (replaced legacy HrRequestWizard which was deleted 2026-03-22)
- **OnboardingJourney** — First-time login guided tour (5 steps, skippable)
- **TicketTimeline** — Chronological ticket comms trail from Autotask

**Portal auth**: URL is the access control — TCT shares the URL directly with the customer. `PasswordGate` component still exists but is never rendered.

**HR access gate**: Clicking "Request Employee Changes" prompts manager email verification. The email is checked against `company_contacts` for `customerRole = CLIENT_MANAGER` or `isPrimary = true`. This is stored in sessionStorage for the browser session.

**Ticket Timeline**: When a customer clicks a ticket, they see a full chronological timeline fetched from Autotask via `/api/customer/tickets/timeline`. Only external (customer-visible) notes appear. Customers can reply to open tickets via `/api/customer/tickets/reply`, which creates an Autotask note.

**Customer Invites**: Staff can invite contacts via `/api/contacts/invite`. Contacts get portal roles (CLIENT_MANAGER, CLIENT_USER, CLIENT_VIEWER). Set via the Portal Role badge (click to edit inline dropdown) on `/admin/contacts`. NOT managed in Autotask.

**Status badges**: Always display as `Status: <label>` (e.g., "Status: In Progress").

## Demo Mode

Demo mode (`src/lib/demo-mode.ts`) provides Contoso Industries demo data for safe presentations. Toggle via the AdminHeader button. When enabled, real customer data is hidden and replaced with demo data. Demo data is generated in-memory — no database writes.

## Sales & Marketing System

All marketing pages (`/admin/marketing/*`) must include AdminHeader and the ambient gradient background. The audience system supports Autotask Contact Action Groups, per-company targeting, and manual audience entry. Features include content visibility controls, AI content refinement, delivery modes with magic link tokens, campaign approval workflow, and audience drill-down views.

## Additional Documentation

### Documentation Hierarchy

```
docs/
  architecture.md        # System architecture (bootstrap doc 1)
  system-map.md          # Codebase map (bootstrap doc 2)
  data-model.md          # Database schema & entity relationships (bootstrap doc 3)
  session-summary.md     # Current state & recent changes (bootstrap doc 4)
  current-tasks.md       # Active work items (bootstrap doc 5)
  coding-standards.md    # Engineering standards (implementation rules)
  qa-standards.md        # QA checklist (testing rules)
  UI_STANDARDS.md        # UI design standards, forbidden colors
  runbooks/              # Incident response, debugging workflows
  plans/                 # Project plans, design documents
  reference/             # Setup guides, feature docs, historical
  archive/               # Old session summaries, superseded docs
```

### Authoritative docs (read at session start):
- `docs/architecture.md` — System architecture, data flows, integration diagrams
- `docs/system-map.md` — Which files own which subsystem
- `docs/data-model.md` — Database schema, entity relationships, data flows
- `docs/session-summary.md` — Current state, recent changes, key decisions
- `docs/current-tasks.md` — Active development work

### Implementation rules:
- `docs/coding-standards.md` — Engineering standards, QA process, ship cycle, safety rules
- `docs/qa-standards.md` — QA checklist, validation report template, severity levels
- `docs/UI_STANDARDS.md` — Approved colors, forbidden colors, design patterns

### Runbooks (`docs/runbooks/`):
- `RUNBOOK.md` — Incident response procedures, diagnostics, rollback steps
- `DEBUGGING_WORKFLOW.md` — AI self-healing debugging workflow, failure capture

### Plans (`docs/plans/`):
- `SOC_REDESIGN_PLAN.md` — SOC Analyst Agent redesign plan
- `plan.md` — General implementation plans
- `OLUJO_PROJECT.md` — Olujo brand awareness CRM project
- `PROJECT_OVERVIEW.md` — Comprehensive architecture reference

### Reference (`docs/reference/`):
- `AUTOTASK_SYNC.md` — Autotask PSA integration (sync system, API, troubleshooting)
- `REPORTING_ARCHITECTURE.md` — Reporting pipeline architecture
- `CUSTOMER_INVITE_AND_ONBOARDING.md` — Customer invite system and portal roles
- `ONBOARDING_PORTAL.md` — Customer onboarding portal
- `BLOG_SYSTEM_README.md` — AI blog generation system
- `CLAUDE_SESSION_PREFERENCES.md` — Session workflow and communication preferences
- `AZURE_AD_SETUP.md` — Microsoft OAuth configuration
- `DATABASE_SETUP.md` — Database setup guide
- `COMPLETE_RESEND_SETUP_GUIDE.md` — Resend email setup
- `CONTENT_EDITING_GUIDE.md`, `SPAM_PROTECTION.md`, `SELF_HEALING_AND_RELIABILITY.md`, and others

### Archive (`docs/archive/`):
- Historical session summaries and superseded documents

## Temporary Development Shortcuts

> **These practices are intentionally kept in place to speed up active development. They are NOT production-ready and must be cleaned up before broader customer-facing rollout.**

The following convenience-oriented practices currently exist in this documentation and codebase:

1. **Hardcoded secrets in CLAUDE.md** — MIGRATION_SECRET and CRON_SECRET values are listed below for fast Claude session access. These must be removed from documentation before customer-facing production expands.
2. **Auto-deploy from all branches** — Vercel auto-deploys preview environments from every push. This accelerates development but means any branch push creates a publicly accessible preview.
3. **Auto-merge workflow** — Claude branches auto-merge to main via GitHub Actions, which triggers production deployment. This is fast but bypasses manual review.
4. **Direct secret references in sync endpoints** — The Autotask sync trigger uses `?secret=MIGRATION_SECRET` in query params for convenience.
5. **Impersonation endpoint** — `/api/onboarding/impersonate` allows staff to access customer portal sessions. Useful for development/support but requires audit before broader rollout.
6. **Debug endpoints accessible** — `/admin/debug/failures`, `/admin/setup`, `/admin/run-migration`, `/blog/setup` are accessible with minimal auth guards.

**Rules for Claude sessions:**
- **Preserve** these shortcuts for now unless the user explicitly asks to remove them.
- **Do not expand** these shortcuts further (e.g., do not add more hardcoded secrets, do not add more unguarded endpoints).
- **Do not treat these as patterns to follow** for new code. New features should follow proper security practices.

---

## Pre-Launch Cleanup Required

> **Checklist for hardening before broader customer-facing production access. This is a future task — not the immediate priority — but it must be completed before the platform is opened to customers beyond the current controlled group.**

- [ ] **Remove secrets from documentation** — Remove MIGRATION_SECRET and CRON_SECRET values from CLAUDE.md. Reference environment variables only.
- [ ] **Move all secrets to environment-variable-only handling** — Ensure no secret values appear in source code, documentation, or URL query parameters.
- [ ] **Review deployment and branch protection rules** — Add required reviews for main branch, restrict auto-merge to passing CI only.
- [ ] **Review auto-deploy behavior** — Ensure customer-facing production deploys require explicit approval or at minimum passing e2e tests.
- [ ] **Audit auth flows and impersonation** — Review `/api/onboarding/impersonate` for proper authorization, logging, and rate limiting. Consider adding audit trail for impersonation sessions.
- [ ] **Review logging for secret leakage** — Audit all `console.log` statements to ensure no secrets, tokens, or sensitive customer data appear in Vercel function logs.
- [ ] **Validate production-safe migration procedures** — Ensure database migrations cannot be triggered by unauthorized parties. Review MIGRATION_SECRET rotation policy.
- [ ] **Audit admin/debug endpoints** — Add session auth guards to `/admin/setup`, `/admin/run-migration`, `/blog/setup`. Consider removing or restricting `/admin/debug/failures` in production.
- [ ] **Confirm CSP and third-party script usage** — Review `'unsafe-inline'` in production CSP. Implement CSP violation reporting (`report-uri` / `report-to`).
- [ ] **Review demo mode and internal-only tools** — Ensure demo mode cannot be accidentally activated in production by non-staff users.
- [ ] **Verify preview/production environment separation** — Ensure preview deployments cannot access production data or send real emails to customers.
- [ ] **Audit customer portal security** — Review password hashing, session handling, rate limiting on auth endpoints, and contact role enforcement.
- [ ] **Review MCP server access** — Ensure the MCP server (`mcp-server/`) is not deployed or accessible in production environments.

---

## Known Secrets & API Endpoints

> **TEMPORARY DEVELOPMENT CONVENIENCE** — These values are listed here to speed up Claude sessions during active development. They must be removed before broader production rollout. See "Pre-Launch Cleanup Required" above.

**MIGRATION_SECRET**: `Ty3svIEQ5Ehntq4xJzYjAUT5UptrYXOj7tseRTxHYDI=`
**CRON_SECRET**: `a63d095dce16b3ad9d55cc79a3db7b9f600502272033b8c3284673e23d757cb1`

**Production base URL**: `https://www.triplecitiestech.com`
**Preview URL pattern**: `https://<branch-name>-triplecitiestech.vercel.app`

**Always provide full URLs** when referencing API endpoints or pages. Never give partial paths — always include the full domain. Example: `https://www.triplecitiestech.com/api/soc/migrate` not just `/api/soc/migrate`.

**User runs Windows (PowerShell)** — Always provide commands in PowerShell syntax, never bash/curl/Mac/Linux. Use `Invoke-RestMethod` or `Invoke-WebRequest` instead of `curl`.
