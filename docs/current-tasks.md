# Current Tasks

> Last updated: 2026-04-02 (Session 3)

## Policy Generation System — Phase 2 Work

### Priority 1: Enhancements to Ship
- [ ] **Bulk generation** — Generate all missing/required policies in sequence (fire one at a time to avoid timeout). UI shows progress bar.
- [ ] **Policy editing** — Allow inline editing of generated policy content before approving. Currently preview-only.
- [ ] **Regenerate with mode** — UI buttons for improve/update-framework/standardize/fill-missing modes (currently only 'new' mode exposed in UI).
- [ ] **Existing policy detection** — Cross-reference uploaded policies (compliance_policies with source != 'generated') against catalog slugs. Auto-detect matches even when titles differ.
- [ ] **Policy comparison/diff** — Show changes between versions (v1 vs v2) when regenerating.

### Priority 2: Export & Integration
- [ ] **DOCX export** — Add docx generation using a library like `docx` npm package. Currently HTML/Markdown only.
- [ ] **PDF export** — Browser print-to-PDF from HTML works, but native server-side PDF would be better.
- [ ] **SharePoint publishing** — Implement `SharePointPolicyPublisher` using Graph API. Stub exists in `export.ts`.
- [ ] **IT Glue publishing** — Implement `ITGluePolicyPublisher`. Stub exists in `export.ts`.
- [ ] **ZIP bundle** — Bundle multiple HTML/DOCX files into a downloadable ZIP instead of concatenated HTML.

### Priority 3: Advanced Features
- [ ] **Auto-detect frameworks from company** — If company handles PHI → auto-suggest HIPAA. If handles CUI → auto-suggest CMMC/NIST 800-171.
- [ ] **Pre-fill from compliance engine data** — Read environment context, tool deployments, and assessment findings to pre-answer questionnaire.
- [ ] **Policy analysis integration** — After generating a policy, auto-run the existing policy analysis (analyzePolicyWithAI) to show control coverage.
- [ ] **Additional framework definitions** — Add HIPAA, NIST 800-171, CMMC as first-class frameworks in `frameworks/` directory with full control definitions.
- [ ] **Policy template library** — Allow saving generated policies as templates that can be applied to other companies.

## Compliance Evidence Engine — Outstanding Work

### Priority 1: Blocked / Waiting
- [ ] **SaaS Alerts integration** — Support ticket submitted to Kaseya. Webhook receiver built at `/api/compliance/webhooks/saas-alerts`.

### Priority 2: Evidence Quality Improvements
- [ ] **CIS 10.3 (Autorun/Autoplay)** — Needs Intune device configuration profile data.
- [ ] **CIS 7.3/7.4 patch differentiation** — Datto RMM API limitation.
- [ ] **Assessment formatting** — Long policy sections still dense.

### Priority 3: Features to Build
- [ ] **Multi-framework policy analysis** — `analyzePolicyWithAI` hardcodes CIS v8.
- [ ] **Customer attestation input** — DB table exists, need API + UI.
- [ ] **Override persistence** — Carry overrides forward to future assessments.
- [ ] **Customer portal compliance card** — Backend exists, needs UI wiring.
- [ ] **MyITProcess integration** — Collects alignment scores but no evaluator.

### Priority 4: Cleanup
- [ ] **Debug endpoint cleanup** — Auth-gate or remove `/api/compliance/debug-collectors`.
- [ ] **TypeScript pattern** — Always use `Array.from()` for Set iteration.

## Other Systems — Maintenance
- Reporting pipeline: stable
- SOC system: stable
- Blog/marketing: stable
- Autotask sync: stable
- HR offboarding: stable
