# CLAUDE.md — AI-Assisted Development Guide

**Read this file first before making any changes to this repository.**

This document defines the engineering standards, patterns, and expectations for this project. It is specifically written to guide AI-assisted development (Claude, GitHub Copilot, etc.) and human developers working on the Triple Cities Tech platform.

---

## Project Overview

**Triple Cities Tech (TCT)** is a managed IT services company in the Southern Tier of New York. This repository contains:

1. **Public marketing website** — Services, blog, contact forms
2. **Admin dashboard** — Staff-only project management, AI tools, blog CMS
3. **Customer portal** — Per-company onboarding and status tracking

**Primary Use Cases:**
- Customer companies and projects tracking
- Project phase and task management
- AI-assisted project planning
- Automated blog content generation
- Email notifications and approvals

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 15.5.9 |
| Language | TypeScript | 5.4 |
| UI | React + Tailwind CSS | 18.3 / 3.4 |
| Database | PostgreSQL (Vercel Postgres) | 15+ |
| ORM | Prisma | 7.2.0 |
| Auth | NextAuth v5 | beta.30 |
| AI | Anthropic SDK (Claude) | 0.71.2 |
| Email | Resend | 6.0.1 |
| Hosting | Vercel | iad1 region |

**Key Infrastructure Files:**
- `/prisma/schema.prisma` — 26+ database models
- `/src/lib/prisma.ts` — Database client singleton
- `/src/auth.ts` — NextAuth configuration (Azure AD OAuth)
- `/next.config.js` — Security headers, CSP, webpack config

---

## Development Principles

### 1. **Incremental Changes Only**

- Make **small, focused changes** — one feature or fix at a time
- Avoid large refactors unless explicitly requested
- Prefer modifying existing code over creating new files
- Test each change before moving to the next

### 2. **Verified-Create Pattern** (Critical)

This is the **most important pattern** in this codebase.

**Rule:** The UI must **never** display success unless the backend confirms persistence.

#### API Response Contract

Every create/update operation **must** return:

```typescript
// Success
{
  success: true,
  data: {
    id: string,              // UUID of created record
    url: string,             // Canonical URL to view the record
    ...otherFields
  },
  requestId: string          // For log correlation
}

// Error
{
  success: false,
  error: string,             // Human-readable message
  code?: string,             // Machine-readable error code
  requestId: string
}
```

#### Client-Side Rules

1. **Never** show success toast/banner unless `response.ok && data.success === true && data.data.id` exists
2. **Never** navigate away from a form on error
3. **Always** display `requestId` in error messages for support tracing
4. **Always** disable submit button during pending request (prevent double-submit)

#### Reference Implementation

✅ **Good Example:** `/src/app/api/companies/route.ts`
- Uses `createRequestLogger` for structured logging
- Returns `apiSuccess()` or `apiError()` from `/src/lib/api-response.ts`
- Includes timing measurements
- Proper error handling

❌ **Needs Migration:** `/src/app/api/projects/route.ts`
- Uses `console.log` instead of structured logging
- Returns raw Prisma objects instead of envelope
- No request IDs or timing

---

## Self-Healing Reliability Standards

### Structured Logging

**Current State:** Only 2 of 60+ API routes use structured logging (being migrated)

**Target:** All API routes must use `/src/lib/server-logger.ts`

#### How to Use

```typescript
import { createRequestLogger } from '@/lib/server-logger'
import { apiSuccess, apiError } from '@/lib/api-response'

export async function POST(req: Request) {
  const log = createRequestLogger('POST /api/your-route')
  log.info('Request received')

  try {
    // ... do work ...
    const timer = log.startTimer('database-operation')
    const result = await prisma.thing.create({ ... })
    timer()  // Logs elapsed time

    log.info('Operation completed', {
      thingId: result.id,
      durationMs: log.elapsed(),
    })

    return apiSuccess(result, '/admin/things', log.requestId, 201)
  } catch (error) {
    log.error('Operation failed', {
      error: error instanceof Error ? error.message : 'Unknown',
      durationMs: log.elapsed(),
    })
    return apiError('Failed to create thing', log.requestId, 500)
  }
}
```

**Benefits:**
- Request correlation via `requestId`
- Latency visibility
- Searchable JSON logs in Vercel dashboard
- Easier debugging and support

