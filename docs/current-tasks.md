# Current Tasks

> Last updated: 2026-03-14

Active development work and outstanding items. Only currently active work belongs here — completed work moves to `docs/session-summary.md`.

---

## Active Development

### SOC Dashboard Overhaul
- **Status**: In progress
- **Key files**: `src/components/soc/`, `src/app/api/soc/`, `src/lib/soc/`
- **Recent work**: Actionable filter, AI-generated rules, trend analysis, ticket-centric dashboard redesign
- **Remaining**: Production hardening (rate limiting on AI calls, error recovery, false positive rate monitoring)

### AI SOC Analyst Agent
- **Status**: In progress
- **Key files**: `src/lib/soc/engine.ts`, `src/lib/soc/prompts.ts`, `src/lib/soc/correlation.ts`
- **Recent work**: Full AI classification pipeline, human approval workflow, OSINT prompts, action plans, merge recommendations
- **Remaining**: Tune AI prompts based on production data, improve correlation accuracy

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
