# Session Summary

> Last updated: 2026-04-01 (Session 2)
> Branch: `claude/fix-unicode-compliance-engine-wnzk8`
> Latest commit: `75f8bf8` — Add SaaS Alerts webhook receiver

## What Was Built This Session

### Critical Fix: Cross-Customer Data Isolation
- **Ubiquiti collector** was returning ALL 88 MSP sites (498 devices) for every customer. Now filters by customer-mapped console name.
- **BCDR collector** was matching wrong customers' devices. Now skipped entirely if setup wizard says no on-prem servers or m365-only backup.
- **SaaS Alerts collector** was storing empty evidence (0 events, 0 tenants). Now reports error instead.
- **All MSP collectors** now support explicit platform mappings — admin-confirmed site/org/device bindings replace fragile name matching.

### New Feature: Platform Mapping System
- **compliance_platform_mappings table** — stores per-company explicit bindings to platform entities
- **API**: GET/POST/DELETE `/api/compliance/platform-mappings` + `?action=list-sources&platform=X` for dropdown population
- **PlatformMappingPanel component** — searchable dropdowns pulling live data from each platform's API
  - Suggested matches highlighted based on company name
  - "Not Used" option for every platform (skips collection entirely)
  - Ubiquiti lists by console/host name (not "Default" site names)
  - BCDR shows individual devices with client name
- **New "Platform Mapping" tab** in ComplianceDashboard alongside Assessments and Policy Analysis
- **All 5 MSP collectors updated**: Datto RMM (site UID), BCDR (device serial), Ubiquiti (hostId), Domotz (agent ID), IT Glue (org name). Falls back to name matching when no mapping exists.

### SaaS Alerts Webhook System
- SaaS Alerts API blocked by Cloudflare bot protection — can't call from serverless
- Built webhook receiver: POST `/api/compliance/webhooks/saas-alerts`
- **compliance_webhook_events table** — stores inbound events (90-day TTL)
- Collector reads from local webhook storage instead of calling API
- Webhook setup instructions shown in Platform Mapping UI
- **Status**: Domain whitelisted in SaaS Alerts, but need Kaseya support to clarify webhook URL registration. Message drafted for Ben.

### Bug Fixes
1. **Unicode entities** — `&#9660;`, `&#9650;`, `&bull;` rendering literally in PolicyManager.tsx → replaced with actual chars
2. **Policy timestamps** — Added `analyzedAt` date to policy cards
3. **controlDetails column** — Added to ensure-tables.ts + ALTER TABLE for existing tables + fixed GET query to include it
4. **Policy quotes in assessments** — GET query now returns controlDetails; PolicyManager UI shows per-control reasoning, quotes, section references
5. **Re-analyze race condition** — reanalyzeAll was calling reanalyzePolicy which clobbered the 'all' state
6. **needs_review policy upgrade** — Controls with insufficient technical evidence (e.g., IT Glue found nothing) now upgrade to pass via uploaded policies
7. **Assessment result formatting** — FormattedReasoning component: numbered lists split into items, policy documentation in bordered sections with parsed quotes
8. **Datto RMM** — Removed AV reference from evidence summary (not used for AV)
9. **CIS 10.2 evaluator** — Added proper evaluator for anti-malware signature updates (was "no evaluator available")
10. **applyPolicyCoverage** — Shows full policy quotes for controls with technical evidence (was just listing policy names)
11. **loadPolicyCoverage logging** — Errors now logged instead of silently swallowed

### Debug Endpoints
- `?collector=policies` — shows controlDetails count, sample quotes, analyzedAt per policy
- `?collector=saas_alerts` — raw HTTP test showing each auth pattern + endpoint response

## Known Issues — Must Fix Next

### Priority 1
1. **DNSFilter collection_failed** — endpoint paths were fixed in prior session but still not working. Need to debug with debug endpoint.
2. **SaaS Alerts webhook URL registration** — domain whitelisted but no way to specify endpoint URL in UI. Need Kaseya support response.

### Priority 2
1. **Multi-framework policy analysis** — AI prompt hardcodes CIS v8
2. **Customer attestation input** — DB table exists, no API/UI
3. **Override persistence across assessments** — per-assessment only
4. **Customer portal compliance card** — backend exists, not wired in
5. **Assessment formatting** — long policy documentation sections still dense for controls with 8+ policies

### Priority 3
1. **Assessment score methodology** — separate technical vs documentation scores
2. **Debug endpoint cleanup** — should be auth-gated before production
3. **MyITProcess integration** — collects data but doesn't feed into evaluators

## Architecture Notes
- Platform mapping: `compliance_platform_mappings` table, explicit per-company bindings
- Webhook events: `compliance_webhook_events` table, 90-day TTL, source-indexed
- Environment context now loaded in Phase 1 (was Phase 3) — used to skip BCDR before Phase 2
- All Set iterations use Array.from() — TypeScript target doesn't support downlevelIteration
