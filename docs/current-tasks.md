# Current Tasks

> Last updated: 2026-04-03 (Session 4 — Stabilization)

## Stabilization — Completed (Session 4)

All items from the production stabilization audit have been implemented:

- [x] **AbortController cleanup** — All 33 components with useEffect+fetch now properly cancel requests (was 2)
- [x] **Error boundaries** — Admin layout + portal layout wrapped (was 0 layouts wrapped)
- [x] **Silent error fixes** — 4 customer-facing API routes fixed (tickets, team, timeline, metrics)
- [x] **CSRF protection** — 5 customer mutation endpoints protected
- [x] **Rate limiting** — Portal auth login + discover endpoints rate-limited
- [x] **Cron transient handling** — All 9 cron routes that need it now classify errors correctly
- [x] **Auth standardization** — 10 routes migrated to checkSecretAuth
- [x] **Loading skeletons** — SOC, reporting, marketing, contacts admin pages
- [x] **Unit tests** — 58 tests covering ticket utils, session signing, env validation, api-auth
- [x] **E2e tests** — ~70 new tests for critical workflows, error contracts, auth enforcement
- [x] **Authenticated test infrastructure** — Playwright setup with E2E_TEST_SECRET support
- [x] **Documentation** — CLAUDE.md, coding-standards.md, qa-standards.md updated with enforcement rules

## Stabilization — Remaining (Low Priority)

- [ ] **Standardize API response format** — Adopt `apiSuccess()`/`apiError()` from `api-response.ts` across all 100+ routes. Big effort, incremental payoff.
- [ ] **Schema drift CI check** — Build-time check that Prisma schema fields match raw SQL table columns.

## Policy Generation System — Phase 2 Work

### Priority 1: Enhancements to Ship
- [ ] **Bulk generation** — Generate all missing/required policies in sequence with progress bar
- [ ] **Policy editing** — Allow inline editing of generated content before approving
- [ ] **Regenerate with mode** — UI buttons for improve/update-framework/standardize/fill-missing modes
- [ ] **Existing policy detection** — Cross-reference uploaded policies against catalog slugs
- [ ] **Policy comparison/diff** — Show changes between versions

### Priority 2: Export & Integration
- [ ] **DOCX export** — Add docx generation using `docx` npm package
- [ ] **PDF export** — Native server-side PDF (browser print works as workaround)
- [ ] **SharePoint publishing** — Implement `SharePointPolicyPublisher` via Graph API
- [ ] **IT Glue publishing** — Implement `ITGluePolicyPublisher`
- [ ] **ZIP bundle** — Bundle multiple files into downloadable ZIP

### Priority 3: Advanced Features
- [ ] **Auto-detect frameworks from company** — PHI → HIPAA, CUI → CMMC/NIST 800-171
- [ ] **Pre-fill from compliance engine data** — Use environment/tool data to pre-answer questionnaire
- [ ] **Additional framework definitions** — HIPAA, NIST 800-171, CMMC as first-class
- [ ] **Policy template library** — Save generated policies as reusable templates

## Compliance Evidence Engine — Outstanding Work

### Blocked / Waiting
- [ ] **SaaS Alerts integration** — Support ticket submitted to Kaseya

### Evidence Quality
- [ ] **CIS 10.3 (Autorun/Autoplay)** — Needs Intune profile data
- [ ] **CIS 7.3/7.4 patch differentiation** — Datto RMM API limitation

### Features to Build
- [ ] **Multi-framework policy analysis** — `analyzePolicyWithAI` hardcodes CIS v8
- [ ] **Customer attestation input** — DB table exists, need API + UI
- [ ] **Customer portal compliance card** — Backend exists, needs UI wiring

## Other Systems — Status
- Reporting pipeline: **stable** (stabilization fixes applied)
- SOC system: **stable** (AbortController, transient handling added)
- Blog/marketing: **stable** (cron transient handling added)
- Autotask sync: **stable** (auth header support added)
- HR offboarding: **stable** (CSRF protection added)
- Customer portal: **stable** (error boundaries, AbortController, error states added)
