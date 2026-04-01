# Session Summary

> Last updated: 2026-04-01
> Branch: `claude/integrate-tct-feature-NhLTX-WjY92`
> Latest commit: `35261aa` — Add progress indicator to Re-analyze All button

## What Was Built This Session

### Major Features
1. **MFA collection fix** — v1.0 endpoint first, beta fallback, credentialUserRegistrationDetails third fallback
2. **Environment-aware N/A** — setup wizard answers auto-mark controls as N/A (cloud-only → no VPN control, no servers → no server firewall)
3. **Tool deployment attestation** — Bullphish ID/RocketCyber/Dark Web ID toggles auto-pass controls
4. **Ubiquiti UniFi integration** — new client at `src/lib/ubiquiti.ts`, /ea/devices endpoint (grouped by host)
5. **MyITProcess integration** — new client at `src/lib/myitprocess.ts`, read-only API (GET only)
6. **Multi-layer audit log evaluators** — CIS 8.x now shows all 6 logging layers (M365, RMM, EDR, Domotz, Ubiquiti, SaaS Alerts)
7. **Compliance scope definition** — 6 new setup wizard questions defining what's in scope
8. **Policy Analysis UI** — paste, upload, or SharePoint folder scan with AI analysis against all 65 CIS v8 controls
9. **Policies feed into assessments** — applyPolicyCoverage upgrades needs_review to pass when policy satisfies (only for documentation controls, not technical ones)
10. **Per-control reasoning and quotes** — AI analysis now returns reasoning, exact quotes, and section references per control
11. **SharePoint folder scanner** — POST /api/compliance/policies/sharepoint-scan lists all documents in a folder for bulk import
12. **Compliance Playbook** — docs/COMPLIANCE_PLAYBOOK.md documents all scoring logic

### Performance Fixes
- **DB connection pool exhaustion** — detectConnectors used 12 connections per page load → now 1
- **runAssessment** — restructured to 3-phase (release DB during API collection, parallel collectors)
- **getComplianceDashboard** — inlined queries, 3 connections → 1
- **getAssessmentSummary** — inlined queries, 5+ connections → 1
- **ensureComplianceTables** — removed 14 redundant calls from engine internals
- **Domotz parallel device fetching** — was sequential (timeout), now parallel
- **loadEnvironmentContext** — accepts optional client parameter to reuse existing connection

### Bug Fixes
- **Domotz agent status** — was object `{value: "ONLINE"}` not string, all comparisons failed
- **Domotz per-customer matching** — now matches agents by company name
- **IT Glue fuzzy matching** — 5-strategy matching (exact, normalized, short-name, word overlap, squished)
- **Ubiquiti /ea/devices** — response grouped by host, not flat array
- **DNSFilter** — org IDs are strings not numbers, traffic reports need org-scoped endpoints
- **Policy AI prompt** — expanded from 19 to all 65 CIS v8 controls

## Known Issues — Must Fix Next Session

### Priority 1: Bugs
1. **Unicode `&#9660;` rendering literally** in PolicyManager.tsx — the HTML entities aren't rendering in JSX. Need to use actual unicode characters or React elements instead.
2. **Policy analysis timestamps not shown** — users can't tell when a policy was last analyzed. Need to show `analyzedAt` date on each policy card.
3. **Policy re-analyze may not include controlDetails (quotes/reasoning)** — the new prompt requests controlDetails but existing re-analyzed policies may not have the `controlDetails` column populated if the ALTER TABLE didn't run. Verify the column exists.
4. **CIS 3.4 and other controls with technical evidence** — policies are mentioned as "Additionally supported by" but don't show quotes. The applyPolicyCoverage function correctly doesn't override technical evidence, but should still show the policy quote in the reasoning.
5. **Ubiquiti still shows 0 devices for EZ Red** — the /ea/devices endpoint returns devices grouped by host, code was fixed but needs verification after deploy.
6. **DNSFilter collection_failed** — endpoint paths were fixed but untested in production.

### Priority 2: Features Not Yet Complete
1. **Multi-framework policy analysis** — AI prompt hardcodes CIS v8. Should accept framework parameter for CMMC, HIPAA, NIST 800-171.
2. **SharePoint folder scan** — built but untested (requires Sites.Read.All permission on customer app registration).
3. **Customer attestation input** — DB table exists, no API/UI.
4. **Override persistence across assessments** — overrides are per-assessment only.
5. **Customer portal compliance card** — backend exists, not wired into portal.

### Priority 3: Quality
1. **Policy analysis quality** — need to verify the AI is returning proper controlDetails with quotes and sections. May need prompt tuning.
2. **Assessment score should exclude policy-only controls from denominator** or clearly indicate which controls are policy-satisfied vs technically-satisfied.
3. **Debug endpoint cleanup** — /api/compliance/debug-collectors should be removed or auth-gated before production.

## Architecture Notes
- Raw SQL tables (not Prisma-managed), following reporting/SOC pattern
- 3-phase assessment: Phase 1 (DB read + release), Phase 2 (parallel API collection, zero DB), Phase 3 (DB write)
- Policy coverage: loaded in Phase 3 via loadPolicyCoverage, applied via applyPolicyCoverage after each evaluator
- All collectors run in parallel via Promise.allSettled
- Company name pre-fetched in Phase 1 and passed to collectors (no DB during Phase 2)

## Env Vars
- `UBIQUITI_API_KEY`, `UBIQUITI_API_URL` (https://api.ui.com)
- `MYITP_API_KEY`, `MYITP_API_URL` (https://reporting.live.myitprocess.com)
- `DOMOTZ_API_KEY`, `DOMOTZ_API_URL`
- `IT_GLUE_API_KEY`, `IT_GLUE_API_URL`
- `SAAS_ALERTS_API_KEY`, `SAAS_ALERTS_API_URL`
