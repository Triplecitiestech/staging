# Current Tasks

> **Last updated**: 2026-07-05 (later session). Exchange Online automation for keep_accessible offboardings (code complete; operator enablement pending).
> **Branch**: `claude/mailbox-conversion-delegate-access-k5vmp3`.
> **Detailed context**: `docs/session-summary.md` (2026-07-05 sections) + `docs/gotchas.md` → "HR Onboarding/Offboarding Automation" + `docs/runbooks/EXO_AUTOMATION_ENABLEMENT.md`.

## Exchange Online automation: mailbox conversion + delegation (2026-07-05) — 🟡 code complete, operator enablement required

keep_accessible offboardings now dispatch the conversion + Full Access/Send As grants to an Azure Automation Exchange runner and record ONLY verified outcomes; license removal is deferred behind the conversion in both paths. Nothing executes until the operator completes the enablement runbook — until then every tenant degrades to `[MANUAL]` with the reason attached (today's behavior).

**Validation / follow-ups:**
- [ ] **[CI]** Confirm the auto-merge gate goes green (full e2e vs preview — this touches the shared HR pipeline; no `[skip-e2e]`).
- [ ] **[OPERATOR — Part A, one-time, ~45 min]** Follow `docs/runbooks/EXO_AUTOMATION_ENABLEMENT.md` Part A: run `scripts/exchange-automation/New-TctExchangeAutomationApp.ps1`, create the Automation account + PS 7.4 runtime env + runbook + webhook, set the 4 Vercel env vars (`EXO_AUTOMATION_ENABLED`, `EXO_AUTOMATION_WEBHOOK_URL`, `EXO_DISPATCH_SECRET`, `EXO_CALLBACK_SECRET`), redeploy, then `POST https://www.triplecitiestech.com/api/migrations/run` (creates `exo_tenant_config`, `hr_exchange_jobs`, `hr_request_steps` ensure).
- [ ] **[OPERATOR — Part B, per tenant]** Enable a TEST tenant first with `Enable-TctExchangeTenant.ps1` (consent URL → `Mail Recipients` role group → verification → registration → probe).
- [ ] **[OPERATOR — Part C]** Run the full pilot checklist (incl. the dispatch-failure and timeout drills) before enabling real customer tenants.
- [ ] **[PHASE 2]** Email forwarding (`forward_to_manager`/`forward_to_specific`) via the same runner (`set_forwarding` job type is already modeled); also consider `transfer_to_manager` + `forward_email_to` (live schema pairs them, the pipeline currently ignores that combination).
- [ ] **[LOW]** Admin UI for tenant enablement + job history (registry is secret-authed API only today).

## Offboarding automation: requested-action reconciliation (2026-07-05) — 🟡 code complete, awaiting CI gate

Every action requested on the offboarding form now appears in the ticket's PROVISIONING RESULTS as `[DONE]/[FAILED]/[MANUAL]/[QUEUED]/[NOT RUN]` (see session summary). IT Glue SOPs 16573760 / 14639952 / 20377379 already updated live.

**Validation / follow-ups:**
- [ ] **[CI]** Confirm the auto-merge gate goes green (full e2e vs preview — sandbox had no DB, so e2e could not run locally; build + lint + 183 unit tests green).
- [ ] **[OPERATOR — Michael Beach ticket T20260704.0004]** The pending manual work from the incident is still open: convert `MBeach@danbrownconstruction.com` to a shared mailbox and grant access to `Jking@danbrownconstruction.com` (license was already removed — if conversion is blocked, temporarily re-assign a license, convert, remove again), then close out the NEXT STEPS checklist on the ticket.
- [ ] **[VALIDATION]** Run one test offboarding with `data_handling = keep_accessible` after deploy and confirm the PROVISIONING RESULTS reconciliation + "Still in progress" customer note render as designed.
- [ ] **[MED — product decision]** Wire Thread to `/api/integrations/thread/webhook` (exists, HMAC-authed, generates pre-filled portal form links) OR add an admin UI button for `POST /api/forms/links` so techs can send a form link from a ticket without the API.
- [x] **[DONE 2026-07-05 — later session]** License removal deferral + real Exchange Online integration both shipped (see the Exchange Online automation section above).
- [ ] **[LOW]** Onboarding pipeline could get the same requested-vs-executed reconciliation (its results builder is still accumulation-style, though every branch does log today).

## UniFi per-site MCP connector tools (2026-07-04) — 🟡 code complete, awaiting CI + operator steps

Per-site UniFi surface through the Cloud Connector Proxy: resolver (never guesses), ~18 secret-redacted reads with typed errors, tier-1 attributed actions, tier-2 staged config writes through the existing human-approval gate. 66 unit tests green; single-target rule pinned by test. Detail in `docs/session-summary.md` (2026-07-04) + `docs/unifi-site-tools.md`.

**Validation / follow-ups:**
- [ ] **[CI]** Confirm the auto-merge gate goes green (full e2e vs preview — this change touches the shared staged-writes runtime + admin UI copy, so no `[skip-e2e]`).
- [ ] **[OPERATOR — enables writes]** In Vercel → Project → Settings → Environment Variables (Production), add `CONNECTOR_UNIFI_WRITES_ENABLED` = `true`, then redeploy. Until then all UniFi write tools refuse with a clear message; reads work regardless.
- [ ] **[OPERATOR — firmware remediation list]** From a Claude chat run `unifi_probe_consoles`, or in PowerShell: `$env:UBIQUITI_API_KEY = "<key>"; npx tsx scripts/probe-unifi-consoles.ts -- --out unifi-probe-report.md`. Consoles bucketed `FIRMWARE_UNSUPPORTED` need their Network app updated to >= 10.1.84 in Site Manager; `CONSOLE_OFFLINE` need connectivity fixed.
- [ ] **[VALIDATION]** After enablement: resolve one known site, list its clients, restart one lab device (tier 1), and stage+approve+execute one low-stakes tier-2 change (e.g. a DNS record toggle) end-to-end.
- [ ] **[LOW]** Consider a Site Manager ISP-metrics read tool (separate cloud API — the local Integration API has no health/ISP metrics).

## Site Connectivity reframe + failover detection (2026-06-30) — 🟡 code complete, awaiting CI + operator webhook setup

Reframed the WAN report so it can't report a false "100% / SLA-compliant" at WAN-failover sites, and added Domotz `agent_wan_change` webhook ingestion for real failover detection. 30 unit tests green; scoped typecheck + lint clean. Detail in `docs/session-summary.md` (2026-06-30) + `docs/reference/WAN_RELIABILITY_REPORT.md`.

**Validation / follow-ups:**
- [ ] **[CI]** Confirm the auto-merge gate goes green (`next build` + `test:e2e` vs preview — couldn't run in sandbox: no Prisma engine download, no Domotz creds).
- [ ] **[OPERATOR — enables failover detection]** In Domotz Portal → Webhooks, add a channel to `https://www.triplecitiestech.com/api/webhooks/domotz?token=<token>`, bind an Alert Profile covering WAN/Public-IP-change + collector up/down, and set `DOMOTZ_WEBHOOK_TOKEN` in Vercel. Until then the report says failover detection is unavailable.
- [ ] **[VALIDATION]** Re-run the live Montrose report after webhook setup: confirm the failover caveat shows, SLA is suppressed, and detected failovers appear once events flow in.
- [x] **[DONE 2026-06-30]** Failover **episode** pairing — `pairFailoverEpisodes()` pairs out→back `agent_wan_change` events into episodes with an **estimated primary-circuit downtime** + longest-episode figure (the 17-min Montrose drop now shows as a 17m episode). Estimate caveats are stated in-report; true per-uplink data still needs the Meraki API (not available).
- [ ] **[LOW]** Add a Playwright e2e once a preview-reachable Domotz fixture exists; PDF export (print-to-PDF for now).

## TBR / Customer History export (2026-06-16) — ✅ shipped & in production (PRs #92–#95)

Live multi-year Autotask ticket export for Technology Business Reviews: `GET /api/reports/tbr-export` + admin page `/admin/reporting/customer-history` (Reporting dashboard → "Customer History (TBR)"). Counts split **Human support vs Proactive monitoring** by queue. Accuracy verified against a raw Autotask CSV export. Full detail in `docs/session-summary.md`.

**Follow-ups (not started):**
- [ ] **[MED — offered to owner, awaiting answer]** Break the monitoring bucket into **Security / Network / Other** sub-types so the security-coverage number stands alone on the TBR.
- [ ] **[MED]** Split CLOSED tickets by human/monitoring too (currently only "created" is split; closed is a single total).
- [ ] **[LOW]** Annualize the current partial year (run-rate) so a half-year isn't visually compared to full years.
- [ ] **[LOW]** Reuse the live Autotask pull in the Annual Report / Business Review engines (they still read the 30-day DB cache → can't do multi-year). Step toward consolidating the scattered reporting (owner flagged).
- [ ] **[LOW]** `hours=true` can be slow for high-volume companies (batched per-ticket TimeEntries under a deadline) — consider a company-scoped TimeEntries date-range query.
- [ ] **[INFRA]** Fix the `triple-cities-tech` MCP server: `api_call` can't auth to gated endpoints (its `MIGRATION_SECRET` ≠ prod), and `db_query`/`ticket_check`/`company_lookup` fail with "ENOTFOUND base". Until fixed, a Claude session cannot pull/verify prod data directly.

### Next Session Starting Point

- **Current objective**: TBR/Customer History export is shipped, in production, and verified accurate. Owner was reviewing the human-vs-monitoring split for Tri-Bros. No open blocker.
- **Recommended next tasks**: (1) await/act on owner feedback on the split; (2) if wanted, add the Security/Network/Other monitoring sub-split (small change in `aggregateTickets` + the report HTML in `route.ts`, classify off `queueLabel`); (3) optionally annualize the partial year.
- **Most relevant files**: `src/app/api/reports/tbr-export/route.ts` (endpoint, `aggregateTickets`, HTML renderer, `isMonitoringQueue`), `src/components/reporting/CustomerHistoryGenerator.tsx` (UI), `src/lib/autotask.ts` (`getCompanyTicketsCreatedSince` / `collectCompanyTickets` / `queryOnePage` / `getTimeEntriesByTicketIds`), `src/components/reporting/ReportingDashboard.tsx` (nav link), `docs/reference/TBR_DATA_CAPABILITIES.md` (reference).
- **Open questions**: Sub-split monitoring into Security/Network/Other? Should the Annual Report/Business Review engines switch to the live pull (de-scatter reporting)?
- **Validation still needed**: confirm `/admin/reporting/customer-history` renders the human/monitoring split correctly post-deploy (owner re-running); the post-merge e2e runs of #94/#95 were expedited past — confirm they went green.
- **Access constraints for the next session**: NO Autotask/Datto creds in the dev sandbox; the `triple-cities-tech` MCP `api_call` 401s on gated routes and its DB tools are broken — so you cannot pull prod data yourself. The owner runs the report (`/admin/reporting/customer-history`) or provides CSV exports. Use those for any data verification.

## SOC dashboard alert history + search (2026-06-11) — shipped (PR #89)

Security Alerts tab now shows full analyzed history (open pinned first, then resolved), with text search, verdict filter, open/resolved filter, 7–365-day range selector, and Show-more paging. Pure helpers + unit tests in `src/lib/soc/ticket-filter.ts`. `/api/soc/tickets` clamps `days` to 1–365 and trims list-payload descriptions to 300 chars.

## CI e2e gate restoration — ✅ DONE 2026-06-12 (first green gate: run 1072)

Steps 1–3 of the original plan executed (bypass secret + `E2E_TEST_SECRET` in GitHub, header wired in `playwright.config.ts` + workflow). Suite failures from the first real runs were triaged and fixed (see session-summary 2026-06-12 + gotchas → Testing & CI). Full suite (~15 min) now blocks merges and runs 859 specs including authenticated flows. `[skip-e2e]` is for genuine pipeline emergencies only again.

Remaining optional follow-up: **step 4, the smoke-gate restructure** (`98b0d69` on `claude/friendly-euler-cn1z6r`, owner-approved) would cut the blocking gate from ~15 min to ~5 min with the full suite non-blocking. Re-evaluate whether it's still wanted now that the full suite passes reliably; also consider moving the reporting forbidden-colors scan into the authenticated project so it checks real page content.

## SOC improvement backlog (2026-06-11 analysis) — prioritized, not started

From a full review of `src/lib/soc/` + `/api/soc/*` + cron wiring. Discuss before building; items 1–3 are the high-value ones.

- [ ] **[HIGH] Escalation notifications**: nothing pages a human — a `confirmed_malicious` verdict only writes an Autotask note + dashboard row. Wire Resend email (and/or SMS) for `escalate`/`confirmed_threat` verdicts, reusing the health-monitor email pattern. An overnight real threat currently waits for someone to open the dashboard.
- [ ] **[HIGH] Suppression rules don't suppress**: `matchRules()` results only feed prompt context and the escalate path in `classificationToAction()` (`src/lib/soc/engine.ts`). Rules with action `suppress`/`auto_close_recommend` never short-circuit the pipeline, so every known-noise alert still costs 2 AI calls (Haiku screen + Sonnet 8k assessment). Honor suppress rules before the AI steps (still log + store a rule-based verdict).
- [ ] **[HIGH] Cron timeout budget**: `/api/cron/soc-triage` has `maxDuration = 60` but processes up to 50 tickets × (enrichment fetches + 2 AI calls ≈ 20–40s each). Fine when ingest keeps the queue near-zero; a backlog (agent paused, alert flood) would hard-timeout hourly and drain over days. Raise to 300 like `/api/soc/run`, or self-chain batches like the reporting sync.
- [ ] **[MED] Verdict feedback loop**: pending-action approve/reject decisions are stored but never analyzed; no "AI was wrong" signal feeds rules/Known Benign/trends. Track human-vs-AI disposition agreement as a precision metric on the dashboard.
- [ ] **[MED] Dead config keys**: `confidence_auto_close` + `confidence_flag_review` are loaded and shown in Config UI but never read by the engine — remove from UI or implement.
- [ ] **[MED] Verdict vocabulary drift**: `classificationToVerdict()` only emits `confirmed_threat`/`suspicious`/`false_positive`; `expected_activity` + `informational` exist only on legacy rows (and in stats counters/UI filters). Either map a classification to them or retire them once legacy rows age out.
- [ ] **[LOW] Known Benign admin UI** (carried from cross-stack handoff) — catalogue is migration-seeded only.
- [ ] **[LOW] SocConfigPanel reads config via `/api/soc/status`** instead of `GET /api/soc/config`; works (status embeds config) but is indirect. `SocIncidentsList` has a `typeFilter` state that is never sent to the API.
- [ ] **[LOW] `internal_site_ids` default `["177027"]`** is hardcoded in `loadSocConfig` — fine while seeded, but document it as instance-specific.
- [ ] **[LOW] Server-side alert search**: current dashboard search is client-side over the fetched range (≤365d of security tickets, trimmed payload — fine at today's volume). If ticket volume grows ~10×, move search/pagination into `/api/soc/tickets` (indexes on `soc_ticket_analysis` already support it).

## Autotask client hardening (2026-06-09) — done, pending gate/merge

`queryAll` includeFields (ticket queries now field-limited), resilience.ts retry wired into GET/query/PATCH (POST not retried — duplicates), pagination throws instead of silently truncating. Unit tests added. See session-summary for detail.

**Follow-ups (not started, from the AutotaskMCP comparison):**
- [ ] `createTicket()` support (SOC remediation tickets / portal ticket creation) — business decision.
- [ ] Ticket-level time entries with `roleID`/`billingCodeID`/`contractID` (current `createTimeEntry` is task-only, no billing fields).
- [ ] Picklist metadata cache TTL (currently re-fetched every sync run).
- [ ] Optional: internal MCP-style tool layer over `autotask.ts` for AI agents (must inherit scoping/permissions/audit).

## Documents Hub (2026-05-30) — shipped, live in production

Branded internal Documents feature at `/admin/documents`: the Secure Boot 2023 playbook (`secure-boot-playbook`) **and** a full **Marketing Content** subsystem with an in-app editor. Shared client islands (CopyButton / Countdown / PhaseNav), AdminHeader link, e2e smoke coverage. Auth-gated; TECHNICIAN can view. Branch `claude/fervent-pasteur-TLwSp` (auto-merged to `main`).

**Marketing Content editor (shipped):** self-service mini-CMS — list / new / edit / render under `/admin/documents/marketing-content`, backed by the self-healing raw-pg `branded_documents` table (`src/lib/documents/store.ts`, no migration). Markdown body + hero/meta/CTA, live branded preview (shared `BrandedDoc`), draft/published. API `/api/admin/documents` (+ `/[slug]`), session-gated + CSRF. **Public sharing:** published pieces render at `/content/[slug]` (drafts → 404) with site Header/Footer + SEO/OG; "Copy public link" in the editor and admin render. Verified end-to-end against a real Postgres (store CRUD, authed API, public published-vs-draft gating, render).

**Possible follow-ups (not started):**
- [ ] Other doc types: Quarterly Business Review, Social dump (same editor/render pattern as Marketing).
- [ ] Tighten permissions: marketing doc create/edit/delete is currently any authenticated staff — could restrict to ADMIN/SUPER_ADMIN.
- [ ] Broader forbidden-orange sweep: the services gradients + ticket priority badge are fixed, but `#f97316`-family orange still appears in reporting **charts** (`PriorityBreakdownChart`, `HealthDistribution`, `MonitoringDashboardClient`) and in customer **email/PDF** templates. Decide which are in-scope for the dark-site no-orange rule vs. light-background documents (the e2e check only covers rendered page HTML).

## SOC Cross-Stack Redesign (2026-05-28) — see `docs/SOC_CROSSSTACK_HANDOFF.md`

Shipped: RocketCyber client, cross-stack enrichment (RMM/EDR/DNSFilter/SaaS), shared `CrossStackAssessment` UI, real-time `/api/soc/ingest` webhook (Autotask Extension Callout wired by operator), `soc_known_benign` table. Open:
- [x] **[HIGH]** Datto EDR `/Alerts` fields are under `data` — `fetchEdr` now flattens each alert via `flattenEdrAlert()` (promotes `data.*` up, keeps top-level identity, preserves raw `data`). Surfaces threatName/path/md5/commandLine/parentProcessName/owner/ruleName/mitreId through the type, AI prompt, and UI. "[Unknown]" issue resolved.
- [x] **[HIGH]** SaaS Alerts `/reports/events/query` 422 — the gateway validates `{ body: <ES search> }`; `SaasAlertsClient.getEvents` now wraps the search under a top-level `body` key. Confirmed live on NYSWDA T20260527.0006: source flipped from `error (422)` to `no_data`.
- [ ] **[MED]** Operator: map tools per customer in Compliance → Connect Tools (esp. Datto EDR org, SaaS Alerts customer).
- [ ] **[MED]** Confirm Autotask Extension Callout sends a usable ticket id/number (check first callout's `receivedKeys`).
- [ ] **[LOW]** Known Benign admin UI; confirm Vercel env (`ROCKETCYBER_API_TOKEN`, `SOC_INGEST_SECRET`) + `dry_run=false`.

## CFO Dashboard (2026-05-29) — shipped, live in production

Full financial dashboard at `/admin/cfo`. See `CLAUDE.md` → "CFO Dashboard" section and `docs/CFO_HANDOFF.md` for everything. QuickBooks is connected (production). Done: access gate, Sequence analytics, QB OAuth (encrypted), settings, demo mode, print-PDF, AR→debt simulator, hiring calculator, rate-gate + delta sync, financial-summary KPIs.

**Next focus — Spending insight / anomaly detection (NOT started):**
- [ ] Get vendor-level spend visibility. Most spend is on **Amex (Platinum/Gold)** and only shows in Sequence as one lump "AMEX EPAYMENT" — the real detail is on the Amex statement / QuickBooks.
- [ ] Investigate options: **(a)** Amex API / Plaid / card-feed API into the card transactions; **(b)** parse/scan uploaded statements (PDF/CSV) from SharePoint; **(c)** pull vendor/category expense detail from **QuickBooks** (live now — likely the best near-term source; QB P&L detail by account = the "Expenses by Vendor" report Rio sends).
- [ ] Do the same for other spending pod accounts.
- [ ] Goal: per-vendor/per-category spend over time → anomaly detection + better spending habits.
- [ ] Possible UI: per-month outflow drill-down (click a chart month → top destinations that made it up) — offered but not built.

## Open — Resume here (compliance workflow stream)

The operator's last instruction was **"do them all"** for these three slices. The previous session ran out of context partway through Slice A and paused.

### [ ] Slice A — SharePoint import: fetch + extract actual document content
Today bulk-imported policies are stored with content `[SHAREPOINT:<url>]` (placeholder). The AI analyzer runs against ~50 bytes and returns shallow garbage.

- Add deps: `mammoth` (.docx) + `pdf-parse` (.pdf)
- New `src/lib/compliance/policy-generation/sharepoint-fetch.ts` — Graph download + per-extension text extraction
- Update `importSelectedFiles` in `PolicyManager.tsx` AND/OR `/api/compliance/policies` POST to extract before storing
- Watch `maxDuration` if extraction is slow per file

### [ ] Slice B — Intune compliance policy executor
Operator hit control CIS 2.3 ("Address Unauthorized Software") — needs an Intune compliance policy (technical). Today's allowlist correctly suppresses the wrong (documentation) Remediate option, but there's no right option to offer yet.

- New `src/lib/compliance/actions/executors/intune-compliance.ts`
- Pattern: mirror existing `intune-defender.ts` (same Graph auth, idempotency marker, `allDevicesAssignmentTarget`)
- Different Graph endpoint: `/v1.0/deviceManagement/deviceCompliancePolicies` (compliance, not configuration)
- Sane Windows 10 baseline: Defender running + real-time on + no active threats; consider BitLocker / secure boot / OS min
- Catalog action `intune.create_compliance_policy.windows_baseline` with satisfiesControls for cis-v8 1.2, 2.3, 2.5, 4.1
- Live previewer using `countEnrolledWindowsDevices` (already exists in intune-defender.ts)
- Permissions: `DeviceManagementConfiguration.ReadWrite.All`

### [ ] Slice C — doc-primary-controls.ts curation for non-CIS frameworks
Today only CIS v8 is curated. HIPAA / NIST 800-171 / CMMC / PCI fail-open → `policy.generate_for_control` Remediate always shows for them, same conflation bug just not caught yet.

- Read each framework's mappings in `framework-mappings.ts`
- Per (framework, controlId): is documentation the primary fix?
- HIPAA: most are doc-primary. NIST/CMMC/PCI: more technical-heavy.
- Add cleared frameworks to `CURATED_FRAMEWORKS` set in `doc-primary-controls.ts`

## Just-shipped (this multi-session push)

### Compliance workflow build (8 of 8 steps live)
- [x] Customer picker landing (deleted ComplianceDashboard + PolicyGenerationDashboard)
- [x] Step 1 Onboard
- [x] Step 2 Customer Profile (question-engine-driven)
- [x] Step 3 Connect Tools (Tool Inventory toggle + Live Data Feeds + Platform Mappings embedded)
- [x] Step 4 Policies (PolicyManager embedded — scan/single-add/library/publish/approval)
- [x] Step 5 Run Assessment
- [x] Step 6 Findings (Remediate button + drillable counter cards + disposition collapsed-by-default)
- [x] Step 7 Changes log
- [x] Step 8 Reassess
- [x] Microsoft Secure Score recommendation breakdown page

### Real Graph executors (8 of 8 catalog actions are real, not stubbed)
- [x] CA policies: MFA-all apply/remove
- [x] CA policies: Block Legacy Auth apply/remove
- [x] Password protection enable/disable
- [x] Intune Defender realtime configuration profile apply/remove
- [x] Policy generation for control (Claude API)
- [x] Policy publish to SharePoint (.docx upload via Graph)

### Customer-portal approval loop (closed)
- [x] `compliance_policy_approvals` table + HMAC-signed magic link token
- [x] Operator-side: Request approval button on every analyzed policy row
- [x] Customer-side: token-gated review page with approve/reject + notes
- [x] Server-side publish gate consults the approval table as authoritative
- [x] Per-policy status badge + pending-approvals panel on workflow landing + per-customer count on picker

### Iterated operator-feedback fixes
- [x] Connector toggle UI on /connect; intentional-off now reports as `not_applicable` not `collection_failed`
- [x] /admin/compliance dashboard → thin picker (operator: "this seems redundant")
- [x] Workflow nav highlights the page you're VIEWING, not the next-to-do step
- [x] SharePoint scan parser handles all four URL shapes (direct, viewer ?id=, share /r/, custom lib)
- [x] SharePoint scan recurses subfolders + empty-state card on 0 results
- [x] Findings counter cards drill-filter the list
- [x] Remediate previews are specific (CA executors query Graph for user/device counts)
- [x] Remediate picker labels distinguish "documentation only" vs "pushes to tenant"
- [x] `policy.generate_for_control` Remediate suppressed for non-doc-primary controls (CIS v8 curated)
- [x] Policies add-form: scan-multi-site vs add-single split, dropped always-on permission note
- [x] SharePoint import surfaces progress + result card (no more silent close)
- [x] Customer profile gains `sop_storage_locations` question; evaluators honor it for SOP messaging
- [x] .docx download button as universal manual-upload destination

## Deferred (not pulled into scope unless asked)

- [ ] IT Glue / My Glue direct publish API
- [ ] End-customer-facing compliance landing page (today only the magic-link review)
- [ ] Per-tenant credential encryption (W5)
- [ ] Drop legacy `policy_org_profiles` + `compliance_customer_context` tables (W16 — operator-gated)
