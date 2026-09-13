# Contractor Portal (`/field`) — architecture

Phase 1 ships the Field Playbook behind invite-managed email-code login for
low-voltage subcontractors who have no TCT account. Phases 2 and 3 attach to
tables that already exist; they add UI and one Autotask call, not structure.

## Pieces

| Layer | Where | Notes |
|---|---|---|
| Content | `content/field/playbook.html` | Served byte-for-byte by `GET /field/playbook`. Never edited by code. Carried into the serverless bundle by `outputFileTracingIncludes` in `next.config.js`. |
| Schema | `src/lib/field/schema.ts` | `FIELD_SCHEMA_STATEMENTS`, run by `POST /api/migrations/run`. Idempotent. RLS on, no policies. |
| Data access | `src/lib/field/store.ts` | Raw pg via the shared `getPool()`. Only server code touches the tables. Never receives a plaintext code or session token. |
| Login flow | `src/lib/field/login.ts`, `email.ts`, `tokens.ts` | Request → hash + store 6-digit code (10 min) → deliver. Verify → constant-time compare, 5 attempts, session mint. |
| Session | `src/lib/field/session.ts` (Node), `src/lib/field/edge.ts` + `src/middleware.ts` (Edge) | Cookie `field_session` = 32 random bytes hex; DB stores SHA-256. 30 days. `last_seen_at` touched at most every 10 min. |
| Contractor routes | `src/app/field/{page,layout}.tsx`, `login/`, `login/code/`, `logout/route.ts`, `playbook/route.ts` | Plain white, mobile-first. No site chrome. |
| Contractor APIs | `src/app/api/field/login/{request,verify}/route.ts` | Unauthenticated. Identical response for unknown emails. Per-IP 10/hour. 1 s delay per verify. |
| Staff routes | `src/app/field/admin/page.tsx`, `src/app/api/field/admin/contractors/…` | NextAuth (Entra) staff session, same as `/admin`. |
| UI | `src/components/field/*` | Login forms, admin panel. |

## Why the session check is split across two runtimes

`src/middleware.ts` runs on the Edge runtime, where `pg` is not available. The
middleware therefore does what it can without a database — sets
`X-Robots-Tag: noindex, nofollow` and `Cache-Control: private, no-store` on
every `/field/*` response, allows same-origin framing for `/field/playbook`
only, and 302s to `/field/login` when the cookie is absent or not 64 hex chars.
The hash lookup, expiry, contractor-active check and `last_seen_at` throttle
run in `resolveFieldSession()` (Node) on every protected page and route
handler. Both halves must stay: the middleware is the cheap gate, the Node
guard is the real one.

`/field/admin` is exempt from the contractor gate because it is a STAFF page.

## Tables

```
field_contractors ──< field_login_codes
                  ──< field_sessions
                  ──< field_jobs ──< field_job_notes
field_audit_log   (append-only; actor_type staff | contractor | system)
```

`field_jobs` and `field_job_notes` exist with zero rows and no UI.

## Phase 2 — job packets

A job packet is one `field_jobs` row: customer, point of contact, scope,
scheduled date, optional Autotask company/ticket ids, `status` (`draft` →
`assigned` → `in_progress` → `complete`, or whatever the phase decides; the
column is free text with default `draft` so the state machine is not fixed
today).

Attach points:

1. **Staff create/assign** — extend `/field/admin` (or add `/field/admin/jobs`)
   and `src/app/api/field/admin/jobs/…`. Company/ticket ids come from the
   existing Autotask client (`src/lib/autotask.ts`); no second client.
2. **Contractor view** — add a "Jobs" tab beside "Playbook" in
   `src/app/field/page.tsx` (or a `src/app/field/jobs/page.tsx` route under the
   same layout). Query `field_jobs WHERE contractor_id = session.contractorId`.
   The session context already carries `contractorId`.
3. **Audit** — add events to `FieldAuditEvent` in `store.ts`
   (`job_created`, `job_assigned`, `job_viewed`).

Nothing in phase 1 reads `field_jobs`, so no phase-1 code changes.

## Phase 3 — contractor notes → Autotask

A note is one `field_job_notes` row written by the contractor from the job
view; `photos` is a JSONB array of stored-file references (SharePoint/OneDrive
via the existing Graph plumbing, or Autotask attachments — decide then; the
column holds references, never bytes).

Posting to Autotask is a separate step from saving the row:

1. Save the note (`posted_to_autotask_at IS NULL`).
2. Post it to the job's `autotask_ticket_id` through the existing ticket-note
   path used by the connector (`autotask_add_customer_note` / internal-note
   equivalents in `src/lib/autotask-write.ts`), then stamp
   `posted_to_autotask_at` and `autotask_note_id` from the read-back.
3. A row with a null `posted_to_autotask_at` is a retry candidate for a small
   cron, so a failed Autotask call never loses the note.

Contractors have no Autotask identity, so the note is posted by the platform
and attributed in its body (`Field note from <contractor name>`), never by
impersonation.

## Security invariants to keep

- No plaintext code or session token is ever stored. `code_ciphertext` is
  AES-256-GCM under the existing `ENCRYPTION_MASTER_KEY_V1` (`src/lib/crypto.ts`)
  so staff can read a code back on `/field/admin`; it is `NULL` when no key is
  configured.
- The visible response to `/api/field/login/request` is identical for enrolled
  and unknown emails.
- `field_audit_log` is written for invite, deactivate/reactivate, code request,
  code issue, delivery result, login success/failure, lockout, logout and
  playbook view. `meta` holds hashes/ids/outcomes, never a code or token.
- Every `/field/*` response is `noindex, nofollow` + `private, no-store`.
  `/field` is in `robots.ts` disallow and absent from `sitemap.ts` and
  `NAVIGATION`. Do not add it to either.
- No env var holds a contractor or a code.
