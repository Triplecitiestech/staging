# Current Tasks

> Last updated: 2026-04-01

## Compliance Evidence Engine — Active Work

### Priority 1: Bugs to Fix Immediately
- [ ] **Unicode `&#9660;` rendering literally in PolicyManager** — HTML entities don't work in JSX. Replace with actual unicode chars (`\u25BC`) or use React `<span>` elements. Same for `&bull;`, `&rarr;`, `&middot;` — check all of PolicyManager.tsx.
- [ ] **Policy analysis timestamp not visible** — Add `analyzedAt` date to each policy card so users know when it was last analyzed. Currently only shows `createdAt`.
- [ ] **Verify controlDetails column exists** — The ALTER TABLE in the policies route may not have run. Check if `compliance_policy_analyses` has a `controlDetails` JSONB column. If not, add it to ensure-tables.ts.
- [ ] **Policy quotes not showing in assessment results** — Even after re-analyze, CIS 3.4 and other controls with technical evidence only show "Additionally supported by uploaded policy: ..." without quotes. For controls WITHOUT technical evidence, verify the quotes/reasoning from controlDetails are being displayed.
- [ ] **Ubiquiti 0 devices** — /ea/devices endpoint code was fixed to handle nested host response, but production still shows 0. Run debug endpoint to verify: `/api/compliance/debug-collectors?collector=ubiquiti&secret=...`
- [ ] **DNSFilter collection_failed** — Endpoint paths fixed but untested. Run debug endpoint to verify: `/api/compliance/debug-collectors?collector=dnsfilter&secret=...`

### Priority 2: Features to Complete
- [ ] **Multi-framework policy analysis** — Update `analyzePolicyWithAI` to accept a frameworkId parameter. Use the framework's control list instead of hardcoded CIS v8. This enables analyzing policies against CMMC, HIPAA, NIST 800-171 when those frameworks are added.
- [ ] **SharePoint folder scan testing** — The scan endpoint and UI are built but untested. Requires `Sites.Read.All` on the customer's Azure AD app registration. Test with a real SharePoint folder URL.
- [ ] **Customer attestation input** — DB table `compliance_attestations` exists. Need API route and UI for customers to submit responses where technical evidence is insufficient.
- [ ] **Override persistence** — When a reviewer marks a control as N/A with a reason, that override should carry forward to future assessments (currently per-assessment only).
- [ ] **Customer portal compliance card** — Backend exists (`/api/compliance/portal`), needs component wired into `CustomerDashboard.tsx` with `compliancePortalEnabled` toggle.
- [ ] **Policy management UI polish** — Delete policy button, edit policy, re-order, categories filter.

### Priority 3: Quality Improvements
- [ ] **Assessment score methodology** — Consider separate scores: technical score (from integrations) vs documentation score (from policies). Or show "X/Y controls satisfied by evidence, Z additional by policy."
- [ ] **Evaluator evidence attribution** — When applyPolicyCoverage upgrades a control, the "Supporting Evidence" section should show the policy document as evidence, not stale IT Glue references.
- [ ] **Remove debug endpoint** — `/api/compliance/debug-collectors` should be removed or properly gated before broader rollout.
- [ ] **MyITProcess integration** — Currently collects data but doesn't feed into any evaluator. Alignment scores could inform documentation controls.

## Other Systems — Maintenance
- Reporting pipeline: stable, all cron jobs healthy
- SOC system: stable
- Blog/marketing: stable
- Autotask sync: running every 15 min (504 timeouts occasionally during pool exhaustion — should be resolved now)
