# Current Tasks

> Last updated: 2026-03-20

Active development work and outstanding items. Only currently active work belongs here — completed work moves to `docs/session-summary.md`.

---

## In Progress

(No items currently in progress)

---

## Immediate Backlog (do next)

### 1. kflorance M365 Setup
- Go to `/admin/companies/kflorance/onboard` → Step 2
- Enter Azure AD Tenant ID, Client ID, Client Secret for the kflorance tenant
- Click Test Connection, then Mark Complete
- Once done, HR forms will show live groups/licenses/users from Azure AD

### 2. DNS — portal subdomain
- Add CNAME record: `portal` → `48fc0e6b423bbc2a.vercel-dns-010.com.`
- Then add `portal.triplecitiestech.com` as a domain alias in Vercel project settings

### 3. Pax8 Secret Rotation
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
- **File**: `src/components/onboarding/HrRequestWizard.tsx`

### SOC Phase 2
- **Status**: Not started
- **Plans**: `docs/plans/SOC_REDESIGN_PLAN.md`
- OSINT API integrations (AbuseIPDB, VirusTotal, AlienVault OTX, ip-api.com)
- Auto-action tiers (Tier 1 full auto, Tier 2 semi-auto, Tier 3/4 human required)
- Single-pass AI analysis

### Background Job Architecture
- **Status**: Researched, not started
- **Problem**: Long-running HR provisioning (create AD user, assign licenses, add to groups) can't run inside a Vercel function (10s timeout on hobby, 60s on pro)
- **Options**: BullMQ on Railway, Upstash QStash, or Vercel Cron + DB job queue
- **User preference**: "reliable background job processing architecture, not simple request/response"

### Pax8 License Sync
- **Status**: Not started
- Pax8 has a partner API for subscription/license data
- Goal: show per-company license counts in admin dashboard

---

## Completed This Session (2026-03-20)

| Task | Commit |
|---|---|
| Fix `page` implicit any in `graph.ts` pagination | `4170d65` |
| Fix M365 sync errors: add M365 columns to Prisma schema | `a766b47` |
| Fix `updated_at` → `"updatedAt"` in M365 raw SQL routes | `93c7945` |
| Fix Prisma type cascade: add M365 fields to `new/page.tsx` select | `5da471e` |
| Remove portal password gate | `a7fbd1a` |
| Improve tech onboarding wizard Step 1 checklist | `a766b47` |
| Clarify role badge click-to-edit in wizard instructions | `93c7945` |
| Fix HR submit route: `companies.name` → `"displayName"` as name | `claude/fix-hr-submit-name-column` |
