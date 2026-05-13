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
- [x] **W3** Author `customer_profile` question-engine schema in code (new file: `src/lib/compliance/customer-profile-schema.ts`). 9 sections / ~40 questions consolidated from both legacy stores with preserved legacy keys for 1:1 backfill. Exports declarative schema, typed key constants, reader helpers (`getCustomerProfileAnswers`, `getAnswer`, `getStringAnswer`, `getMultiAnswer`, `getBooleanAnswer`, `isProfileEmpty`, `computeProfileCompletion`), and a seed-SQL builder for when the question-engine UI lands (W7+). Reader function bridges both legacy stores so engine N/A logic (W5) and policy generator (W6) can be cut over before any data migration runs. ✅ 2026-05-13
- [x] **W4** Backfill: `form_responses` table introduced in `ensure-tables.ts`; reader (`getCustomerProfileAnswers`) prefers `form_responses` and falls back to merging legacy stores; writer (`saveCustomerProfileAnswers`) upserts to `form_responses`; dual-writes added to `/api/compliance/policies/questionnaire` (org-profile type) and `/api/compliance/customer-context` POSTs; one-time backfill helper `backfillAllCustomerProfiles()` + migration endpoint `POST /api/migrations/customer-profile-backfill` for production cutover. Idempotent — safe to re-run. ✅ 2026-05-13
- [x] **W5** Engine N/A logic reads via `getCustomerProfileAnswers()` (`src/lib/compliance/engine.ts`). `loadEnvironmentContext` split into `buildEnvironmentContextFromProfile()` (canonical values, no label parsing) + `buildEnvironmentContextFromMspSetup()` (kept as backward-compat fallback for `compliance_msp_setup`). Per-control evaluators in `cis-v8.ts` / `cmmc-l1.ts` consume the same `EnvironmentContext` shape — no changes there. ✅ 2026-05-13
- [x] **W6** Policy generator reads via `getCustomerProfileAnswers()` (`src/app/api/compliance/policies/generate/route.ts`). The `orgProfile` map passed into `generatePolicy()` is now populated from the consolidated reader; derived security posture from platform mappings still layered on top. Bonus: `/api/compliance/workflow-status` also uses `computeProfileCompletion()` from the new module. Threshold for Step 5 adjusted from 60% (of 5 hard-coded keys) → 30% (of 13 required schema questions) to preserve "≈3 required fields filled" intent under the larger schema. ✅ 2026-05-13
- [ ] **W13** Refactor `PolicyGenerationDashboard.tsx` to stop authoring profile questions inline. **Blocked on P2** — the inline editor is currently the only profile-authoring UI; removing it requires the dedicated Profile editor under the new cockpit (`/admin/compliance/[companyId]/profile`) to exist first. Data-layer side (dual-write through the new `saveCustomerProfileAnswers()`) already done as part of W4.
- [ ] **W15** Delete `ComplianceSetupWizard.tsx`. **Blocked on P2** — the wizard writes to `compliance_msp_setup` (MSP-wide fallback) which is distinct from per-customer Customer Profile and is still consumed by `engine.buildEnvironmentContextFromMspSetup()` as a back-compat fallback. Deletion path: build per-customer Profile editor in P2 → audit whether `compliance_msp_setup` provides any unique fallback value → either keep the wizard or migrate its MSP-wide answers into a different store, then delete.
- [ ] **W16** Drop `policy_org_profiles` and `compliance_customer_context` tables (operator-gated, after one-release soak with `form_responses` populated for every customer via `/api/migrations/customer-profile-backfill`).