### Timeouts

| Operation | Timeout | Implementation |
|-----------|---------|----------------|
| AI API calls (Anthropic) | 25s | `AbortController` with `signal` |
| Vercel function max | 30s | `vercel.json` → `maxDuration: 30` |
| RSS feed fetch | 10s | `rss-parser` timeout option |
| Client fetch (UI) | 30s | `AbortController` on fetch |

**Example: AI Call with Timeout**

```typescript
const abortController = new AbortController()
const timeoutId = setTimeout(() => abortController.abort(), 25000)

try {
  const response = await anthropic.messages.create(
    { model, messages, system },
    { signal: abortController.signal }
  )
  clearTimeout(timeoutId)
  return response
} catch (error) {
  clearTimeout(timeoutId)
  if (error instanceof Error && error.name === 'AbortError') {
    return apiError('AI service timed out', log.requestId, 504, 'AI_TIMEOUT')
  }
  throw error
}
```

### Retries

**General Rule:** No automatic retries on create operations (risk of duplicates)

- **AI calls**: No retry (expensive/slow) — return error, let user retry
- **DB calls**: Prisma handles connection pool retries internally
- **Email sending**: 1 retry with 2s delay on transient failure (non-blocking)

### Idempotency

**Current State:** `Idempotency-Key` header is logged but **not enforced** (needs implementation)

**Target:** All create operations should accept and honor idempotency keys

```typescript
// Client generates key before submit
const idempotencyKey = crypto.randomUUID()
fetch('/api/companies', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey,
  },
  body: JSON.stringify(data)
})

// Server checks for duplicate
const idempotencyKey = req.headers.get('Idempotency-Key')
if (idempotencyKey) {
  const existing = await prisma.company.findFirst({
    where: { idempotencyKey }
  })
  if (existing) {
    return apiSuccess(existing, `/admin/companies`, log.requestId, 200)
  }
}
```

---

## AI Operation Rules

When AI is part of a workflow (blog generation, project phase creation):

### Pattern: Create First, Enrich Later

1. **Create the database record immediately** with status `PROCESSING` or `DRAFT`
2. **Return success to the client** with the record ID
3. **Run AI processing asynchronously** (background job, cron, or non-blocking)
4. **Update the record** when AI completes (or mark as `FAILED` if error)
5. **UI polls or refreshes** to show updated state

**Why:** AI calls are slow (5-25s) and can fail. Never block record creation on AI.

### Example: Project with AI-Generated Phases

❌ **Bad (current implementation):**
```typescript
// Client waits for AI to generate phases, then creates project with phases
// Problem: If AI times out, no project is created at all
```

✅ **Good (target implementation):**
```typescript
// 1. Create project immediately (status: ACTIVE)
const project = await prisma.project.create({ ... })
log.info('Project created', { projectId: project.id })

// 2. Return success to client
return apiSuccess(project, `/admin/projects/${project.id}`, log.requestId, 201)

// 3. Trigger AI phase generation in background (non-blocking)
generatePhasesAsync(project.id, prompt).catch(err => {
  log.error('AI phase generation failed', { projectId: project.id, error: err })
})
```

### AI Chat Timeout

Current implementation (✅ good example): `/src/app/api/admin/ai-chat/route.ts`
- 25s server-side timeout with `AbortController`
- Structured logging with timing
- Proper error codes (`AI_TIMEOUT`, `RATE_LIMITED`, etc.)

---

## UI Standards

Full details: [`docs/UI_STANDARDS.md`](docs/UI_STANDARDS.md)

### Key Rules

1. **No success without confirmation** — See verified-create pattern above
2. **Loading states** — Always show spinner + elapsed time for operations >5s
3. **Error states** — Inline errors with `requestId` for support
4. **Forms** — Disable inputs during submit, validate server-side always
5. **Tables** — Text left, numbers right, status center, actions right

### Admin Dashboard Color Palette

| Element | Tailwind Class |
|---------|---------------|
| Background | `bg-slate-900` |
| Card | `bg-slate-800/80 backdrop-blur` |
| Primary button | `from-cyan-500 to-cyan-600` |
| AI/Creative | `from-purple-500 to-indigo-600` |
| Success | `text-green-400 bg-green-500/10` |
| Error | `text-red-400 bg-red-500/10` |

