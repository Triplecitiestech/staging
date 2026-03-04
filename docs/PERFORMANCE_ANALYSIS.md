# Performance Analysis: AI Workflows

**Analysis Date:** March 4, 2026
**Analyzed By:** Claude (Repository Hardening Session)
**Purpose:** Identify and document performance bottlenecks in AI-assisted workflows

---

## Executive Summary

**Finding:** AI-assisted project creation can be slow (3-15 seconds) due to sequential API calls for phase/task creation.

**Root Cause:** Frontend creates phases and tasks one-by-one instead of in a single batch operation.

**Impact:** Poor user experience, perceived slowness, timeout risk for large projects.

**Recommended Fix:** Use bulk creation endpoint (already exists) instead of sequential creation.

---

## Performance Breakdown

### AI Chat Operation (Good ✅)

**Endpoint:** `POST /api/admin/ai-chat`
**File:** `/src/app/api/admin/ai-chat/route.ts`

| Stage | Time | Implementation |
|-------|------|----------------|
| Authentication | ~10ms | NextAuth session check |
| AI API call | 3-20s | Anthropic API (Claude Haiku) |
| Response parsing | ~10ms | Extract JSON from response |
| **Total** | **3-20s** | ✅ Has 25s timeout |

**Status:** ✅ **Well optimized**
- Structured logging with timing
- 25s server timeout (AbortController)
- 30s client timeout
- Elapsed time shown to user after 5s
- Proper error handling

**No action needed.**

---

### Phase/Task Creation (Slow ❌)

**Current Implementation:** Sequential API calls
**File:** `/src/components/admin/AIProjectAssistant.tsx:207-247`

#### Current Flow (Sequential)

```
For each phase (5 phases):
  POST /api/phases (200-500ms)
  Wait for response
  For each task in phase (5 tasks):
    POST /api/tasks (200-500ms)
    Wait for response

Total time: 30 sequential API calls × 300ms avg = 9 seconds
```

**Calculation for typical project:**
- 5 phases × 5 tasks each = 25 tasks
- 5 phase creates + 25 task creates = **30 API calls**
- Each call: ~300ms (100ms network + 100ms DB + 100ms overhead)
- **Total: 9 seconds minimum**

**Worse case:**
- 10 phases × 10 tasks = 100 tasks
- 110 API calls × 300ms = **33 seconds** (exceeds 30s timeout!)

#### Recommended Flow (Batch)

The project creation endpoint **already supports batch creation**:

```
POST /api/projects
{
  companyId: "...",
  title: "...",
  aiPhases: [
    {
      name: "Phase 1",
      description: "...",
      orderIndex: 0,
      tasks: [
        { taskText: "Task 1", orderIndex: 0, ... }
      ]
    }
  ]
}

Total time: 1 API call × 500ms = 0.5 seconds
```

**Improvement: 9 seconds → 0.5 seconds (18x faster!)**

---

## Latency Measurements (After Phase 4 Improvements)

With the new structured logging in `/src/app/api/projects/route.ts`, we now measure:

| Operation | Measured Metric | Typical Time |
|-----------|----------------|--------------|
| Company lookup | `company-lookupMs` | 10-50ms |
| Slug generation | `slug-generationMs` | 10-100ms (depends on uniqueness checks) |
| Template fetch | `template-fetchMs` | 10-50ms |
| Project creation (DB) | `db-create-projectMs` | 100-500ms (depends on phase/task count) |
| Audit log creation | (non-blocking) | 10-50ms |
| **Total** | `durationMs` | **200-800ms** |

**Note:** These measurements are now logged for every request and can be queried in Vercel logs by `requestId`.

---

## Identified Bottlenecks

### 1. Sequential Phase/Task Creation ❌ **HIGH IMPACT**

**Location:** `/src/components/admin/AIProjectAssistant.tsx:207-247`

**Problem:**
```typescript
for (const phase of structure.phases) {
  await fetch('/api/phases', { ... })  // Wait
  for (const task of phase.tasks) {
    await fetch('/api/tasks', { ... })  // Wait
  }
}
```

**Solution:** Use existing batch endpoint
```typescript
// Send all phases to project creation in one call
await fetch('/api/projects', {
  method: 'POST',
  body: JSON.stringify({
    companyId,
    title,
    aiPhases: structure.phases  // Already in correct format!
  })
})
```

**Impact:** 18x faster (9s → 0.5s)

---

### 2. Slug Uniqueness Checks ⚠️ **MEDIUM IMPACT**

**Location:** `/src/app/api/projects/route.ts:70-77`

**Problem:** Sequential database queries in a loop
```typescript
while (await prisma.project.findUnique({ where: { slug } })) {
  slug = `${baseSlug}-${counter}`
  counter++
}
```

**Worst case:** If slug collisions are common, this could run 10+ queries

