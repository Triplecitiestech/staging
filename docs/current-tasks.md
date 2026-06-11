# Current Tasks

> **Last updated**: 2026-06-11. SOC dashboard alert history + search shipped; SOC improvement backlog added.
> **Branch**: `claude/wonderful-lamport-ngzbi5`.
> **Detailed context**: `docs/SESSION_HANDOFF.md`.

## SOC dashboard alert history + search (2026-06-11) — shipped (PR #89)

Security Alerts tab now shows full analyzed history (open pinned first, then resolved), with text search, verdict filter, open/resolved filter, 7–365-day range selector, and Show-more paging. Pure helpers + unit tests in `src/lib/soc/ticket-filter.ts`. `/api/soc/tickets` clamps `days` to 1–365 and trims list-payload descriptions to 300 chars.

## CI e2e gate restoration (2026-06-11) — BLOCKED on operator, then small CI change

The e2e-vs-preview merge gate fails for **every** branch because Vercel Deployment Protection 401-walls all preview routes (see gotchas → CI/CD). Until fixed, merges need `[skip-e2e]` (record each use). Restoration plan:

1. **[OPERATOR] Create the bypass secret**: Vercel dashboard → `staging` project → Settings → Deployment Protection → "Protection Bypass for Automation" → generate secret. (Alternative: disable Deployment Protection entirely, restoring the documented "publicly accessible previews" shortcut — owner's call.)
2. **[OPERATOR] Add GitHub secret**: repo Settings → Secrets and variables → Actions → new secret `VERCEL_AUTOMATION_BYPASS_SECRET`.
3. **[CODE] Wire the header**: `playwright.config.ts` → `use.extraHTTPHeaders` with `x-vercel-protection-bypass` + `x-vercel-set-bypass-cookie: true` when the env var is set; pass the secret through in `auto-merge-claude.yml` + `ci.yml`.
4. **[CODE] Land the gate restructure**: the owner-approved smoke-blocking/full-suite-non-blocking rework already exists as `98b0d69` on `claude/friendly-euler-cn1z6r` (failed its gate only because of the 401 wall). Cherry-pick after 1–3 so deploys gate on a ~5-min smoke run.

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