---

## Testing Expectations

**Current State:** Minimal test coverage (Vitest configured, few tests written)

**Target:** All critical paths tested (create, update, delete, AI calls)

### What to Test

1. **Verified-create flow** — Success response includes `id`, `url`, `requestId`
2. **Error handling** — Errors return proper envelope with `requestId`
3. **Timeouts** — AI calls abort after 25s
4. **Validation** — Required fields enforced
5. **Idempotency** — Duplicate keys return same result

### Running Tests

```bash
npm test        # Run all tests
npm test:watch  # Watch mode
```

**Example Test:**

```typescript
import { expect, test } from 'vitest'

test('POST /api/companies returns verified-create envelope', async () => {
  const response = await fetch('http://localhost:3000/api/companies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Test Company' }),
  })

  const data = await response.json()
  expect(response.ok).toBe(true)
  expect(data.success).toBe(true)
  expect(data.data.id).toBeDefined()
  expect(data.data.url).toBe('/admin/companies')
  expect(data.requestId).toBeDefined()
})
```

---

## Development Workflow Rules

### Git & Commits

1. **Always create new commits** rather than amending (unless explicitly requested)
2. **Never skip hooks** (`--no-verify`) unless user explicitly requests it
3. **Never force-push to main/master** — warn user if they request it
4. **Commit messages** should be clear and concise:
   - Good: `Add request ID logging to project creation endpoint`
   - Bad: `fix bug`, `update code`

### When Creating API Routes

**Checklist:**
- [ ] Use `createRequestLogger` from `/src/lib/server-logger.ts`
- [ ] Log request start, end, and any errors
- [ ] Use `apiSuccess` / `apiError` from `/src/lib/api-response.ts`
- [ ] Include timing measurements (`log.elapsed()`)
- [ ] Add timeout for AI or external calls
- [ ] Validate all inputs before database write
- [ ] Handle errors gracefully (try/catch)
- [ ] Return proper status codes (200, 201, 400, 401, 500, 504)

**Reference Implementation:**
- ✅ `/src/app/api/companies/route.ts`
- ✅ `/src/app/api/admin/ai-chat/route.ts`

### When Modifying Database Schema

1. **Always run Prisma migration locally first:**
   ```bash
   npx prisma migrate dev --name descriptive-migration-name
   ```
2. **Commit the migration files** in `prisma/migrations/`
3. **Update seed file** if needed (`prisma/seed.ts`)
4. **Test migration** on development database before pushing

### Before Pushing Changes

1. **Run linter:**
   ```bash
   npm run lint
   ```
2. **Run tests:**
   ```bash
   npm test
   ```
3. **Test locally:**
   ```bash
   npm run dev
   ```
4. **Check for console errors** in browser dev tools

---

## Reference Implementations

Use these files as examples of best practices:

### ✅ Excellent Examples

| File | Why It's Good |
|------|--------------|
| `/src/app/api/companies/route.ts` | Verified-create, structured logging, timing, idempotency support |
| `/src/app/api/admin/ai-chat/route.ts` | AI timeout, error codes, structured logging |
| `/src/lib/server-logger.ts` | Clean utility, well-typed, timing helpers |
| `/src/lib/api-response.ts` | Type-safe response envelope |
| `/docs/SELF_HEALING_AND_RELIABILITY.md` | Clear documentation of standards |

### ❌ Needs Improvement (Do Not Copy)

| File | Issues |
|------|--------|
| `/src/app/api/projects/route.ts` | Uses `console.log`, returns raw Prisma objects, no timing |
| `/src/app/api/phases/route.ts` | No structured logging, no request IDs |
| `/src/app/api/tasks/route.ts` | Inconsistent error handling |

**If modifying these files, migrate them to the correct pattern.**

---

## What to Avoid

### ❌ Don't Do This

1. **Console.log in production API routes** — Use `createRequestLogger` instead
2. **Return raw Prisma objects** — Use `apiSuccess` / `apiError` envelope
3. **Show success without backend confirmation** — Verified-create pattern required
4. **Infinite spinners** — Always timeout after 25-30s
5. **Skip error handling** — Always wrap DB/AI calls in try/catch
6. **Create large refactors** — Make small, incremental changes
7. **Add dependencies without justification** — Keep bundle size reasonable
8. **Break existing functionality** — Test before pushing

