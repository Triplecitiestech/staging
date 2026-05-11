# Session Summary

> Last updated: 2026-05-11 (Session 8 — Multi-Tenant M365 Onboarding, Admin Nav Restructure, Wizard Rebuild)
> Branch: `claude/fix-pto-calendar-sync-a8dAt`

## What Was Done This Session

### 1. Multi-Tenant M365 Admin-Consent Onboarding (replaces per-tenant app reg)

Customer onboarding for Microsoft 365 used to require the TCT tech to walk the customer through a 15-step manual app-registration process in their Entra tenant, then copy a client ID, tenant ID, and client secret back into the wizard. That's gone. Now there is a single TCT-published multi-tenant app registration (`TCT Customer Portal`) in the TCT tenant, and the customer's Global Admin grants tenant-wide admin consent in one click.

**Dual-mode support** — `legacy` (per-tenant app reg) and `multi_tenant` (admin consent) coexist on `companies` rows. Existing customers keep working; new ones go through the new flow. Defaults to `legacy` so historical data is preserved.

**Schema additions** (additive — no breaking changes):
- `companies.m365_consent_mode` (`'legacy' | 'multi_tenant'`, default `'legacy'`)
- `companies.m365_consent_granted_at` (timestamp, set by the consent callback)
- Wired into `src/app/api/migrations/run/route.ts` per the "no Prisma migrate" gotcha

**New routes:**
- `GET /api/admin/m365/consent?companyId=…` — initiates Microsoft `/adminconsent` flow, scoped to `organizations` (work tenants only), state-signed with `signState()`
- `GET /api/admin/m365/consent/callback` — Microsoft redirect target. Validates HMAC state, blocks tenant double-binding, writes `m365_tenant_id` + `m365_consent_mode='multi_tenant'` + `m365_consent_granted_at`, redirects to wizard

**Library refactors:**
- `src/lib/graph.ts` — `getTenantCredentials()` and `getTenantCredentialsBySlug()` now branch on `m365_consent_mode`. Multi-tenant mode sources `clientId`/`clientSecret` from env vars; legacy mode still pulls them from `companies` row. `getAccessToken()` is now exported. All 8 downstream Graph callers (HR, cron, forms, compliance) pick up the new behavior transparently — zero changes needed at call sites.
- `src/lib/compliance/collectors/graph.ts` — dropped duplicate token cache, delegates to central `getAccessToken`
- `src/lib/compliance/engine.ts` — `graphConfigured` check honors both modes (legacy needs `m365_client_id`; multi-tenant needs `m365_consent_granted_at`)

**Required env vars** (added to `RECOMMENDED_VARS` in `src/lib/env-validation.ts`):
- `M365_PORTAL_CLIENT_ID` — Application (client) ID of the multi-tenant TCT app
- `M365_PORTAL_CLIENT_SECRET` — Client secret Value (not Secret ID)
- `M365_PORTAL_REDIRECT_URI` — optional override; defaults to `${NEXT_PUBLIC_BASE_URL}/api/admin/m365/consent/callback`

**Portal SSO** (`/api/portal/auth/login` + `/api/portal/auth/callback`) — both branch on consent_mode. Multi-tenant flow uses `M365_PORTAL_CLIENT_ID/SECRET` against the customer's tenant ID; legacy flow unchanged.

### 2. Customer Onboarding Wizard — Full Rebuild (4 → 5 steps)

Wizard at `/admin/companies/[id]/onboard` now has linear, guided steps with inline actions instead of "go to another page and click some button":

1. **Autotask Sync** — verify `autotaskCompanyId`, sync this company's contacts with a single button
2. **M365 Connection** — single "Connect Microsoft 365" button + "Copy consent URL (for incognito)" + violet incognito-workflow callout
3. **Test Connection** — verifies Graph access
4. **Manager & Invite** (NEW) — fetches contacts on visit, tech picks one via radio button, clicks **Set as Manager + Send Invite**. Chains `PATCH /api/contacts/invite` (role=CLIENT_MANAGER) + `POST /api/contacts/invite` (send welcome email) in one action. No more "leave the wizard, go to /admin/contacts, click the envelope icon" detour.
5. **Finalize** — review checklist, **Mark Onboarding Complete**

**Step 1 also gained:** an inline Autotask company search/link UI when `autotaskCompanyId` is null. Searches AT via `/api/autotask/companies/search?q=`, links via `POST /api/autotask/companies/import { companyId, autotaskCompanyId }`. Fixes the case where a company was created via the manual New Company form path without an AT link.

**Step status durability fixes:**
- Step 2 complete check derives from connection state (`m365_consent_granted_at` set, or credentials saved) — not the conflated `m365_setup_status === 'verified'` flag (which also gates Step 3 separately)
- Step 4 complete check refreshes from DB: if a contact is already `CLIENT_MANAGER` + `INVITED/ACCEPTED`, sidebar shows ✓ after page reload (not just in-session)

### 3. Per-Company Contact Sync (Vercel timeout fix)

The global `?step=contacts` sync iterates every Autotask-linked company sequentially and can exceed Vercel's 60s function ceiling on larger tenants. Extracted the sync into `src/lib/autotask-contact-sync.ts` and added two ways to invoke it:

- `syncAutotaskContacts({ companyId })` — single company, called by the wizard's per-company button (`POST /api/admin/companies/[id]/sync-contacts`, `maxDuration=30`)
- `syncAutotaskContacts()` — all companies, called by `/api/autotask/trigger?step=contacts` and the new `sync_contacts` job in Pipeline Status
- Both write to `reporting_job_status` via `createJobTracker(JOB_NAMES.SYNC_CONTACTS)` so the Pipeline Status row reflects last-run state (per-company variant skips this — it has its own UI feedback)

Wizard Step 1 now uses the per-company button by default. Pipeline Status keeps the bulk job for backfill.

### 4. Admin Navigation Restructure

- **Top nav**: Companies is now a dropdown with **All Companies** + **All Contacts**. Standalone Contacts link is gone.
- **Staff** moved to its own page at `/admin/staff` (in the More menu). The legacy `/admin/contacts` page is now client-contacts-only.
- **`ContactsList` gained a `mode` prop** — `'both' | 'clients-only' | 'staff-only'`. `/admin/contacts` passes `clients-only`, `/admin/staff` passes `staff-only`. The combined-tabs UI only renders in `both` mode (no existing caller uses it after this split).
- **`CompanyDetail` contacts card** replaced with a summary + "View & manage all N contacts →" link to `/admin/contacts?search=<companyName>`. No more duplicated UI between the two pages. Add Contact form stays (only manual-create path).
- **"Continue Onboarding →"** violet banner on the company detail page when `onboardingCompletedAt` is null, with smart next-step copy.
- **`ContactsList` reads `?search=<term>`** from URL on mount, so wizard deep links land pre-filtered.

### 5. New Company Form Trap Fixed

`/admin/companies/new` rendered both "Import & Sync" (small, in the green selected-AT-company card) AND "Create Company" (prominent, at bottom) at the same time. Selecting an AT result pre-filled formData.displayName, so the form *looked* linked — but if the user clicked the prominent **Create Company** button it hit `/api/companies` POST (a path that doesn't set `autotaskCompanyId`), creating an orphan local company. This is how Southern Tier Women's Health ended up needing the new Step 1 link box. Fix: the manual section now collapses entirely when an AT company is selected; only "Import & Sync" remains as the forward action.

### 6. Permission Fix for TECHNICIAN Role

`/api/contacts/invite` was hard-coded to `['SUPER_ADMIN', 'ADMIN']`, so a TECHNICIAN running the wizard's Step 4 (Set as Manager + Send Invite) hit `Forbidden`. Granted `invite_customers` + `manage_customer_roles` to TECHNICIAN role in `src/lib/permissions.ts`. Switched the route from role-array to granular `hasPermission(role, '<perm>')` checks (so per-user `permissionOverrides` also work). Error messages now state which permission is missing.

### 7. Welcome Email Rewritten

- "You have been invited to the new Triple Cities Tech Support Portal…"
- Explicit instruction to sign in with Microsoft 365 credentials (no new password to create)
- Bookmark callout: "Bookmark `<portal-url>` so you can get back here anytime"
- Fallback contact: `support@triplecitiestech.com` + `607-341-7500`
- CTA button: "Sign In with Microsoft 365"

### 8. Portal Sign-In Page TCT-Branded

`/portal` now has:
- Top brand bar with the TCT logo + "Triple Cities Tech / Customer Support Portal" wordmark, linked back to the main site
- Logo directly on the dark gradient (no washed-out white tile)
- Footer with copyright + clickable support contacts

## Key Decisions

- **Multi-tenant mode is opt-in per company** — existing legacy customers keep working until they (or TCT) re-run consent. Dual-write window indefinitely; no forced cutover.
- **Autotask remains the source for contacts** — M365 is for SSO and live HR data, not contact provisioning. Autotask's own M365 sync handles that upstream.
- **Step 4 chains the existing PATCH + POST endpoints** instead of introducing a new "set-and-invite" combo endpoint. Less surface area; existing role/invite APIs stay the unique writers.
- **Step status derives from DB state, not in-session actions** — so refresh / deep-link / cross-session work doesn't reset progress.
- **Per-company sync is the wizard default; global sync stays available** for backfill on Pipeline Status.

## Outstanding Work

- **Publisher Verification** for the multi-tenant app (Microsoft Partner Center / CPP). Skipped for now — customers see "Unverified" on the consent prompt but consent still works. Tackle before broader customer rollout.
- **Customer-facing share link** for the consent flow — currently `/api/admin/m365/consent` requires a TCT staff session, so the URL can't be emailed directly to a customer admin. Workaround: tech opens it in incognito after signing into TCT admin. Proper fix is a signed time-limited token tied to companyId.
- **Bulk Pipeline Status sync_contacts** can still hit 60s timeout on very large Autotask instances. Per-company variant is the recommended path; consider self-chaining batches like the projects sync if bulk becomes painful.
- **/api/companies POST should accept autotaskCompanyId** as another path to prevent the orphan-company trap entirely (defense in depth alongside the form fix).
