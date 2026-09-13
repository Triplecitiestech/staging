# Portal Defect Investigation — read-only root-cause pass

**Investigated:** 2026-09-13 · **Repo state:** `claude/brave-ride-eqhjhl` @ `439baf5` (identical to `main` + 2 unrelated commits) · **Scope:** read-only. No application code, schema, data or Autotask record was modified. The only file added is this one.

**Both defects have a root cause backed by file and line.** They share nothing: defect 1 is a wrong constant in the ticket read path, defect 2 is a production CHECK constraint that omits a value the application writes.

**Evidence-source note.** Autotask was read through the TCT MCP connector (read-only tools only — `autotask_ticket_notes`, `autotask_ticket_time_entries`, `autotask_entity_picklist`, `autotask_entity_capabilities`). Vercel was read through `get_runtime_errors`. The production Postgres database was **not** reachable from this session, which bounds several answers below.

---

## Defect 1 — Customer portal replies are invisible to the customer

### 1. Root cause

The customer ticket timeline keeps only notes whose Autotask `publish` value is **3**, at **`src/lib/tickets/adapters.ts:521`** (`if (note.publish !== NOTE_PUBLISH.CUSTOMER_PORTAL) continue;`), where `NOTE_PUBLISH.CUSTOMER_PORTAL = 3` is defined at **`src/types/tickets.ts:20`**. **Publish id 3 does not exist on this Autotask instance** — the live picklist is 1, 2 and 4 — so the filter discards **100% of ticket notes on every ticket for every customer**, including the customer's own portal replies (which the write path correctly stores as `publish: 1`, **`src/app/api/customer/tickets/reply/route.ts:83`**) [TOOL - autotask_entity_picklist].

A second, independent defect in the same feature means the note is also mis-attributed: the write path sends **`creatorContactID`**, which is **not a field on the `TicketNotes` entity**. The writable field is `createdByContactID`. Autotask discards the unknown key, so the note is stored with no contact attribution and Autotask stamps the read-only `creatorResourceID` with the API user — the "TCT Customer Portal" resource 29682943 [TOOL - autotask_entity_capabilities].

### 2. Evidence trail

**Read path, in call order**

| Step | Location | What it shows |
|---|---|---|
| Portal UI fetch | `src/components/onboarding/CustomerDashboard.tsx:221` | Customer ticket detail calls `GET /api/tickets/{id}/notes?perspective=customer`. This is the **only** customer ticket-note path rendered in production. |
| Route | `src/app/api/tickets/[ticketId]/notes/route.ts:86` | `handleCustomerNotes` delegates to `getCustomerTicketNotes(ticketId)`. No filtering of its own. |
| Adapter | `src/lib/tickets/adapters.ts:484-541` | Fetches notes live from Autotask, then **line 521** drops every note whose `publish !== 3`. **Line 523** then drops notes with neither creator id. |
| Constant | `src/types/tickets.ts:17-21` | `ALL_AUTOTASK_USERS: 1 // Internal — AT staff only`, `CUSTOMER_PORTAL: 3 // External — customer-visible`. Both comments are wrong for this instance. |
| Client render | `src/components/tickets/TicketDetail.tsx:29` | `const visibleNotes = notes;` — no client-side filtering. The server response is what the customer sees. |

**The instance's actual publish picklist** [TOOL - autotask_entity_picklist, entity `TicketNotes`, field `publish`, `includeInactive: true`, read 2026-09-13]:

| id | Label | isActive | isSystem |
|---|---|---|---|
| 1 | All Autotask Users | true | true |
| 2 | Internal Project Team | true | true |
| 4 | Internal & Co-Managed | true | true |

**There is no id 3, active or inactive.** The correct mapping is already documented and implemented elsewhere in this repo: `src/lib/autotask.ts:234-246` states plainly that id 1 is the customer-visible value and that no id 3 exists, and `classifyPublishVisibility()` at **`src/lib/autotask-activity.ts:71-95`** resolves visibility from the live label. `src/types/tickets.ts` contradicts both [VERIFIED - repo source].

**Ticket 35699 (T20260908.0006), the disputed ticket** [TOOL - autotask_ticket_notes, 30 notes]:

