# Current Tasks

> Last updated: 2026-04-04 (Session 5 — Questionnaire UX + Workflow Planning)

## Compliance Guided Workflow — Priority 1 (Next Build)

### Overview
Replace the current tab-based compliance UI with a linear stepper that guides the tech through the full compliance process for each customer company. The stepper composes existing components into a clear, gated flow.

### Prerequisites
- [x] **Questionnaire cleanup** — Reduced from 74 to 62 questions, removed redundancies
- [x] **Security posture derivation** — Generate route derives tool deployment from platform mappings
- [ ] **Build the stepper component** — `ComplianceWorkflow.tsx` composing existing panels

### Step-by-Step Flow

**Step 1: Prerequisites**
- Check M365 connection status for the selected company
- Check Autotask sync status (company exists in local DB with AT ID)
- If either is missing → show message with link to `/admin/companies/[id]/onboard`
- Gated: cannot proceed until both are verified

**Step 2: Platform Mapping**
- Embed existing `PlatformMappingPanel` component
- Shows which tools are mapped to this customer's sites/instances
- "Mark as not used" for tools the customer doesn't have
- Complete when all platforms are either mapped or marked "not used"

**Step 3: Tool Configuration**
- Embed the tool toggle section from `ToolCapabilityMap`
- Auto-detects from platform mappings (if datto_edr mapped → toggle already on)
- Shows gap analysis summary
- Complete when all tool toggles are set appropriately

**Step 4: Initial Assessment**
- One-click "Run Assessment" that collects evidence from all mapped tools
- Shows collection progress
- Displays results: overall score, passed/failed/partial controls
- Shows top gaps with remediation suggestions
- Complete once first assessment runs successfully

**Step 5: Policy Generation**
- Shows needs analysis: how many policies needed vs existing
- Embeds the org profile questionnaire (31 questions with group headers)
- Policy catalog with generate buttons
- Complete when all required policies are at least "draft" status

**Step 6: Final Assessment**
- Re-runs assessment with policies factored in
- Shows improvement delta from Step 4
- Highlights remaining gaps (technical controls needing remediation)
- Export full compliance report

### UI Details
- Sidebar stepper (sticky left, desktop) with step status badges (reuse StepIndicator from TechOnboardingWizard)
- Main content area shows active step
- Previous/Next navigation, can click completed steps in sidebar
- Steps are gated: Step 4 requires 2+3, Step 5 requires 4
- Progress persists per company
- Company selector at top, above stepper

### Implementation Notes
- New file: `src/components/compliance/ComplianceWorkflow.tsx`
- Composes: `PlatformMappingPanel`, `ToolCapabilityMap`, `ComplianceDashboard`, `PolicyGenerationDashboard`
- Existing components stay as-is — stepper is a wrapper
- MSP Setup Wizard (`ComplianceSetupWizard`) stays separate (MSP-level, not per-customer)
- Need API endpoint to check prerequisites (M365 + Autotask status for a company)

## Stabilization — Completed (Session 4)

All items from the production stabilization audit have been implemented:

- [x] **AbortController cleanup** — All 33 components with useEffect+fetch now properly cancel requests
- [x] **Error boundaries** — Admin layout + portal layout wrapped
- [x] **Silent error fixes** — 4 customer-facing API routes fixed
- [x] **CSRF protection** — 5 customer mutation endpoints protected
- [x] **Rate limiting** — Portal auth login + discover endpoints rate-limited
- [x] **Cron transient handling** — All 9 cron routes classify errors correctly
- [x] **Auth standardization** — 10 routes migrated to checkSecretAuth
- [x] **Loading skeletons** — SOC, reporting, marketing, contacts admin pages
- [x] **Unit tests** — 58 tests covering ticket utils, session signing, env validation, api-auth
- [x] **E2e tests** — ~70 new tests for critical workflows
- [x] **Documentation** — CLAUDE.md, coding-standards.md, qa-standards.md updated

## Stabilization — Remaining (Low Priority)

- [ ] **Standardize API response format** — Adopt `apiSuccess()`/`apiError()` across all 100+ routes
- [ ] **Schema drift CI check** — Build-time check that Prisma schema matches raw SQL tables

## Policy Generation System — Phase 2 Work

### Priority 1: Enhancements to Ship
- [x] **Questionnaire UX cleanup** — Reduced to 62 questions, added grouping, removed redundancies
- [x] **Security posture auto-derivation** — Generate route pulls from platform mappings
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
- Reporting pipeline: **stable**
- SOC system: **stable**
- Blog/marketing: **stable**
- Autotask sync: **stable**
- HR offboarding: **stable**
- Customer portal: **stable**
