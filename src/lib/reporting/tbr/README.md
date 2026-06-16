# Presentation TBR / Monthly Summary (`src/lib/reporting/tbr/`)

Reusable generator for the customer-facing **Technology Business Review** and
**Monthly Customer Summary**, rendered in the 2026 TBR deck design (dark
cyan-on-black executive style). Built to **extend** the existing reporting
system — it reuses the platform's single integration clients (`autotask.ts`,
`datto-rmm.ts`, …) and never duplicates them.

Feasibility basis: `docs/plans/TBR_MONTHLY_REPORTING_FEASIBILITY.md`.

## Module map (the requested modular architecture)

| File | Role | Maps to requested module |
|------|------|--------------------------|
| `types.ts` | Normalized data model + `SectionState` contract | normalized data model |
| `theme.ts` | Design tokens + stylesheet (parameterized by `TbrTheme`) | `reportTemplates` (style) |
| `template.ts` | Reusable render primitives (`tileGrid`, `dataTable`, `shareTable`, `stateBanner`, `slide`) + page shell | `reportTemplates` / `reportSections` |
| `data-sources.ts` | Loaders that wrap existing clients and return a `SectionState` | `dataSources` + `integrations` |
| `sections.ts` | Section registry pairing a typed loader with a renderer | `reportSections` |
| `index.ts` | `generateTbrReport()` orchestrator | `reportGenerators` |
| `../../../app/api/reports/tbr/route.ts` | HTTP entry point (auth + customer resolution) | `reportGenerators` / `customerMappings` |

Customer mapping (`customerMappings`) reuses existing infra: Autotask via
`Company.autotaskCompanyId` (resolved in the route), Datto via
`matchesCompanyName` / `compliance_platform_mappings`, M365 via
`Company.m365TenantId`.

## Per-section state machine

Every section resolves to one of: `success`, `empty`, `error`, `manual`
(no integration — hand-entered), or `pending` (integration exists, not yet
wired). A thrown loader is caught and becomes `error`, so **one failing source
never breaks the report**. Non-`success` sections render a banner plus a
"ghost" of the metrics they will show once wired.

Current wiring: **Ticket Volume**, **Devices & Alerts** (Autotask + Datto RMM),
**Backup & Business Continuity** (Datto SaaS) and **Content Filtering**
(DNSFilter) are live and per-customer scoped. Content Filtering is scoped via an
explicit `compliance_platform_mappings` entry (platform `dnsfilter`, set in the
compliance Platform Mappings UI); `DnsFilterClient.buildSummary(start, end,
orgId)` then queries only that organization with the account-wide fallback
disabled, so it can never mix customers. A customer with no DNSFilter mapping
renders `pending` (never an account-wide pull). **Security Alerts (Datto EDR)**
stays `pending` — its `buildSummary` is still MSP-wide (needs the same per-org
scoping); **M365** is `pending` (tenant-scoped, so no leak risk, but its Graph
usage-report CSV calls must be added to graph.ts and verified live). **Email
Security (INKY)** and **Security Awareness (BullPhish ID)** are `manual` (no
integration exists). Verified end-to-end: with no credentials present the whole
deck still renders, degrading each source independently.

## How to add a data source

1. Add or reuse a client in `src/lib/<vendor>.ts` with an `isConfigured()` guard
   and `AbortSignal.timeout(...)` on every fetch (never a parallel client).
2. In `data-sources.ts`, add a loader `async (ctx) => SectionState<T>`:
   - return `{ status:'success', source, data }` on data,
   - `{ status:'empty', source, note }` when scoped-but-empty,
   - throw (or return `{ status:'error', ... }`) on failure.
   - Memoize with `memo(ctx, key, fn)` if it feeds more than one section.
3. Add the customer mapping (prefer `compliance_platform_mappings` over name
   matching for customer-facing scoping — see the DNSFilter scoping note in the
   feasibility report).

## How to add a section / slide

Add one `defineSection<T>({ id, eyebrow, title, load, render, ghost })` to
`sections.ts` and include it in `TBR_SECTIONS` (deck order). `defineSection`
captures the data type, wraps `load` in try/catch, and adds the slide wrapper +
state banner automatically — so `render` only handles the `success` body using
the primitives from `template.ts`.

## How to add a theme / brand

Themes are plain `TbrTheme` objects in `theme.ts`. Pass a different theme to
`renderTbrReport(report, theme)`; templates consume a theme, so new
brands/styles are new theme values, not forked templates.

## Usage

```
GET /api/reports/tbr?company=<name|partial>&type=tbr&years=3&format=html
GET /api/reports/tbr?companyId=<autotaskId>&type=monthly_summary&format=json
```
Auth: logged-in staff session OR `MIGRATION_SECRET` (`Authorization: Bearer …`
or `?secret=`). `format=json` returns `{ meta, coverage }` (per-section status
roll-up) without the HTML. The raw multi-year data export remains
`/api/reports/tbr-export`.

## Not yet done (tracked in the feasibility report §7)

EDR per-customer org scoping + SOC "events analyzed" (then wire Security Alerts —
apply the same `compliance_platform_mappings` org-scoping pattern now used for
DNSFilter); M365 Graph Reports calls + delta snapshot (then wire Microsoft 365);
Datto SaaS TB / last-backup / jobs (investigate `/saas/{id}/applications`); INKY +
BullPhish connectors; persistence to `BusinessReview` (`reportType:'tbr'`) + an
admin UI entry point reusing the existing customer typeahead + date-range picker.
