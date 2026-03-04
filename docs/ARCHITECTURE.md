# Architecture

## System Overview

Triple Cities Tech is a Next.js 15 App Router application with:
- **Public site** — marketing pages, blog, contact form
- **Admin dashboard** — staff-only project management, AI tools, blog CMS
- **Customer portal** — per-company onboarding status pages

All three share one Next.js deployment on Vercel (iad1).

## Technology Stack

```
┌─────────────────────────────────────────────┐
│  Browser                                    │
│  React 18 + Tailwind CSS                    │
│  NextAuth session (Azure AD)                │
└──────────────┬──────────────────────────────┘
               │ HTTPS
┌──────────────▼──────────────────────────────┐
│  Vercel Edge (middleware.ts)                 │
│  Security headers, bot blocking, CSP        │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  Next.js App Router                         │
│  src/app/api/**  (REST API routes)          │
│  30s function timeout (vercel.json)         │
└──────┬───────────────┬──────────────────────┘
       │               │
┌──────▼──────┐  ┌─────▼──────────────────────┐
│  Prisma 7   │  │  Anthropic SDK (Claude)    │
│  PostgreSQL │  │  AI Chat / Blog Gen / Edit │
│  (Vercel)   │  │  Timeout: 25s (AbortCtrl)  │
└─────────────┘  └────────────────────────────┘
```

## Authentication Flow

```
User → /admin/* → middleware checks path
  → NextAuth session check (src/auth.ts)
    → Azure AD OAuth (PKCE)
    → On sign-in: validate email against staff_users table
    → Session enriched with { role, staffId }
    → Roles: ADMIN | MANAGER | VIEWER
```

**Key files:**
- `src/auth.ts` — NextAuth config, Azure AD provider, Prisma adapter
- `src/middleware.ts` — security headers, suspicious request blocking
- `prisma/schema.prisma` — `StaffUser`, `Account`, `Session`, `User` models

## Create Company Flow

```
NewCompanyForm.tsx                     POST /api/companies
┌─────────────────┐                   ┌──────────────────────────┐
│ Form submit      │ ──fetch POST──▶ │ 1. auth() check           │
│                  │                  │ 2. Generate password      │
│ Shows spinner    │                  │ 3. Generate unique slug   │
│                  │                  │ 4. prisma.company.create  │
│ On success:      │ ◀──{success,──  │ 5. Return envelope:       │
│ redirect to      │    id, url}      │    {success, id, url,     │
│ /admin/companies │                  │     requestId}            │
│                  │                  │                           │
│ On error:        │ ◀──{error,────  │ 6. Log with requestId     │
│ show inline msg  │    requestId}    │    + latency              │
└─────────────────┘                   └──────────────────────────┘
```

**Key files:**
- `src/components/companies/NewCompanyForm.tsx` — client form
- `src/app/api/companies/route.ts` — POST handler
- `src/app/admin/companies/new/page.tsx` — page wrapper

## AI Project Chat Flow

```
AIProjectAssistant.tsx                POST /api/admin/ai-chat
┌─────────────────────┐              ┌────────────────────────────┐
│ User types message   │──fetch───▶  │ 1. auth() check             │
│                      │             │ 2. Build system prompt       │
│ Show typing dots     │             │    with project context      │
│                      │             │ 3. anthropic.messages.create │
│ Display AI response  │◀─{message}─ │    model: haiku              │
│                      │             │    timeout: 25s              │
│ If JSON detected:    │             │ 4. Return {message, usage,   │
│ show "Create Phases" │             │    requestId}                │
│                      │             └────────────────────────────┘
│ On "Create Phases":  │
│ POST /api/phases ×N  │──sequential──▶ prisma.phase.create
│ POST /api/tasks ×N   │──sequential──▶ prisma.phaseTask.create
│ Reload page          │
└─────────────────────┘
```

**Key files:**
- `src/components/admin/AIProjectAssistant.tsx` — chat widget
- `src/app/api/admin/ai-chat/route.ts` — AI endpoint
- `src/app/api/phases/route.ts` — phase CRUD
- `src/app/api/tasks/route.ts` — task CRUD

## Blog Generation Flow (Automated)

```
Vercel Cron (MWF 8AM UTC)
  → GET /api/cron/generate-blog
    → ContentCurator: fetch RSS feeds (10s timeout)
    → BlogGenerator: call Claude Sonnet for content
    → prisma.blogPost.create (status: DRAFT)
    → Send approval email via Resend
    → Staff clicks approve/reject link
    → /api/blog/approval handles status change
    → Vercel Cron (15min): publish if scheduledFor <= now
```

**Key files:**
- `src/lib/content-curator.ts` — RSS aggregation
- `src/lib/blog-generator.ts` — AI content generation
- `src/app/api/cron/generate-blog/route.ts` — cron handler
- `src/app/api/blog/approval/route.ts` — approval workflow

## Data Model (Key Entities)

```
StaffUser ─── BlogPost
                │
Company ──── Project ──── Phase ──── PhaseTask
                │           │           │
                │         Comment     Comment
                │         Assignment  Assignment
                │
              AuditLog
```

See `prisma/schema.prisma` for the full 26-model schema.

## Structured Logging

**Target State:** All API routes use `src/lib/server-logger.ts`
**Current State:** ~2 of 60+ API routes (company creation, AI chat)

### What's Implemented
- Request ID generation and correlation
- Timing captures: total latency, DB time, AI time
- Structured JSON format: `{ timestamp, requestId, level, message, context }`
- Security events via `src/lib/security.ts:logSecurityEvent()`

### What's Pending
- Most API routes still use `console.log` (322 instances across 79 files)
- No consistent request ID propagation
- Inconsistent timing measurements

**Files to reference:**
- ✅ `/src/app/api/companies/route.ts` - Best practice example
- ✅ `/src/app/api/admin/ai-chat/route.ts` - Best practice example
- ❌ `/src/app/api/projects/route.ts` - Needs migration

## Error Handling

**Target State:** All API routes use standard response envelope
**Current State:** ~2 of 60+ API routes

### What's Implemented
- **API response envelope** (`src/lib/api-response.ts`): `{ success, data?, error?, requestId }`
- **Company creation**: Uses verified-create pattern with envelope
- **AI chat**: Uses envelope for errors
- **Client**: `AdminErrorBoundary` wraps all admin pages
- **AI calls**: 25s timeout via AbortController; errors surfaced to user
- **Non-critical failures** (audit logs): caught and logged, don't block primary operation

### What's Pending
- Most API routes return raw Prisma objects or inconsistent error formats
- Project/phase/task creation routes need envelope migration
- No timeout protection on most operations
- Idempotency header accepted but not enforced
