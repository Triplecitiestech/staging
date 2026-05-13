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

> **Major redesign approved 2026-05-13.** The 6-step Guided Workflow is being replaced with a bootstrap-plus-cockpit shape; the three intake stores are being consolidated into a single Customer Profile via the HR question engine; and an entirely new Change Bundle remediation lifecycle is being built. Design docs:
> - `docs/plans/COMPLIANCE_ARCHITECTURE.md` — overall system shape and target data model
> - `docs/plans/COMPLIANCE_WORKFLOW_REDESIGN.md` — workflow reshape + intake consolidation + legacy retirement
> - `docs/plans/CHANGE_MANAGEMENT_AND_REMEDIATION.md` — Change Bundle workflow, action catalog, customer impact analysis, deployment lifecycle
>
> The backlog below replaces the previous Priority 1–4 list. Old items that survived the redesign are folded in; items the redesign retired (e.g., "Step 6 comparison delta" — the comparison engine already exists) are removed from the active list but noted in the design docs.

### Priority 0: Pre-flight bug fixes (small, do first)
- [x] **P0-1** Add `compliance_company_tools` table to `src/lib/compliance/ensure-tables.ts` — was self-healed inline by the company-tools route; centralized so workflow-status reads are race-free. ✅ 2026-05-13
- [x] **P0-2** Add `compliance_customer_context` table to `ensure-tables.ts` (interim) — was self-healed inline by the customer-context route; centralized and inline DDL removed. Table will be retired entirely once consolidation lands (W16). ✅ 2026-05-13
- [x] **P0-3** Audit `PlatformMappingPanel.tsx` for 1:M UI support — **already supported**. Each mapping renders as its own row with its own Remove button; `addMapping` is additive (no delete-then-insert); `alreadyMapped` set hides duplicates from the picker so users add new entities instead of re-adding existing ones; header badge shows the count. No code change required. ✅ 2026-05-13

### Priority 1: Customer Profile consolidation (Workflow Redesign §3)
- [ ] **W3** Author `customer_profile` question-engine schema in code (new file: `src/lib/compliance/customer-profile-schema.ts`) and seed via existing question-engine seeder.
- [ ] **W4** Backfill script: `policy_org_profiles.answers` JSONB → `form_responses` rows (new: `scripts/backfill-customer-profile.ts`).
- [ ] **W5** Update engine N/A logic to read from question engine instead of `policy_org_profiles` / `compliance_customer_context` (`src/lib/compliance/engine.ts`, `frameworks/cis-v8.ts`, `frameworks/cmmc-l1.ts`).
- [ ] **W6** Update policy generator to read profile answers from question engine (`src/lib/compliance/policy-generation/generator.ts`).
- [ ] **W13** Refactor `PolicyGenerationDashboard.tsx` to stop authoring profile questions inline — read from question engine instead.
- [ ] **W15** Delete `ComplianceSetupWizard.tsx` once the new Customer Profile editor is live.
- [ ] **W16** Drop `policy_org_profiles` and `compliance_customer_context` tables (operator-gated, after one-release soak).

### Priority 2: Bootstrap + Cockpit UI shell (Workflow Redesign §2)
- [ ] **W7** Build per-customer cockpit page + single-fetch endpoint (`src/app/admin/compliance/[companyId]/page.tsx`, `src/app/api/compliance/[companyId]/cockpit/route.ts`).
- [ ] **W8** Build Connections page combining Connectors + Tool Inventory + Platform Mappings (`src/app/admin/compliance/[companyId]/connections/page.tsx`).
- [ ] **W9** Build Policies page merging PolicyManager + PolicyGenerationDashboard navigation (`src/app/admin/compliance/[companyId]/policies/page.tsx`).
- [ ] **W10** Build Assessments + Findings pages (`src/app/admin/compliance/[companyId]/assessments/page.tsx`, `findings/page.tsx`).
- [ ] **W11** Build TCT-only Diagnostics page (`src/app/admin/compliance/diagnostics/page.tsx`) — connector errors, raw evidence JSON, evaluator debug.
- [ ] **W14** Wire `engine.compareAssessments()` into the cockpit + AssessmentResults UI (latest vs. baseline, latest vs. previous, arbitrary pair).
- [ ] **W15 (cont.)** Delete `ComplianceDashboard.tsx` and `ComplianceWorkflow.tsx` after migration. Move `StepIndicator` to a reusable `BootstrapStepper.tsx`.

