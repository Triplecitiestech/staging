# Current Tasks

> Last updated: 2026-04-02 (Session 2 — final)

## Compliance Evidence Engine — Outstanding Work

### Priority 1: Blocked / Waiting
- [ ] **SaaS Alerts integration** — Support ticket submitted to Kaseya. Their API at manage.saasalerts.com is behind Cloudflare bot protection, blocking all server-to-server calls. Webhook receiver built at `/api/compliance/webhooks/saas-alerts` and domain whitelisted. Need Kaseya to explain webhook URL registration or provide a non-Cloudflare API endpoint. Once working, SaaS Alerts auto-appears as a logging layer in CIS 8.2 and 13.1.

### Priority 2: Evidence Quality Improvements
- [ ] **CIS 10.3 (Autorun/Autoplay)** — Currently uses Intune compliance rate as a proxy. Needs actual Intune device configuration profile data to verify autorun is specifically disabled. Requires Graph API call to `/deviceManagement/deviceConfigurations` to check for autorun settings.
- [ ] **CIS 7.3/7.4 patch differentiation** — Datto RMM API `/device/{uid}/patch` returns 404. The API only provides aggregate `patchesApprovedPending` per device, not OS vs third-party split. Both evaluators use the same data and note this limitation. Would need Datto RMM reporting module or alternative API endpoint.
- [ ] **Assessment formatting** — Long policy documentation sections (8+ policies) still dense. Consider collapsible/accordion sections.

### Priority 3: Features to Build
- [ ] **Multi-framework policy analysis** — `analyzePolicyWithAI` hardcodes CIS v8 control list. Accept frameworkId parameter for CMMC, HIPAA, NIST 800-171.
- [ ] **Customer attestation input** — DB table `compliance_attestations` exists. Need API route + UI for customer-submitted responses.
- [ ] **Override persistence** — Reviewer overrides (N/A, manual pass) should carry forward to future assessments. Currently per-assessment only.
- [ ] **Customer portal compliance card** — Backend exists (`/api/compliance/portal`), needs component wired into CustomerDashboard.
- [ ] **Assessment score methodology** — Consider separate technical vs documentation scores, or "X/Y by evidence, Z by policy" display.
- [ ] **MyITProcess integration** — Collects alignment scores but doesn't feed into any evaluator.

### Priority 4: Cleanup
- [ ] **Debug endpoint cleanup** — `/api/compliance/debug-collectors` should be auth-gated or removed before broader production rollout.
- [ ] **Remove SaaS Alerts API client logging** — Verbose auth pattern logging added for debugging, should be removed once integration works.
- [ ] **TypeScript pattern** — Always use `Array.from()` for Set iteration. `for...of Set` and `[...Set]` fail build (no downlevelIteration).

## Other Systems — Maintenance
- Reporting pipeline: stable
- SOC system: stable
- Blog/marketing: stable
- Autotask sync: stable
- HR offboarding: `targetUserId` scope fix deployed
