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

## Spending insight / anomaly detection — BUILT (QuickBooks)
Most spend rides on **Amex** and is invisible at vendor level in Sequence (one lump "AMEX EPAYMENT"),
but QuickBooks already splits it into real expense accounts + vendors. We went with **option (c)
QuickBooks** (already connected; reconciled; reproduces Rio's "Expenses by Vendor" automatically). Card
feed (a) / statement ingestion (b) were deferred — only worth it for sub-monthly latency.

**What shipped:**
- Two month-summarized QBO reports pulled live during the build (only when `qbSource==='live'`):
  - `getProfitAndLossByMonth` → `ProfitAndLoss?summarize_column_by=Month&accounting_method=Accrual` → **category × month** (the accounts behind the Amex lump).
  - `getVendorExpensesByMonth` → `VendorExpenses?summarize_column_by=Month` → **vendor × month** (Rio's report).
- `parseSpendSeries(report, kind)` in `qb-parse.ts` — tolerant time-series parser. Reads `Columns[].MetaData` StartDate to key each month ('YYYY-MM'); walks rows tracking the **top-level section** so `category` keeps only the Expenses/COGS region (leaf rows, never section Summaries → no double-count), `vendor` keeps every vendor row. Returns `{kind, months, rows}`.
- `detectSpendAnomalies(series)` in `compute.ts` — month-over-month, latest complete month vs. mean of prior months. Flags **spike** (≥1.5× baseline AND ≥$250 delta), **new** (baseline ≤$50, latest ≥$250), **dropped** (baseline ≥$250, latest ≤$50). Ranked by absolute $ impact. Thresholds are the `SPEND_ANOMALY` consts.
- `monthlyOutflowDrilldown(allTransfers, categoryMap)` in `compute.ts` — per-month top Sequence MONEY_OUT destinations (the proposed chart drill-down; rendered as an accordion under the cash chart, newest month first — no fragile chart-click).
- `build.ts` → `loadQbSpendInsights()` assembles `DashboardData.qbSpend: QbSpendInsights | null` (months, totalMonthlyCents, byCategory[20], byVendor[20], anomalies[20]) + `DashboardData.outflowDrilldown`. Window = **last 12 *complete* calendar months** (current partial month excluded so it doesn't read as a spending collapse).
- UI (`CfoDashboardClient.tsx`): "Spending anomalies — QuickBooks (month over month)", "Spend by category — QuickBooks" (total-spend area chart + per-row monthly trail), "Spend by vendor — QuickBooks", and "Monthly outflow drill-down". Existing Sequence anomaly section relabeled "…Sequence pods (weekly spikes)".
- `demo.ts` masks vendor names + scales all cents for the new shapes (category labels left as-is, matching opsBreakdown policy).

**Caveats / still open:**
- **VendorExpenses + `summarize_column_by=Month`**: if this QBO report doesn't honor month-summarization it returns a single Total column → the parser yields no months → the **vendor section + vendor anomalies silently disappear** (categories still work from P&L). Verify on the live preview (Refresh → check the vendor section renders with a month trail). If empty, switch the vendor source to per-month `ProfitAndLossDetail` grouped by vendor, or `TransactionListByVendor`.
- No snapshot fallback for `qbSpend` (it's live-only; null when QB disconnected or a fetch fails). Could persist a `qb_spend_snapshot` like `qb_snapshot` for resilience.
- Anomalies are **not** wired into the top "Recommended actions" strip (kept out to avoid renumbering churn + demo coupling). Easy add later via `generateActions`.
- Anomaly thresholds are hardcoded consts — could move to Settings if Rio wants to tune sensitivity.
- v1 Reports API (minorversion 75) is being superseded by a v2 (Intuit, Mar 2026); month-summarization over ~12 cols is well within v2 limits, but watch for migration.

## Still open (other)
- **Card feed (a) / SharePoint statements (b)** — only if sub-monthly anomaly latency is needed later.
- Hiring calculator still needs Rio's burden-questionnaire answers to set real US/PH defaults.