| Note id | Created (UTC) | Author fields | publish | Passes the `=== 3` filter? |
|---|---|---|---|---|
| 29895451 | 2026-09-11 13:28:46 (09:28 ET) | `creatorResourceID 29682943`, `createdByContactID null`, title *"Customer Reply from Joe Cronk"* | **1** | No |
| 29895560 | 2026-09-11 20:00:30 (16:00 ET) | same | **1** | No |
| 29894396 / 29894685 / 29895161 | 09-08, 09-09, 09-10 | `createdByContactID 30683690`, `creatorResourceID null` (email-ingested) | **1** | No |
| 29894647 (TCT reply to Joe) | 2026-09-09 13:00 | `creatorResourceID 29682939` | **1** | No |
| all workflow/system notes | — | — | 1, 2, 4 | No |

Zero of 30 notes on this ticket reach the customer's screen.

**What the customer *does* see, which is why the timeline did not look empty.** Time entries are appended with no visibility test at `src/lib/tickets/adapters.ts:544-558`; any time entry with `summaryNotes` is rendered. Ticket 35699 carries three, and their `summaryNotes` are TCT's customer-facing replies [TOOL - autotask_ticket_time_entries]:

| Time entry | Date | Resource | summaryNotes content |
|---|---|---|---|
| 13829 | 09-08 | Benjamin Miguel | "Hi Joe, Following up on the recent security alerts…" |
| 13836 | 09-08 | Kurtis Florance | "Joe, Good news first - that computer is online…" |
| 13849 | 09-09 | Kurtis Florance | "Joe, Happy to get the notification piece sorted…" |

So Joe saw a populated conversation consisting entirely of TCT's side, with **his own replies absent** — exactly the report *"I sent a reply this morning that does not appear to be showing here now."* `internalNotes` is correctly never rendered.

**One stated premise is not supported.** The brief says the customer's email replies "display correctly" in contrast to the portal replies. They do not display in the portal either — they are `publish: 1` like everything else and are discarded by the same line. What differs between the two classes is **attribution** (`createdByContactID 30683690` vs. the portal resource), not visibility. The email replies display in Autotask and in the customer's own mail thread [TOOL - autotask_ticket_notes].

**Write path**

- `src/app/api/customer/tickets/reply/route.ts:79-85` calls `createTicketNote` with `publish: 1` (correct for this instance) and `creatorContactID: autotaskContactId`.
- `src/lib/autotask.ts:2058-2092` (`createTicketNote`) forwards `creatorContactID` verbatim into the POST body at line 2075.
- Live `entityInformation` for `TicketNotes` lists **12 fields**: `createDateTime`, `createdByContactID`, `creatorResourceID`, `description`, `id`, `impersonatorCreatorResourceID`, `impersonatorUpdaterResourceID`, `lastActivityDate`, `noteType`, `publish`, `ticketID`, `title`. **`creatorContactID` is not among them.** `createdByContactID` is `isReadOnly: false`; `creatorResourceID` is `isReadOnly: true` [TOOL - autotask_entity_capabilities].
- The stored rows confirm the send was ignored: both portal notes have `createdByContactID: null` and `creatorResourceID: 29682943`.

**Same field-name bug on a third path.** `src/lib/reporting/sync.ts:715` persists `creatorContactId: note.creatorContactID ?? null` — again the non-existent field — so `ticket_notes.creatorContactId` is NULL for every synced row, contact-authored ones included. In the **staff** adapter that makes those notes `isSystem` (`src/lib/tickets/adapters.ts:316`) and they are skipped unless the "system" toggle is on, which defaults off (`src/types/tickets.ts:75-79`). `src/lib/autotask.ts:1939` and `:1973` read `n.createdByContactID ?? n.creatorContactID` correctly — the correct pattern already exists in this file.

### 3. Blast radius

**All customers, not some.** The filter is a literal comparison against a picklist id that does not exist on the instance; nothing about it is per-company, per-ticket or per-contact. Every portal user of every company with a linked `autotaskCompanyId` sees a ticket timeline containing **time entries only** and **no notes at all**. What determines exposure is only whether a company uses the portal's ticket view and whether its tickets carry time entries with `summaryNotes` — a customer whose tickets have neither sees an empty conversation instead of a half one [VERIFIED - repo source].

