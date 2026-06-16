# Automated TBR / Monthly Reporting — Data-Source Feasibility Report

*Date: 2026-06-16 · Author: AI session (claude/beautiful-bohr-ofgksw) · Status: Deliverable #1 (feasibility only — no production behavior changed)*

> **Purpose.** Confirm whether the website can automatically pull the data needed to generate (1) a polished customer-facing **TBR** in the attached presentation design, and (2) a lighter **Monthly Customer Summary**. This is the required first step before building automation. **No integration availability is assumed — every claim below is grounded in code with `file:line` citations.**

---

## 0. TL;DR verdict

**Most of this already exists.** TCT's platform already has a working, per-customer reporting pipeline (`src/lib/reporting/annual-report/`) that pulls Autotask, Datto RMM, Datto EDR, DNSFilter, Datto BCDR, Datto SaaS, SOC incidents, and health scores, and renders branded HTML. A `BusinessReview` Prisma model already persists reports with a `reportType`/`variant`/status workflow and email delivery. **The correct path is to extend this system, not build a parallel one** (CLAUDE.md: "No parallel implementations… never create `*-v2`/`*-new`").

Per data source, against the attached deck's 8 data-driven slides:

| # | Slide | Data source | Integration today | Verdict |
|---|-------|-------------|-------------------|---------|
| 05 | Users at a Glance — M365 | Microsoft 365 | Auth client exists (`graph.ts`); **no usage-report calls yet** | **Buildable** — `Reports.Read.All` already consented; add Graph Reports calls |
| 06 | Email Security | **INKY** | **None** (hard-coded placeholder) | **Missing** — needs new client + creds + mapping; manual-input fallback meanwhile |
| 07 | Content Filtering | DNSFilter | Client exists (`dnsfilter.ts`), production-used | **Available** *but not customer-scoped* (see §4 — real gap) |
| 08 | Ticket Volume & Breakdown | Autotask + Datto RMM | Both exist; `tbr-export` already does year-by-year | **Available now** |
| 09 | Devices & Alerts | Datto RMM | `datto-rmm.ts` exists, production-used | **Available now** |
| 10 | Security Alerts / Threats | Datto EDR (+ SOC) | `datto-edr.ts` exists | **Mostly available** — "events analyzed" funnel step needs SOC-side data |
| 11 | Security Awareness Training | **BullPhish ID** | **None** (compliance registry mention only) | **Missing** — needs new client + creds; manual-input fallback meanwhile |
| 12 | Backup & Business Continuity | Datto SaaS Protection (+ BCDR) | `datto-saas.ts` / `datto-bcdr.ts` exist | **Partial** — seat counts yes; storage-TB / last-backup / jobs-in-progress not exposed by current calls |

**Bottom line:** 5 of 8 slides are automatable today (4 fully, 1 mostly). M365 is automatable with net-new Graph Reports calls on already-consented permissions. 2 slides (INKY, BullPhish) have **no integration at all** and need either new vendor connectors or a manual-input fallback. 1 slide (Backup) is partially automatable. The reusable architecture should treat every section as independently degradable so a missing source never breaks the report.

---

## 1. The design baseline (attached HTML)

The attached `2026_TBR__TriBros_Transportation_standalone.html` is a **17-slide presentation-style deck** (1.8 MB, single inlined HTML, no external assets, no base64 images — pure CSS/SVG). Structure (from its own section markers):

```
01 Welcome & Objectives      08 Ticket Volume & Breakdown   (data)
02 Check-In                   09 Devices & Alerts            (data)
03 What's New in IT / AI      10 Security Alerts             (data)
04 Your Managed Services      11 Security Awareness Training (data)
05 Users at a Glance: M365    (data)  12 Backup & Continuity (data)
06 Users at a Glance: Email   (data)  13 Strategic Recommendations
07 Users at a Glance: Content (data)  14 Budget & Commercial
                                      15 Open Discussion / Q&A
                                      16 Action Items & Next Steps
                                      17 Thank You
```

- **8 data-driven slides** (05–12) — the subject of this feasibility check.
- **9 narrative/manual slides** (01–04, 13–17) — authored content, no integration needed. Several are marked `data-deck-skip` (presenter-only).

