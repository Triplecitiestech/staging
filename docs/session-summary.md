# Session Summary

> Last updated: 2026-03-20
> Branch: `main`
> Latest commit: `a7fbd1a` (portal password gate removal)

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

### 3. Customer Portal (`/onboarding/[companyName]`)
- **No password required** — URL is the access control (removed password gate 2026-03-20)
- Shows `CustomerDashboard` (ticket stats + projects) and `HrRequestSection` for all visitors
- `HrRequestSection` (Employee Management card) is gated by manager email verification
- Manager email verify calls `/api/hr/verify-manager` → checks `company_contacts` for CLIENT_MANAGER or isPrimary

### 4. HR Request System
- All HR API routes use **raw `pg` Pool** (NOT Prisma) — Prisma caused 500s due to schema/adapter issues
- `companySlug` passed explicitly in all API calls (no session cookie dependency)
- Routes: `/api/hr/submit`, `/api/hr/verify-manager`, `/api/hr/requests`, `/api/hr/requests/[id]`
- Background processing via fire-and-forget fetch to `/api/hr/process`
- JSONB columns require `::jsonb` cast when passing `JSON.stringify()` string

---

## Database

**Connection**: Prisma Data Platform (db.prisma.io:5432) via `DATABASE_URL` env var
**ORM**: Prisma 7.2.0 with PrismaPg serverless adapter
**Important**: Some API routes use raw `pg.Pool` directly (all HR routes, M365 routes)

### Recent Migrations (run manually via raw SQL)
- `migrations/add_m365_tenant_credentials.sql` — **ALREADY RUN** — added to `companies` table:
  - `m365_tenant_id`, `m365_client_id`, `m365_client_secret` (TEXT)
  - `m365_verified_at` (TIMESTAMPTZ)
  - `m365_setup_status` (TEXT, default 'not_configured')
  - `onboarding_completed_at` (TIMESTAMPTZ)
- These columns are now also declared in `prisma/schema.prisma` with `@map()` annotations

### Column naming gotcha
- Prisma stores camelCase field names as-is in PostgreSQL (no auto snake_case)
- `updatedAt` in schema = `"updatedAt"` column in DB (must quote in raw SQL)
- `autotaskCompanyId` = `"autotaskCompanyId"` column in DB
- Exception: M365 columns use `@map("snake_case")` so they ARE snake_case in DB

### HR Tables (raw SQL, NOT Prisma-managed)
- `hr_requests` — main request record
- `hr_request_steps` — step-by-step processing log
- `hr_audit_logs` — audit trail

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
| Raw `pg` for HR routes | Prisma 7 + serverless adapter caused intermittent 500s on hr tables |
| `companySlug` in request body/params | Session cookie unreliable in serverless; explicit is safer |
| Portal URL = access control | No shared password needed; manager email verify handles HR access |
| Per-customer Azure AD app | Each customer tenant needs its own app registration |
| `"updatedAt"` quoted in raw SQL | Prisma stores camelCase field names verbatim in PostgreSQL |

---

## Environment Variables Required

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Prisma Data Platform direct URL |
| `PRISMA_DATABASE_URL` | Same as DATABASE_URL (some routes use this) |
| `AUTOTASK_API_USERNAME` | Autotask API credentials |
| `AUTOTASK_API_SECRET` | Autotask API credentials |
| `AUTOTASK_API_INTEGRATION_CODE` | Autotask API credentials |
| `AUTOTASK_API_BASE_URL` | `https://webservices14.autotask.net/ATServicesRest` |
| `CRON_SECRET` | Bearer token for cron job auth |
| `NEXTAUTH_SECRET` | NextAuth session signing |
| `AZURE_AD_*` | Azure AD OAuth for admin login |

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

### Migration & Seed
- `migrations/add_question_engine_tables.sql` — creates all 8 tables with indexes
- `migrations/seed_default_forms.sql` — seeds default onboarding + offboarding schemas (v1, published)

### API Routes
- `GET /api/forms/config?companySlug=X&type=onboarding&email=Y` — returns merged form config with resolved M365 data sources
  - Uses raw `pg` Pool (matches HR route convention)
  - Validates email is active company contact
  - Loads published global schema, applies customer overrides, resolves M365 data sources in parallel

### Question Engine Phase Status (as of 2026-03-22)
- **Phase 1**: Database + Form Config API — COMPLETE
- **Phase 2**: FormRenderer + Portal Integration — COMPLETE (FormRenderer, FormField, VisibilityEngine, HrRequestCards with FormRendererLoader)
- Phase 3: Admin UI (global form builder + per-customer config) — NOT STARTED
- Phase 4: Thread integration (form links, webhook handler) — NOT STARTED
- Phase 5: Automation mapping engine — NOT STARTED

### Key Architecture (2026-03-22)
- **Legacy HrRequestWizard.tsx DELETED** — it was dead code, never imported
- **FormRenderer is the single UI** — schema-driven, fetches config from `/api/forms/config`
- **Idempotent migrations run on every config request** — no separate migration step needed
- **Process route aligned with schema** — handles both new multi_select group fields AND legacy single fields
- **Submit route aligned** — idempotency key uses `employee_to_offboard` for offboarding

---

## Remaining Work (as of 2026-03-22)

### Immediate
1. **kflorance M365 setup** — enter Azure AD app creds via Admin → Companies → kflorance → Onboard Customer → Step 2
2. **DNS** — add CNAME `portal → 48fc0e6b423bbc2a.vercel-dns-010.com.` for `portal.triplecitiestech.com`

### Soon
3. **Pax8 secret rotation** — rotate `PAX8_CLIENT_SECRET` in Pax8 portal → update Vercel env var
4. **Admin form builder UI** (Phase 3) — global form builder at `/admin/settings/form-builder`

### Backlog
- SOC Phase 2: OSINT integrations (AbuseIPDB, VirusTotal, AlienVault OTX)
- Background job architecture for long-running provisioning (BullMQ or similar)
- Pax8 license sync integration