**Exempt:** the demo company `contoso-industries`, which short-circuits to `DEMO_TIMELINE` at `src/app/api/tickets/[ticketId]/notes/route.ts:70-74`.

**Also affected by the same constant (`src/types/tickets.ts:20`)**

| Surface | Effect |
|---|---|
| Staff ticket view, "External" toggle | `adapters.ts:249` queries `publish = 3` → the External-only view is always empty; with default visibility staff still see notes via the internal branch at `:252`. |
| Staff note labelling | `adapters.ts:320` → `isExternal` is always false, so every note renders as internal, including genuinely customer-visible ones. |
| Staff view, `publish = 4` notes | Matched by neither branch (`:249`, `:252`) → "Internal & Co-Managed" notes (e.g. Service Desk Notification rows 29894350, 29894407) are invisible to staff in every toggle state. |
| `GET /api/customer/tickets/timeline` | Carries an identical `publish !== 3` filter at `src/app/api/customer/tickets/timeline/route.ts:107`, with the same wrong mapping written out in a comment at `:100-104`. **No application code calls this route** (only two e2e specs do), but it must be fixed or deleted with the rest. |

**Since when: cannot be determined from this checkout.** The clone is shallow — `.git/shallow` is present and history is grafted at `02f175a`, 2026-07-28 — so `src/types/tickets.ts`, `adapters.ts` and both routes all report that commit as their first appearance, which is an artefact of the graft, not a date [VERIFIED - git]. The defect predates the available history. A full clone, or `git log --follow` on an unshallowed copy, settles it.

### 4. Proposed fix — described, not implemented

**No migration.** Nothing in this defect touches the schema.

1. **Correct the constant, in one place.** `src/types/tickets.ts:17-21` becomes the live mapping: 1 = customer-visible ("All Autotask Users"), 2 and 4 = internal, no 3. Rename the members so no caller keeps reading "CUSTOMER_PORTAL" as 3 — a rename makes every call site a compile error, which is the point. Fix the misleading comments at `:69-73` in the same edit.
2. **Prefer the existing classifier over a new map.** `classifyPublishVisibility()` (`src/lib/autotask-activity.ts:71-95`) already resolves visibility from the live picklist label with an id fallback and an explicit `unknown` verdict. Per the repo's reuse rule, the adapter should call it rather than a second hardcoded table. Treat `unknown` as **internal** on the customer path — fail closed; a note wrongly shown to a customer is worse than one wrongly hidden from them.
3. **Fix the write-path field name.** `creatorContactID` → `createdByContactID` in `src/app/api/customer/tickets/reply/route.ts:84` and in `createTicketNote` (`src/lib/autotask.ts:2063`, `:2074-2076`); type the dead name out of `AutotaskTicketNote` (`src/lib/autotask.ts:248`) so it cannot be reintroduced. Read the note back after creation and fail if `createdByContactID` did not stick — this repo's own rule that an accepted PATCH is not proof the value persisted.
4. **Fix the same field name in the sync** at `src/lib/reporting/sync.ts:715` (`note.createdByContactID ?? note.creatorContactID`), which restores contact attribution in the staff view. Existing `ticket_notes` rows keep NULL until a re-sync.
5. **Decide the fate of `/api/customer/tickets/timeline`.** It is unreferenced by application code. Deleting it removes a duplicate implementation of the same bug; keeping it means fixing it identically.

**Backward compatibility.** Items 1-3 are backward compatible with existing data — the notes already in Autotask become visible the moment the filter is corrected, with no rewrite of any record. Item 4 is forward-only; historical rows need a note re-sync to gain attribution.

### 5. Risk of the fix, and what needs testing

**The risk is one-directional and serious: a wrong mapping in the other direction publishes internal notes to customers.** Ticket 35699 alone contains an internal handoff note (29894704, `publish: 2`) discussing personnel matters and a contact's standing. Any change here must be verified against real `publish = 2` and `publish = 4` rows, not only against the happy path.

Testing required, in this order:

1. **Unit** — `getCustomerTicketNotes` against a fixture carrying all three live publish values plus `null` and an unknown id: exactly the `publish = 1` rows are returned; 2, 4, `null` and unknown are excluded.
2. **Unit** — staff adapter toggles: External returns the `publish = 1` set, Internal returns 2 and 4 and `null`, and no note is unreachable in every toggle combination (the current `publish = 4` hole).
3. **Live read-only** — call the corrected `getCustomerTicketNotes` against ticket 35699 and diff against the 30-note list in this document: expect the 2 portal replies, the 3 email replies and the technician notes at `publish = 1`; expect the handoff note 29894704 and all `publish = 2` / `4` rows absent.
4. **Write path** — create one note on a **throwaway internal ticket** (never a customer ticket) and read it back to confirm `createdByContactID` persists and `creatorResourceID` still shows the API user. That is a write, so it belongs to the fix pass, not this one.
5. **UI** — customer ticket detail at `sm`/`md` and `lg`+: the "Show conversation history (n more entries)" collapse at `src/components/tickets/TicketDetail.tsx:32-36` has never run against a non-trivial note count on the customer side.
6. **Regression** — `npm run build`, `npm run lint`, `npm run test:e2e`.

---

## Defect 2 — Future-dated requests never arm, and re-submission reports success

### 1. Root cause

A CHECK constraint on `hr_requests.status` in production rejects the value **`'scheduled'`**, so the `UPDATE hr_requests SET status = 'scheduled'` that arms a future-dated request fails with SQLSTATE 23514 and the row stays at `'running'` — a status the nightly cron never selects, because it selects `WHERE status = 'scheduled'` (**`src/app/api/cron/process-scheduled-offboards/route.ts:69`**). The two write sites are **`src/app/api/hr/process/route.ts:1859-1866`** (onboarding) and **`:1956-1963`** (offboarding).

**The constraint's origin is identifiable in this repo,** contrary to the earlier RCA's finding: **`migrations/add_hr_requests.sql:12-13`** declares an inline column CHECK permitting `('pending', 'running', 'completed', 'failed', 'requires_review')` — **no `'scheduled'`**. PostgreSQL auto-names an inline column check `<table>_<column>_check`, i.e. exactly `hr_requests_status_check`, which is why a search for that literal string found nothing [VERIFIED - repo source + PostgreSQL naming rule; INFERRED as to production, see §5].

### 2. Evidence trail

**The permitted values, quoted from the migration rather than inferred from code** — `migrations/add_hr_requests.sql:11-13`:

```sql
  type                  TEXT NOT NULL CHECK (type IN ('onboarding', 'offboarding')),
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'running', 'completed', 'failed', 'requires_review')),
```

This file is referenced by nothing in the repository — no script, no route, no npm task — so it was applied by hand. `requires_review` is permitted by it and is **written by no code anywhere in `src/`**; `scheduled`, which the code does write, is absent. That is the mismatch.

**The competing DDL does not carry a constraint.** `src/app/api/hr/submit/route.ts:85-108` creates `hr_requests` with a plain `status TEXT NOT NULL DEFAULT 'pending'` and is wrapped in `CREATE TABLE IF NOT EXISTS`, so it is a no-op against the existing table and cannot have installed or removed the check. `prisma/schema.prisma` models the column as a plain `String @default("pending")` — Prisma does not express the constraint at all.

**The production failure itself** is recorded in the prior RCA (`docs/incidents/2026-09-03-tribros-scheduled-deletion-rca.md` §1e) from Vercel aggregated runtime errors: `new row for relation "hr_requests" violates check constraint "hr_requests_status_check"`, code `23514`, at **2026-09-01T16:52:14Z**, request `94520e10-916c-422e-a8f7-0324929773b3`, `ecospect-287`, `offboarding`, target `amckinney@ecospect.com`, ticket 35513. The same error group's first occurrence is **2026-07-28T14:59:21Z** [TOOL - Vercel runtime errors, as recorded in the RCA; the 7-day retention window no longer reaches these events].

**State machine, as it stands today**

