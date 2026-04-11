# Current Tasks

> Last updated: 2026-04-11 (Session 7 — Compliance Improvements)

## Compliance System — Recently Completed

### Session 7 (Current)
- [x] **Auto-fill org profile from uploaded policies** — AI extracts org data during policy analysis, merges into questionnaire
- [x] **Mass policy generation** — "Generate All Missing" button with sequential progress
- [x] **Gap-filling policy generation** — Generate policy for uncovered controls from holistic summary
- [x] **Workflow stepper refinement** — Improved step completion logic (org profile %, post-policy assessment)

### Session 6
- [x] **Holistic cross-policy control coverage** — Summary card aggregating controls across all policies
- [x] **Compliance Guided Workflow stepper** — 6-step beta at /admin/compliance/workflow
- [x] **Framework selection in org profile** — Multi-select persisted per company
- [x] **Mobile responsiveness fixes** — ComplianceDashboard, PolicyManager
- [x] **Stuck policy generation retry** — Auto-reset generating records older than 5 minutes
- [x] **504 timeout fix** — Removed ensureComplianceTables from read-only endpoints

## Compliance System — Next Priorities

### Priority 1: Stepper Completion
- [ ] **Embed AssessmentResults in Steps 4 & 6** — Show full assessment details inline in the workflow stepper, not just the "Run" button
- [ ] **Step 6 comparison delta** — Show improvement from Step 4's baseline assessment to Step 6's final
- [ ] **Better step navigation** — Allow clicking completed steps to review, show warning for incomplete prerequisites

### Priority 2: Unified Controls & Policies View
- [ ] **Controls vs Policies clarity** — The Policy Analysis tab shows "39 Controls Covered" (CIS requirements satisfied by uploaded policies). The Policy Generation tab shows "19/21 Missing" (policy documents not yet generated). These measure different things. Consider merging or cross-referencing them so the tech sees one unified view: "Here are your customer's controls. These are covered by existing policies. These need new policies generated. These have no coverage at all."

### Priority 3: Policy Editing & Export
- [ ] **Policy editing** — Allow inline editing of generated content before approving
- [ ] **Regenerate with mode** — UI buttons for improve/update-framework/standardize/fill-missing modes
- [ ] **DOCX export** — Add docx generation using `docx` npm package
- [ ] **PDF export** — Native server-side PDF (browser print works as workaround)
- [ ] **SharePoint publishing** — Implement `SharePointPolicyPublisher` via Graph API
- [ ] **ZIP bundle** — Bundle multiple files into downloadable ZIP

### Priority 4: Advanced Features
- [ ] **Multi-framework policy analysis** — `analyzePolicyWithAI` currently hardcodes one framework per analysis
- [ ] **Auto-detect frameworks from company** — PHI → HIPAA, CUI → CMMC/NIST 800-171
- [ ] **Customer attestation input** — DB table exists, need API + UI
- [ ] **Customer portal compliance card** — Backend exists, needs UI wiring
- [ ] **Policy comparison/diff** — Show changes between versions
- [ ] **Policy template library** — Save generated policies as reusable templates

## Stabilization — Remaining (Low Priority)

- [ ] **Standardize API response format** — Adopt `apiSuccess()`/`apiError()` across all 100+ routes
- [ ] **Schema drift CI check** — Build-time check that Prisma schema matches raw SQL tables

## Compliance Evidence Engine — Blocked

- [ ] **SaaS Alerts integration** — Blocked by Cloudflare. Webhook receiver ready at `/api/compliance/webhooks/saas-alerts`. Pending Kaseya support.

## Other Systems — Status
- Reporting pipeline: **stable**
- SOC system: **stable**
- Blog/marketing: **stable**
- Autotask sync: **stable**
- HR offboarding: **stable**
- Customer portal: **stable**
