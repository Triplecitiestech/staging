# Session Summary

> Last updated: 2026-03-31
> Branch: `claude/integrate-tct-feature-NhLTX`
> Latest commit: `cc94010` — Fix MFA collection, add environment questions to setup wizard

## What Was Built — Compliance Evidence Engine

A multi-tenant compliance and evidence automation system inside the existing TCT website. 9 integrated tools pulling live data + 4 attestation-based toggles. 65 CIS v8 controls across 16 categories. Full assessment lifecycle with historical comparison.

### Core Files
- `src/lib/compliance/` — Engine (types, engine, ensure-tables, frameworks/cis-v8, collectors/graph, collectors/msp, registry/)
- `src/lib/domotz.ts`, `src/lib/it-glue.ts`, `src/lib/saas-alerts.ts` — New integration clients
- `src/app/api/compliance/` — 10 API routes (dashboard, assessments, connectors, export, policies, portal, ai-assist, registry, company-tools, setup)
- `src/app/admin/compliance/` — 3 pages (main dashboard, tools map, setup wizard)
- `src/components/compliance/` — 3 components (Dashboard, ToolCapabilityMap, SetupWizard)

### Integration Status
Integrated (live data): Microsoft 365/Graph, Autotask, Datto RMM, Datto EDR, Datto BCDR, Datto SaaS Protect, DNSFilter, Domotz, IT Glue, SaaS Alerts
Toggle-only (no API): RocketCyber, Bullphish ID, Dark Web ID, Ubiquiti

### Key Architecture Decisions
- Raw SQL tables (not Prisma-managed), following reporting/SOC pattern
- Tool Capability Registry with 25 capabilities mapping tools to controls
- CIS v8 IG1/IG2/IG3 selector — each level filters to appropriate controls
- All 65 evaluators are custom (zero generic), checking actual policies and data
- Intune compliance policies and config profiles collected as named evidence
- `compliancePortalEnabled` added to Prisma Company model with migration

### Modified Existing Files
- `next.config.js` — CSP connect-src for speech + Permissions-Policy microphone=(self)
- `prisma/schema.prisma` — compliancePortalEnabled field
- `src/lib/permissions.ts` — manage_compliance, view_compliance permissions
- `src/components/admin/AdminHeader.tsx` — Compliance nav link
- `src/components/admin/TechOnboardingWizard.tsx` — Compliance Azure AD permissions + secret ID warning

## Outstanding Work

### Bugs
1. **MFA 0%** — EZ Red has all Graph permissions but beta endpoint returns no data. v1.0 fallback added, error logging added. Check runtime logs.
2. **Microphone** — CSP and Permissions-Policy updated but Edge may need manual site allow. Check `wss://speech.platform.bing.com` in CSP.
3. **DNSFilter 0 queries** — API may need different date format or org scoping.

### Features Not Yet Built
1. Policy management UI (API exists, no frontend)
2. Customer portal ComplianceCard (API exists, not wired into portal)
3. Admin toggle for compliancePortalEnabled per company
4. Customer attestation input UI (table exists, no API/UI)
5. Environment-aware N/A — setup wizard captures VPN/cloud-only context but evaluators don't auto-mark N/A
6. Override persistence across assessments
7. Tool deployment toggle → evaluator integration (attestation-based auto-pass)

### Env Vars Added This Session
- `DOMOTZ_API_KEY`, `DOMOTZ_API_URL`
- `IT_GLUE_API_KEY`, `IT_GLUE_API_URL`
- `SAAS_ALERTS_API_KEY`, `SAAS_ALERTS_API_URL`