### Design tokens (lift these into a reusable theme — all in our allowed palette)
```
Background: #000 (black) with gradients to #0B1220 / #0F172A / #0E4A57 / #0E7490
Primary accent: cyan scale  --cyan-400 #22D3EE (accent), --cyan-500 #06B6D4 (CTA)
Brand: --tct-shield-blue #1F8FB3, white text, gray-300/400 for dim text
Supporting (sparingly): emerald-400 #34D399, rose-400/500 (danger)
Fonts: 'Inter' (display/body), ui-monospace (numerics)
Layout: 96px side padding, 72px titles, large "tile" stat numerals (68px)
```
This is **fully compliant** with TCT's forbidden-color rule (no yellow/amber/gold/orange) — it's a cyan-on-black executive style. Reusable section classes already present in the deck: `card`, `grid4`/`row3`/`row4`, `funnel`/`fstep`, `bkcards`/`bkcard`, `dtable`, `chip`, `eyebrow`, `pageno`, `tile`.

### Exact fields each data slide renders (the normalized model must cover these)
- **05 M365:** active users; email activities (send+receive); Teams activities; OneDrive files (+% vs prior); SharePoint files (+% vs prior); active app users (Excel/Outlook/Teams/Word).
- **06 Email Security:** emails processed; contained-links / no-links; links clicked (unsafe count); danger messages; messages by threat level (Neutral/Caution/Danger + %); threat breakdown (phish/malware vs spam tiers).
- **07 Content Filtering:** total requests; allowed; blocked; threats; top categories (list); top domains (list).
- **08 Ticket Volume:** created (multi-year total); closed; currently open; aging >30d; alerts resolved (RMM); created-vs-closed by year (4-year table).
- **09 Devices & Alerts:** managed devices (+online now); servers; workstations; fully-patched (% of fleet); AV installed (% coverage); reboot-required; alerts by priority (Critical/High/Moderate/Low/Info + share %).
- **10 Security Alerts:** events captured; events analyzed; total alerts; critical alerts; detection funnel; top-risk narrative.
- **11 Security Awareness:** courses opened; started; completed; no-action.
- **12 Backup:** total protected data (TB); last backup; jobs in progress; per-workload (OneDrive/Exchange/SharePoint/Teams) active count + fully-protected count + last-protected date.

---

## 2. What already exists (reuse map)

### 2.1 Existing report-generation system
| Piece | Location | What it does |
|-------|----------|--------------|
| **Annual Report module** | `src/lib/reporting/annual-report/` (`data-builder.ts`, `report-processor.ts`, `types.ts`, `pdf-export.ts`, `index.ts`) | Per-customer report that pulls **Autotask + Datto RMM + EDR + DNSFilter + BCDR + SaaS + SOC + health**, tracks per-source coverage (`DataSourceCoverage`), supports section show/hide, renders branded HTML. |
| **Business Review module** | `src/lib/reporting/business-review/` (`data-builder.ts`, `narrative.ts`, `recommendations.ts`, `pdf-export.ts`, `types.ts`, `index.ts`) | Monthly/quarterly customer-facing review: ticket metrics, SLA, narrative prose, data-grounded recommendations, customer-vs-internal variant, draft→review→ready→sent workflow, Resend email delivery. |
| **TBR export (live)** | `src/app/api/reports/tbr-export/route.ts` | Live multi-year pull (Autotask + Datto RMM), **already produces created-vs-closed by year, aging >7/>30, queues, priorities, reactive vs proactive, resolution times** — exactly slide 08. JSON or HTML. |
| **Executive summary (live)** | `src/app/api/reports/executive-summary/route.ts` | Live annual snapshot, JSON or HTML. |
| **Customer History page** | `src/app/admin/reporting/customer-history/page.tsx` + `src/components/reporting/CustomerHistoryGenerator.tsx` | Live Autotask typeahead customer selector, year (1–10) + include-hours + include-datto toggles, shareable link. |
| **Persistence** | `BusinessReview` Prisma model (`prisma/schema.prisma` ~1310) | Stores `reportType` (monthly/quarterly/annual), `variant` (customer/internal), `reportData`/`narrative`/`recommendations` JSON, status workflow, `sentTo`/`sentAt`. Unique on `(companyId, reportType, variant, periodStart)`. |
| **API routes** | `src/app/api/reports/business-review/*`, `.../annual-report/*` | GET list / GET one / POST generate / PATCH status / DELETE / `/pdf` (HTML) / `/send` (email). |

