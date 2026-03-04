# Runbook

## Quick Reference

| What | Where |
|------|-------|
| Production URL | Vercel dashboard → Project → Domains |
| Logs | Vercel dashboard → Project → Logs (Runtime) |
| Database | Vercel dashboard → Storage → Postgres |
| Cron status | Vercel dashboard → Project → Cron Jobs |
| AI usage | console.anthropic.com → Usage |
| Email logs | resend.com → Dashboard |

## Incident: AI Chat is Slow or Non-Responsive

### Symptoms
- AI project assistant shows typing dots for >25s
- Users report "AI not working" in admin dashboard
- 500 errors in Vercel logs with `[AI Chat]` prefix

### Diagnosis

1. **Check Anthropic status**: https://status.anthropic.com
2. **Check Vercel logs**: Filter by `[AI Chat]` — look for timeout or rate limit errors
3. **Check API key**: Verify `ANTHROPIC_API_KEY` is set in Vercel env vars
4. **Check usage**: console.anthropic.com → Usage → check for rate limit hits

### Resolution

| Cause | Fix |
|-------|-----|
| Anthropic API down | Wait for recovery; AI features degrade gracefully |
| Rate limited (429) | Wait 60s; consider upgrading API tier |
| API key expired/invalid | Rotate key in Anthropic console; update Vercel env var; redeploy |
| Function timeout (30s) | AI call has 25s timeout — if consistently hitting, model may be overloaded |

### Verification
- Send a test message in AI chat
- Check Vercel logs for `[AI Chat] Received response` with timing

## Incident: Create Company / Project Fails

### Symptoms
- Form shows error after submit
- Error banner includes `requestId` for log correlation

### Diagnosis

1. **Get requestId** from the error message shown to user
2. **Search Vercel logs** for that requestId
3. **Common errors**:
   - `duplicate key value violates unique constraint` → slug collision (should be auto-handled)
   - `connect ECONNREFUSED` → database connection pool exhausted
   - `Unauthorized` → session expired

### Resolution

| Cause | Fix |
|-------|-----|
| Slug collision | Bug — the slug uniqueness loop should handle this. Check code. |
| DB connection exhausted | Check Vercel Postgres connection limits; may need to scale |
| Session expired | User re-logs in; no action needed |
| Prisma client error | Run `npx prisma generate` and redeploy |

## Incident: Blog Cron Not Running

### Symptoms
- No new draft blog posts appearing
- Approval emails not being sent

### Diagnosis

1. **Check Vercel Cron Jobs tab**: Is the cron enabled? Last run time?
2. **Check logs** for cron route: Filter by `/api/cron/generate-blog`
3. **Check content sources**: Are RSS feeds returning data?

### Resolution

| Cause | Fix |
|-------|-----|
| Cron disabled | Re-enable in Vercel dashboard |
| RSS feeds down | Check `content_sources` table; update URLs if needed |
| AI generation failing | Check Anthropic API key and rate limits |
| Email not sending | Check Resend API key and domain verification |

## Incident: Deploy Breaks

### Symptoms
- Vercel build fails
- Site shows 500 errors after deploy

### Diagnosis

1. **Check Vercel build logs**: Look for the specific error
2. **Common build errors**:
   - `prisma migrate deploy` fails → migration drift
   - TypeScript errors → code issue
   - Missing env vars → check Vercel settings

### Resolution

| Cause | Fix |
|-------|-----|
| Migration drift | Run `npx prisma migrate dev` locally; commit migration files |
| Missing env var | Add to Vercel project settings; redeploy |
| Type error | Fix in code; push updated commit |
| Dependency issue | Clear Vercel build cache; `npm ci` locally to verify |

### Rollback

Vercel supports instant rollback:
1. Go to Vercel dashboard → Project → Deployments
2. Find last working deployment
3. Click "..." → "Promote to Production"

## Incident: Customer Portal Not Loading

### Symptoms
- Customer sees blank page or error at `/[company-slug]/status`
- 404 for company slug

### Diagnosis

1. Check company exists: query `companies` table for the slug
2. Check password hash is set
3. Check onboarding auth rate limiter hasn't locked out the IP

### Resolution

| Cause | Fix |
|-------|-----|
| Company slug wrong | Verify in admin → Companies list |
| Password not set | Should be auto-generated; check company record |
| Rate limited | Wait 15 minutes for IP lockout to expire |

## Where to Find Logs

### Structured Logs (Server)
- **Currently**: Only ~2 of 60+ API routes use `server-logger.ts` (company creation, AI chat)
- **Most routes**: Still use `console.log/error/warn` (being migrated)
- **Format** (where implemented): JSON with `{ timestamp, level, requestId, message, context }`
- **Search by `requestId`** to trace a full request lifecycle (only works for routes using structured logging)

### Security Logs
- Prefixed with `[SECURITY-*]`
- Include IP, user agent, event type, severity
- Critical events also logged to `console.error`

### Client Errors
- Caught by `AdminErrorBoundary` on admin pages
- Logged to browser console (consider adding external error reporting in future)