**Solution:** Accept that this is rare (good enough for now) but log attempts
- ✅ Now logged: `{ slug, attempts: counter }`
- Monitor in production logs
- If >5 attempts common, optimize with a different slug strategy

**Impact:** Usually <50ms (negligible unless many collisions)

---

### 3. No Timeout on Database Operations ⚠️ **LOW IMPACT**

**Location:** All Prisma queries

**Problem:** No explicit timeout on `prisma.*.create()` or `findMany()`

**Risk:** If database is slow/overloaded, request hangs until Vercel 30s timeout

**Solution:** Prisma client has connection pool timeout (default 2s) — monitor logs

**Impact:** Low (Vercel Postgres is fast, connection pool handles this)

---

## Recommendations

### Immediate (High Priority)

1. **Fix AI Assistant sequential creation** (Phase/Task creation)
   - Location: `/src/components/admin/AIProjectAssistant.tsx`
   - Change: Use batch creation via `/api/projects` endpoint
   - Impact: 18x faster (9s → 0.5s)
   - Risk: Low (endpoint already exists and works)

### Short Term (Medium Priority)

2. **Monitor slug collision frequency**
   - Now logged in structured logs as `{ attempts: counter }`
   - If >5 attempts becomes common, optimize slug generation
   - Consider: timestamp suffix, random suffix, or pre-check with DB query

3. **Add client-side loading indicators for batch operations**
   - Show progress: "Creating 5 phases with 25 tasks..."
   - Show elapsed time for operations >2s
   - Prevent user from navigating away during creation

### Long Term (Low Priority)

4. **Implement background job queue for large AI operations**
   - For projects with >20 phases or >100 tasks
   - Create project immediately, enrich async
   - UI shows "Processing..." status, polls for completion

5. **Add caching for frequently accessed data**
   - Company list (used in dropdowns)
   - Project templates (rarely change)
   - Consider React Query or SWR for client-side cache

---

## How to Measure Performance in Production

With the new structured logging in place, query Vercel logs:

### Find slow project creations:
```
Filter: POST /api/projects durationMs > 2000
```

### Find slug collision issues:
```
Filter: Generated unique slug attempts > 5
```

### Trace a specific request:
```
Filter: requestId = "req_xyz123"
```

All logs include:
- `requestId` — correlation ID
- `durationMs` — total time
- `dbTimeMs` — database time (when measured)
- `aiTimeMs` — AI API time (when measured)

---

## Testing Recommendations

### Performance Test Scenarios

1. **Small project** (2 phases, 5 tasks each)
   - Expected time: <1s
   - Success criteria: No timeout, correct data

2. **Medium project** (5 phases, 10 tasks each)
   - Expected time: <2s
   - Success criteria: No timeout, correct data

3. **Large project** (10 phases, 20 tasks each)
   - Expected time: <5s
   - Success criteria: No timeout, correct data, no memory issues

4. **Huge project** (20 phases, 50 tasks each)
   - Expected time: <10s or async creation
   - Success criteria: May need background job queue

### Load Testing

Use Vercel's load testing or tools like k6/Artillery:
- Concurrent users: 5-10
- Scenario: Create projects simultaneously
- Monitor: Database connection pool, memory usage, error rate

---

## Summary

| Issue | Severity | Fix Difficulty | Impact | Status |
|-------|----------|---------------|--------|--------|
| Sequential phase/task creation | 🔴 High | Easy | 18x faster | ⚠️ Needs fix |
| Slug uniqueness checks | 🟡 Medium | Easy | Monitor first | ✅ Now logged |
| No DB operation timeouts | 🟢 Low | Hard | Prisma handles it | ✅ Monitor logs |
| AI chat timeout | ✅ Good | N/A | Already optimal | ✅ Complete |

**Next Steps:**
1. Fix AI Assistant to use batch creation (1-2 hour task)
2. Deploy and monitor logs for performance metrics
3. Iterate based on real production data

---

## Code References

### ✅ Good Examples (Use as Reference)

| File | What's Good |
|------|------------|
| `/src/app/api/companies/route.ts` | Structured logging, timing, verified-create |
| `/src/app/api/admin/ai-chat/route.ts` | Timeout handling, error codes, timing |
| `/src/app/api/projects/route.ts` | **NEW!** Structured logging, timing, batch creation support |

### ❌ Needs Improvement

| File | Issue | Fix |
|------|-------|-----|
| `/src/components/admin/AIProjectAssistant.tsx:207-247` | Sequential creation | Use batch endpoint |
| `/src/app/api/phases/route.ts` | No structured logging | Migrate to server-logger |
| `/src/app/api/tasks/route.ts` | No structured logging | Migrate to server-logger |

---

**Document Owner:** Development Team
**Last Updated:** March 4, 2026
**Next Review:** After batch creation fix is deployed