**Implication for the requested modular architecture** — the user's desired structure already has homes:

| Requested module | Existing equivalent to extend |
|------------------|-------------------------------|
| `integrations` | `src/lib/{autotask,datto-rmm,datto-edr,datto-saas,datto-bcdr,dnsfilter,graph,rocketcyber}.ts` (one client each — **reuse, do not duplicate**) |
| `dataSources` | `annual-report/data-builder.ts` builders + `DataSourceCoverage` registry |
| `customerMappings` | `Company.autotaskCompanyId` / `Company.m365TenantId` + `compliance_platform_mappings` table |
| `reportSections` | `annual-report/types.ts` `REPORT_SECTION_DEFS` + processor visibility |
| `reportTemplates` | `*/pdf-export.ts` HTML generators (need a new **presentation-style** template — see §6) |
| `reportGenerators` | `generateBusinessReview()` / `buildAnnualReportData()` + the route layer |

### 2.2 Customer → integration mapping (the "customerMappings" concern)
- **Autotask:** `Company.autotaskCompanyId` (`prisma/schema.prisma:117`, `@unique`). Solid.
- **M365:** `Company.m365TenantId` + `Company.m365ConsentMode` (`schema.prisma:126,131`). Solid; multi-tenant admin-consent is the default for new onboards.
- **Datto RMM / EDR / SaaS / BCDR:** `compliance_platform_mappings` table (explicit `companyId → platform → externalId`), with **fuzzy company-name fallback** (`matchesCompanyName`) used by `datto-bcdr.ts`, `datto-saas.ts`, and `annual-report/data-builder.ts`. BCDR has a cross-company safety check; EDR requires explicit mapping (MSP-wide otherwise). **Reusable**, but explicit mappings should be filled in to avoid name-match drift.
- **DNSFilter:** ⚠️ **No per-customer mapping** — see §4.

---

## 3. Per-data-source feasibility detail

### 05 · Microsoft 365 — `src/lib/graph.ts`  → **BUILDABLE (net-new Graph Reports calls)**
- **Exists:** Full Graph client (`getUsers`, `getManagedDevices`, `getLicenseSkus`, provisioning, etc.), token cache, 15s auth / 30s data timeouts, pagination helper. Single credential source `getTenantCredentials()` resolves legacy per-tenant vs multi-tenant.
- **Gap:** **Zero `/reports/` usage-endpoint calls today.** The 6 slide-05 metrics come from Graph Reports API: `getOffice365ActiveUserCounts`, `getEmailActivityCounts`, `getTeamsUserActivityUserCounts`, `getOneDriveUsageFileCounts`, `getSharePointSiteUsageFileCounts`, `getOffice365ActiveUserDetail` (app usage).
- **Auth/permissions:** Client-credentials (app-only). `Reports.Read.All` is **already consented** for the multi-tenant portal app (per `docs/M365_PORTAL_PERMISSIONS.md`) — so no new admin consent needed for usage reports.
- **Mapping:** `Company.m365TenantId`.
- **Caveats:** (a) Microsoft **pseudonymizes** usage-report user names by default at the tenant level — counts/aggregates are fine, per-user detail may be obfuscated. (b) "% vs last period" requires storing a prior-period snapshot (no historical baseline today). (c) Graph reports support fixed periods (D7/D30/D90/D180) — custom date ranges need stitching.
- **Verdict:** All 6 metrics achievable by adding ~6 functions to `graph.ts` + a snapshot for deltas. No new credentials.