| Transition | Location | Notes |
|---|---|---|
| insert `pending` | `src/app/api/hr/submit/route.ts:226-230` | |
| `→ running` | `src/app/api/hr/process/route.ts:741` | |
| `→ scheduled` (onboarding) | `:1859-1866`, inside a `try` | account was created with `accountEnabled: false` first |
| `→ scheduled` (offboarding) | `:1956-1963`, inside a `try` | a customer-visible "is scheduled to take effect on …" note has **already** been posted at `:1941-1945` |
| `→ failed` | `:760`, `:977`, `:1886`, `:1971`, `:2390` | |
| `→ completed` | end of pipeline | |
| cron selector | `src/app/api/cron/process-scheduled-offboards/route.ts:67-71` | `WHERE status = 'scheduled'`, then filters `last_day` / `start_date` against today (ET) |
| deletion selector | `:218-224` | additionally requires `status = 'completed'` |

**Why re-submission reported success — two distinct mechanisms, one of which is still live**

- **Mechanism A — the re-process guard (fixed in code on 2026-09-04).** Re-POSTing `/api/hr/process` with the same `requestId` hit a guard that returned **HTTP 200** `{ message: "Request already in state: running" }` for a `running` row. A wedged row is indistinguishable from a run genuinely in flight, so every retry answered 200 and did nothing. Current code returns **409** with a `wedgedHint` (`src/app/api/hr/process/route.ts:713-727`); `completed` still returns 200, which is genuine idempotency (`:708-712`).
- **Mechanism B — the submit path, still live today.** `/api/hr/submit` kicks off processing **fire-and-forget** at `src/app/api/hr/submit/route.ts:288-297`: the `fetch` to `/api/hr/process` has only a `.catch` for network failure, the HTTP status is never inspected, and the route returns **202 `{ message: 'Request submitted successfully' }`** at `:300-303` regardless. So a customer re-submitting **through the portal** is still told the request succeeded no matter what the pipeline did — the 409 is invisible to them. A portal re-submission more than 2 minutes later also does not re-drive the stuck row at all: the idempotency key includes a 2-minute time slot (`:175-190`), so it inserts a **new** `hr_requests` row and runs a second pipeline, leaving the original wedged row untouched.

**What has already been fixed in code, and what has not**