### Priority 3: Finding lifecycle (Architecture §2.7)
- [ ] **F1** Add `compliance_finding_dispositions` table to `ensure-tables.ts`.
- [ ] **F2** Build disposition API routes (GET list, PATCH update, POST link-project) under `src/app/api/compliance/[companyId]/dispositions/`.
- [ ] **F3** Wire disposition controls into AssessmentResults / Findings UI (status dropdown, assignee, due date, accepted-risk rationale).
- [ ] **F4** Build stale-disposition surfacing in cockpit (accepted-risk older than 90 days, scheduled past due date).
- [ ] **F5** Add `manage_compliance` permission to `src/lib/permissions.ts`.

### Priority 4: Change Management & Remediation (greenfield — CHANGE_MANAGEMENT doc)
- [ ] **C1** Build action catalog scaffolding + types (`src/lib/compliance/actions/types.ts`, `catalog.ts`, `validators.ts`).
- [ ] **C2** Seed initial action catalog with 10–15 high-value actions (MFA enforcement, CA policies, Defender hardening, backup, training programs, etc.).
- [ ] **C3** Add CI lint: every action requires non-empty `impact.userFacing` (`scripts/validate-action-catalog.ts`).
- [ ] **C4** Add 3 remaining tables to `ensure-tables.ts`: `compliance_pending_changes`, `compliance_change_bundles`, `compliance_change_bundle_items`.
- [ ] **C5** Build Pending Change API routes (CRUD + abandon + communicate + deploy + rollback).
- [ ] **C6** Build Bundle API routes (CRUD + items + preview + send + decision + cancel).
- [ ] **C7** Build Disposition API routes (covered by F2; cross-reference here).
- [ ] **C8** Build Action Catalog API routes (list, get, suggest-for-control).
- [ ] **C9** Build Pending Changes admin UI per customer (`src/app/admin/compliance/[companyId]/changes/page.tsx`).
- [ ] **C10** Build BundleComposer component + preview view.
- [ ] **C11** Build customer-facing bundle report (HTML + PDF via @react-pdf/renderer + email via Resend) — `src/lib/compliance/bundle-report/`.
- [ ] **C12** Build verification runner: after `delaySecondsBeforeVerify`, re-run named evaluator(s); transition change to complete or rolled_back.
- [ ] **C13** Build executor framework: registry of automated handlers by id; manual executor pattern surfaces staff instructions + "mark deployed" button.
- [ ] **C16** Stale-disposition surfacing covered by F4.
- [ ] **C17** Wire billable dispositions to per-customer "Compliance Operations" Project + new phase per engagement (`src/lib/compliance/billable-handoff.ts`).

### Priority 5: Framework expansion
- [ ] **FR1** CMMC L2 evaluators (currently type stub only)
- [ ] **FR2** NIST 800-171 evaluators
- [ ] **FR3** HIPAA evaluators
- [ ] **FR4** PCI DSS evaluators
- [ ] **FR5** Auto-detect required frameworks from Customer Profile (PHI → HIPAA, CUI → CMMC/NIST 800-171, card processing → PCI)

### Priority 6: Carried over from prior backlog
- [ ] Policy editing (inline edit before approve)
- [ ] Regenerate-with-mode UI buttons
- [ ] DOCX export (`docx` npm package)
- [ ] PDF export (native server-side) — partially solved by the bundle report PDF infrastructure
- [ ] SharePoint publishing via Graph API
- [ ] ZIP bundle download
- [ ] Policy comparison/diff
- [ ] Policy template library
- [ ] Customer portal compliance card (out-of-scope for current redesign; can layer on once cockpit is live)
- [ ] Customer attestation input (already exists in `compliance_attestations`; needs UI)

### Compliance Evidence Engine — Blocked
- [ ] **SaaS Alerts integration** — Blocked by Cloudflare. Webhook receiver ready at `/api/compliance/webhooks/saas-alerts`. Pending Kaseya support to configure webhook delivery.

## Stabilization — Remaining (Low Priority)

- [ ] **Standardize API response format** — Adopt `apiSuccess()`/`apiError()` across all 100+ routes
- [ ] **Schema drift CI check** — Build-time check that Prisma schema matches raw SQL tables
- [ ] **Migrate `MIGRATION_SECRET` / `CRON_SECRET`** — Both were in git history (CLAUDE.md). Rotate in Vercel.
- [ ] **Encrypt per-tenant integration credentials at rest** — Legacy-mode `m365_client_secret` is still plaintext. Once all customers are migrated to `multi_tenant`, drop the columns entirely.

## Other Systems — Status
- M365 customer onboarding: **multi-tenant flow live; dual-mode supported**
- Customer portal SSO: **multi-tenant + legacy both supported**
- Reporting pipeline: **stable**
- SOC system: **stable**
- Blog/marketing: **stable**
- Autotask sync: **stable**
- HR offboarding: **stable**
- Customer portal: **stable**