### 06 · Email Security (INKY) — **MISSING ENTIRELY**
- **Evidence:** Only a hard-coded placeholder: `annual-report/data-builder.ts` `buildEmailSecurityPlaceholder()` returns `{ available:false, note:"Inky… not yet implemented… needs INKY_API_KEY, INKY_API_URL, src/lib/inky.ts, sync job, company→tenant mapping" }`; `types.ts` `EmailSecurityAnalysis = { available, note }`; section label "Email Security (Inky)".
- **No** client, route, env var, or credential anywhere (`INKY_*` not in `.env.example`).
- **EasyDMARC (`easydmarc.ts`) is NOT a substitute** — it validates SPF/DKIM/DMARC records, not inbound threat scanning/click data.
- **Verdict:** Needs a brand-new connector (auth method TBD from INKY API docs), creds, and company→INKY-tenant mapping. Until then: **manual-input / "data unavailable" section state.**

### 07 · Content Filtering (DNSFilter) — `src/lib/dnsfilter.ts`  → **AVAILABLE, but NOT customer-scoped (real gap)**
- **Exists & production-used:** `DnsFilterClient` with `getTrafficReport`, `buildSummary`, monthly trends. Auth `Authorization: Token <DNSFILTER_API_TOKEN>`, 30s timeout. Returns total/blocked queries, threat categories, top blocked domains. `DNSFILTER_API_TOKEN` is in `.env.example`.
- ⚠️ **Scoping gap:** `getOrganizationId()` (`dnsfilter.ts:81-102`) fetches the org list and **uses the first org** ("Found N organizations. Using first"). There is **no `companyId → DNSFilter org` mapping**. For an MSP token spanning multiple customer orgs, every customer's report would get the **same (first) org's** traffic. This both breaks accuracy and risks cross-customer data bleed (cf. CLAUDE.md gotcha #6 — per-customer scoping).
- **Verdict:** All slide-07 metrics are retrievable, **but a per-customer org mapping must be added** (extend `compliance_platform_mappings` to `platform='dnsfilter'`, and accept an org id in the client) before this is safe in a customer-facing per-customer TBR. "Allowed = total − blocked" is derived; "threats" = sum of threat categories.

### 08 · Ticket Volume & Breakdown (Autotask + Datto RMM) — **AVAILABLE NOW**
- **Autotask** (`src/lib/autotask.ts` + `src/lib/reporting/`): hybrid live + synced-cache. `getCompanyTicketsCreatedSince(companyId, since)` pulls unlimited multi-year history (date-window paginated, dedup'd). `tbr-export/route.ts` already computes **created/closed by year (4-year table), open, aging >7/>30, reactive vs proactive, resolution times** — i.e. the entire slide. 30s timeout, retry/backoff, 3-thread Autotask limit respected. Mapping via `Company.autotaskCompanyId`.
- **Datto RMM "alerts resolved":** `DattoRmmClient.getResolvedAlerts()` filtered to the period (NOT Autotask).
- **Verdict:** Available now via the existing `tbr-export` aggregation; reuse it.

### 09 · Devices & Alerts (Datto RMM) — `src/lib/datto-rmm.ts`  → **AVAILABLE NOW**
- `getDevices`/`getSiteDevices` → managed count, online, server vs workstation (`deviceType`), `patchStatus==='FullyPatched'` (%), `antivirusProduct` present (AV %), `rebootRequired`. `getOpenAlerts`/`getResolvedAlerts` → alerts by `priority` (Critical/High/Moderate/Low/Information) with share %. OAuth2 password grant (`DATTO_RMM_API_KEY`/`SECRET`), 15s timeout, paginated. Mapping via site (compliance mapping or `matchesCompanyName`).
- **Verdict:** Every slide-09 field is directly retrievable.

### 10 · Security Alerts / 2026 Threats (Datto EDR + SOC) — `src/lib/datto-edr.ts`  → **MOSTLY AVAILABLE**
- `buildSummary()` → `totalEvents` (events captured), `eventsBySeverity` (critical count = critical alerts), `topThreats`, `eventsByType`. LoopBack token auth (`DATTO_EDR_API_TOKEN`), 30s timeout. Per-org mapping required (`compliance_platform_mappings`, else MSP-wide — **must scope**).
- **Gap:** "Events analyzed" (the funnel's middle step "escalated by the SOC engine") is **not** an EDR field. Source it from the **SOC engine** (`src/lib/soc/`, RocketCyber + correlation) or treat the funnel as captured→alerts→critical. The "top risk" narrative is authored/AI-generated.
- **Verdict:** Captured / total alerts / critical → available now. "Analyzed" → derive from SOC pipeline or omit. Funnel renderable.

### 11 · Security Awareness Training (BullPhish ID) — **MISSING ENTIRELY**
- **Evidence:** Recognized only in the compliance tool registry (`compliance/registry/tool-definitions.ts:215` — `bullphish_id`, `integrationStatus:'known'`, `connectorType:null`, `evidenceSourceTypes:[]`) and as a **manual** remediation action ("log in to the BullPhish portal…"). No client, route, env var, or credential.
- **Verdict:** Needs a brand-new connector + creds. Until then: **manual-input / "data unavailable" section state.**

### 12 · Backup & Business Continuity (Datto SaaS + BCDR) — `src/lib/datto-saas.ts`, `src/lib/datto-bcdr.ts`  → **PARTIAL**
- **SaaS Protection** `buildSummary()`/`getSeats()` → per-workload active counts (OneDrive/Exchange users, SharePoint/TeamSites, Teams) and seat states (Active/Paused/Archived/Unprotected). Basic-auth, shares BCDR creds (`DATTO_BCDR_PUBLIC_KEY`/`PRIVATE_KEY`), 30s timeout, fuzzy mapping (capped 10 customers/call).
- **Gaps (not exposed by current calls):** **Total protected data (TB)**, **last-backup date per workload**, **jobs in progress**. BCDR (`datto-bcdr.ts`) exposes `localStorageUsedBytes`/`offsiteStorageUsedBytes` and `lastSeenDate` for **on-prem appliances** (not SaaS workloads).
- **Verdict:** "Fully protected X/Y per workload" and active counts → available now. TB / last-backup / jobs → require additional Datto SaaS endpoints (e.g. `/saas/{id}/applications`) or are not currently retrievable → manual/omit per field.

---

## 4. Cross-cutting risks & concerns

1. **Per-customer scoping (critical).** DNSFilter (and EDR if unmapped) can return MSP-wide or wrong-customer data. Per CLAUDE.md gotcha #6, customer-facing reports **must** scope every source to the selected customer. Action: add `dnsfilter` to `compliance_platform_mappings`, require explicit org ids, and prefer explicit mappings over `matchesCompanyName` for all Datto sources in customer-facing output.
2. **Rate limits / serverless time budget.** Autotask = 3 concurrent threads, 500/page; Datto RMM/EDR paginate heavily; full reports already run against a ~50s serverless budget (`tbr-export` self-guards). A full TBR touching 6+ sources should fetch sources **in parallel with per-source timeouts** and persist results (the `BusinessReview` JSON pattern) rather than recompute live on every view.
3. **M365 deltas need snapshots.** "% vs last period" requires storing prior-period M365 usage numbers.
4. **Missing connectors (INKY, BullPhish).** Two slides cannot be automated at all yet. The architecture must degrade gracefully (manual-input state) so they never break the deck.
5. **No live connectivity proof from this build container.** Confirmed: **none** of the integration env vars (Autotask/Datto/DNSFilter/M365/etc.) are present in this ephemeral container — they live only in Vercel. Connectivity therefore must be proven on a deployed environment (see §5), not from here. I did **not** fabricate any "connection succeeded" claims.

## 5. How to PROVE each integration is reachable (operator steps)

Credentials live only in Vercel, so prove reachability against the **preview** deployment for branch `claude/beautiful-bohr-ofgksw` (`https://claude-beautiful-bohr-ofgksw-triplecitiestech.vercel.app`) or production. PowerShell (per your environment):

```powershell
$secret = "<MIGRATION_SECRET>"   # paste from Vercel; do not commit
$base   = "https://www.triplecitiestech.com"

# Env + DB connectivity
Invoke-RestMethod "$base/api/reports/diagnose-env?secret=$secret"

# Datto RMM reachability (existing diagnostic route)
Invoke-RestMethod "$base/api/reports/rmm-test?secret=$secret"

# End-to-end proof for ALL sources at once: generate an annual report for a real
# customer — the response's per-source `available`/coverage notes are the live proof.
Invoke-RestMethod "$base/api/reports/tbr-export?company=<NAME>&years=3&datto=true&format=json"
```
The annual-report builder already returns `DataSourceCoverage[]` (`source, available, isPartial, note`) per integration — generating one report for a pilot customer is the single best feasibility proof across Autotask, Datto RMM/EDR/SaaS/BCDR, DNSFilter, SOC, and health in one shot.

---

## 6. Recommended architecture (extend, don't fork)

Keep one integration client per vendor (reuse `src/lib/*.ts`). Add a thin, modular **presentation TBR layer** that reuses the existing data builders and renders the attached design. Proposed (subject to your sign-off — see "Next steps"):

```
src/lib/reporting/tbr/                 ← NEW, presentation-style report (no -v2 of anything)
  sections.ts        reportSections registry: id, title, dataSource, render(), state machine
  data-sources.ts    dataSources registry: wraps EXISTING clients; each returns
                       { status: 'success'|'empty'|'error'|'manual', data?, note? }
  theme.ts           design tokens lifted from the attached deck (cyan-on-black)
  template.ts        reportTemplates: HTML generator using theme + section renderers
  types.ts           normalized model covering every field in §1
  index.ts           reportGenerator: select customer + type (TBR|Monthly) + range → HTML
```
- **Per-section states (required):** every section renders one of `loading | success | empty | error/manual-input`. INKY & BullPhish default to **manual-input**; a failed/timed-out source renders **error** without aborting the report.
- **Persistence:** reuse the `BusinessReview` model with a new `reportType` value (e.g. `'tbr'` / `'monthly_summary'`) — **no schema migration needed** (it's a string + JSON payload).
- **Generators/routes:** reuse the existing `business-review`/`annual-report` route patterns (generate / list / view / `/pdf` / `/send`) and the existing customer typeahead + date-range selectors from `CustomerHistoryGenerator`.
- **TBR vs Monthly Summary:** same sections, different selection — Monthly Summary = the at-a-glance subset (slides 05–12 metrics, single month, no narrative slides); TBR = full deck incl. narrative/recommendations (reuse `narrative.ts` + `recommendations.ts`).

## 7. Gaps to build (prioritized)
1. **Presentation HTML template + theme** matching the attached deck (the one genuinely-missing reusable piece). *(largest design effort)*
2. **DNSFilter per-customer org mapping** (correctness/safety — do before customer-facing use).
3. **M365 Graph Reports calls** (6 functions) + prior-period snapshot for deltas.
4. **EDR/SOC "events analyzed"** wiring (or accept reduced funnel).
5. **Datto SaaS extra fields** (TB / last-backup / jobs) — investigate `/saas/{id}/applications`; else manual.
6. **INKY connector** (new) — or manual-input until creds/API confirmed.
7. **BullPhish ID connector** (new) — or manual-input until creds/API confirmed.

## 8. Adding sections / data sources later (Deliverable #3 preview)
- **New section:** add an entry to `reportSections` (`sections.ts`) with `id`, `title`, `dataSourceId`, a `render(data, state)`; add its title to the section-defs; it auto-participates in show/hide and state handling.
- **New data source:** add one client in `src/lib/<vendor>.ts` with an `isConfigured()` guard + `AbortSignal.timeout`, register it in `dataSources` returning the normalized `{status,data,note}` shape, and add the customer mapping (prefer `compliance_platform_mappings`). The section layer is decoupled from the client, so one failing source degrades to `error`/`empty` only for its own card.
- **New design/theme:** themes live in `theme.ts`; a template consumes a theme — additional brands/styles are new theme objects, not forked templates.

---

*This document changes no runtime behavior. It is the feasibility basis for the reusable TBR + Monthly Summary implementation (Deliverables #2/#3), pending direction on scope and on the two missing connectors.*