| Item | Status |
|---|---|
| Constraint repair — drop and re-add `hr_requests_status_check` permitting `('pending','running','scheduled','completed','failed')` | **Code present** at `src/app/api/migrations/run/route.ts:873-930`, merged to `main` 2026-09-05 05:07 -0400 (PR #206, commit `deb0339`). **Takes effect only when an operator POSTs `/api/migrations/run`. Whether that has happened cannot be determined from this session.** |
| `'scheduled'` write fails loudly — sets `failed`, posts an "ACTION REQUIRED — Scheduled … Could Not Be Armed" ticket note, and for offboarding escalates the ticket to Critical and returns 500 | **Code present**, `src/app/api/hr/process/route.ts:1874-1901` and `:1964-2004` |
| Re-process guard returns 409 for `running` | **Code present**, `:713-727` |
| Read-only admin view of stuck requests | **Code present**, `GET /api/admin/hr/pending-actions` + `/admin/hr/pending` |
| Rows already wedged at `running` | **Not fixed.** Repairing the constraint does not move them; they remain invisible to the cron and refused by the process route. |
| `/api/hr/submit` reporting 202 regardless of pipeline outcome | **Not fixed** (Mechanism B above) |

### 3. Blast radius

**Every future-dated onboarding and offboarding, all customers, since at least 2026-07-28** — the first occurrence timestamp of the 23514 error group. The commit message for `deb0339` records the correlation as **11 of 11 future-dated requests from 2026-04-30 onward** [VERIFIED - repo, commit `deb0339`; the underlying enumeration is the RCA's, not re-derived here].

Consequences differ by request type:

- **Onboarding** — the M365 account is created with sign-in blocked (`src/app/api/hr/process/route.ts:1142`, `:1167`) and nothing ever unblocks it. Technicians unblocked these by hand when clients phoned.
- **Offboarding** — no action runs on the last working day, while a **customer-visible** note has already promised it will (`:1941-1945`). EcoSpect / amckinney@ecospect.com is that case: a technician did the work manually, so the customer never saw the failure.
- **Scheduled 30-day deletions** are not armed by this defect (they key off `scheduled_deletion_date` with `status = 'completed'`), but a wedged row that is later forced to `completed` would arm one.

**Is any other future-dated request currently stuck, and how many? Could not be determined from this session.** The authoritative answer is a single query against production Postgres, which is not reachable here, and `/admin/hr/pending` requires a staff browser session that this session does not hold. Two ways to settle it:

- Open **https://www.triplecitiestech.com/admin/hr/pending** (staff login) — it lists exactly these rows and distinguishes a query error from "nothing pending".
- Or run, SELECT-only, against `DATABASE_URL`:

```sql
SELECT id, type, status, company_slug, target_upn, autotask_ticket_number,
       answers->>'last_day'   AS last_day,
       answers->>'start_date' AS start_date,
       started_at, created_at
FROM hr_requests
WHERE status NOT IN ('completed', 'failed')
ORDER BY created_at DESC;
```

Rows at `running` with a populated `started_at` and a null `completed_at` are the wedged ones. For an onboarding, each one is also an M365 account still sign-in-blocked — check those UPNs in the tenant directly.

**Negative evidence, and its limit.** No SQLSTATE 23514 error appears on `/api/hr/process` in the last 7 days [TOOL - Vercel get_runtime_errors, project `staging`, 2026-09-06 → 09-13]. That is **not** evidence the constraint was repaired: it is equally consistent with no future-dated request having been submitted in that window. The two cannot be distinguished without the constraint definition or the migration-route output.

### 4. Proposed fix — described, not implemented

**It needs a migration, and the repair is already written.** The remaining work is operational plus three code gaps.

1. **Read the constraint before changing it** — the one query that turns the inference in §1 into a fact:

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'hr_requests'::regclass;
```

2. **Apply the existing repair** — `POST https://www.triplecitiestech.com/api/migrations/run` with the `MIGRATION_SECRET`. The block at `src/app/api/migrations/run/route.ts:895-929` pre-flights for rows holding values outside the new list and **reports instead of forcing**, then drops and re-adds the constraint. Read the returned `results` array: `✅ hr_requests_status_check…` means applied, `⚠️ … NOT applied — existing rows hold values outside the allowed list` means stop and look at those rows.
3. **Close the `requires_review` gap.** The repair's list is `('pending','running','scheduled','completed','failed')` and **drops `requires_review`**, which the original migration permitted. No code writes it, so the expected impact is nil — but if any production row holds it, the pre-flight refuses to apply the repair and the operator will see the warning rather than a fix. Decide deliberately: either add `requires_review` to the list, or confirm zero rows hold it first. Keep the list in sync with `KNOWN_STATUSES` (`src/lib/hr/pending-actions.ts:42-48`), as the comment at `:887-889` already requires.
4. **Unwedge the existing rows — a separate, human-approved data change.** Do it only after §3's count is known, per row, with the M365 state of each subject checked first. There is deliberately no cancel/retry/re-arm verb in the codebase and this pass does not propose adding one.
5. **Fix the still-live silent success** at `src/app/api/hr/submit/route.ts:288-303`: inspect the `/api/hr/process` response status and stop returning an unconditional success message to the submitter. The honest 202 is "received"; it must not read as "provisioned".
6. **Consider an alignment check.** `migrations/add_hr_requests.sql` still declares the old list and is the likely origin of the production constraint. Either bring it in line with `KNOWN_STATUSES` or retire it, so re-applying it on a fresh environment cannot recreate this outage.

**Backward compatibility with rows already in a bad state:** the constraint repair is compatible — it widens the permitted set, validates existing rows on `ADD` and fails loudly rather than silently if any row is outside it. But it is **not curative**: a row wedged at `running` stays wedged and stays invisible to the cron. Items 2 and 4 are separate operations and must not be conflated.

### 5. Risk of the fix, and what needs testing

**The principal risk is treating the migration as the whole fix.** Applying it stops *new* future-dated requests from wedging; it does nothing for the ones already stuck, and an offboarding still promised in writing to a customer remains unexecuted. Second risk: `DROP CONSTRAINT IF EXISTS` followed by `ADD` leaves a brief window with no constraint, and if the `ADD` fails the column is left unenforced — the route's `try/catch` at `:929` reports but does not restore. Third: the repair asserts a permitted-value list built from what the code writes today; a value added later without updating both `KNOWN_STATUSES` and the migration route reproduces this exact defect.

Testing required:

1. **Before** — capture `pg_get_constraintdef` and `SELECT status, COUNT(*) FROM hr_requests GROUP BY status`, so the change is reversible and the `requires_review` question is answered with data.
2. **After** — re-run `pg_get_constraintdef` and confirm it lists `scheduled`.
3. **End-to-end, on a non-production customer or a disposable test contact** — submit one future-dated onboarding and one future-dated offboarding; confirm the row reaches `status = 'scheduled'`, that the cron's selector picks it up on the due date, and that the onboarding account is actually unblocked. A dated log line is not enough; check the tenant.
4. **Failure path** — force the `'scheduled'` write to fail (e.g. against a test database with the old constraint) and confirm the row lands at `failed`, the "ACTION REQUIRED" note posts, the offboarding ticket goes Critical and the route returns 500.
5. **Re-drive** — POST `/api/hr/process` with a `running` requestId and confirm 409, and separately confirm that a portal re-submission after item 5 no longer reports plain success.
6. **Regression** — `npm run build`, `npm run lint`, `npm run test:e2e`, plus the 24 existing tests in `src/lib/hr/pending-actions` (which include a reproduction of the live EcoSpect row).

---

## Could not be determined, and the access that would settle it

| Question | Why it is open | What settles it |
|---|---|---|
| The **actual** definition of `hr_requests_status_check` in production | The production database is not reachable from this session. `migrations/add_hr_requests.sql:12-13` is a strong, code-backed candidate for its content and explains its auto-generated name, but that is an inference, not a read. | `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'hr_requests'::regclass;` against `DATABASE_URL` |
| Whether the constraint repair has been applied to production | Applying it is a manual `POST /api/migrations/run`; nothing in the repo records that it ran. Absence of 23514 errors in the 7-day Vercel window is consistent with both outcomes. | The query above, or the `results` array from a fresh `POST /api/migrations/run` |
| How many requests are **currently** wedged, and which | Same lack of database access; `/admin/hr/pending` needs a staff browser session. | https://www.triplecitiestech.com/admin/hr/pending, or the SELECT in Defect 2 §3 |
| When the `publish = 3` filter was introduced | This checkout is a shallow clone grafted at 2026-07-28 (`.git/shallow`), so every affected file falsely reports that date as its first commit. | A full clone, or `git log --follow` on an unshallowed copy |
| Whether Autotask accepts `createdByContactID` on create and whether a note so attributed renders as the contact | `entityInformation` says the field is writable, which is a question, not a verdict — this repo has been wrong in both directions on read-only flags before. No write was made, as required by this pass. | One create + read-back on a throwaway internal ticket, during the fix pass |
| Whether any customer other than EcoSpect noticed the missing portal replies | Portal usage is not instrumented in a way this session can read; `connector_tool_calls` covers MCP calls, not portal page views. | Vercel request logs for `/api/tickets/*/notes?perspective=customer`, or asking the affected contacts |

## Unrelated problems found in passing — listed, not touched

1. **`[hr/process] Time entry failed (non-fatal): Autotask time entry failed (500): {"errors":["API-only user cannot be selected for this field."]}`** — still occurring, most recently **2026-09-11T14:55:34Z** [TOOL - Vercel get_runtime_errors]. The HR pipeline cannot log its own time entry; it is swallowed as non-fatal. Per the repo's own rule, a 500 with a structured `errors[]` body is a request rejection, not an outage, so this will never succeed on retry.
2. **`GET /api/customer/tickets/timeline`** is dead application code — referenced only by two e2e specs — and duplicates `getCustomerTicketNotes`, including its defect.
3. **Customer time-entry visibility is untested.** `src/lib/tickets/adapters.ts:544-558` renders every time entry with `summaryNotes` to the customer with no visibility check. That is defensible — `TimeEntries` exposes no publish field at all (`timeEntryVisibility()`, `src/lib/autotask-activity.ts:105-111`) and `summaryNotes` is the customer-facing half by convention — but it is a convention, not an enforced boundary, and `showOnInvoice: false` entries are included.
4. **`migrations/add_hr_requests.sql` is orphaned** — no script or route applies it, yet it is the likely source of a live production constraint. Any other hand-applied file in `migrations/` carries the same risk.
