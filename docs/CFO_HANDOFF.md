# CFO Dashboard — Handoff

> **Last updated**: 2026-05-29. Built across one long session on branch
> `claude/add-project-access-control-U9Tde` (auto-merged to `main`, live in production).
> Quick rules live in `CLAUDE.md` → "CFO Dashboard (Financial)". This is the deep context.

## What it is

Internal, staff-only financial dashboard at **`/admin/cfo`**. Ported from a standalone
Node tool (Sequence + QuickBooks "CFO dashboard") the operator had locally. Combines:
- **Sequence** (getsequence.io) — banking: pods, transfers (24mo), rules/executions. The
  operating cash layer.
- **QuickBooks Online** — accrual: Balance Sheet, P&L, Aged Receivable Detail.

## Pages
- `/admin/cfo` — the dashboard (KPIs, recommended actions, 30-day forecast, 12-mo income/outflow
  area chart, ops breakdown, obligations, anomalies, YoY, debt overview + paydown, what-if
  simulator, QuickBooks panel, AR, rules health, uncategorized spend).
- `/admin/cfo/settings` — QB connect/disconnect/status, debts editor (JSON), scheduled outflows,
  QB + AR snapshot loaders (fallback before live QB), category overrides.
- `/admin/cfo/hiring` — fully-loaded hiring cost calculator (US W-2 vs Philippines contractor),
  with affordability vs. live net flow + revenue-needed.

## Code map
- `src/lib/cfo/` — `types.ts`, `sequence-client.ts`, `qb-auth.ts` / `qb-client.ts` / `qb-parse.ts`,
  `roles.ts`, `categories.ts`, `compute.ts` (pure analytics), `build.ts` (orchestrator + delta cache),
  `store.ts` (raw-pg `cfo_settings`), `access.ts` (gate), `demo.ts` (anonymize+scale), `hiring.ts`.
- `src/components/cfo/` — `CfoDashboardClient.tsx`, `CfoSettingsClient.tsx`, `CfoSimulator.tsx`,
  `HiringCalculator.tsx`, `CfoAccordion.tsx`, `CfoAreaChart.tsx` (last two added by a parallel session).
- `src/app/api/admin/cfo/` — `access`, `data`, `rebuild`, `config`, `qb/{connect,callback,status,disconnect}`.
- `src/app/api/cron/cfo-rebuild` — 6-hour rebuild (in `vercel.json`).

## Access control
A staff user gets in if EITHER:
1. **`view_cfo_dashboard` permission** (in `permissions.ts`; SUPER_ADMIN by default). Grant per-user in
   **/admin/staff → Permissions → Reporting** (NOTE: that editor's list is hardcoded in
   `ContactsList.tsx`, separate from `permissions.ts`).
2. **Entra group** in `CFO_DASHBOARD_ENTRA_GROUP_IDS` — live app-only Graph `checkMemberGroups`
   against the TCT `AZURE_AD` app. Needs `GroupMember.Read.All` + `User.Read.All` + admin consent on
   THAT app. Fails closed. (Operator added accounting + administration groups; verify consent/perms if
   a group member is denied.)

## Env vars (Vercel, Production)
- `SEQUENCE_API_TOKEN` — required for banking analytics.
- `QB_CLIENT_ID`, `QB_CLIENT_SECRET`, `QB_ENV=production` — Intuit production app. Redirect URI on the
  Intuit app: `https://www.triplecitiestech.com/api/admin/cfo/qb/callback`.
- `ENCRYPTION_MASTER_KEY_V1` — 32-byte base64 (~44 chars), encrypts QB tokens. MUST be set + redeployed
  or QB connect fails. Generate (PowerShell):
  `$b=New-Object byte[] 32;[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b);[Convert]::ToBase64String($b)`
  **Do not rotate** once set (breaks stored QB tokens).
- `CFO_DASHBOARD_ENTRA_GROUP_IDS` — comma-separated Entra group object IDs (optional; allowlist works without).

## Key behaviors / gotchas
- `cfo_settings` is a raw-pg key/value jsonb table (self-healing via `ensureCfoTables`), NOT Prisma. Keys:
  `dashboard` (cached snapshot), `transfers_cache`, `debts`, `destination_categories`, `qb_tokens`
  (encrypted), `qb_snapshot`, `ar_snapshot`, `scheduled_outflows`, `hiring_assumptions`.
- `maxDuration=300` on data/rebuild/cron (first full Sequence pull is slow under the rate gate). Vercel Pro.
- Sequence: ~700ms process-wide rate gate, concurrency 2, backoff→30s, **delta sync** (only ~30-day window
  after the first full pull, merged into `transfers_cache`). `getAllTransfers` is resilient per-account —
  keep it that way.
- The **income-vs-outflow chart is cash movement, not P&L**. Outflow includes the Amex bill (a month of
  card spend in one payment), payroll, debt principal, owner draws. Accrual profit = QuickBooks panel.
- "Est. monthly revenue" KPI uses **QB accrual income** (income ÷ monthsInPeriod) when connected, else
  Sequence cash-in avg.
- Demo mode masks names (`company()`) + scales all cents by one factor (`num(_,'cfo-scale')`).

## NEXT FOCUS — Spending insight / anomaly detection (not started)
Most spend is on **Amex**, invisible at vendor level in Sequence (one lump "AMEX EPAYMENT"). To detect
spending anomalies / improve habits we need vendor-level detail. Options to evaluate:
- **(c) QuickBooks (best near-term, already connected)** — pull P&L detail by account / a vendor-expense
  report. This reproduces the "Expenses by Vendor" report Rio sends, automatically. Likely start here.
- **(a) Card feed** — Amex API / Plaid / a transactions feed into the actual card line items.
- **(b) Statement ingestion** — parse/scan uploaded Amex + pod-account statements (PDF/CSV) from SharePoint.
- Same for other spending pod accounts. Goal: per-vendor/per-category spend over time → anomalies.
- Also offered but not built: a per-month outflow drill-down (click a chart month → its top destinations).