### Priority 2: Bootstrap + Cockpit UI shell (Workflow Redesign §2)
- [ ] **W7** Build per-customer cockpit page + single-fetch endpoint (`src/app/admin/compliance/[companyId]/page.tsx`, `src/app/api/compliance/[companyId]/cockpit/route.ts`).
- [ ] **W8** Build Connections page combining Connectors + Tool Inventory + Platform Mappings (`src/app/admin/compliance/[companyId]/connections/page.tsx`).
- [ ] **W9** Build Policies page merging PolicyManager + PolicyGenerationDashboard navigation (`src/app/admin/compliance/[companyId]/policies/page.tsx`).
- [ ] **W10** Build Assessments + Findings pages (`src/app/admin/compliance/[companyId]/assessments/page.tsx`, `findings/page.tsx`).
- [ ] **W11** Build TCT-only Diagnostics page (`src/app/admin/compliance/diagnostics/page.tsx`) — connector errors, raw evidence JSON, evaluator debug.
- [ ] **W14** Wire `engine.compareAssessments()` into the cockpit + AssessmentResults UI (latest vs. baseline, latest vs. previous, arbitrary pair).
- [ ] **W15 (cont.)** Delete `ComplianceDashboard.tsx` and `ComplianceWorkflow.tsx` after migration. Move `StepIndicator` to a reusable `BootstrapStepper.tsx`.

### Priority 3: Finding lifecycle (Architecture §2.7)
- [x] **F1** `compliance_finding_dispositions` table added to `ensure-tables.ts` — keyed on `(companyId, frameworkId, controlId)`. Indexed by company, by `(company, lifecycleStatus)`, and by `lastReviewedAt` for stale-disposition surfacing. FK to `companies` ON DELETE CASCADE. ✅ 2026-05-13
- [x] **F2** Disposition API routes:
  - `GET /api/compliance/[companyId]/dispositions` — list (filterable by `frameworkId`, `status`)
  - `POST /api/compliance/[companyId]/dispositions` — upsert keyed on `(frameworkId, controlId)` in body. Sparse merge (omitted fields preserved; explicit `null` clears). Stamps `decisionBy`/`decidedAt` only when `lifecycleStatus` changes. Enforces `acceptedRiskRationale` when status is `accepted_risk`. Writes audit log.
  - `POST /api/compliance/[companyId]/dispositions/link-project` — link an existing PhaseTask under a customer-owned Project; flips status to `billable_project`. Verifies the project belongs to the customer (no cross-customer leakage). PhaseTask auto-creation deferred to C17 (when the per-customer "Compliance Operations" project pattern is formalized).
   ✅ 2026-05-13
- [ ] **F3** Wire disposition controls into AssessmentResults / Findings UI (status dropdown, assignee, due date, accepted-risk rationale). **Blocked on P2** — the Findings page is part of the cockpit (`/admin/compliance/[companyId]/findings`). The disposition API is ready; the UI just needs to consume it. Could partially land via an inline panel inside the existing `AssessmentResults.tsx`, but the natural home is the new Findings page.
- [ ] **F4** Build stale-disposition surfacing in cockpit (accepted-risk older than 90 days, scheduled past due date). **Blocked on P2** — needs the cockpit page to surface it. Data side (`lastReviewedAt` indexed) is ready.
- [x] **F5** `manage_compliance` permission — already exists in `src/lib/permissions.ts` (SUPER_ADMIN, ADMIN, BILLING_ADMIN). Verified no new add needed. ✅ 2026-05-13

### Priority 4: Change Management & Remediation (greenfield — CHANGE_MANAGEMENT doc)
- [x] **C1** Action catalog scaffolding (`src/lib/compliance/actions/types.ts`, `catalog.ts`, `validators.ts`, `executors.ts`, `index.ts`). Public types: `RemediationAction`, `ActionImpact`, `ActionExecutor`, `ExecutorContext`/`ExecutorResult`. ✅ 2026-05-13
- [x] **C2** 10 high-value actions seeded covering MFA enforcement, legacy auth blocking, password protection, Defender real-time protection, and manual actions for BullPhish training + DNSFilter threat protection. Each with mandatory plain-English `impact.userFacing`. ✅ 2026-05-13
- [x] **C3** Build-time validator (`scripts/validate-action-catalog.ts`) — exits 1 on any catalog issue. Run via `npx tsx scripts/validate-action-catalog.ts`. Catches empty `impact.userFacing`, jargon leaks ("Conditional Access", "Graph API", etc.), duplicate ids, missing executor handler / instructions, reversible=true without `rollbackActionId`. ✅ 2026-05-13
- [x] **C4** `compliance_pending_changes` + `compliance_change_bundles` + `compliance_change_bundle_items` added to `ensure-tables.ts` with FKs, indexes, and lifecycle status defaults. ✅ 2026-05-13
- [x] **C5** Pending Change API routes:
  - `GET/POST /api/compliance/[companyId]/changes`
  - `GET/PATCH /api/compliance/[companyId]/changes/[id]`
  - `POST /api/compliance/[companyId]/changes/[id]/abandon`
  - `POST /api/compliance/[companyId]/changes/[id]/communicate` (staff attestation gate)
  - `POST /api/compliance/[companyId]/changes/[id]/deploy` (invokes executor; transitions to verifying)
  - `POST /api/compliance/[companyId]/changes/[id]/rollback`
  - State machine guarded by `assertStatusTransition()` in `change-management.ts`; every transition writes to `compliance_audit_log`. ✅ 2026-05-13
