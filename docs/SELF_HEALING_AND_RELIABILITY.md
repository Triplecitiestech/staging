# Self-Healing & Reliability Standards

## 1. Verified-Create Flow

Every "create" action (company, project, phase, task, blog post) must follow this contract:

### API Response Envelope

```typescript
// Success
{
  success: true,
  data: {
    id: "uuid",
    url: "/admin/companies/uuid",  // canonical view URL
    ...fields
  },
  requestId: "req_abc123"
}

// Error
{
  success: false,
  error: "Human-readable error message",
  code: "DUPLICATE_SLUG",           // machine-readable code (optional)
  requestId: "req_abc123"
}
```

### Client Rules

1. **Never** show "success" unless `response.ok && data.success === true && data.data.id` exists
2. **Never** navigate away from the form on error
3. Always display `requestId` in error messages for support tracing
4. Disable submit button during pending request (prevent double-create)

### Server Rules

1. Validate all inputs before any database write
2. Generate `requestId` at the start of every handler
3. Log `requestId` + timing at entry and exit
4. Return the envelope format above — never return raw Prisma objects

## 2. Structured Logging

### Format

Every log line is JSON:

```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "level": "info",
  "requestId": "req_abc123",
  "message": "Company created",
  "context": {
    "route": "POST /api/companies",
    "userId": "user@tct.com",
    "durationMs": 245,
    "dbTimeMs": 120,
    "companyId": "uuid"
  }
}
```

### Log Levels

| Level | When |
|-------|------|
| `info` | Normal operations: request start/end, entity created/updated |
| `warn` | Recoverable issues: retry triggered, fallback used, slow query |
| `error` | Failures: unhandled exception, AI timeout, DB connection lost |

### Timing

Every request logs:
- `durationMs` — total wall-clock time
- `dbTimeMs` — time spent in Prisma queries
- `aiTimeMs` — time spent waiting for Anthropic API (if applicable)

Use `src/lib/server-logger.ts` for all server-side logging.

## 3. Timeouts

| Operation | Timeout | Implementation |
|-----------|---------|----------------|
| AI API calls (Anthropic) | 25s | `AbortController` with `signal` passed to SDK |
| Vercel function max | 30s | `vercel.json` → `maxDuration: 30` |
| RSS feed fetch | 10s | `rss-parser` timeout option |
| Client fetch (UI) | 30s | `AbortController` on fetch |

### Timeout Behavior

- AI call times out → return `{ success: false, error: "AI service timed out...", requestId }` with status 504
- Client fetch times out → show "Request timed out. Please try again." with retry button
- Never show infinite spinner — always have a max wait with user feedback

## 4. Retry Logic

### Server-Side Retries

- **AI calls**: No automatic retry (too expensive + slow). Return error, let user retry.
- **DB calls**: Prisma handles connection pool retries internally.
- **Email sending**: 1 retry with 2s delay on transient failure.

### Client-Side Retries

- Failed fetches: Show error + manual "Try Again" button
- No automatic client retries (avoids double-create)
- Rate-limited responses (429): Show "Please wait X seconds" using `Retry-After` header

## 5. Idempotency

### Create Actions

- Client generates an `idempotencyKey` (UUID) before submit
- Server checks if a record with that key already exists
- If exists: return the existing record (200) instead of creating a duplicate
- Key stored on the record or in a separate idempotency table with TTL

### Implementation Pattern

```typescript
// Client
const idempotencyKey = crypto.randomUUID()
fetch('/api/companies', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey,
  },
  body: JSON.stringify(formData)
})

// Server
const idempotencyKey = req.headers.get('Idempotency-Key')
if (idempotencyKey) {
  const existing = await findByIdempotencyKey(idempotencyKey)
  if (existing) return existing  // already created
}
```

## 6. Graceful Degradation

### AI Service Down

- Create operations (company, project) proceed without AI
- AI-dependent features (chat, blog generation) show clear "AI unavailable" message
- Never block a database write because AI is slow/down

### Database Issues

- Connection pool exhaustion: logged as error, returns 503
- Migration drift: caught at build time (`prisma migrate deploy` in build command)

### External Services

- Resend (email) down: log error, continue; email is best-effort
- RSS feeds unavailable: skip feed, log warning, continue with available sources

## 7. Background Jobs

For operations where AI enrichment is needed but shouldn't block creation:

1. Create the database record immediately (status: `ACTIVE` or `PROCESSING`)
2. Return success to the client with the record ID
3. Trigger AI processing asynchronously
4. AI result updates the record when complete
5. UI polls or refreshes to show updated state

This pattern applies to:
- Project creation with AI-generated phases
- Blog post generation from RSS sources
