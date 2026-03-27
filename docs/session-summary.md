# Session Summary

> Last updated: 2026-03-27
> Branch: `claude/continue-platform-work-2xyFK`
> Latest commit: `fb0edd6` (SSL fix for Prisma pg pool)

---

## Current Architecture

Triple Cities Tech is a Next.js 15 App Router application deployed on Vercel (iad1) with four major surface areas:

### 1. Public Marketing Site
- Route group `src/app/(marketing)/` — home, about, contact, services, industries, support, payment, MSA
- `/schedule` page with embedded Calendly widget
- `/blog` with AI-generated content, SEO optimization, dynamic sitemap/robots.txt
- Cloudflare Turnstile + honeypot + rate limiting on contact form

### 2. Admin Dashboard (`/admin/*`)
- NextAuth (Azure AD) session required for all `/admin/*` routes
- Companies, Projects, Contacts, SOC, Reporting/Analytics, Blog CMS, Marketing Campaigns, Pipeline Status
- `/admin/companies/[id]/onboard` — tech onboarding wizard (4-step: Autotask sync, M365 creds, test connection, portal access)
- `/admin/preview/[slug]` — admin portal preview (renders customer portal inside admin layout with preview banner)
- Demo mode toggle in AdminHeader — anonymizes all identifying data across admin and portal preview

### 3. Customer Portal (`/onboarding/[companyName]`)
- **No password required** — URL is the access control (removed password gate 2026-03-20)
- Shows `CustomerDashboard` (ticket stats + projects) and `HrRequestSection` for all visitors
- `HrRequestSection` (Employee Management card) is gated by manager email verification
- Manager email verify calls `/api/hr/verify-manager` → checks `company_contacts` for CLIENT_MANAGER or isPrimary

### 4. HR Request System
- All HR API routes use **`getPool()` from `src/lib/db-pool.ts`** (NOT Prisma) — Prisma caused 500s due to schema/adapter issues
- `companySlug` passed explicitly in all API calls (no session cookie dependency)
- Routes: `/api/hr/submit`, `/api/hr/verify-manager`, `/api/hr/requests`, `/api/hr/requests/[id]`
- Background processing via fire-and-forget fetch to `/api/hr/process`
- JSONB columns require `::jsonb` cast when passing `JSON.stringify()` string
- **Ticket creation**: `/api/hr/process` creates Autotask tickets via `POST ${AUTOTASK_API_BASE_URL}/V1.0/Tickets` after form submission

---

## Database

**Connection**: PostgreSQL via Vercel Postgres / Prisma Data Platform
**ORM**: Prisma 7.2.0 with PrismaPg serverless adapter
**Important**: Some API routes use raw `pg.Pool` directly via `getPool()` from `src/lib/db-pool.ts` (all HR routes, M365 routes, portal auth, form routes — 24+ routes total)

### Connection Pools (as of 2026-03-27)

Two separate pg pools exist — both **MUST** have SSL config in production:

| Pool | File | Purpose | Max |
|------|------|---------|-----|
| Prisma pool | `src/lib/prisma.ts` | All Prisma ORM queries | 5 |
| Raw pg pool | `src/lib/db-pool.ts` | 24+ routes needing direct SQL | 5 |