### ⚠️ Be Careful With

1. **AI calls** — Always timeout, never block record creation
2. **Database migrations** — Test locally, commit migration files
3. **Authentication** — Don't bypass session checks
4. **Security headers** — Don't weaken CSP or remove protections
5. **Environment variables** — Never commit secrets, use `.env.local`

---

## Common Tasks

### Add a New API Route

1. Create file in `/src/app/api/your-route/route.ts`
2. Import logger and response helpers:
   ```typescript
   import { createRequestLogger } from '@/lib/server-logger'
   import { apiSuccess, apiError } from '@/lib/api-response'
   ```
3. Follow the pattern in `/src/app/api/companies/route.ts`
4. Add authentication check if needed:
   ```typescript
   const session = await auth()
   if (!session) return apiError('Unauthorized', log.requestId, 401)
   ```
5. Test the endpoint locally
6. Write a test in `src/__tests__/`

### Migrate an Existing Route to Structured Logging

1. Read the current implementation
2. Import `createRequestLogger` and `apiSuccess`/`apiError`
3. Replace `console.log` calls with `log.info/warn/error`
4. Replace return statements with envelope format
5. Add timing measurements
6. Test to ensure behavior is unchanged

### Add a New Database Model

1. Update `/prisma/schema.prisma`
2. Run `npx prisma migrate dev --name add-model-name`
3. Update `/prisma/seed.ts` if needed
4. Run `npx prisma generate`
5. Create API routes following the patterns above

### Debug a Slow Operation

1. Check Vercel logs for the `requestId`
2. Look for timing measurements: `durationMs`, `dbTimeMs`, `aiTimeMs`
3. If AI is slow, check Anthropic dashboard for rate limits
4. If DB is slow, check query in Prisma logs
5. Consider adding indexes or optimizing query

---

## Migration Status (As of March 2026)

This section tracks the progress of applying Smart Sumai standards across the codebase.

### ✅ Completed

- Structured logging infrastructure created (`server-logger.ts`)
- API response envelope created (`api-response.ts`)
- Company creation migrated to verified-create pattern
- AI chat migrated to structured logging + timeouts
- Documentation spine created

### 🚧 In Progress

- Migrate 60+ API routes to structured logging
- Migrate API routes to use response envelope
- Implement idempotency enforcement
- Add timeout protection to database operations
- Add client-side error boundaries

### 📋 Planned

- Write comprehensive integration tests
- Add retry logic for transient failures
- Implement background job queue for AI operations
- Add rate limiting to API routes
- External error reporting (Sentry or similar)

---

## Getting Help

### Documentation

- [`README.md`](README.md) — Setup, environment variables, build commands
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — System flows, data model
- [`docs/UI_STANDARDS.md`](docs/UI_STANDARDS.md) — UI patterns, color palette
- [`docs/SELF_HEALING_AND_RELIABILITY.md`](docs/SELF_HEALING_AND_RELIABILITY.md) — Detailed reliability standards
- [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — Incident response, troubleshooting
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — Release history

### When Stuck

1. **Check reference implementations** — See "Reference Implementations" section above
2. **Read the docs** — Especially ARCHITECTURE.md and SELF_HEALING_AND_RELIABILITY.md
3. **Search logs** — Use `requestId` to trace requests in Vercel dashboard
4. **Test locally** — `npm run dev` and inspect browser console
5. **Ask for clarification** — If requirements are unclear, ask the user

---

## Summary

**Key Takeaways:**

1. ✅ **Always use verified-create pattern** — No success without backend confirmation
2. ✅ **Always use structured logging** — Request IDs, timing, JSON format
3. ✅ **Always timeout AI calls** — 25s max with AbortController
4. ✅ **Always return API envelope** — `{ success, data, error, requestId }`
5. ✅ **Never block creation on AI** — Create record first, enrich async
6. ✅ **Always make small changes** — Incremental, testable, reversible

**Before you start coding:**
- Read this file (you just did!)
- Check [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for system flows
- Look at reference implementations
- Follow the patterns, don't invent new ones (unless explicitly improving reliability)

**Remember:** The goal is to make this codebase **reliable, maintainable, and debuggable**. Every change should move us closer to that goal.
