# Current Tasks

> Last updated: 2026-05-11 (Session 8 — Multi-Tenant M365 Onboarding, Admin Nav, Wizard Rebuild)

## M365 Onboarding & Customer Portal — Recently Completed

### Session 8 (Current)
- [x] **Multi-tenant M365 admin-consent flow** — single TCT app reg, customer admin consents once, replaces 15-step per-tenant app reg walkthrough
- [x] **Schema additions** — `m365_consent_mode`, `m365_consent_granted_at` (additive, both modes coexist)
- [x] **New routes** — `/api/admin/m365/consent` + `/callback`
- [x] **Per-company contact sync** — `/api/admin/companies/[id]/sync-contacts` avoids 60s Vercel timeout; extracted to `src/lib/autotask-contact-sync.ts`
- [x] **Wizard rebuild** — 4 → 5 steps, inline Manager & Invite action, inline AT company search/link in Step 1
- [x] **Admin nav restructure** — Companies dropdown (All Companies + All Contacts), Staff moved to `/admin/staff`, ContactsList gains `mode` prop
- [x] **CompanyDetail simplification** — embedded contacts list replaced with summary + link to filtered global view
- [x] **"Continue Onboarding →" banner** on company detail when not complete
- [x] **NewCompanyForm trap fixed** — manual creation section hides when AT company is selected (was creating orphans)
- [x] **TECHNICIAN role permissions** — `invite_customers` + `manage_customer_roles` granted; routes switched to granular `hasPermission()`
- [x] **Welcome email rewrite** — M365 SSO emphasis, bookmark callout, support contacts
- [x] **Portal `/portal` branded** — TCT logo header + footer with support contacts
- [x] **Step status durability** — Step 2 and Step 4 derive from DB state, not just in-session button clicks

### Session 7 — Compliance Improvements
- [x] Auto-fill org profile from uploaded policies
- [x] Mass policy generation
- [x] Gap-filling policy generation
- [x] Workflow stepper refinement

### Session 6
- [x] Holistic cross-policy control coverage
- [x] Compliance Guided Workflow stepper
- [x] Framework selection in org profile
- [x] Mobile responsiveness fixes
- [x] Stuck policy generation retry
- [x] 504 timeout fix

## M365 Onboarding — Follow-ups

- [ ] **Publisher Verification** for the multi-tenant TCT Customer Portal app — Microsoft Partner Center / CPP enrollment. Removes the "Unverified" warning on the consent prompt. Skip for now; tackle before broader customer rollout.
- [ ] **Customer-facing share link for consent flow** — currently `/api/admin/m365/consent` requires a TCT staff session, so TCT techs have to run the consent in incognito with their own admin login active. Proper fix is a signed time-limited token (`?token=<signed>`) that lets a customer admin click an emailed link directly.
- [ ] **Batch the global sync_contacts job** — currently iterates every Autotask-linked company sequentially and can exceed 60s on very large tenants. Per-company variant already exists; bulk variant should self-chain like the projects sync does.
- [ ] **Defense in depth on autotaskCompanyId** — `/api/companies` POST should accept (and persist) `autotaskCompanyId` so the orphan-company trap can't recur even if a future UI bypasses the form's collapse logic.

## Compliance System

### Priority 1: Stepper Completion
- [ ] **Embed AssessmentResults in Steps 4 & 6** — Show full assessment details inline in the workflow stepper
- [ ] **Step 6 comparison delta** — Show improvement from Step 4 baseline to Step 6 final
- [ ] **Better step navigation** — Allow clicking completed steps to review

### Priority 2: Unified Controls & Policies View
- [ ] **Controls vs Policies clarity** — Merge or cross-reference the "39 Controls Covered" (Policy Analysis) and "19/21 Missing" (Policy Generation) views

### Priority 3: Policy Editing & Export
- [ ] Policy editing (inline edit before approve)
- [ ] Regenerate-with-mode UI buttons
- [ ] DOCX export (`docx` npm package)
- [ ] PDF export (native server-side)
- [ ] SharePoint publishing via Graph API
- [ ] ZIP bundle download

### Priority 4: Advanced Features
- [ ] Multi-framework policy analysis
- [ ] Auto-detect frameworks from company (PHI → HIPAA, CUI → CMMC/NIST 800-171)
- [ ] Customer attestation input
- [ ] Customer portal compliance card
- [ ] Policy comparison/diff
- [ ] Policy template library

## Stabilization — Remaining (Low Priority)

- [ ] **Standardize API response format** — Adopt `apiSuccess()`/`apiError()` across all 100+ routes
- [ ] **Schema drift CI check** — Build-time check that Prisma schema matches raw SQL tables
- [ ] **Migrate `MIGRATION_SECRET` / `CRON_SECRET`** — Both were in git history (CLAUDE.md). Rotate in Vercel.
- [ ] **Encrypt per-tenant integration credentials at rest** — Legacy-mode `m365_client_secret` is still plaintext. Once all customers are migrated to `multi_tenant`, drop the columns entirely.

## Compliance Evidence Engine — Blocked
- [ ] **SaaS Alerts integration** — Blocked by Cloudflare. Webhook receiver ready at `/api/compliance/webhooks/saas-alerts`.

## Other Systems — Status
- M365 customer onboarding: **multi-tenant flow live; dual-mode supported**
- Customer portal SSO: **multi-tenant + legacy both supported**
- Reporting pipeline: **stable**
- SOC system: **stable**
- Blog/marketing: **stable**
- Autotask sync: **stable**
- HR offboarding: **stable**
- Customer portal: **stable**