**Critical**: Both pools MUST include `ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false`. Without this, all database connections silently fail in production. This was a regression during pool consolidation (2026-03-27) and caused:
- HR onboarding tickets not being created (email sent but background processor couldn't connect to DB)
- Health monitor reporting all systems degraded
- Autotask sync status checks timing out

### Pool Consolidation (2026-03-27)
- **Before**: 24 separate `new Pool()` instances scattered across route files
- **After**: Single shared `getPool()` from `src/lib/db-pool.ts` with `max: 5`, SSL, keepalive
- Prisma pool in `prisma.ts` also rewritten with resilient config
- **All 24 routes updated** to import `getPool()` instead of creating their own pools

### Recent Migrations (run manually via raw SQL)
- `migrations/add_m365_tenant_credentials.sql` — added M365 columns to `companies` table
- `20260306_add_error_logs/migration.sql` — creates `error_logs` table (may not yet be applied to production)
- `20260307100000_add_reporting_tables/migration.sql` — creates `reporting_job_status` table and reporting tables

### Column naming gotcha
- Prisma stores camelCase field names as-is in PostgreSQL (no auto snake_case)
- `updatedAt` in schema = `"updatedAt"` column in DB (must quote in raw SQL)
- `autotaskCompanyId` = `"autotaskCompanyId"` column in DB
- Exception: M365 columns use `@map("snake_case")` so they ARE snake_case in DB

### HR Tables (raw SQL, NOT Prisma-managed)
- `hr_requests` — main request record (includes `autotask_ticket_id` column)
- `hr_request_steps` — step-by-step processing log
- `hr_audit_logs` — audit trail

---

## Demo Mode (as of 2026-03-27)

### Architecture
- **Purely client-side display transform** — no database modifications
- React Context: `DemoModeProvider` wraps admin layout (`src/app/admin/layout.tsx`)
- Toggle via AdminHeader button — persisted in `localStorage` key `admin-demo-mode`
- When active, all identifying data is anonymized via deterministic hash functions

### Context API (`useDemoMode()`)
Returns: `{ active, toggle, company, person, email, title, num, pct }`
- `company(name)` → fake company name (from 20 templates)
- `person(name)` → fake person name (first + last)
- `email(addr)` → fake email (first.last@domain)
- `title(text)` → fake ticket/project title (from 40 templates with `{person}` and `{company}` placeholders)
- `num(value, key)` → skewed ±5-15%
- `pct(value, key)` → skewed ±3-8 points
- All functions are **identity passthroughs** when demo mode is off or when called outside the provider

### Key Implementation Files
- `src/lib/demo-mode.ts` — Core anonymization engine (anonCompany, anonPerson, anonEmail, anonTicketTitle, skewNumber, skewPercent)
- `src/components/admin/DemoModeProvider.tsx` — React context provider
- `src/components/admin/PreviewBanner.tsx` — Client component for admin preview banner (anonymizes company name)

### Components with Demo Mode (all use `useDemoMode()`)
- `src/components/companies/CompanyDetail.tsx` — company name, slug, contacts, projects
- `src/components/onboarding/OnboardingPortal.tsx` — portal header, company name
- `src/components/onboarding/CustomerDashboard.tsx` — company name, project titles, phase titles, task text, comment authors
- `src/components/tickets/TicketTable.tsx` — ticket titles, assigned-to names
- `src/components/tickets/TicketDetail.tsx` — ticket title, assigned-to
- `src/components/tickets/TimelineEntry.tsx` — author names
- `src/components/reporting/BusinessReviewDetail.tsx` — company name, reviewer names, emails
- `src/components/reporting/AnnualReportDetail.tsx` — company name
- `src/components/reporting/PriorityBreakdownChart.tsx` — company names, assigned-to
- `src/components/soc/SocDashboardClient.tsx` — company names, assigned-to, ticket titles
- `src/components/soc/SocTicketDetail.tsx` — company name, assigned-to, ticket title

### Null Safety
All anonymization functions return `''` (empty string) when given null/undefined input. The `title` callback in DemoModeProvider also guards: `anonTicketTitle(t || '')`. This prevents React rendering crashes when demo mode is active and data fields are undefined.

---

## Health Monitor (as of 2026-03-27)

### Endpoint
`GET /api/cron/health-monitor` — runs every 15 minutes via Vercel Cron

### Checks Performed
1. **Database Connectivity** — `SELECT 1` with retry
2. **Error Rate** — queries `error_logs` table (gracefully skips if table doesn't exist)
3. **Cron Job Health** — checks `reporting_job_status` table for 4 jobs (gracefully skips if table doesn't exist):
   - `sync_tickets` (max age: 6 hours)
   - `sync_time_entries` (max age: 6 hours)
   - `aggregate_company` (max age: 48 hours)
   - `aggregate_technician` (max age: 48 hours)
4. **Autotask API** — checks latest `autotask_sync_logs` entry

### Alert Behavior
- Sends email to `kurtis@triplecitiestech.com` when issues detected
- 30-minute cooldown prevents re-alerting for same system
- Sends resolution email when previously-alerted systems recover
- Self-healing: re-triggers stale/failed cron jobs automatically

### Bug Fixed (2026-03-27)
Job names used hyphens (`sync-tickets`) but job tracker records underscores (`sync_tickets`). DB lookup never matched, causing false "never run" alerts for all 4 jobs every 15 minutes. Fixed by using correct underscore names for DB lookups.

---

## M365 Integration

### Architecture
- Per-customer Azure AD app registrations stored in `companies` table
- Graph API client: `src/lib/graph.ts` — token cache per tenantId (5-min buffer before expiry)
- Methods: `getUsers`, `getSecurityGroups`, `getDistributionLists`, `getM365Groups`, `getSharePointSites`, `getLicenseSkus`
- `graphGetAll<T>()` handles `@odata.nextLink` pagination automatically

### API Routes
- `GET/PUT/POST/PATCH /api/admin/companies/[id]/m365` — credentials CRUD + test connection + mark complete
  - **Raw pg** — credentials saved to `m365_tenant_id`, `m365_client_id`, `m365_client_secret`
  - Column is `"updatedAt"` (camelCase, must quote in raw SQL)
- `GET /api/hr/m365-data?companySlug=X&email=Y` — returns live tenant groups/licenses/users/sites

### Tech Onboarding Wizard (`/admin/companies/[id]/onboard`)
- Step 1: Autotask sync check — links to Pipeline Status (`/admin/reporting/status`) and Contacts (`/admin/contacts`)
- Step 2: M365 app registration — enter Tenant ID, Client ID, Client Secret
- Step 3: Test connection — calls POST `/api/admin/companies/[id]/m365` with `{ action: 'test' }`
- Step 4: Portal access — shows portal URL, marks onboarding complete

### Setting Manager Role
- Go to `/admin/contacts`, find the contact, click the colored **Portal Role badge** (e.g. "User") in the Portal Role column — it becomes an inline dropdown
- Select **Manager** (CLIENT_MANAGER)
- This is done in the TCT admin site, NOT in Autotask
- Portal roles are stored in `company_contacts.customerRole`

---

## Autotask Sync

### Sync errors fixed (2026-03-20)
- Root cause: M365 columns existed in DB but not in `prisma/schema.prisma`
- Prisma threw `column (not available) does not exist` on any company create/update
- Fix: added all 6 M365 columns to schema with `@map()` annotations

### Sync flow
- Cron: `/api/cron/autotask-sync` (every 5 min via Vercel Cron)
- Manual trigger: `/admin/reporting/status` → click Run next to "Sync Tickets"
- Syncs: companies → contacts → projects → phases → tasks (incremental if prior success log exists)
- Logs to `autotask_sync_logs` table, viewable at `/admin/autotask-logs`

---

## Key Decisions & Conventions

| Decision | Rationale |
|---|---|
| Raw `pg` via `getPool()` for HR routes | Prisma 7 + serverless adapter caused intermittent 500s on hr tables |
| `companySlug` in request body/params | Session cookie unreliable in serverless; explicit is safer |
| Portal URL = access control | No shared password needed; manager email verify handles HR access |
| Per-customer Azure AD app | Each customer tenant needs its own app registration |
| `"updatedAt"` quoted in raw SQL | Prisma stores camelCase field names verbatim in PostgreSQL |
| Shared pool via `getPool()` | Consolidated 24 separate pools to prevent connection exhaustion |
| SSL required on all pools | Production DB requires SSL; omitting it causes silent connection failures |

---

## Question Engine (Phase 1 — 2026-03-20)

### Architecture
- Full design doc: `docs/plans/QUESTION_ENGINE_ARCHITECTURE.md`
- Database-driven form schemas with per-customer overrides
- Merge algorithm: global schema + sparse customer overrides + custom sections/questions
- M365 data source resolution at API request time via Graph client

### Database Tables (raw SQL, NOT Prisma-managed)
- `form_schemas` — versioned global form templates (onboarding/offboarding)
- `form_sections` — normalized sections within a schema
- `form_questions` — normalized questions with type, validation, data sources, visibility rules
- `customer_form_configs` — sparse per-customer overrides (hide/reorder/relabel)
- `customer_custom_questions` — per-customer additional questions
- `customer_custom_sections` — per-customer additional sections
- `automation_mappings` — maps answer values to backend automation actions
- `form_links` — secure form links for Thread integration

### Question Engine Phase Status (as of 2026-03-22)
- **Phase 1**: Database + Form Config API — COMPLETE
- **Phase 2**: FormRenderer + Portal Integration — COMPLETE
- Phase 3: Admin UI (global form builder + per-customer config) — NOT STARTED
- Phase 4: Thread integration (form links, webhook handler) — NOT STARTED
- Phase 5: Automation mapping engine — NOT STARTED

---

## Session Work Log (2026-03-27)

### Commits This Session

| Commit | Description |
|---|---|
| `b07e7a2` | Pool consolidation: 24 separate pools → shared `getPool()` + resilient `prisma.ts` (from prior session) |
| `8c819f7` | Add demo mode to CompanyDetail + PreviewBanner component |
| `ed07663` | Fix demo mode: anonymize project titles, phase titles, task text in portal |
| `afd47f5` | Fix demo mode crash: anonymization functions returning null/undefined |
| `8984702` | Fix critical: add missing SSL config to shared db pool |
| `4653052` | Fix health monitor: job name mismatch + missing table handling |
| `fb0edd6` | Fix critical: add missing SSL config to Prisma pg pool |

### Issues Fixed
1. **Demo mode not working on company detail page** — added `useDemoMode()` to `CompanyDetail.tsx`
2. **Demo mode not working on portal preview** — anonymized project titles, phase titles, task text in `CustomerDashboard.tsx` and `OnboardingPortal.tsx`; created `PreviewBanner.tsx` client component
3. **Demo mode crashing portal** — `anonTicketTitle()` and other anon functions returned null/undefined when given falsy input, crashing React rendering
4. **HR onboarding tickets not created** — `db-pool.ts` missing SSL config; background processor couldn't connect to production DB
5. **Health monitor false alerts every 15 minutes** — job name mismatch (hyphens vs underscores) + missing table crashes
6. **Autotask API "connection timeout" alerts** — `prisma.ts` pool also missing SSL config

### Root Cause
All database connection issues traced to the pool consolidation commit which rewrote both `prisma.ts` and `db-pool.ts` but omitted the SSL configuration line from both. This single omission caused cascading failures across the entire platform in production.

---

## Remaining Work (as of 2026-03-27)

### Immediate
1. **Verify kflorance onboarding** — re-submit after SSL fix deploys; confirm Autotask ticket creates
2. **Apply pending migrations** — `error_logs` and `reporting_job_status` tables may not exist in production DB
3. **Verify health monitor stops flooding** — after deploy, confirm no more false alerts

### Soon
4. **kflorance M365 setup** — enter Azure AD app creds via Admin → Companies → kflorance → Onboard Customer → Step 2
5. **DNS** — add CNAME `portal → 48fc0e6b423bbc2a.vercel-dns-010.com.` for `portal.triplecitiestech.com`
6. **Pax8 secret rotation** — rotate `PAX8_CLIENT_SECRET` in Pax8 portal → update Vercel env var

### Backlog
- Admin form builder UI (Phase 3) — global form builder at `/admin/settings/form-builder`
- SOC Phase 2: OSINT integrations (AbuseIPDB, VirusTotal, AlienVault OTX)
- Background job architecture for long-running provisioning (BullMQ or similar)
- Pax8 license sync integration
