# Current Tasks

> Last updated: 2026-03-14

Active development work and outstanding items. Only currently active work belongs here — completed work moves to `docs/session-summary.md`.

---

## Active Development

### SOC Reasoning Layer (Phase 1 — COMPLETE)
- **Status**: Complete (2026-03-14)
- **Key files**: `src/lib/soc/types.ts`, `src/lib/soc/prompts.ts`, `src/lib/soc/engine.ts`, `src/components/soc/SocTicketDetail.tsx`, `src/app/api/soc/tickets/[id]/analysis/route.ts`, `src/app/api/soc/migrate/route.ts`
- **What shipped**:
  - 5-value classification: false_positive, expected_activity, informational, suspicious, confirmed_threat
  - Dynamic `EvidenceItem[]` array with color-coded indicators
  - `buildReasoningPrompt()` with technician roster context and historical FP rate
  - `generateReasoning()` engine integration with legacy fallback
  - Customer messages gated by `customerMessageRequired` flag
  - Reasoning-first UI: Summary → Assessment → Evidence → Recommended Action → Actions → Technical Details (collapsed)
  - `reasoning JSONB` column on `soc_incidents`; `internal_site_ids` seeded with `["177027"]`
  - Fixed 504 timeouts on 3 SOC API routes (maxDuration + Promise.all parallelization)

### SOC Phase 2 (Future)
- **Status**: Not started
- **Key files**: `docs/plans/SOC_REDESIGN_PLAN.md`
- **Planned work**:
  - OSINT API integrations (AbuseIPDB, VirusTotal, AlienVault OTX, ip-api.com)
  - Auto-action tiers (Tier 1 full auto, Tier 2 semi-auto, Tier 3/4 human required)
  - Single-pass AI analysis (replacing 3-call pipeline with 1-2 calls)
  - Dashboard stat card updates (auto-resolved, awaiting review metrics)
  - Datto RMM job/session data integration
  - IP reputation service integration

### SOC Production Hardening
- **Status**: Ongoing
- **Key files**: `src/lib/soc/engine.ts`, `src/app/api/soc/`
- **Remaining**: Rate limiting on AI calls, error recovery for partial failures, tune AI prompts based on production data, improve correlation accuracy

### Autotask Integration Improvements
- **Status**: Ongoing
- **Key files**: `src/lib/autotask.ts`, `src/app/api/autotask/trigger/route.ts`
- **Recent work**: Fixed silent catch bugs, cron auth via Vercel Authorization header, cleanup step handles dependent records, resync improvements
- **Remaining**: Task status PATCH still returns 404 (Autotask instance limitation), reporting backfill completion for all companies

### Reporting & Analytics
- **Status**: In progress
- **Key files**: `src/lib/reporting/`, `src/app/api/reports/`, `src/components/reporting/`
- **Recent work**: Real-time queries, self-healing pipeline, self-chaining backfill, business review PDF, AI assistant, SLA metrics
- **Remaining**: Ensure all companies have full historical data, refine health score algorithm

### Monitoring Dashboards
- **Status**: Recently added
- **Key files**: `src/app/admin/monitoring/page.tsx`, `src/app/admin/page.tsx`
- **Recent work**: System health cards on admin home, AT sync logs page, AI usage tracking, threshold alerts, DB response time graph
- **Remaining**: Add alerting notifications, expand monitored metrics

### Customer Portal Improvements
- **Status**: Ongoing
- **Key files**: `src/components/onboarding/`, `src/app/onboarding/`
- **Recent work**: Smart ticket sorting, metrics, chat CTA, invite system with portal roles, impersonation
- **Remaining**: Improve onboarding journey flow, add more self-service features

---

## Outstanding Technical Debt

### High Priority
- E2e test suite needs updates after recent SOC/reporting changes
- Reporting backfill completion for all companies

### Medium Priority
- CSP violation reporting (`report-uri` / `report-to`) not implemented
- `/admin/setup` and `/admin/run-migration` have no session auth guard
- `/blog/setup` publicly accessible
- Several admin API routes lack role-specific checks

### Low Priority
- ~10 pre-existing lint warnings (unused variables)
- `'unsafe-inline'` in production CSP script-src
- `CRON_SECRET` vs `AUTOTASK_SYNC_SECRET` naming inconsistency
- `TestFailure` Prisma model exists but all queries use raw SQL

---

## Future Required: Pre-Launch Cleanup

> **Not the immediate priority**, but must be completed before the platform is opened to customers beyond the current controlled group. Full checklist is in `CLAUDE.md` under "Pre-Launch Cleanup Required".

Key items:
- Remove hardcoded secrets from documentation (CLAUDE.md)
- Audit auth flows, impersonation, and debug endpoints
- Review auto-deploy and auto-merge behavior
- Harden customer portal security
- Implement CSP violation reporting
- Verify preview/production environment separation