- [x] **C6** Bundle API routes:
  - `GET/POST /api/compliance/[companyId]/bundles`
  - `GET/PATCH /api/compliance/[companyId]/bundles/[id]`
  - `POST/DELETE /api/compliance/[companyId]/bundles/[id]/items`
  - `POST /api/compliance/[companyId]/bundles/[id]/send` (state transition; PDF/email rendering deferred to C11)
  - `POST /api/compliance/[companyId]/bundles/[id]/items/[itemId]/decision` (per-item customer decision; auto-recomputes bundle aggregate status)
  - `POST /api/compliance/[companyId]/bundles/[id]/cancel`
   ✅ 2026-05-13
- [x] **C7** Disposition API routes — done as P3/F2 (cross-referenced in CHANGE_MANAGEMENT doc).
- [x] **C8** Action Catalog API routes (`/api/compliance/actions`, `/api/compliance/actions/[actionId]`). Supports filters `?controlId=&frameworkId=` (uses `suggestActionsForControl`) and `?capabilityId=`. ✅ 2026-05-13
- [ ] **C9** Build Pending Changes admin UI per customer. **Blocked on P2** — needs the cockpit.
- [ ] **C10** Build BundleComposer component + preview view. **Blocked on P2**.
- [ ] **C11** Build customer-facing bundle report (HTML + PDF + email). **Blocked on P2**. The bundle `send` route is a state transition only today; it accepts a `reportPdfUrl` field for when the renderer ships.
- [x] **C12** Verification worker (`/api/cron/verify-pending-changes`): finds pending changes in `verifying` past their `delaySecondsBeforeVerify` window, parses `verification.evaluatorIds` into `(frameworkId, controlId)` pairs, kicks off one fresh assessment per `(companyId, frameworkId)` (cached within a cron tick), reads the resulting findings, and transitions each change to `complete` (every targeted control is `pass` or `not_applicable`) or `rolled_back` (any targeted control still fails — or catalog drift / missing action). Honors `overrideStatus`. Writes audit log entries `pending_change.verified` / `pending_change.verification_failed`. Scheduled every 15 minutes via `vercel.json`. Returns 200 with `transient: true` on infra-class errors so Vercel does not surface alert noise. The rollback action is NOT auto-invoked; staff stages and deploys the explicit rollback to keep the audit trail clean. ✅ 2026-05-13
- [x] **C13** Executor framework: registry of automated handlers by id; manual executor pattern. Implemented in `src/lib/compliance/actions/executors.ts`. **All 8 automated handlers are stubs today** — they succeed without doing anything (clear `[stub]` summary). Real Graph / Intune / vendor SDK implementations land alongside C12 verification work. The pending-change `deploy` flow exercises the full lifecycle end-to-end against the stubs. ✅ 2026-05-13
- [ ] **C16** Stale-disposition surfacing — same as F4 (blocked on P2 cockpit).
- [x] **C17** Billable handoff helper (`src/lib/compliance/billable-handoff.ts`): `getOrCreateComplianceOperationsProject()`, `getOrCreateActiveEngagementPhase()`, `createComplianceTaskForDisposition()`. One persistent `Compliance Operations` Project per customer; a new Phase per engagement window; PhaseTask per finding. Pattern wired up but not yet invoked by the disposition `link-project` route (which still requires staff-supplied project/phase ids) — that wiring lands when the cockpit UI ships. ✅ 2026-05-13

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
