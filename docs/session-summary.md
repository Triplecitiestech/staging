# Session Summary

> Last updated: 2026-03-31
> Branch: `claude/integrate-tct-feature-NhLTX-WjY92`
> Latest commit: `4bdddf6` — Fix MFA collection, add env-aware N/A, tool attestation, Ubiquiti integration

## What Was Built — Compliance Evidence Engine

A multi-tenant compliance and evidence automation system inside the existing TCT website. 10 integrated tools pulling live data + 4 attestation-based toggles. 65 CIS v8 controls across 16 categories. Full assessment lifecycle with historical comparison.

### Core Files
- `src/lib/compliance/` — Engine (types, engine, ensure-tables, frameworks/cis-v8, collectors/graph, collectors/msp, registry/)
- `src/lib/domotz.ts`, `src/lib/it-glue.ts`, `src/lib/saas-alerts.ts`, `src/lib/ubiquiti.ts` — Integration clients
- `src/app/api/compliance/` — 10 API routes (dashboard, assessments, connectors, export, policies, portal, ai-assist, registry, company-tools, setup)
- `src/app/admin/compliance/` — 3 pages (main dashboard, tools map, setup wizard)
- `src/components/compliance/` — 3 components (Dashboard, ToolCapabilityMap, SetupWizard)

### Integration Status
Integrated (live data): Microsoft 365/Graph, Autotask, Datto RMM, Datto EDR, Datto BCDR, Datto SaaS Protect, DNSFilter, Domotz, IT Glue, SaaS Alerts, Ubiquiti UniFi
Toggle-only (no API): RocketCyber, Bullphish ID, Dark Web ID

### Key Architecture Decisions
- Raw SQL tables (not Prisma-managed), following reporting/SOC pattern
- Tool Capability Registry with 25 capabilities mapping tools to controls
- CIS v8 IG1/IG2/IG3 selector — each level filters to appropriate controls
- All 65 evaluators are custom (zero generic), checking actual policies and data
- Intune compliance policies and config profiles collected as named evidence
- `compliancePortalEnabled` added to Prisma Company model with migration
- **Environment-aware N/A** — setup wizard answers feed into evaluators to auto-mark inapplicable controls
- **Tool deployment attestation** — toggles on Tool Capability Map auto-pass controls with low confidence

### Modified Existing Files
- `next.config.js` — CSP connect-src for speech + Permissions-Policy microphone=(self)
- `prisma/schema.prisma` — compliancePortalEnabled field
- `src/lib/permissions.ts` — manage_compliance, view_compliance permissions
- `src/components/admin/AdminHeader.tsx` — Compliance nav link
- `src/components/admin/TechOnboardingWizard.tsx` — Compliance Azure AD permissions + secret ID warning

## Changes This Session (2026-03-31)

### MFA 0% Bug Fix
- Added error logging to `graphGet` (was silently swallowing all 4xx/5xx errors)
- Changed to try v1.0 endpoint first (this endpoint graduated from beta)
- Added `credentialUserRegistrationDetails` as third fallback endpoint
- Updated permission guidance: `AuditLog.Read.All` often required alongside `UserAuthenticationMethod.Read.All`
- Added diagnostic `console.log` statements prefixed `[mfa-collector]` for runtime debugging

### Environment-Aware N/A
- Added `EnvironmentContext` and `ToolDeployment` types to `src/lib/compliance/types.ts`
- Added `loadEnvironmentContext()` to engine — reads from `compliance_msp_setup` table
- Added `loadDeployedTools()` to engine — reads from `compliance_company_tools` table
- Added `envNotApplicable()` helper in cis-v8.ts:
  - CIS 6.4 (MFA for VPN) → N/A when remote_access = "cloud_only"
  - CIS 4.4 (Firewall on Servers) → N/A when on_prem_servers = "no_servers"
  - CIS 16.x (App Security) → N/A when custom_apps = "no"
- Updated evaluators for 6.4, 4.4, and 16.1 to check environment first

### Tool Deployment Attestation
- Added `toolAttestationPass()` helper in cis-v8.ts
- Control → tool mapping: Bullphish ID → 14.x, RocketCyber → 13.1, Dark Web ID → 5.2
- Updated `trainingEvaluator()` to check Bullphish ID deployment first
- Updated CIS 14.1 and 13.1 evaluators to check attestation
- All attestation passes have 'low' confidence with clear attestation note

### Ubiquiti UniFi Integration
- New `src/lib/ubiquiti.ts` — API client for UniFi Cloud (api.ui.com)
- Lists sites via `/ea/sites`, hosts via `/ea/sites/{id}/hosts`
- Collects device hostname, model, firmware version, uptime, connected clients
- New `ubiquiti_network` evidence source type and `ubiquiti` connector type
- Collector in `src/lib/compliance/collectors/msp.ts` builds device inventory
- CIS 12.1 evaluator uses Ubiquiti firmware data for high-confidence network infrastructure assessment
- Env vars: `UBIQUITI_API_KEY`, `UBIQUITI_API_URL` (default: https://api.ui.com)

## Outstanding Work

### Bugs
1. **MFA 0%** — Enhanced logging and fallback endpoints added. After next assessment run, check Vercel runtime logs for `[mfa-collector]` and `[graph-v1]` messages to diagnose further. If all three endpoints return no data, the issue is likely missing `AuditLog.Read.All` permission.
2. **Microphone** — CSP and Permissions-Policy updated but Edge may need manual site allow.
3. **DNSFilter 0 queries** — API may need different date format or org scoping.

### Features Not Yet Built
1. Policy management UI (API exists, no frontend)
2. Customer portal ComplianceCard (API exists, not wired into portal)
3. Admin toggle for compliancePortalEnabled per company
4. Customer attestation input UI (table exists, no API/UI)
5. Override persistence across assessments

### Env Vars Added This Session
- `UBIQUITI_API_KEY`, `UBIQUITI_API_URL`

### Previously Added Env Vars
- `DOMOTZ_API_KEY`, `DOMOTZ_API_URL`
- `IT_GLUE_API_KEY`, `IT_GLUE_API_URL`
- `SAAS_ALERTS_API_KEY`, `SAAS_ALERTS_API_URL`

