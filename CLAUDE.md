# Triple Cities Tech — CLAUDE.md
*Last updated: 2026-07-20 · Owner: Kurtis (kurtis@triplecitiestech.com)*

> **The operating manual for every AI session in this repo.** Read this file first, then the bootstrap docs below. This file holds the rules you must never break plus an index to everything else; deep detail lives in `/docs`. If a section here grows, push the detail into `/docs` and link it — keep this file lean so nothing gets skimmed. When you touch this file, bump the date above.

---

## A · What this repo is

Production codebase for Triple Cities Tech, an MSP (managed IT services provider). One Next.js 15 app on Vercel serving: the public marketing site, the staff admin portal (projects, tickets, reporting, SOC, marketing, CFO), the customer portal, and AI agents (blog generation, SOC triage, report assistant). Integrates Autotask PSA, Microsoft 365/Graph, Datto RMM/EDR, RocketCyber, DNSFilter, SaaS Alerts, QuickBooks, and Sequence. **Stage: shipped — live production at https://www.triplecitiestech.com with active daily development.**

## B · The Goal

- **Why it exists:** one platform for TCT's entire MSP operation — replaces scattered vendor portals with a single pane for staff and a self-service portal for customers.
- **Done looks like:** every subsystem works end-to-end in production, on desktop AND mobile, with self-healing pipelines and no manual babysitting.
- **Out of scope:** features that duplicate an existing subsystem (extend, don't rebuild), and removing the Temporary Development Shortcuts (see `docs/gotchas.md`) without explicit owner approval.

## Session Bootstrap — read in order

1. `docs/architecture.md` — system architecture, data flows, integration diagrams
2. `docs/system-map.md` — codebase map: which files own which subsystem
3. `docs/data-model.md` — database schema, entity relationships
4. `docs/session-summary.md` — current state, recent changes, key decisions
5. `docs/current-tasks.md` — active development work
6. `docs/gotchas.md` — **the full gotcha list + subsystem field notes (Autotask, M365, SOC, SaaS Alerts, portal, CFO). Mandatory — the digest below is not a substitute.**

Implementation/testing rules: `docs/coding-standards.md`, `docs/qa-standards.md`, `docs/UI_STANDARDS.md`.
Docs under `/docs/plans/`, `/docs/reference/`, `/docs/archive/` are supporting material — they do NOT override architecture decisions unless explicitly referenced.

---

## Core Rules

1. **Be autonomous.** Diagnose and fix errors yourself (build failures, lint, broken imports). Escalate only for things you genuinely cannot obtain: credentials, business decisions, ambiguous product requirements.
2. **Every change is tested before deploy.** `npm run build`, `npm run lint`, and `npm run test:e2e` must all pass. Review your own `git diff`. Check UI at mobile (`sm`/`md`) AND desktop (`lg`+) breakpoints. Completion means it works end-to-end, not that it compiles. Full QA process: `docs/coding-standards.md` + `docs/qa-standards.md`.
3. **Every completed task is committed and pushed.** Commit per logical unit; push immediately with `git push -u origin <branch>`; retry on network failure with backoff (2s, 4s, 8s, 16s). Vercel auto-deploys every branch (preview) and `main` (production).
4. **After deployment, verify the live result** — or tell the user exactly what to verify and on which URL, calling out mobile-affecting changes.
5. **When something breaks, fix it — don't report it and stop.** Loop until done or genuinely blocked on user input.
6. **Keep the memory layer up to date.** New lessons go to `docs/gotchas.md`; add a one-liner to the Critical Gotchas digest below only if missing it would break production. Bump this file's date on every edit.
7. **Hand-offs to the user must be explicit and assume nothing.** State WHAT to do, in WHAT ORDER, in WHICH SYSTEM — numbered steps, exact URLs, page/button/field names, example payloads. Vague hand-offs are not acceptable.

## Reuse Before You Build

- **Search the repo first** — 100+ API routes, 20+ reporting modules, 30+ component dirs; the feature may already exist. Extend or refactor existing modules; replacement requires explicit user approval.
- **No parallel implementations** — exactly one Autotask client, one Prisma client, one permission system, one ticket adapter. Never create `*-v2`, `*-new`, `*-alt`, or sibling utility files.
- **Prefer modifying existing files.** Create a new file only when separation is architecturally justified — and say why.
- **Before coding a non-trivial change**: read the relevant source-of-truth modules, explain how the work fits the existing architecture, and confirm whether the feature already exists in part.

## Source of Truth Modules

| Subsystem | Authoritative Module | Notes |
|-----------|---------------------|-------|
| Autotask API client | `src/lib/autotask.ts` | All Autotask REST calls |
| Prisma / Database | `src/lib/prisma.ts` | Singleton PrismaClient with PrismaPg adapter |
| Raw pg pool | `src/lib/db-pool.ts` | `getPool()` — HR/M365/reporting raw-SQL routes |
| Security utilities | `src/lib/security.ts` | `checkRateLimit()`, `checkCsrf()`, input sanitization |
| Resilience utilities | `src/lib/resilience.ts` | `withRetry()`, `withTimeout()`, `withCircuitBreaker()`, `withDbRetry()`, `classifyError()`, `structuredLog` — no ad-hoc retry loops |
| Cron job wrapper | `src/lib/cron-wrapper.ts` | Standardized cron execution: auth, retry, timeout |
| Staff permissions | `src/lib/permissions.ts` | SUPER_ADMIN, ADMIN, BILLING_ADMIN, TECHNICIAN |
| Unified ticket system | `src/lib/tickets/` | Adapters/types consumed by all ticket views |
| SOC engine | `src/lib/soc/` | Engine, correlation, rules, prompts, enrichment |
| Reporting engine | `src/lib/reporting/` | 20+ modules: sync, aggregation, analytics, SLA |
| Autotask contact sync | `src/lib/autotask-contact-sync.ts` | `syncAutotaskContacts({ companyId? })` — single source for the AT→DB contact pull |
| Blog generation | `src/lib/blog-generator.ts` | AI content generation via Claude API |
| Demo mode | `src/lib/demo-mode.ts` | Contoso Industries demo data, in-memory only |
| Error logging | `src/lib/error-logger.ts` | Centralized logging to ErrorLog model |
| API usage tracking | `src/lib/api-usage-tracker.ts` | AI/email/API usage → ApiUsageLog |
| Customer portal data / auth | `src/lib/onboarding-data.ts` / `src/lib/onboarding-session.ts` | Portal loading + sessions |
| M365 / Graph credentials | `src/lib/graph.ts` | `getTenantCredentials*()` — ONLY place that knows legacy vs multi-tenant mode |
| API route auth (secrets) | `src/lib/api-auth.ts` | `checkSecretAuth()` — header + query param auth |
| API response envelope | `src/lib/api-response.ts` | `apiSuccess()`, `apiError()` |
| Env validation | `src/lib/env-validation.ts` | Startup validation of env vars |
| SaaS Alerts client | `src/lib/saas-alerts.ts` | External Partner API only (portal API is Cloudflare-blocked) |
| CFO dashboard | `src/lib/cfo/` | Sequence + QuickBooks; `store.ts` is raw-pg `cfo_settings`, NOT Prisma |
| Sales calculator | `src/lib/sales-calculator/` + `src/config/sales-calculator/` | Internal quoting tool at `/admin/sales-calculator`. Money = `pricing.json` defaults + DB overrides (`sales_calc_pricing_overrides`, edited at `/admin/sales-calculator/pricing`) — never edit the calc code for pricing. Saved quotes = raw-pg `sales_calc_saved_quotes` (inputs only; reprices on load) |

**Rule**: need that functionality? Import and extend the existing module. Never create a duplicate client or service layer.

## C · Stack & Commands

Next.js 15 (App Router) · React 18 · TypeScript strict · Tailwind CSS 3.4 · PostgreSQL (Vercel Postgres) + Prisma ORM 7.2 · NextAuth.js 5 (Azure AD OAuth) · Resend · Anthropic Claude API · Autotask PSA REST · Cloudflare Turnstile · Recharts · Vercel (region `iad1`).

```bash
npm run dev             # Dev server
npm run build           # Prisma migrate deploy + next build (MUST PASS)
npm run lint            # ESLint (MUST PASS)
npm run test:e2e        # Playwright e2e — covers ALL systems, run before every push
npm run test:e2e:ui     # Playwright interactive UI
npm run debug:failures  # Review e2e failure summaries
npm run seed            # Seed database
# Remote e2e vs deployed preview: BROWSERBASE_API_KEY=… BROWSERBASE_PROJECT_ID=… PLAYWRIGHT_BASE_URL=https://preview.vercel.app npm run test:e2e
```

**Layout**: `src/app/` (pages + 100+ API routes: `(marketing)`, `admin/`, `api/`, `blog/`, `onboarding/`), `src/components/` (per-feature dirs + `ui/`), `src/lib/` (subsystem modules — table above), `prisma/schema.prisma` (1300+ lines, 35+ models), `tests/e2e/` (30+ Playwright specs). Full map: `docs/system-map.md`.

**Key features** (one-liners; details in `docs/architecture.md` + `docs/gotchas.md`): AI blog pipeline (generate → approve → scheduled publish via crons) · Project management (Company → Project → Phase → PhaseTask) · Autotask PSA sync · SOC Analyst Agent (`/admin/soc`, cross-stack AI triage) · Reporting & analytics (`/admin/reporting`, self-healing pipeline) · Unified ticket system · Marketing campaigns (`/admin/marketing`) · Customer portal (`/onboarding/[companyName]`) · CFO dashboard (`/admin/cfo`) · Platform monitoring · Demo mode.

## Code Conventions

- **TypeScript**: strict, no `any`. Interfaces for all props/params. `.ts` utils, `.tsx` components.
- **React/Next**: server components by default; `'use client'` only when needed. PascalCase components, camelCase utilities. Path alias `@/*` → `./src/*`.
- **Styling**: Tailwind, mobile-first (`base` → `md:` → `lg:`). Standard grids: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`. Every layout change checked at all breakpoints.
- **FORBIDDEN COLORS**: never `yellow-*`, `amber-*`, `brown-*`, gold/mustard — and avoid `orange-*` (renders amber on our dark backgrounds). Use `violet`, `rose`, `red`, `cyan`, `blue`, `green`, `emerald`. Applies to backgrounds, text, borders, gradients. See `docs/UI_STANDARDS.md`.
- **API routes**: try/catch with `NextResponse.json`; validate input; structured responses; catch blocks return 4xx/5xx with `{ error }` — never 200 with empty data.

## Database — non-negotiables

- **`prisma migrate deploy` does NOT actually run on this DB.** Production has no `_prisma_migrations` table; every column was created by raw `ALTER TABLE IF NOT EXISTS` in `src/app/api/migrations/run/route.ts`. **New schema field = schema.prisma change + ALTER TABLE in that route + POST `/api/migrations/run` after deploy.** A migration file alone is a no-op. Full detail: `docs/gotchas.md`.
- **Never run `prisma migrate` directly on production** — use the API migration endpoints.
- **Raw-pg (NOT Prisma) tables**: reporting (`report_*`), SOC (`soc_*`), CFO (`cfo_settings`). HR and M365 routes also use raw pg via `getPool()` — do not convert them to Prisma.
- **Both pool files (`prisma.ts`, `db-pool.ts`) MUST keep SSL config and `globalThis` caching** — removing either breaks all of production.
- No hard deletes (status fields / `deletedAt`). Raw SQL uses quoted camelCase columns (`"companyId"`) except HR/M365 snake_case `@map()` columns. JSONB inserts need `$1::jsonb`.
- **Expand-contract**: schema changes shipped with code must be additive (ADD COLUMN / CREATE TABLE); never DROP or RENAME in the same deploy as the code change. The migration must be applied **before** the code that needs it goes live.
- **Planned fix**: `docs/runbooks/MIGRATIONS_RETROFIT.md` (operator-run) baselines `_prisma_migrations` so `prisma migrate deploy` works and the manual POST step disappears. Until executed, the raw-SQL route remains the source of truth.

## Ship Cycle & Git

```
Plan → Implement → Verify (build + lint + e2e) → Review (git diff) → Commit → Push → Confirm to user
```
- Branches: `claude/[description]-[sessionId]`. **Never push to `main`.** Auto-merge to main is **gated**: every push to a `claude/**` branch must pass secret-scan + lint + schema-drift + build + unit tests before `.github/workflows/auto-merge-claude.yml` merges it. A failed gate = no merge = no production deploy. The full e2e suite still runs against the Vercel preview but is **non-blocking** (owner decision 2026-07-10, to cut ~30-40 min of merge latency): a red `e2e-preview` job on a merged commit means production is already live with something the suite flagged — investigate immediately, never ignore it.
- `[skip-e2e]` in a commit message skips the (now informational) e2e run — e.g. Vercel integration down, no preview will appear; record any use in `docs/session-summary.md`.
- Commit style: imperative summary, optional bullets. Commit + push after every logical unit — don't batch.
- If verify fails, go back to implement. Never commit a broken build. Local verify still matters: the gates catch what you miss, but a red gate is a wasted deploy iteration.
- Use subagents for broad codebase searches, parallel independent tasks, and keeping context clean during large refactors.

## D · Decisions

*One line each: date · what · why. Long-form reasoning lives in `docs/session-summary.md` and `docs/archive/`.*

- `2026-03-20` — Removed customer portal password gate; the shared URL is the access control.
- `2026-03-22` — Deleted legacy HrRequestWizard; schema-driven FormRenderer is the only portal form engine.
- `2026-03-27` — Health-monitor job names standardized to underscores after a hyphen mismatch caused false alerts every 15 min.
- `2026-04-26` — Confirmed Prisma's migration runner has never applied to prod; declared `/api/migrations/run` the migration source of truth until `_prisma_migrations` is retrofitted.
- HR routes moved to raw pg (`getPool()`) because Prisma caused production 500s.
- New M365 onboardings default to `multi_tenant` admin-consent mode; legacy per-tenant app regs remain supported (`m365_consent_mode`).
- TECHNICIAN role granted `invite_customers` + `manage_customer_roles` (session 8) so techs can run the onboarding wizard.
- SOC made cross-stack (RocketCyber + Datto RMM/EDR + DNSFilter + SaaS Alerts) with hard per-customer scoping after a cross-tenant data leak.
- SaaS Alerts server calls moved to the External Partner API; the portal API is Cloudflare-blocked for server-to-server.
- `2026-06-09` — Restructured CLAUDE.md to the operating-manual format; full gotcha list moved to `docs/gotchas.md` (mandatory bootstrap read #6).
- `2026-06-09` — Gated the auto-merge: claude/** pushes now require secret-scan + lint + schema-drift + build + unit tests + e2e-vs-preview before merging to main. Schema-drift check wired into Vercel builds. `_prisma_migrations` retrofit planned (`docs/runbooks/MIGRATIONS_RETROFIT.md`).
- `2026-06-16` — Added a live, multi-year **TBR / Customer History export**: `GET /api/reports/tbr-export` (read-only; auth = staff session OR `MIGRATION_SECRET`) pulls a company's full ticket history straight from Autotask — bypassing the reporting sync's ~30-day DB cache — plus Datto RMM, with a `/admin/reporting/customer-history` admin UI (live Autotask customer typeahead). Ticket counts are split **human-support vs proactive-monitoring** by queue. Full reference: `docs/reference/TBR_DATA_CAPABILITIES.md`.
- `2026-06-16` — Autotask `nextPageUrl` GET 405s on `includeFields` queries and filters `createDate` at day granularity; large pulls now paginate by recursively splitting the createDate window (`queryOnePage`) and de-dupe by ticket id. Lesson: raw Autotask "ticket" counts include automated monitoring/alert queues — split human vs monitoring for customer-facing reports. See `docs/gotchas.md` → Autotask.
- `2026-06-26` — SOC assessment hardened with a deterministic guardrail layer over the LLM verdict (`applyGuardrails` in `src/lib/soc/engine.ts`): historical recurrence reduces novelty only (never raises benign confidence or lowers risk; it's the agent's own prior closes, not corroboration), IP reputation / geolocation / timing / corroboration are evaluated as separate axes, confidence is capped when uncorroborated (`confidence_uncorroborated_cap`), and IAM/MFA changes default to "confirm with the user before closing". Full detail: `docs/gotchas.md` → SOC.
- `2026-06-27` — SOC identity/MFA alerts now confirm against the customer's OWN M365 tenant (`src/lib/soc/m365-identity.ts`, reusing `getTenantCredentials` + `graphRequest`): Entra audit log + sign-ins + remaining auth methods; a tenant-confirmed benign re-enrollment lifts the confidence cap and counts as positive benign evidence. Also fixed SaaS Alerts correlation to match `customerId` OR `organizationId` (the bare `customerId` term returned 0 events for SaaS-sourced tickets). Autotask auto-posting unchanged. Full detail: `docs/gotchas.md` → SOC.
- `2026-06-29` — Added a reusable **WAN Reliability (ISP/SLA) report** by extending the existing Domotz client (`src/lib/domotz.ts` — added paginated `getAllAgents`, agent/device detail, and uptime/event/RTD/speed history; no new client). New module `src/lib/reporting/wan-reliability/` (pure analyzer + service + JSON/Markdown/text/HTML formatters), `GET /api/reports/wan-reliability` (staff session OR `MIGRATION_SECRET`) + `…/sites` picker, and `/admin/reporting/wan-reliability` UI. Outage timeline from Domotz `downtime_intervals` (collector connectivity = truest WAN signal; device reachability when a device is chosen). Domotz history endpoints default to a 1-week window, so 90-day pulls are time-chunked. Full detail: `docs/reference/WAN_RELIABILITY_REPORT.md` + `docs/gotchas.md` → Domotz.
- `2026-06-30` — **Reframed that report to "Site Connectivity & Stability"** after a false-negative was confirmed: at a WAN-failover site (Meraki MX + Starlink/LTE) the firewall fails over so Domotz reachability shows 100% even when the primary circuit dropped (Montrose: 10 primary drops incl 17-min, reported 100%). We have no Meraki API, so the report now headlines collector connectivity (whole-site dark) — NOT ISP uptime — shows an SLA verdict ONLY for admin-confirmed single-WAN sites, and otherwise shows a prominent failover-masking caveat (never "SLA-compliant"/"no escalation" from reachability). Added **Phase 2 failover detection**: ingest webhook-only `agent_wan_change` events via `POST /api/webhooks/domotz` (token `DOMOTZ_WEBHOOK_TOKEN`) into the shared `compliance_webhook_events` sink (`source='domotz'`), surfaced as a first-class "N failover events" metric. Failover-capability is auto-detected from gateway model + a per-site override (raw-pg `domotz_site_settings`). Also: data-coverage measured empirically (no 100%-over-no-data), cadence-artifact flagging, and failover events paired into **episodes** (`pairFailoverEpisodes`) for an *estimated* primary-circuit downtime. Full detail: `docs/reference/WAN_RELIABILITY_REPORT.md` + `docs/gotchas.md` → Domotz.

- `2026-07-03` — MCP connector gained **Autotask config visibility** (11 live read tools + `autotask_config_query`/`autotask_entity_capabilities`) and a **structurally gated config-write tier**: stage (never writes) → human approval at `/admin/connector/staged-writes` (staff auth the MCP token can't reach) → drift-checked single-use execute; kill switch `CONNECTOR_CONFIG_WRITES_ENABLED`. Verified REST boundaries recorded in `docs/gotchas.md` → Autotask: no workflow rules / notification templates / widgets / SLA definitions / status→SLA-event mapping in the API — the status mapping is served from an owner-maintained overlay, provenance-labelled, never as API data.
- `2026-07-04` — MCP connector gained **per-site UniFi tools** via the Cloud Connector Proxy (new typed client `src/lib/ubiquiti-proxy.ts`; `ubiquiti.ts` untouched): `unifi_resolve_site` (never guesses), ~18 per-site reads (secret-redacted, typed errors incl. `FIRMWARE_UNSUPPORTED`/`CONSOLE_OFFLINE`), tier-1 attributed actions (restart device, PoE power-cycle, guest auth, vouchers) and tier-2 staged config writes (firewall/zones/networks/WLAN-edit/ACL/DNS/adopt) through the SAME human-approval gate — all single console/site/target by schema, kill switch `CONNECTOR_UNIFI_WRITES_ENABLED`. Tool surface = official Integration API only (OpenAPI 10.1.84 verified); port forwards/routes/events/health/locate/block are NOT in the official API and are omitted-with-reason. Fleet firmware remediation: `unifi_probe_consoles` / `scripts/probe-unifi-consoles.ts`. Reference: `docs/unifi-site-tools.md`; field notes: `docs/gotchas.md` → UniFi.
- `2026-07-05` — Offboarding ticket record is now **reconciliation-based**: every action requested on the form appears exactly once in PROVISIONING RESULTS as `[DONE]/[FAILED]/[MANUAL]/[QUEUED]/[NOT RUN]` (`src/lib/hr/offboarding-actions.ts`), after ticket T20260704.0004 silently dropped a requested shared-mailbox conversion (no Graph API for mailbox conversion + logging gated on an array-only answer shape). New offboarding form fields MUST be added to `deriveRequestedOffboardingActions()`, not just the pipeline. IT Glue SOPs 16573760/14639952/20377379 rewritten portal-first. Full notes: `docs/gotchas.md` → HR Onboarding/Offboarding Automation.
- `2026-07-05` — **Mailbox conversion + delegate access automated** for enabled tenants via an **Azure Automation Exchange runner** (EXO PowerShell v3 app-only cert auth; dedicated multi-tenant app "TCT Exchange Automation"; per-tenant custom role group scoped to `Mail Recipients`, NOT Exchange Administrator — "RBAC for Applications" rejected: Graph/EWS only, no PowerShell). Platform: `src/lib/exchange-online.ts` (HMAC webhook dispatch; raw-pg `hr_exchange_jobs`/`exo_tenant_config`), `/api/hr/exchange-callback` (asserts runner-OBSERVED state == requested before any `[DONE]`), `/api/cron/exchange-jobs-reconcile` (45-min lost-callback backstop), kill switch `EXO_AUTOMATION_ENABLED`. keep_accessible DEFERS license removal in both paths (mailbox must be licensed at conversion; callback removes it post-verification, guarded by the runner's 50GB/holds/archive verdict); non-enabled tenants degrade to `[MANUAL]` + reason. Forwarding = phase 2. Enablement: `docs/runbooks/EXO_AUTOMATION_ENABLEMENT.md`.
- `2026-07-06` — **Sales Calculator integrated** as a staff-gated internal route `/admin/sales-calculator` (was a standalone Next 14 app on the Sales SharePoint). Copied VERBATIM — only import paths changed; config JSONs sha256-identical; quote math verified (25 engine parity checks vs hand-computed pricing.json values + 35-check UI drive incl. all exports). Theme scoped to a `.tct-calc-root` wrapper (never `<body>`); its Tailwind tokens resolve from `--tct-*` vars that exist only inside the wrapper. Deps: jspdf/jspdf-autotable/xlsx (client-side, lazy-imported). Side changes: tsconfig target es5→es2018 (type-check only; also fixed a pre-existing raw-tsc error), ESLint `no-explicit-any` off for the copied dirs only. **Pricing changes = edit `src/config/sales-calculator/*.json`, never `src/lib/sales-calculator/`.** Open pricing confirmations: `docs/reference/sales-calculator/OPEN_ITEMS.md`.
- `2026-07-06` — **Sales calculator: live pricing editor + reactive/proactive support model.** Money is now `pricing.json` defaults + DB overrides: raw-pg `sales_calc_pricing_overrides` (append-only audit rows; flat path→number map validated against pricing.json — can never add keys), edited at `/admin/sales-calculator/pricing` (staff view; saves need `system_settings`), applied by the calculator AND the authenticated e2e spec before quoting; graceful degradation to defaults with a visible banner. Service `include` became tri-state (`true` / `"billable"` = hourly T&M / `false`) — use `serviceInclusionState()`, never truthiness; Comprehensive & Ally mark Helpdesk + Remote Support `"billable"` (owner: Comprehensive = reactive, remediation approved + billed hourly; Complete = proactive, included), rendered as a Support Model row + ⏱ legend on the charts from `packages.json.supportModel`. **New table = POST `/api/migrations/run` once after deploy.** Full notes: `docs/gotchas.md` → Sales Calculator.
- `2026-07-06` — Staff can now **preview the agent training material** (`/agents/training`) without an agent login. New `resolveTrainingViewer()` (`src/lib/agent-training-access.ts`) is the single bridge between agent-portal auth and staff NextAuth: agent session wins; a logged-in staff user gets a read-only `TrainingChrome` "Admin Preview" bar (`src/components/agents/TrainingChrome.tsx`) instead of the agent nav/sign-out. Entry point: "View Training" button on `/admin/sales-agents`. Unauthenticated still redirects to `/agents/login`. Don't add a parallel auth bridge — extend this helper.
- `2026-07-08` — **CFO hiring calculator rebuilt as the New Hire Break-Even calculator** (`/admin/cfo/hiring`), a 1:1 port of the owner's breakeven workbook: 3 hire types (US W-2 / US 1099 / PH contractor) × 3 tiers, NY employer taxes with wage-base caps (FUTA/SUTA+RSF/SS), itemized tooling ($218.73/seat) + equipment + onboarding detail, billable-hour math, required billing rate / monthly revenue at target margin (+50/55/60% references), month-1 and year-1 totals. `src/lib/cfo/hiring.test.ts` locks parity with the workbook's computed cells. Saved assumptions are `version: 2`-guarded (`isHiringAssumptions`) — pre-v2 payloads fall back to defaults. Detail: `docs/gotchas.md` → CFO.
- `2026-07-09` — **Sales calculator: Ally "shared responsibility" display state, saved quotes, comparison exports.** (1) Ally (comanaged) renders Helpdesk / Remote Support / Vendor Management with a shared-with-your-IT icon via `packages.json → sharedServices` + `serviceDisplayState()` — DISPLAY ONLY; money treatment unchanged (`serviceInclusionState()` still drives calc; locked by `shared-display.test.ts`). (2) Quotes save/reload/edit: raw-pg **`sales_calc_saved_quotes`** (stores inputs only — loading reprices at current pricing + overrides; soft delete; `tableMissing` degrade) + `/api/admin/sales-calculator/quotes` CRUD + a Saved Quotes toolbar in the calculator. **New table = POST `/api/migrations/run` once after deploy.** (3) Quote Comparison exports landscape PDFs in internal (costs/margins) and customer versions; the internal button hides in customer view. Detail: `docs/gotchas.md` → Sales Calculator.
- `2026-07-10` — **Thread forms integration hardened to Thread's REAL Automation URL contract** (owner-verified docs: Thread POSTs bare JSON — no auth headers, no HMAC; expects `200 { success: 200, message }` with the link inside the message). The invented `x-thread-signature`/`THREAD_WEBHOOK_SECRET` design was replaced with a fail-closed URL key (`THREAD_AUTOMATION_KEY`, `checkAutomationKey()` in `api-auth.ts` — unset env = reject all). Company resolution is deterministic: `meta_data.company_id` (Autotask company ID) primary via shared `src/lib/form-links.ts`; fuzzy name match never runs after an exact-identifier miss; unresolved = 404 `not_configured`. Single-use links now real: `POST /api/forms/links/[token]/used` stamps `form_links.used_at` + `request_id` (token → hr_request → Autotask ticket = the chat-ticket merge chain; Thread chat-ticket id kept in `form_links.source_meta`). New columns are additive with writer-side backfill. Detail: `docs/gotchas.md` → Thread Integration.
- `2026-07-10` — **e2e gate made non-blocking on auto-merge** at the owner's explicit direction ("make it live now" + deploys taking too long): merge now requires secret-scan + quality only (~5-8 min); the Playwright suite still runs vs the preview as a post-hoc signal. Context: the owner initially attributed the day's delay to the gate — the actual delay was a review-hold (`[skip ci]`) he had requested plus a transient Vercel fetch error; the latency claim is still true in general (e2e gate = 15-45 min/push). The blocking gates that remain exist because the fully-ungated pipeline previously shipped broken commits to production.
- `2026-07-15` — **MCP connector gained HR Employee-Relations writes** to TCT's OWN HumanResources SharePoint site (`hr_er_log_append`, `hr_file_document` in `src/lib/mcp-hr-tools.ts` + `src/lib/hr/employee-relations.ts`). DIRECT writes (no staged gate — low-risk, human-approved text), audit-logged + read-back verified, behind kill switch `CONNECTOR_HR_WRITES_ENABLED`. Auth = a NEW dedicated least-privilege Entra app (`Sites.Selected` → `write` on ONLY the HR site), NOT the AZURE_AD staff-SSO app — chosen to keep an internet-reachable file-write credential out of the SSO/PTO/CFO secret. Non-obvious: Excel workbook API works app-only for org-owned SharePoint sites with `Sites.Selected` (docs' "Application: Not supported" is `/me`/user-shared only). Also closed the IT Glue TODO: `includeArchived` filter (default false) on the three doc-search tools. Full detail: `docs/gotchas.md` → "HR Employee-Relations records".
- `2026-07-15` — **MCP connector auth made provider-swappable to drop WorkOS.** `CONNECTOR_AUTH_PROVIDER` (`workos` default | `entra`) in `src/lib/connector/auth.ts` selects the OAuth authorization server; `route.ts` + `/.well-known/oauth-protected-resource` delegate to it. WorkOS path unchanged (default = zero prod impact); Entra path reuses the staff-SSO tenant and preserves per-user write attribution. Motivated by WorkOS desktop-connector sign-in never finalizing. Non-obvious: Entra v2 access-token `aud` is the app CLIENT ID (GUID), not the Application ID URI, so `CONNECTOR_ENTRA_AUDIENCE` = client id; email must be added as an Access-token optional claim. Cutover: `docs/runbooks/CONNECTOR_AUTH_ENTRA.md`.
- `2026-07-16` — **Both went LIVE.** Connector cut over to Entra in prod and the HR write tools are enabled; `hr_er_log_append` verified end-to-end against the real Employee Relations Log.xlsx. Two field lessons: (1) the connector endpoint had to MOVE to a new URL (`/api/connector/entra/mcp`) because Claude caches the OAuth authorization server per connector URL and kept replaying the old WorkOS token; (2) address Excel workbook tables by **NAME**, never Graph's braces-GUID `id` — `encodeURIComponent('{…}')` 404s every `/columns` `/rows` call (first-prod-call bug, fixed in `resolveLogTable`/`tableSeg`). Both in `docs/gotchas.md` + the runbook.
- `2026-07-16` — **MCP connector gained IT Glue document-folder tools** so connector-created SOPs stop defaulting to the org root: `itglue_list_document_folders` (resolve folder ids — never guess), `itglue_create_document_folder` (public API DOES support folder create; delete stays UI-only), `itglue_move_document` (reuses the existing `updateDocument` PATCH of `document_folder_id`, read-back verified — no parallel client). `itglue_create_document` now instructs folder-first placement. Folder endpoints are org-nested only; the folders index default (`omit` = ALL) is the opposite of the documents index (`omit` = root-only). Two parallel sessions shipped this same-day with identical tool names; implementations unified in the merge. Field notes: `docs/gotchas.md` → IT Glue.
- `2026-07-18` — **MCP connector gained read-only Datto RMM reporting tools** (17 `datto_rmm_*` tools in `src/lib/mcp-datto-rmm-tools.ts`) covering the API's full GET surface: account/rate status, sites, devices (per-site authoritative; account search by LIKE filters), class-aware hardware audits, software inventory, alerts (account/site/device × open/resolved), activity logs, job results, components/filters/users/variables. GET-only BY CONSTRUCTION via a new `DattoRmmClient.getV2()` passthrough (no method/body, `/api/v2/` only — the sole change to the shared client); unit test proxies the client and fails on any other method. Console links = the API's own `portalUrl`/`webRemoteUrl` (never a guessed pattern); alert/activity rows resolve links from cached sweeps. Proxy passwords redacted, masked variables forced `[MASKED]`. Write surface (quickjob/UDF/move/resolve/variables) deliberately deferred — would require the staged-write gate. Reference: `docs/reference/DATTO_RMM_CONNECTOR_TOOLS.md`; field notes: `docs/gotchas.md` → Datto RMM.
- `2026-07-18` — **Datto RMM pagination is 0-INDEXED** (live-confirmed: `page=1` empty with `totalCount: 213`; owner saw 0 alerts vs 13 in console). Fixed every sweep to start at `page=0` — including the ORIGINAL client loops, which had skipped the first 250 rows since the SOC session (the real cause of the "account devices returns 5 of hundreds" gotcha; device-sync cron + executive-summary open alerts were silently incomplete). Regression-locked: the tools' unit-test mock serves rows only on page 0. `docs/gotchas.md` → Datto RMM.
- `2026-07-19` — **Four-defect repair** (live-API-verified): DNSFilter query_logs takes DATE-ONLY from/to (full-ISO >9 days back = 400 — the cause of DNSFilter zeros) + blocked breakdown now paginates all pages; Datto EDR severity read from the list model's native `severity` (threatName/flagName/etc. don't exist on list rows); **SLA unified on the ticket_lifecycle engine** — dashboard/company/QBR/annual + ticket views all read `getLifecycleQualitySummary()` and the `completedDate <= dueDateTime` proxy is deleted (never revive it); reopens computed from status history with **null = not measured** (never a fabricated 0). Field notes: `docs/gotchas.md` → DNSFilter / Datto EDR / Reporting SLA & Reopen.
- `2026-07-20` — **Support metrics split HUMAN vs AUTOMATED via one shared classifier** (`src/lib/reporting/ticket-classification.ts` + `humanTicketSqlCondition()` for bulk SQL) after the monthly review counted SaaS Alerts/Datto EDR auto-tickets as support work (fabricated 0m response / 100% response SLA / 47-ticket backlog / blended resolution averages — live-confirmed on Tri-Bros June 2026: 47 created = 14 human + 33 automated). Source 8 "Monitoring Alert" = automated with BOTH-direction misfile rescues (34477 source-8-but-worked = human; 34369 default-source SOC alert = automated); every surface (business review, dashboard, company, annual, exec summary, TBR export, health score, aggregation, customer portal metrics) counts human only; automated tickets render as a new "Security & Monitoring Activity" section (no SLA/response math ever); lifecycle stores null SLA verdicts for automated tickets and quality reads classify-and-exclude. Also: status 52 "Complete - No Notify" + reopen status 22 added to the cold-start status defaults (52 missing = the fake backlog). Full detail: `docs/gotchas.md` → Reporting Human vs Automated.

## Critical Gotchas — digest

**The full list in `docs/gotchas.md` is mandatory reading.** These are the catastrophic-if-missed rules:

1. **Prod migrations**: a schema field without a matching `ALTER TABLE` in `/api/migrations/run` = production crash ("column does not exist"). Prisma migration files alone do nothing.
2. **Raw-pg subsystems**: HR, M365, reporting, SOC, CFO settings — never convert to Prisma; never remove SSL config or `globalThis` pool caching.
3. **Every external `fetch()` needs `signal: AbortSignal.timeout(…)`** (15s auth, 30s data) — a hung API blocks the whole serverless function.
4. **Cron jobs never return 500 for transient failures** — `classifyError()` + 200 `{ transient: true }`. Cron auth is the Vercel-set `Authorization: Bearer <CRON_SECRET>` header.
5. **API catch blocks never return 200 with empty data** — return 4xx/5xx with `{ error }` or the UI lies to the user.
6. **SOC enrichment must be scoped to the customer** — platform mappings first, name-match fallback, SKIP rather than query MSP-wide. Unscoped queries have leaked other customers' data before.
7. **Auth helpers are mandatory**: `checkSecretAuth()` for secret routes, `checkCsrf()` on customer mutations, `checkRateLimit()` on auth endpoints. Never inline secret checks, never log auth details, never hardcode fallback signing keys.
8. **React**: `useState(prop)` needs a `useEffect` sync; every useEffect fetch needs AbortController cleanup; no `overflow-hidden` around absolute dropdowns; every admin subsection needs `loading.tsx`; error boundaries wrap major sections.
9. **Quality gates before every push**: build + lint + e2e. A fix isn't confirmed until the previously failing test passes (`npm run debug:failures`, `/admin/debug/failures`).
10. **Use `NEXT_PUBLIC_BASE_URL`** for generated URLs — never hardcode the domain. Strict CSP: third-party resources require `next.config.js` header updates.
11. **Autotask**: data is authoritative; statuses are instance-specific picklists (`?step=diagnose`); never silently catch phase/task API errors; task PATCH write-back 404s (notes/time entries POST fine).
12. **Don't guess about external APIs** — read the vendor docs first; every integration here has at least one non-obvious quirk (see field notes in `docs/gotchas.md`).

## E · Memory Map (`docs/`)

- `architecture.md` · `system-map.md` · `data-model.md` · `session-summary.md` · `current-tasks.md` — bootstrap docs 1–5
- `gotchas.md` — bootstrap doc 6: full gotchas + Autotask/M365/SOC/SaaS Alerts/portal/CFO field notes, temporary dev shortcuts, pre-launch cleanup checklist
- `coding-standards.md` · `qa-standards.md` · `UI_STANDARDS.md` — implementation and QA rules
- `runbooks/` — `RUNBOOK.md` (incident response), `DEBUGGING_WORKFLOW.md` (e2e self-healing debug loop), `CREDENTIALS_MIGRATION.md` (secret rotation)
- `plans/` — design documents (`SOC_REDESIGN_PLAN.md`, `OLUJO_PROJECT.md`, `PROJECT_OVERVIEW.md`, …)
- `reference/` — setup + feature guides (`AUTOTASK_SYNC.md`, `REPORTING_ARCHITECTURE.md`, `ONBOARDING_PORTAL.md`, `CUSTOMER_INVITE_AND_ONBOARDING.md`, `AZURE_AD_SETUP.md`, `BLOG_SYSTEM_README.md`, `CLAUDE_SESSION_PREFERENCES.md`, …)
- `archive/` — superseded docs and old session summaries
- Cross-cutting handoffs: `SOC_CROSSSTACK_HANDOFF.md`, `CFO_HANDOFF.md`, `COMPLIANCE_PLAYBOOK.md`

**Session reset**: before ending a session, update `session-summary.md` + `current-tasks.md`, commit, push. New sessions reload context from the bootstrap docs.

## F · References

- **Production**: https://www.triplecitiestech.com · **Preview**: `https://<branch-name>-triplecitiestech.vercel.app`
- **Hosting**: Vercel (auto-deploy all branches; `main` → production; region `iad1`)
- **Env vars**: full list in `.env.example`. Required core: `DATABASE_URL`, `PRISMA_DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `AZURE_AD_*` (3), `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_BASE_URL`. Autotask: `AUTOTASK_API_*` (4) + `MIGRATION_SECRET` (auths `/api/migrations/*`, `/api/test-failures/migrate`, `/api/soc/migrate`, `/api/autotask/trigger`). `CRON_SECRET` — all `/api/cron/*` (Vercel sets the Bearer header). M365 multi-tenant app: `M365_PORTAL_CLIENT_ID/SECRET` (TCT-published app reg, NOT per-customer). Integrations: `ROCKETCYBER_API_TOKEN`, `SOC_INGEST_SECRET`, `SAAS_ALERTS_API_KEY` + `SAAS_ALERTS_REFRESH_TOKEN`, `SAAS_ALERTS_WEBHOOK_TOKEN`, `ENCRYPTION_MASTER_KEY_V1`, `E2E_TEST_SECRET`.
- **Secrets are NEVER stored in this file or any doc.** They live in Vercel env vars only (`vercel env pull`). If a session needs one for a one-off command, ask the operator to paste it into that message — never commit it.
- Always give **full URLs** (e.g. `https://www.triplecitiestech.com/api/soc/migrate`), never partial paths.

## G · Project-specific overrides & user preferences

- **User runs Windows (PowerShell)** — always give commands in PowerShell syntax (`Invoke-RestMethod`/`Invoke-WebRequest`), never bash/curl/Mac/Linux.
- **Mobile + desktop both matter** — every UI change is verified at `sm`/`md` and `lg`+ breakpoints; flag mobile-affecting changes explicitly.
- **Forbidden colors** (yellow/amber/gold/brown/orange) — see Code Conventions; this is an owner mandate, not a suggestion.
- **Temporary development shortcuts exist intentionally** (auto-merge to main, preview auto-deploys, query-param secret fallback, impersonation + debug endpoints). Preserve them, don't expand them, don't copy them as patterns. Full list + pre-launch hardening checklist: `docs/gotchas.md`.

## Self-Improvement Protocol

When the user corrects a mistake or a session reveals a new convention:
1. Fix the immediate issue.
2. Record the lesson in `docs/gotchas.md` under the right section; promote a one-liner to the Critical Gotchas digest above only if missing it would break production.
3. Bump this file's *Last updated* date and commit the doc update alongside the fix.

The same mistake must never happen twice across sessions.
