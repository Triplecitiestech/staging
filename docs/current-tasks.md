# Current Tasks

> Last updated: 2026-04-02 (Session 3)

## Compliance Evidence Engine — Outstanding Work

### Priority 1: Blocked / Waiting
- [ ] **SaaS Alerts integration** — Support ticket submitted to Kaseya. Their API at manage.saasalerts.com is behind Cloudflare bot protection, blocking all server-to-server calls. Webhook receiver built at `/api/compliance/webhooks/saas-alerts` and domain whitelisted. Need Kaseya to explain webhook URL registration or provide a non-Cloudflare API endpoint. Once working, SaaS Alerts auto-appears as a logging layer in CIS 8.2 and 13.1.

### Priority 2: Evidence Quality Improvements
- [x] **CIS 10.3 (Autorun/Autoplay)** — Now checks Intune device config profiles for autorun-specific policies. High confidence when matching profile found.
- [ ] **CIS 7.3/7.4 patch differentiation** — Datto RMM API `/device/{uid}/patch` returns 404. The API only provides aggregate `patchesApprovedPending` per device, not OS vs third-party split. Both evaluators use the same data and note this limitation. Would need Datto RMM reporting module or alternative API endpoint.
- [ ] **Assessment formatting** — Long policy documentation sections (8+ policies) still dense. Consider collapsible/accordion sections.

### Priority 3: Features — Recently Completed
- [x] **Override persistence** — Reviewer overrides now carry forward to new assessments automatically. Prefixed with `[Carried forward]` in reasoning.
- [x] **Customer portal compliance card** — Compliance score gauge, trend chart, and findings breakdown added to CustomerDashboard. Fetches from `/api/compliance/portal`.
- [x] **Multi-framework policy analysis** — `analyzePolicyWithAI` accepts frameworkId parameter. Supports CIS v8, CMMC L2, HIPAA, NIST 800-171.

### Priority 3: Features to Build
- [ ] **Customer attestation input** — DB table `compliance_attestations` exists. Need API route + UI for customer-submitted responses.
- [ ] **Assessment score methodology** — Consider separate technical vs documentation scores, or "X/Y by evidence, Z by policy" display.
- [ ] **MyITProcess integration** — Collects alignment scores but doesn't feed into any evaluator.
- [ ] **PolicyManager framework selector** — UI needs a dropdown to select which framework to analyze against (currently always CIS v8 from the UI).

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
