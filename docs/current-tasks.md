# Current Tasks

> Last updated: 2026-03-27

Active development work and outstanding items. Only currently active work belongs here — completed work moves to `docs/session-summary.md`.

---

## Critical — Verify After Deploy

### 1. Verify SSL Fix Resolved Production Issues
- **What**: Pool consolidation removed SSL config from both `prisma.ts` and `db-pool.ts`, causing all production DB connections to fail silently
- **Fixed in**: commits `8984702` (db-pool.ts) and `fb0edd6` (prisma.ts)
- **Verify**: After deploy, confirm health monitor stops sending false alerts
- **Verify**: Re-submit kflorance HR onboarding and confirm Autotask ticket is created

### 2. Apply Pending Database Migrations
- `error_logs` table — needed by health monitor error rate check and `src/lib/error-logger.ts`
- `reporting_job_status` table — needed by health monitor cron job check
- These may already exist if reporting migrate endpoint was called; health monitor now gracefully handles missing tables
- Run via: `POST /api/reports/migrate` with Bearer MIGRATION_SECRET

### 3. Verify Demo Mode Works End-to-End
- Toggle demo mode on in admin header
- Navigate to `/admin/companies/[id]` — company name, contacts, projects should be anonymized
- Navigate to `/admin/preview/[slug]` — portal should load (was crashing), all data anonymized
- Check reporting pages, SOC dashboard, ticket views — all should show fake data

---

## Immediate Backlog (do next)

### 4. kflorance M365 Setup
- Go to `/admin/companies/kflorance/onboard` → Step 2
- Enter Azure AD Tenant ID, Client ID, Client Secret for the kflorance tenant
- Click Test Connection, then Mark Complete
- Once done, HR forms will show live groups/licenses/users from Azure AD

### 5. DNS — portal subdomain
- Add CNAME record: `portal` → `48fc0e6b423bbc2a.vercel-dns-010.com.`
- Then add `portal.triplecitiestech.com` as a domain alias in Vercel project settings

### 6. Pax8 Secret Rotation
- Log into Pax8 portal → rotate `PAX8_CLIENT_SECRET`
- Update `PAX8_CLIENT_SECRET` env var in Vercel project settings

---

## Question Engine

### Phase 1: Database + Form Config API (COMPLETE)
- Migration: `migrations/add_question_engine_tables.sql` + `migrations/seed_default_forms.sql`
- API: `GET /api/forms/config` — merge algorithm + M365 data source resolution + idempotent migrations

### Phase 2: Form Renderer + Portal (COMPLETE)
- `FormRenderer.tsx` — schema-driven step-by-step wizard
- `FormField.tsx` — all field types (text, select, multi_select, radio, checkbox, user_select, date, etc.)
- `VisibilityEngine.ts` — conditional visibility rule evaluation
- `HrRequestCards.tsx` — action cards + FormRendererLoader that fetches config and renders FormRenderer
- Legacy `HrRequestWizard.tsx` DELETED (was dead code)

### Phase 3: Admin UI (NOT STARTED)
- Global form builder at `/admin/settings/form-builder`
- Per-customer config at `/admin/companies/{id}/form-config`

### Phase 4: Thread Integration (NOT STARTED)
- Form links system (create, validate, expire)
- `/form/[token]` portal route

### Phase 5: Automation Mapping (NOT STARTED)
- Automation mapping admin UI
- Process route evaluation of mappings

---

## Upcoming Features

### HR Wizard — Live M365 Group Pickers
- **Status**: Built, waiting on M365 creds per company
- **What it does**: Step 2 of HR wizard shows checkboxes for Azure AD security groups, distro lists, Teams, SharePoint sites; license SKU dropdown; user dropdown (clone-from)
- **Requirement**: Each company needs M365 credentials entered via tech onboarding wizard first

### SOC Phase 2
- **Status**: Not started
- **Plans**: `docs/plans/SOC_REDESIGN_PLAN.md`
- OSINT API integrations (AbuseIPDB, VirusTotal, AlienVault OTX)
- Auto-action tiers (Tier 1 full auto, Tier 2 semi-auto, Tier 3/4 human required)
- Single-pass AI analysis

### Background Job Architecture
- **Status**: Researched, not started
- **Problem**: Long-running HR provisioning can't run inside a Vercel function (10s timeout on hobby, 60s on pro)
- **Options**: BullMQ on Railway, Upstash QStash, or Vercel Cron + DB job queue

### Pax8 License Sync
- **Status**: Not started
- Pax8 has a partner API for subscription/license data
- Goal: show per-company license counts in admin dashboard

---

## Recently Completed (2026-03-27)

| Task | Commit |
|---|---|
| Pool consolidation: 24 pools → shared `getPool()` | `b07e7a2` |
| Demo mode on company detail page + preview banner | `8c819f7` |
| Demo mode for project/phase/task titles in portal | `ed07663` |
| Fix demo mode null/undefined crash | `afd47f5` |
| Fix missing SSL in db-pool.ts (critical) | `8984702` |
| Fix health monitor job name mismatch + missing tables | `4653052` |
| Fix missing SSL in prisma.ts (critical) | `fb0edd6` |
