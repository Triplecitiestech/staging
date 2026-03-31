# Current Tasks

> Last updated: 2026-03-31

Active development work and outstanding items.

## Compliance Evidence Engine — Active Work

### Priority 1: Bugs
- [ ] **MFA data shows 0%** — All permissions granted for EZ Red but beta Graph endpoint returns no data. v1.0 fallback and error logging added in latest commit. Next step: check Vercel runtime logs for `[graph-beta]` errors after running an assessment, adjust endpoint path if needed.
- [ ] **Microphone dictation not prompting** — CSP `connect-src` updated with speech WebSocket endpoints, `Permissions-Policy` set to `microphone=(self)`. Edge may have cached old block. User needs to add site to mic allow list or clear cache.
- [ ] **DNSFilter 0 queries** — buildSummary tries multiple endpoint patterns but all return 0. May need different org scoping or date format.

### Priority 2: Evidence Quality
- [ ] **Environment-aware N/A controls** — Setup wizard now captures VPN/cloud-only/server/BYOD context (4 new questions). Evaluators need to read these answers and auto-mark controls as N/A when they don't apply (e.g., CIS 6.4 "MFA for VPN" is N/A for cloud-only customers).
- [ ] **Tool deployment toggle → evaluator** — When a tool (RocketCyber, Bullphish ID, etc.) is toggled as "deployed" on the Tool Map, the relevant evaluators should auto-pass those controls with "attestation" confidence.
- [ ] **Override persistence** — When a reviewer marks a control as N/A with a reason, that override should carry forward to future assessments (currently per-assessment only).

### Priority 3: Remaining Features
- [ ] **Policy management UI** — Backend exists (`/api/compliance/policies` with Claude AI analysis), needs frontend in the compliance dashboard.
- [ ] **Customer portal compliance card** — Backend exists (`/api/compliance/portal`), needs component wired into `CustomerDashboard.tsx` with `compliancePortalEnabled` toggle in admin company settings.
- [ ] **Customer attestation input** — DB table exists (`compliance_attestations`), needs API route and UI for customers to submit responses where technical evidence is insufficient.

## Other Systems — Maintenance
- Reporting pipeline: stable, all cron jobs healthy
- SOC system: stable
- Blog/marketing: stable
- Autotask sync: running every 15 min
