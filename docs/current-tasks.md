# Current Tasks

> Last updated: 2026-04-01 (Session 2)

## Compliance Evidence Engine — Active Work

### Priority 1: Bugs to Fix Now
- [ ] **DNSFilter collection_failed** — Still not working. Need to debug with debug endpoint and fix the collector/client.
- [ ] **SaaS Alerts webhook** — Domain whitelisted but need Kaseya support to explain how to register the webhook endpoint URL. Message drafted for Ben.
- [ ] **Platform mapping QA** — Verify Ubiquiti console listing works (was showing "Default", now uses host names). User needs to map EZ Red's console.
- [ ] **Assessment formatting polish** — Controls with 8+ policy quotes (like CIS 8.2) are still dense. Consider collapsible sections.

### Priority 2: Features to Complete
- [ ] **Multi-framework policy analysis** — Update `analyzePolicyWithAI` to accept frameworkId. Use framework's control list instead of hardcoded CIS v8.
- [ ] **Customer attestation input** — DB table `compliance_attestations` exists. Need API route + UI for customer responses.
- [ ] **Override persistence** — Reviewer overrides should carry forward to future assessments (currently per-assessment only).
- [ ] **Customer portal compliance card** — Backend exists (`/api/compliance/portal`), needs component in CustomerDashboard.
- [ ] **Policy management polish** — Delete policy, edit, re-order, categories filter.

### Priority 3: Quality
- [ ] **Assessment score methodology** — Separate scores: technical (integrations) vs documentation (policies). Or show "X/Y by evidence, Z by policy."
- [ ] **Debug endpoint cleanup** — `/api/compliance/debug-collectors` should be removed or properly gated before production.
- [ ] **MyITProcess integration** — Collects data but doesn't feed into any evaluator. Alignment scores could inform documentation controls.
- [ ] **Set iteration pattern** — TypeScript target doesn't support `for...of` on Sets or `[...Set]` spread. Always use `Array.from()`.

## Completed This Session
- [x] Unicode entities in PolicyManager
- [x] Policy analysis timestamps on cards
- [x] controlDetails column + GET query
- [x] Policy quotes in assessment results (both policy-only and technical+policy)
- [x] Re-analyze race condition
- [x] needs_review policy upgrade logic
- [x] Assessment result formatting (FormattedReasoning)
- [x] Datto RMM AV reference removed
- [x] CIS 10.2 evaluator
- [x] Cross-customer data isolation (Ubiquiti, BCDR, SaaS Alerts)
- [x] Platform Mapping system (table, API, UI, collector integration)
- [x] SaaS Alerts webhook receiver
- [x] applyPolicyCoverage shows quotes for technical evidence controls

## Other Systems — Maintenance
- Reporting pipeline: stable
- SOC system: stable
- Blog/marketing: stable
- Autotask sync: stable
