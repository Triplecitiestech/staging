# Current Tasks

> Last updated: 2026-03-31

Active development work and outstanding items.

## Compliance Evidence Engine — Active Work

### Priority 1: Bugs
- [x] **MFA data shows 0%** — Fixed: Added v1.0 first, beta fallback, credentialUserRegistrationDetails third fallback. Error logging added to graphGet. Runtime logs will show `[mfa-collector]` and `[graph-v1]` messages. If still 0%, check for `AuditLog.Read.All` permission.
- [ ] **Microphone dictation not prompting** — CSP `connect-src` updated with speech WebSocket endpoints, `Permissions-Policy` set to `microphone=(self)`. Edge may have cached old block. User needs to add site to mic allow list or clear cache.
- [ ] **DNSFilter 0 queries** — buildSummary tries multiple endpoint patterns but all return 0. May need different org scoping or date format.

### Priority 2: Evidence Quality — DONE
- [x] **Environment-aware N/A controls** — Setup wizard answers now feed into evaluators. CIS 6.4 (VPN MFA) = N/A for cloud-only. CIS 4.4 (Server firewall) = N/A for no-server. CIS 16.x (App security) = N/A for no-custom-dev.
- [x] **Tool deployment toggle → evaluator** — Bullphish ID → 14.x training auto-pass. RocketCyber → 13.1 alerting auto-pass. Dark Web ID → 5.2 credential monitoring. All with 'low' confidence attestation note.
- [ ] **Override persistence** — When a reviewer marks a control as N/A with a reason, that override should carry forward to future assessments (currently per-assessment only).

### Priority 3: Remaining Features
- [ ] **Policy management UI** — Backend exists (`/api/compliance/policies` with Claude AI analysis), needs frontend in the compliance dashboard.
- [ ] **Customer portal compliance card** — Backend exists (`/api/compliance/portal`), needs component wired into `CustomerDashboard.tsx` with `compliancePortalEnabled` toggle in admin company settings.
- [ ] **Customer attestation input** — DB table exists (`compliance_attestations`), needs API route and UI for customers to submit responses where technical evidence is insufficient.

### New: Ubiquiti Integration
- [x] **Ubiquiti UniFi Cloud API client** — `src/lib/ubiquiti.ts` lists sites and devices with firmware versions
- [x] **Evidence collection** — Ubiquiti collector in msp.ts, wired into engine
- [x] **CIS 12.1 evaluator** — Uses Ubiquiti firmware data for network infrastructure assessment

## Other Systems — Maintenance
- Reporting pipeline: stable, all cron jobs healthy
- SOC system: stable
- Blog/marketing: stable
- Autotask sync: running every 15 min
