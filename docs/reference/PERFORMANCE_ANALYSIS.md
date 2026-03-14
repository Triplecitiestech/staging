# Performance Analysis

> Tracks API route maturity tiers, identifies bottlenecks, and records timing baselines.
> Updated: 2026-03-04

## API Route Maturity Tiers

Routes are categorized by their adherence to the standards in `docs/SELF_HEALING_AND_RELIABILITY.md`.

### Tier 1 — Hardened (reference implementations)

These routes use `createRequestLogger`, `apiSuccess`/`apiError` envelope, structured timing, and safe error responses.

| Route | File | Logging | Envelope | Timing | Error Safety |
|-------|------|---------|----------|--------|--------------|
| POST /api/companies | `src/app/api/companies/route.ts` | Structured | Yes | db, total | Safe |
| DELETE /api/companies | `src/app/api/companies/route.ts` | Structured | Yes | total | Safe |
| POST /api/admin/ai-chat | `src/app/api/admin/ai-chat/route.ts` | Structured | Custom* | ai, total | Safe |
| POST /api/projects | `src/app/api/projects/route.ts` | Structured | Yes | db, total | Safe |
| GET /api/projects | `src/app/api/projects/route.ts` | Structured | N/A (list) | db, total | Safe |

*AI chat uses `{ success, message, usage, requestId }` — appropriate for its use case.

### Tier 2 — Legacy (not yet migrated)

These routes use `console.log`/`console.error`, return raw objects, and may leak internal error details.

| Route | File | Issues |
|-------|------|--------|
| Various `/api/admin/*` | Multiple files | Need audit |
| Various `/api/blog/*` | Multiple files | Need audit |
| Various `/api/cron/*` | Multiple files | Need audit |
| `/api/contact` | `src/app/api/contact/route.ts` | Need audit |

### Migration Priority

1. ~~POST/GET /api/projects~~ — **Done** (2026-03-04)
2. `/api/admin/*` routes — high traffic, staff-facing
3. `/api/blog/*` routes — cron-triggered, need timeout handling
4. `/api/contact` — public-facing, security-sensitive

## Identified Bottlenecks

### 1. Project Creation — Slug Uniqueness Loop (Low risk)

`POST /api/projects` generates slugs by looping `findUnique` until no collision. In practice this rarely iterates more than once, but under concurrent creation of identically-named projects it could issue N+1 queries.

**Mitigation**: Acceptable for current traffic. If it becomes an issue, switch to `upsert` or append a short random suffix.

### 2. AI API Latency (Medium risk)

Anthropic API calls can take 5–25 seconds. The 25s AbortController timeout prevents runaway requests, but blog generation (Claude Sonnet) is particularly slow and occasionally approaches the 30s Vercel function limit.

**Mitigation**: Already handled — timeout at 25s, graceful 504 response. Monitor `aiTimeMs` in structured logs.

### 3. Project List Query (Low risk)

`GET /api/projects` includes `company` and `phases` relations. With many projects this could become slow.

**Mitigation**: Add pagination when project count exceeds ~100. Monitor `dbTimeMs` in structured logs.

## Timing Baselines

To be populated from production structured logs after deployment:

| Route | p50 (ms) | p95 (ms) | p99 (ms) |
|-------|----------|----------|----------|
| POST /api/companies | TBD | TBD | TBD |
| POST /api/projects | TBD | TBD | TBD |
| GET /api/projects | TBD | TBD | TBD |
| POST /api/admin/ai-chat | TBD | TBD | TBD |

## Pre-existing Build Issues

The following issues exist in the build environment and are **not caused by recent changes**:

- `npm run build` fails due to missing modules in `src/app/about/page.tsx` (`@/components/layout/Header`, `@/components/layout/Footer`, `@/constants/data`, etc.)
- ESLint config is `.eslintrc.json` but ESLint 10 requires `eslint.config.js` — `npm run lint` cannot run
- Prisma CLI not in PATH — `prisma migrate deploy` in build script fails without `npx`

These should be addressed in a separate remediation session.
