# Triple Cities Tech — CLAUDE.md
*Last updated: 2026-06-09 · Owner: Kurtis (kurtis@triplecitiestech.com)*

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
- Branches: `claude/[description]-[sessionId]`. **Never push to `main`.** Auto-merge to main is **gated**: every push to a `claude/**` branch must pass secret-scan + lint + schema-drift + build + unit tests + the full e2e suite against the Vercel preview before `.github/workflows/auto-merge-claude.yml` merges it. A failed gate = no merge = no production deploy.
- `[skip-e2e]` in the commit **subject line** (first line only — body text is ignored) skips ONLY the e2e gate — pipeline emergencies only (e.g. Vercel integration down); record any use in `docs/session-summary.md`.
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
