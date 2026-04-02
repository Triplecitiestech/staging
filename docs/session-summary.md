# Session Summary

> Last updated: 2026-04-02 (Session 2 — final)
> Branch: `claude/fix-unicode-compliance-engine-wnzk8`
> Latest commit: `4e90c1d` — Improve 7.x evaluators with per-device detail

## What Was Built This Session

### Critical Fix: Cross-Customer Data Isolation + Platform Mapping
- **Platform Mapping system** — New `compliance_platform_mappings` table, API, and UI tab. Admin explicitly maps each customer to their sites/orgs/devices in each platform. All 9 MSP collectors updated to use explicit mappings, falling back to name matching when unmapped. "Not Used" option skips collection entirely.
- **Ubiquiti** — Was returning all 88 MSP sites. Now filters by mapped console/host name.
- **BCDR** — Skipped when setup wizard says no on-prem servers. Shows individual devices in mapping.
- **SaaS Protect** — Split into its own collector (was inside BCDR, died when BCDR skipped).
- **EDR** — New collector with org-filtered alerts. Platform mapping uses `/Organizations` endpoint.
- **DNSFilter** — Rewrote collector: uses orgs/networks/policies (traffic endpoints don't exist). Supports roaming clients.
- **SaaS Alerts** — Blocked by Cloudflare. Built webhook receiver at `/api/compliance/webhooks/saas-alerts`. Support ticket submitted to Kaseya.

### Policy Coverage Logic Fixes
- `needs_review` controls upgrade to `pass` when uploaded policies satisfy them
- `partial` documentation controls (IT Glue missing) upgrade when policies provide the documentation
- Controls with technical evidence show full policy quotes (not just names)
- Assessment results formatted with structured policy sections, numbered lists

### Evaluator Improvements
- **11.x**: SaaS-only passes for cloud customers (no BCDR recommendation when not used)
- **11.3/11.4**: Now check both BCDR and SaaS Protect for encryption/isolation
- **7.x**: Per-device patch detail (lists unpatched device hostnames with pending counts)
- **10.2**: New evaluator for anti-malware signature updates
- **9.2**: DNSFilter passes on org existence (roaming clients don't need network-level filtering)
- **17.x**: Pass via uploaded SIRP/incident response policies

### UI Fixes
- Unicode entities fixed in PolicyManager
- Policy analysis timestamps on cards
- controlDetails with quotes shown in expanded policy view
- FormattedReasoning component for assessment results
- Re-analyze race condition fixed

## Verified Working (EZ Red Assessment 4/1/2026)
- EDR: "EZ Red" — 29 devices, 43 security events ✅
- SaaS Protect: 57 seats (56 active, 0 unprotected) ✅
- DNSFilter: "EZ Red" — org configured, 4 policies ✅
- Datto RMM: 27 devices, per-device patch detail ✅
- Ubiquiti: Filtered to customer console only ✅
- BCDR: Correctly skipped (not used) ✅
- 11.1-11.4: All pass with SaaS Protect evidence ✅
- Policy quotes showing in assessment results ✅
- Platform Mapping: All 9 platforms visible and mappable ✅

## Architecture Notes
- `compliance_platform_mappings` — explicit per-company bindings replace name matching
- `compliance_webhook_events` — stores inbound webhook events (90-day TTL)
- SaaS Protect collector is independent from BCDR collector
- Environment context loaded in Phase 1 (was Phase 3) for collector decisions
- `applyPolicyCoverage` checks `missingEvidence` source types to determine if partial→pass upgrade is allowed
- TypeScript: always use `Array.from()` for Set iteration (no downlevelIteration)
