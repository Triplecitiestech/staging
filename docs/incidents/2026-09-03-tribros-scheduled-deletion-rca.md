# RCA — Scheduled M365 account deletion executed on a reinstated user

**Incident date:** 2026-09-03 · **Client:** Tri-Bros Transportation (Autotask company 398) · **Subject:** MLinero@shiptribros.com
**Author:** Phase 1 investigation, 2026-09-04 · **Status:** investigation complete, design proposed, NOT implemented

> Scope note: the timeline of the incident itself was established from Autotask and Entra before this
> investigation began and is not re-litigated here. This document establishes the *code* behaviour
> behind it, enumerates what else is exposed, and proposes a fix.

---

## 1 · Pending destructive actions

**Read this section first. It is the only time-critical part of this document.**

### 1a · What could and could not be enumerated

The authoritative record of a pending scheduled deletion is a single column —
**`hr_requests.scheduled_deletion_date`** — in the application's production Postgres database.
**That database is not reachable from this session.** The Supabase project offered as the probable
backing store (`oozkmimrijczjnwvohix`) was checked and **disconfirmed**: it contains 43 tables, none of
them `hr_requests` (tool: `mcp__Supabase__list_tables`, 2026-09-04). No other tool in this session can
execute SQL against the production database, and the connection strings are Vercel environment
variables (**`DATABASE_URL`**, **`PRISMA_DATABASE_URL`**) that this session cannot read.

The enumeration below is therefore **indirect** — reconstructed from the Autotask artefacts the pipeline
emits — and is **not a substitute for the query in §1d**. Its known blind spots are listed in §1c.

### 1b · Enumeration from Autotask

Every portal-generated offboarding is titled `[OFFBOARDING] Employee Termination: <name>`
(**`src/app/api/hr/process/route.ts:531-541`**, `buildTicketTitle`) and carries the submitted form in its
ticket description, including a **`Data Handling:`** line. A deletion is scheduled if and only if that
value is in **`DELETE_AFTER_HOLD_VALUES`** (**`src/lib/hr/offboarding-actions.ts:101`**). All tickets with
activity between 2026-07-01 and 2026-09-04 were retrieved (`autotask_search_tickets`, 841 rows,
`truncated: false`) and every offboarding among them was read individually.

| Tenant (AT company) | Target UPN | ObjectId | Action | Scheduled date | Contradicting signal | Source ticket | State |
|---|---|---|---|---|---|---|---|
| Tri-Bros Transportation (398) | MLinero@shiptribros.com | Not determinable | `DELETE /users` | 2026-09-03 | **Yes** — 3 (client email 08-07, portal onboarding 08-10, manual re-enable 08-10) | [35000](https://ww14.autotask.net/Mvc/ServiceDesk/TicketDetail.mvc?TicketId=35000) | **Executed 2026-09-03** — the incident. Not pending. |
| Southern Tier Women's Health (322) | LLamuraglia@stwhs.com | Not determinable | `DELETE /users` | 2026-08-05 | No — none found | [34641](https://ww14.autotask.net/Mvc/ServiceDesk/TicketDetail.mvc?TicketId=34641) | **Executed 2026-08-05** — second, previously unreported firing of the same path. Not pending. |
| Dan Brown Construction (394) | CLabar@danbrownconstruction.com | Not determinable | None — `keep_accessible` | n/a | n/a | [35201](https://ww14.autotask.net/Mvc/ServiceDesk/TicketDetail.mvc?TicketId=35201) | No deletion scheduled |
| Dan Brown Construction (394) | scott@danbrownconstruction.com | Not determinable | None — `forward_to_specific` | n/a | n/a | [34723](https://ww14.autotask.net/Mvc/ServiceDesk/TicketDetail.mvc?TicketId=34723) | No deletion scheduled |
| EcoSpect (287) | amckinney@ecospect.com | **`null`** | Scheduled **offboarding** (disable, remove groups, forward mail) | **2026-09-04 — today** | **Yes** — see §1e | [35513](https://ww14.autotask.net/Mvc/ServiceDesk/TicketDetail.mvc?TicketId=35513) | **Pending, and structurally unable to execute** — §1e |
| Brooms Over Broome (181) | britney@broomsoverbroome.com | Not determinable | Unknown — ticket has no portal form block | n/a | n/a | [34718](https://ww14.autotask.net/Mvc/ServiceDesk/TicketDetail.mvc?TicketId=34718) | Cannot be determined |

**No pending account deletion was identified.** Both deletions the code ever scheduled in this window
have already fired. The stop-and-escalate condition (a pending deletion within 7 days, or a pending
deletion with a contradicting signal) is therefore **not met on the evidence available** — but see §1c
before treating that as a clean bill of health.

### 1c · Why §1b is not proof of zero

Four ways a pending deletion can exist and leave no Autotask trace:

| Blind spot | Mechanism | Source |
|---|---|---|
| Note write failed | The "Account Deletion Scheduled" note is posted inside a `try {} catch {}` whose entire body is the comment `// Non-fatal`. The deletion stays scheduled; the ticket says nothing. | **`src/app/api/hr/process/route.ts:2629-2641`** |
| No ticket at all | `addTicketNote` returns immediately if `ticketId` is falsy. A request whose Autotask ticket creation failed schedules its deletion silently. | **`src/app/api/hr/process/route.ts:1068-1069`** |
| Request never reached `completed` | The deletion query also requires `status = 'completed'`. A row stuck in another status keeps its `scheduled_deletion_date` set but dormant — and will fire the moment anything sets it to `completed`. | **`src/app/api/cron/process-scheduled-offboards/route.ts:221`** |
| Past-dated and failing | The date is cleared only after a *successful* delete. A deletion failing every night keeps retrying indefinitely and posts nothing. | **`src/app/api/cron/process-scheduled-offboards/route.ts:246-255`** |

### 1d · The query a human must run

Run against the production database (`DATABASE_URL`). **SELECT only.**

```sql
SELECT r.id,
       r.company_slug,
       r.target_upn,
       r.target_user_id            AS entra_object_id,
       r.status,
       r.scheduled_deletion_date,
       r.autotask_ticket_id,
       r.autotask_ticket_number,
       r.submitted_by_email,
       r.impersonated_by_email,
       r.created_at,
       r.completed_at
FROM hr_requests r
WHERE r.scheduled_deletion_date IS NOT NULL
ORDER BY r.scheduled_deletion_date ASC;
```

Then, for every row returned, the contradicting-signal check — a later lifecycle request for the same
subject in the same tenant:

```sql
SELECT r.id, r.type, r.status, r.target_upn, r.target_user_id, r.created_at,
       r.autotask_ticket_number
FROM hr_requests r
WHERE r.company_slug = $1                      -- from the row above
  AND (LOWER(r.target_upn) = LOWER($2)         -- target_upn from the row above
       OR r.target_user_id = $3)               -- target_user_id from the row above
ORDER BY r.created_at ASC;
```

A second row of type `onboarding` created **after** the offboarding is the machine-readable
contradiction the system currently ignores. Note this query cannot catch a re-onboarding whose
`POST /users` failed, because that path never persists `target_upn` — see §4, item 4.

### 1e · Separate live finding — EcoSpect scheduled offboarding, today

Not a deletion, so it does not trip the stop rule, but it is live and it is today.

- Ticket [35513](https://ww14.autotask.net/Mvc/ServiceDesk/TicketDetail.mvc?TicketId=35513) (EcoSpect, company 287) requests offboarding of **amckinney@ecospect.com** with `Last Day: 2026-09-04`, `Data Handling: Forward Email to Manager`.
- The portal posted a **customer-visible** note: *"is scheduled to take effect on Friday, September 4, 2026"* (note 29893384, 2026-09-01), and a TCT technician told the client on 2026-09-02: *"the system is set to disable her account at 12:01 AM EST on 9/4. This ticket will auto-update once complete."* (note 29893481).
- **The status write that arms the schedule was rejected by the database.** Vercel aggregated runtime errors (`get_runtime_errors`, route `/api/hr/process`) record `error: new row for relation "hr_requests" violates check constraint "hr_requests_status_check"`, code `23514`, at **2026-09-01T16:52:14Z**. The error's `detail` names the failing row: request `94520e10-916c-422e-a8f7-0324929773b3`, `ecospect-287`, `offboarding`, `scheduled`, `jderedita@ecospect.com`, `{"last_day": "2026-09-04", ...}`, ticket `35513`, `amckinney@ecospect.com`, `target_user_id = null`.
- The rejected statement is **`UPDATE hr_requests SET status = 'scheduled'`** at **`src/app/api/hr/process/route.ts:1886-1891`**. The cron selects on **`WHERE status = 'scheduled'`** (**`src/app/api/cron/process-scheduled-offboards/route.ts:69`**), so the row cannot match.
- Corroboration: ticket 35513's `lastActivityDate` is **2026-09-03T21:19:39Z**. The cron ran at 05:01 UTC on 2026-09-04 (schedule `1 5 * * *`, **`vercel.json`** crons block). No execution note exists. The ticket was also set to Complete on 2026-09-03T21:04.
- The constraint **`hr_requests_status_check` is defined nowhere in this repository** — not in the table DDL (**`src/app/api/hr/submit/route.ts:85-108`**, plain `status TEXT NOT NULL DEFAULT 'pending'`), not in **`prisma/schema.prisma:1380`** (plain `String @default("pending")`), and not in **`/api/migrations/run`**. It is a production-only artefact whose allowed-value list excludes `scheduled`.
- The same error group's `first` timestamp is **2026-07-28T14:59:21Z**, which matches ticket [34870](https://ww14.autotask.net/Mvc/ServiceDesk/TicketDetail.mvc?TicketId=34870) `[ONBOARDING] New Employee: Joanna Penny` (created 2026-07-28T14:59:23Z). The same `'scheduled'` write exists on the future-dated **onboarding** path at **`src/app/api/hr/process/route.ts:1822-1830`**, where the account is created with `accountEnabled: false` first (**`:1142`**, **`:1167`**). A future-dated onboarding that hits this constraint therefore leaves a **permanently locked** account no cron will ever unlock.

**Action needed today:** revoke Audrey McKinney's access manually at the client's stated cutoff. Do not rely on the automation. How many other future-dated requests are affected cannot be determined from the aggregated error view — the query in §1d, widened to `status`, would settle it.

---

## 2 · Summary

A scheduled 30-day account deletion is stored as one date column on the originating offboarding
request row and executed by a nightly cron that reads that column and calls Graph `DELETE /users`
with no live check of the account's state. Nothing in the system links a later lifecycle request to an
earlier pending action against the same subject, so three contradicting signals — a client email, a
portal onboarding request for the identical UPN, and a manual admin re-enable — could not and did not
reach the pending deletion. The onboarding request that would have been the decisive signal received
Graph's `ObjectConflict` on the exact UPN and discarded it into an internal note, because the
`catch` block stringifies the error and never inspects its code. There is no cancellation path of any
kind, despite a customer-visible note telling the client one exists. The terminal deletion notified
nobody: an internal-only note on a ticket closed 30 days earlier, deliberately without a status
change, which suppresses every Autotask notification Event.

---

## 3 · Execution path — how a scheduled deletion actually runs

**Schedule leg** — offboarding, at request-processing time:

| # | Step | Location |
|---|---|---|
| 1 | Client contact submits the offboarding form. Authorization is `customerRole = 'CLIENT_MANAGER'` **or** `isPrimary` on `company_contacts`, matched on the `submittedByEmail` in the request body. | **`src/app/api/hr/submit/route.ts:143-173`** |
| 2 | Row inserted into **`hr_requests`** (table created by the request handler itself, not by the migrations route). | **`src/app/api/hr/submit/route.ts:85-113`**, **`:226-230`** |
| 3 | `/api/hr/process` runs the offboarding pipeline: revoke sessions, disable, remove groups, licences. | **`src/app/api/hr/process/route.ts:1857`** onward |
| 4 | Subject's Entra **objectId** is resolved via `getUserByEmail(...).id` and persisted to `target_user_id`. | **`src/lib/graph.ts:648-657`**; **`src/app/api/hr/process/route.ts:1972-1977`** |
| 5 | If `data_handling ∈ DELETE_AFTER_HOLD_VALUES` and `primaryActionSucceeded`, compute `today + 30` and write it to **`hr_requests.scheduled_deletion_date`**. | **`src/app/api/hr/process/route.ts:2604-2627`** |
| 6 | Post a **customer-visible** (`publish: 1`) note naming the deletion date and telling the client to "update the HR request" to cancel. | **`src/app/api/hr/process/route.ts:2629-2637`** |

**Execute leg** — nightly:

| # | Step | Location |
|---|---|---|
| 7 | Vercel Cron `GET /api/cron/process-scheduled-offboards`, schedule `1 5 * * *` (05:01 UTC). Auth is the `Authorization: Bearer $CRON_SECRET` header — **skipped entirely if `CRON_SECRET` is unset**. | **`vercel.json`** crons; **`src/app/api/cron/process-scheduled-offboards/route.ts:34-42`** |
| 8 | `ALTER TABLE hr_requests ADD COLUMN IF NOT EXISTS scheduled_deletion_date DATE` — a DDL statement on every run, errors swallowed. | **`src/app/api/cron/process-scheduled-offboards/route.ts:204`** |
| 9 | `SELECT ... WHERE scheduled_deletion_date IS NOT NULL AND scheduled_deletion_date <= today AND status = 'completed' AND target_user_id IS NOT NULL`. | **`src/app/api/cron/process-scheduled-offboards/route.ts:206-225`** |
| 10 | Null-check `target_user_id` / `company_slug`; load tenant credentials. **No Graph read.** | **`:229-238`** |
| 11 | **`await graph.deleteUser(req.target_user_id)`** → `DELETE /users/{objectId}`, app-only token. | **`:246`**; **`src/lib/graph.ts:614-619`** |
| 12 | `UPDATE hr_requests SET scheduled_deletion_date = NULL`. | **`:249-255`** |
| 13 | Internal-only (`publish: 2`) note to the **original** ticket, with the explicit comment "Do NOT change ticket status". | **`:259-281`** |
| 14 | `hr_audit_logs` row with `actor = 'system'`. | **`:284-304`** |

Steps 9-14 are wrapped in a `try` whose `catch` only `console.warn`s and is labelled `(non-fatal)`
(**`:313-315`**), so a throw anywhere in the deletion block still returns HTTP 200 with no failure
surfaced.

---

## 4 · Findings

| # | Item | Finding | Source | Confidence |
|---|---|---|---|---|
| 1 | Pending destructive actions | No pending deletion evidenced; both scheduled deletions in the window already fired (Tri-Bros 09-03, STWHS 08-05). Authoritative enumeration impossible without DB access. One pending **offboarding** for today that cannot execute. | §1 | Verified for what Autotask shows; **cannot be determined** authoritatively |
| 2 | Scheduling mechanism | Column `hr_requests.scheduled_deletion_date DATE` on the originating request row; nightly Vercel Cron at 05:01 UTC; handler calls `graph.deleteUser`. **The Graph call is keyed on `target_user_id` — the Entra objectId — which is the correct key.** The *state*, however, is a column on a one-shot request row, not a per-subject record; and `target_upn` is stored beside it and never reconciled. No index on the column. | §3; **`cron/process-scheduled-offboards/route.ts:206-246`**; **`hr/submit/route.ts:113`** | Verified |
| 3 | Cancellation path | **None exists.** `hr_requests` is written by exactly two files — `/api/hr/process` and the cron. `/api/hr/requests/[id]/route.ts` exports **only `GET`** (180 lines). `/admin/hr/flow/page.tsx` is a static `'use client'` diagram with no `fetch`. No admin UI, no API, no client UI can cancel or reschedule. The customer-visible instruction *"update the HR request before the scheduled date"* (**`hr/process/route.ts:2635`**) corresponds to nothing that exists. | `grep 'UPDATE hr_requests'`; **`hr/requests/[id]/route.ts:16`**; **`admin/hr/flow/page.tsx:1`** | Verified |
| 4 | The swallowed conflict | `graph.createUser` is wrapped in a bare `catch (err)` that stringifies `err.message`, calls `logStep(... 'failed' ...)`, pushes `create_user` to `failedSteps`, and posts the internal note **"M365 User Creation Failed"**. **The error code is never inspected** — `ObjectConflict` is indistinguishable from a network timeout. Because `primaryActionSucceeded` stays false and `newUserId` stays null, licence assignment is skipped too (**`:1195`**), and `target_upn` is never persisted for onboarding (that write is at **`:1181-1184`**, inside the success branch). The same file *does* special-case `already exist` — but for permission grants, at **`:1329`**. | **`src/app/api/hr/process/route.ts:1187-1192`** | Verified |
| 5 | Precondition verification | **None on the deletion path.** Between the SQL select (**`:206-225`**) and `graph.deleteUser` (**`:246`**) the only code is a null-check and a credential load. No `accountEnabled`, no `assignedLicenses`, no `signInActivity`, no `memberOf` read. Two things make this a gap rather than a design constraint: `getUserByEmail` already `$select`s `accountEnabled` (**`src/lib/graph.ts:653`**), so the field sits in a response shape the codebase already parses and discards; and **the codebase already implements exactly this pattern elsewhere** — group removal does a live `getUserGroups` read and acts only on what it returns (**`hr/process/route.ts:2106-2109`**), and the compliance executors do live existence checks before both create and delete (**`src/lib/compliance/actions/executors/graph-ca-policies.ts:99-106`**, **`:151-157`**). The scheduled unlock, `graph.enableAccount` at **`cron/.../route.ts:139`**, reads nothing either. | as cited | Verified |
| 6 | Notification design | Internal-only note (`publish: 2`) on the **original** offboarding ticket, which was Complete. **No** new ticket, **no** reopen, **no** assignment, **no** status change (explicit comment: "Do NOT change ticket status", **`:260`**). **No email to anyone** — the cron does not import `Resend` at all. **No pre-deletion warning at any interval** exists anywhere. Because publish is internal *and* the status is unchanged, no Autotask Event fires: the rules observed on these tickets trigger on "Created" and on `Status changed to "Complete"`. Contrast the initial offboard, which posts `publish: 1` customer-visible notes (**`hr/process/route.ts:2632-2636`**, **`:2446-2453`**) **and** sends email via Resend (**`:2476-2526`**) **and** fired the Autotask "Notify Customer of New Ticket" rule (observed, ticket 35201 note 29891726). | **`cron/process-scheduled-offboards/route.ts:259-281`**; imports at **`:1-8`** | Verified |
| 7 | False claims in templates | `'The account can no longer be recovered from Azure AD.'` — **`src/app/api/cron/process-scheduled-offboards/route.ts:273`**. False: the account was restored from the Entra deleted-users container on 2026-09-03. Two further unverified claims in the same pair of templates: the note **title** `'Account Permanently Deleted — 30-Day Hold Expired'` (**`:265`**) asserts finality the API does not provide; and `'If the deletion needs to be cancelled, update the HR request before the scheduled date.'` (**`hr/process/route.ts:2635`**) describes a capability that does not exist (item 3). | as cited | Verified |
| 8 | Attribution | App-only `client_credentials` with scope `https://graph.microsoft.com/.default` (**`src/lib/graph.ts:70-73`**), so no human identity reaches Graph. `deleteUser` sends a bare `DELETE /users/{id}` with no correlation header (**`:614-619`**). Two credential modes: `legacy` (per-tenant id/secret on the company row) and `multi_tenant` (**`M365_PORTAL_CLIENT_ID`** / **`M365_PORTAL_CLIENT_SECRET`**) — **`:120-127`**. (a) The originating human **is** captured, as `hr_requests.submitted_by_email` plus `impersonated_by_email` / `impersonated_by_name` (**`hr/submit/route.ts:91-92`**, **`:111-112`**), but the deletion's audit row hardcodes `actor = 'system'` and its `details` JSON carries only `targetUpn`, `fullName`, `scheduledDate`, `executedDate`, `reason` — **the submitter is not carried through** (**`cron/.../route.ts:284-301`**). (b) Nothing marks a call as scheduled vs interactive. `executeScheduled` is read at **`hr/process/route.ts:703`**, **`:1090`** and **`:1862`** for branching and **is never persisted** — not in `hr_requests`, not in `hr_request_steps` (whose insert has no actor column at all, **`:625-627`**), not in any `hr_audit_logs` details payload (**`:2686-2705`**). So for the writes on the shared pipeline — disable, group removal, licence removal — **the database itself cannot tell afterwards whether a human clicked submit or the 05:01 cron drove it.** `deleteUser` and `enableAccount` are inferable only because each has exactly one call site. **A technician looking only at an Entra audit entry cannot distinguish a scheduled deletion from an unauthorized one using any field available today** — every portal action presents identically as Application "TCT Customer Portal" with no user agent and no IP. Token caching is keyed on `tenantId` alone (**`graph.ts:47`**, **`:63-66`**), so a cached token carries no notion of which request minted it. In-repo precedent for the fix: the compliance framework threads the human through as `ExecutorContext.staffEmail`, *"Staff member triggering the deployment"* (**`src/lib/compliance/actions/executors.ts:49-50`**), populated from the staff session (**`src/app/api/compliance/[companyId]/changes/[id]/deploy/route.ts:141`**). | as cited | Verified |
| 9 | Class of defect | See §7. | §7 | Verified |
| 10 | Pax8 | Pax8 **does** exist as a working OAuth2 client (**`src/lib/pax8.ts`**, 389 lines) but is imported in exactly one file, **`src/app/api/hr/process/route.ts:10`**, and reached from exactly two call sites — **`:1216`** and **`:1384`** — both inside the `if (hrRequest.type === 'onboarding')` branch opened at **`:1082`**. The offboarding pipeline begins at **`:1857`**; both call sites are structurally unreachable from it. No file in `src/lib/hr/` and neither cron imports Pax8. The client exposes `increaseSubscriptionQuantity` (**`pax8.ts:258`**) but its only caller is `addSeats` (**`:304-311`**), which computes `currentQuantity + seatsToAdd`; there is no decrease or cancel caller. **Confirmed: offboarding makes no Pax8 call and no call to any other billing or distributor system. Licence removal releases the seat in Microsoft only; the Pax8 subscription quantity is never decremented.** | as cited | Verified |
| 11 | Evidence limits | See §6. | §6 | Verified |

---

## 5 · Root cause

**Proximate cause.** The nightly cron read `hr_requests.scheduled_deletion_date <= today` and called
Graph `DELETE /users/{target_user_id}` without any live read of the account's state
(**`src/app/api/cron/process-scheduled-offboards/route.ts:206-246`**). On 2026-09-03 the account was
enabled, licensed and in daily use; the job checked none of that.

**Design causes**, in the order they had to fail for the incident to happen:

| # | Design cause | Why it mattered here |
|---|---|---|
| 1 | **No per-subject lifecycle state.** State lives as a column on a one-shot request row (**`hr/submit/route.ts:113`**). There is no record keyed to a subject that a later request could consult. | The 08-10 onboarding for the same person had no way to discover the 08-04 pending deletion — nothing indexes pending actions by subject. |
| 2 | **A machine-readable contradiction was discarded.** Graph returned `ObjectConflict` on the exact UPN; the handler stringified it into a note and inspected nothing (**`hr/process/route.ts:1187-1192`**). | This was the single cheapest possible detection. The system had the answer and threw it away. |
| 3 | **No pre-execution verification.** | This is the only cause whose fix is sufficient on its own. The decisive contradicting signal — the manual Entra re-enable on 08-10 — originated **outside the portal entirely**, so no amount of internal supersession logic would have caught it. Verification would have. |
| 4 | **No cancellation path, and a note that claims one.** | Even a human who remembered the timer had nothing to press, and the client was told otherwise (**`hr/process/route.ts:2635`**). |
| 5 | **The terminal action notified nobody.** Internal note, no status change, no email, no assignment, no prior warning. | Deletion at 05:01:22; discovery at ~14:00 by the client. TCT had no signal in between. |
| 6 | **A false claim in the record.** `'can no longer be recovered'` (**cron `:273`**). | Actively misleading during recovery; the account was in fact restored the same day. |

Causes 1, 3, 4, 5 and 6 are all in the destructive path itself and are all independently sufficient to
have prevented, stopped, or shortened the incident.

---

## 6 · What cannot be determined

| Question | Why not | What would prove it |
|---|---|---|
| The authoritative list of pending scheduled deletions | Production Postgres unreachable from this session; the offered Supabase project has no `hr_requests` table | The §1d query against **`DATABASE_URL`** |
| The current `status` of EcoSpect request `94520e10-…` | Same | `SELECT status FROM hr_requests WHERE id = '94520e10-916c-422e-a8f7-0324929773b3'` |
| The allowed-value list of **`hr_requests_status_check`** | The constraint is defined nowhere in this repo; it exists only in production | `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'hr_requests_status_check'` |
| How many future-dated requests are stranded by that constraint | Aggregated error view collapses occurrences to `count=1` per group | `SELECT id, type, status, autotask_ticket_number FROM hr_requests WHERE status NOT IN ('completed','failed') ORDER BY created_at DESC` |
| The Entra objectId of any subject in §1b | It lives in `hr_requests.target_user_id` | §1d query |
| Whether Tri-Bros is in `legacy` or `multi_tenant` consent mode, and hence which app registration and which secret performed the delete | `companies.m365_consent_mode` is a DB column (**`src/lib/graph.ts:148`**) | `SELECT m365_consent_mode, m365_tenant_id FROM companies WHERE slug LIKE 'tribros%'` |
| The service principal's **granted** Graph application permissions (item 8, least-privilege review) | Not expressible in this repo — it is Entra tenant configuration. The code only proves which permissions are *exercised*. | Entra portal → App registrations → the app → API permissions, or `GET /servicePrincipals(appId='…')/appRoleAssignments` |
| Whether the 2026-09-03 cron run logged anything beyond the Autotask note | `get_runtime_logs` returned "Query did not finish within the time budget" at both 72h and 10h lookbacks | A deployment-scoped `get_runtime_logs` query, or a Vercel log drain |
| Whether **`INTERNAL_SECRET`** and **`CRON_SECRET`** are actually set in production | Vercel environment variables are not readable from this session. Both auth checks **fail open** when unset (**`hr/process/route.ts:3-11`**; **`cron/.../route.ts:37-42`**) | Vercel → project → Settings → Environment Variables |

**Log retention actually verified.** Entra ID audit logs: **seven days** on Entra ID Free, **30 days** on
P1 and P2 [verified against Microsoft Learn, *Microsoft Entra data retention*, doc updated 2026-03-25].
Consequence: the 2026-09-03 deletion entry and the 2026-08-10 manual re-enable are still within a
30-day window, but **the 2026-08-04 offboarding entries are at or past expiry** — if the original
offboarding actions need to be evidenced in Entra, that must be done now or not at all. Vercel
aggregated runtime errors accept a maximum 7-day lookback per the tool contract, though group
`first`-seen timestamps survive longer (the 2026-07-28 timestamp in §1e was read from a 7-day query).
**Not logged anywhere at all:** any record that a Graph call originated from a scheduled job; any
per-subject history of lifecycle actions; any cancellation or supersession decision.

---

## 7 · Class of defect

Two weaknesses are being scored: **stale intent** (the action can fire on preconditions that no longer
hold) and **attribution** (an auditor cannot tell a legitimate scheduled action from an unauthorized
one).

| Destructive / write operation | Graph call | Trigger | Stale intent | Attribution |
|---|---|---|---|---|
| Delete user (30-day hold) | `DELETE /users/{id}` | Scheduled — nightly cron | **Yes — the incident.** Up to 30 days between decision and execution, zero verification | **Yes** |
| Unlock account on start date | `PATCH /users/{id}` `accountEnabled: true` | Scheduled — same cron, **`:139`** | **Yes.** Fires on `start_date <= today` with no check that the hire still starts. Enables sign-in for someone who may have withdrawn | **Yes** |
| Scheduled offboarding — disable, remove groups, remove licences | `PATCH`, `DELETE /members`, `POST /assignLicense` | Scheduled — cron re-enters `/api/hr/process` with `executeScheduled: true`, **`:96-108`** | **Yes.** Same 30-day-class gap between submission and `last_day`; no re-check that the termination still stands | **Yes** |
| Disable account (immediate) | `PATCH accountEnabled: false`, **`graph.ts:600`** | Interactive | No — same request | Partial: submitter on the request row, absent from Graph |
| Revoke sign-in sessions | `POST /revokeSignInSessions` | Interactive | No | Partial |
| Remove from groups | `DELETE /groups/{id}/members/{id}` | Interactive **and** scheduled | Yes, on the scheduled path only | **Yes** on scheduled path |
| Remove licences | `POST /assignLicense` (`removeLicenses`), **`graph.ts:622-631`**; call sites **`hr/process/route.ts:2161`**, **`hr/exchange-finalize.ts:211`** | Interactive, plus **deferred** via the Exchange callback | Yes on the deferred path — it fires on a runner callback whose `licenseRemovalSafe` verdict is the only guard | **Yes** on deferred path |
| Mailbox conversion + delegate grants | Azure Automation runner, not Graph | Deferred — HMAC webhook + 45-min reconcile cron | Yes — same class | **Yes** |
| Create HR SharePoint site | `POST /groups` (`groupTypes: ['Unified']`, mail-enabled) — **`graph.ts:712-723`**; call site **`hr/process/route.ts:2054`** | Interactive **and** scheduled | Yes on scheduled path | **Yes** |
| Create user | `POST /users` with a temp password — **`graph.ts:519-536`**; call site **`hr/process/route.ts:1157`** | Interactive **and** scheduled | Yes — a scheduled onboarding provisions an identity with no re-check that the hire still starts | **Yes** |
| Remote device wipe | — | **Not automated.** `wipe_devices` is `automated: false` (**`offboarding-actions.ts:346-352`**) — a manual instruction only. Note a DB seed row names a `graph_method` of `remoteWipe` (**`src/app/api/migrations/question-engine/route.ts:356`**) that is implemented nowhere; if that seed is ever wired up it inherits this whole class. | n/a | n/a |
| Password reset | Not present as a standalone destructive path; temp password is set at create time (**`hr/process/route.ts:1138`**, `generateTempPassword` **`:568`**) | Interactive | No | Partial |
| **Delete Conditional Access policy** | `DELETE /identity/conditionalAccess/policies/{id}` — **`src/lib/compliance/actions/executors/graph-ca-policies.ts:157-161`**, **`:459`** | Interactive, staff session | No | **No — this path is correct.** Carries `staffEmail` (**`executors.ts:49-50`**) and does a live existence check first (**`:151-157`**) |

**One further exposure worth recording:** `graphRequest` is **exported** (**`src/lib/graph.ts:253`**) and accepts an arbitrary `RequestInit`, so any importer can issue any verb against a customer tenant with the same app-only token, outside the `createGraphClient` wrapper. The compliance executors do exactly that, including deleting Conditional Access policies — i.e. removing MFA or legacy-auth enforcement from a client tenant. Those call sites are *better* engineered than the HR ones (session-attributed, live pre-flight), so this is noted as scope rather than as a defect; but it means the destructive surface is not bounded by the 13 named wrapper methods.

**Every scheduled or deferred path in the system shares both weaknesses.** The deletion is the worst
case only because it is irreversible after Entra's soft-delete window; the scheduled unlock and the
scheduled offboarding have identical structure. Fixing this for deletion alone would leave the class
intact. Separately, and outside the two weaknesses above: **licence removal has no Pax8 counterpart**
(item 10), so every offboarding since the integration shipped has released a Microsoft seat while
leaving TCT billed for the Pax8 subscription.

---

## 8 · Design proposal

> **This is a proposal. Nothing in it is implemented. It needs approval before any code is written.**

### 8.1 Durable per-subject lifecycle state

**Recommended: a new table `m365_subject_lifecycle`, keyed on `(company_id, entra_object_id)`.**

The current key is right at the point of the Graph call — `target_user_id` **is** the objectId
(**`hr/process/route.ts:1974`**) — but wrong everywhere else: **`target_upn`** is what the offboarding form
collects, what `hr_requests` indexes in practice, and what a re-onboarding would match on. **UPN is a
weak key**: it changes on rename and on marriage, it is reassignable, and — decisively for this incident
— a re-created account has the same UPN and a *different* objectId. Any supersession rule matched on
UPN alone would have mis-linked the 08-10 re-creation had it succeeded.

So: **objectId is the identity, UPN is an alias.** Store both; match on either; never treat a UPN match
as proof of subject identity without recording that it was a UPN match.

| Option | Tradeoff |
|---|---|
| **A — new `m365_subject_lifecycle` table (recommended)** | One row per subject per tenant, holding current known state, the open pending action (if any), and an append-only event log. Additive `CREATE TABLE`, so it satisfies expand-contract. Costs a migration and a backfill. Gives supersession, cancellation and audit a single place to live. |
| B — new `hr_pending_actions` table keyed on request | Smaller change, but reproduces the original defect: still keyed on the request, so two requests for one person remain unlinked. Rejected. |
| C — index and query `hr_requests` by `target_upn` | No migration. But UPN-only matching (see above), no place to record a supersession decision, and `target_upn` is not even populated when onboarding fails — the exact case that matters. Rejected. |

Per repo convention the table is raw-pg with a matching `ALTER`/`CREATE` in **`/api/migrations/run`**, and
a `POST /api/migrations/run` after deploy. It must **not** be created lazily by a request handler the
way `hr_requests` is — that pattern is how `hr_requests_status_check` came to exist in production and
nowhere in the repo.

### 8.2 Supersession

| Later request | Pending action it invalidates | Behaviour |
|---|---|---|
| Onboarding for the same subject | Pending deletion; pending scheduled offboarding | Invalidate. A reinstatement and a pending termination cannot both be valid. |
| Graph `ObjectConflict` on `POST /users` for a UPN with a pending deletion | Pending deletion | Invalidate — §8.4 |
| Offboarding for the same subject | Pending scheduled unlock | Invalidate |
| Second offboarding for a subject with a pending deletion | Nothing | Keep the earlier date; record the duplicate. Never shorten a deletion window automatically. |

**On ambiguity — a UPN match with no objectId match, or two candidate subjects — do not decide.**
Suspend the pending action, mark it `needs_human_review`, and escalate per §8.5. Suspension is
fail-safe: the destructive action does not run, and nothing irreversible happens while a human looks.

Every decision — superseded, suspended, confirmed — is appended to the subject's event log with the
triggering request id, the matched key (`objectId` or `upn`), the actor, and the timestamp. That log
is the auditable record; a status column alone would not be.

### 8.3 Pre-execution precondition re-verification

**This is the highest-value change and should ship first.** It is the only fix that catches a
contradiction originating outside the portal, which is what actually happened here.

Immediately before any scheduled destructive Graph write, re-read the subject from Graph and abort if
any check fails or cannot be evaluated:

| Field | Read | Abort if | Cost |
|---|---|---|---|
| `accountEnabled` | `GET /users/{objectId}?$select=accountEnabled` | `true` — someone re-enabled it | None. Already `$select`ed by `getUserByEmail` (**`graph.ts:653`**) |
| `assignedLicenses` | `GET /users/{objectId}?$select=assignedLicenses` | non-empty — someone re-licensed it | None. `getUserAssignedLicenses` already exists and is used at **`hr/process/route.ts:1367`** |
| `id` + `userPrincipalName` | same call | objectId not found, **or** the UPN no longer matches what was scheduled | None |
| `signInActivity.lastSignInDateTime` | `GET /users/{objectId}?$select=signInActivity` | a sign-in after the action was scheduled | **Requires `AuditLog.Read.All`, which we may not hold.** Treat as an enhancement, not a gate |
| `memberOf` | `GET /users/{objectId}/memberOf` | re-added to groups | One extra call. Recommended but weaker than the first three |

On 2026-09-03 the first two checks alone would each independently have stopped the deletion.

**Fail-safe is the rule, not the exception:** a Graph error, a timeout, a missing credential, a
suspended subject record, or an unevaluable check **aborts and escalates**. There is no code path in
which a destructive action proceeds on an inconclusive guard. This inverts the current cron, where
the deletion block's `catch` is labelled `(non-fatal)` and returns HTTP 200
(**`cron/.../route.ts:313-315`**).

Because `signInActivity` may be unavailable, the abort condition must be expressed as *"every gate that
is available returned a pass"* — never *"no gate returned a fail"*. An unavailable gate is not a pass.

### 8.4 `ObjectConflict` as a supersession trigger

Replace the bare `catch` at **`hr/process/route.ts:1187-1192`** with error-code inspection. On
`Request_BadRequest` / `ObjectConflict` for `userPrincipalName`:

1. `GET /users/{upn}` to resolve the existing account's **objectId**.
2. If that subject has a pending deletion or pending offboarding → supersede it (§8.2) and say so on the ticket.
3. Continue the onboarding **against the existing account** — enable, licence, groups — rather than reporting a failure. This is what the technician did by hand on 08-10 at 18:23.
4. Record the conflict and the resolution in the subject event log.

`graph.createUser` currently throws a generic `Error` built from the response text, so the code is only
available as a substring. Parsing Graph's `error.code` properly means threading the structured error
out of `graphRequest` — a small, contained change to **`src/lib/graph.ts`**, and worth doing rather than
string-matching, because string-matching a vendor error is the same failure mode as the lookup tables
this codebase has already been bitten by three times.

### 8.5 Notifications

| When | Where | Publish | Rationale |
|---|---|---|---|
| T-7 days before deletion | **New** Autotask ticket, assigned to a named technician | Internal | Somebody must look at it while there is still time. A note on a closed ticket is not a notification. |
| T-1 day | Note on the T-7 ticket + email to TCT | Internal | Last chance |
| Abort / supersede | Note on the T-7 ticket, **and** a note on the original offboarding ticket | Internal | The abort is the interesting event; it must be loud |
| Deletion executed | **New** ticket, assigned, referencing the original | Internal, plus a **customer-visible** note on the original | The client was told the date; they should be told it happened |
| Ambiguity / suspension | **New** ticket, assigned, priority High | Internal | Needs a human decision |

**Recommendation: new ticket, never reopen.** Reopening a ticket Complete for 30 days corrupts SLA and
resolution metrics — this repo has an entire lifecycle engine that would mis-measure it — and the
original ticket's contact list is 30 days stale. A new ticket linked to the original is auditable and
metrically clean. It also, unlike the current design, fires Autotask's "Created" Event and so actually
emails someone.

### 8.6 A working cancellation path

**Recommended: TCT staff only, in the admin UI, plus a client-initiated *request* that a human actions.**

| Option | Tradeoff |
|---|---|
| **A — TCT admin cancel (recommended)** | New `/admin/hr` view listing pending actions with a cancel button, gated on the existing staff permission system (**`src/lib/permissions.ts`**). Auditable, attributable to a named staff member, and it finally gives TCT visibility of pending actions — which today does not exist at all. |
| B — client contact can cancel directly | Fixes the false note literally, but the portal's access control is a shared URL with no password (owner decision 2026-03-20), so a cancel button is only as strong as a forwarded link. Acceptable for *requesting* a cancellation; not for executing one. |
| C — cancel by re-submitting a form | What the note implies today. Indirect, and it was never built. Rejected. |

Either way, **the note text must be corrected now** — it currently promises a capability that does not
exist (§8.8).

### 8.7 Distinguishing scheduled from interactive, and carrying the human through

Three layers, because the Entra-side options are genuinely constrained:

1. **Application layer (fully in our control).** Every destructive Graph call takes an explicit
   execution-context argument — `{ mode: 'interactive' | 'scheduled', requestId, subjectObjectId,
   initiatedByEmail, impersonatedByEmail, scheduledAt }` — sourced from `hr_requests.submitted_by_email`
   and `impersonated_by_email`, which are **already captured** (**`hr/submit/route.ts:91-92`**, **`:111-112`**)
   and merely not propagated. `hr_audit_logs.actor` stops being the literal `'system'` and becomes
   `scheduled_job:<requestId> on behalf of <submitter>`. **Copy the shape that already works in this
   repo** — `ExecutorContext.staffEmail` in the compliance framework (**`src/lib/compliance/actions/executors.ts:49-50`**)
   is the same idea, already threaded from session to write; and `mode` must be *persisted*, not merely
   branched on, which is precisely what `executeScheduled` fails to do today (item 8). `hr_request_steps`
   needs an actor column to make this stick (**`hr/process/route.ts:625-627`**).
2. **Graph request layer.** Send a `client-request-id` header on every write and record the value
   locally. Microsoft echoes it as `request-id` and it is the only field that ties an Entra audit entry
   back to one of our records. **Whether it surfaces in the Entra audit UI must be verified against
   current Microsoft documentation before this is relied on** — I have not verified it, and this is
   exactly the kind of claim that should not be taken from memory.
3. **Entra layer — the honest limit.** With app-only `client_credentials` there is no per-request
   human identity to give Entra, and the audit entry will always read Application / "TCT Customer
   Portal". A **separate app registration used only by scheduled jobs** would at least make
   "scheduled vs interactive" answerable from the audit entry's own `Display Name` field, with no
   correlation needed. That is a real improvement over today's answer, which is "no field can tell you".

### 8.8 Correcting the false text

| File:line | Current | Change |
|---|---|---|
| **`cron/process-scheduled-offboards/route.ts:273`** | `'The account can no longer be recovered from Azure AD.'` | State what is true and verifiable: the account is deleted and recoverable from the Entra deleted-users container for a limited period, after which it is not. **The exact window must be cited from current Microsoft documentation, not from memory.** |
| **`cron/process-scheduled-offboards/route.ts:265`** | title `'Account Permanently Deleted — 30-Day Hold Expired'` | `'Account Deleted — 30-Day Hold Expired'`. Drop "Permanently"; it is the claim that was wrong. |
| **`hr/process/route.ts:2635`** | `'If the deletion needs to be cancelled, update the HR request before the scheduled date.'` | Replace with the real path from §8.6 — today, "contact TCT support and reference this ticket". |

### 8.9 Should client contacts be able to schedule irreversible deletions?

**Recommendation: no. Deletion specifically requires TCT approval; everything else in the form stays
self-service.**

Today a contact with `customerRole = 'CLIENT_MANAGER'` **or** `isPrimary` can arm an irreversible
deletion in a tenant we administer, with no TCT review, no visibility, and no cancellation
(**`hr/submit/route.ts:143-173`**). The form option itself is fine — clients should be able to *ask* for
data disposal. What should not be automatic is our service principal irreversibly destroying a mailbox
in a client tenant on a 30-day timer nobody can see.

Concretely: `data_handling = delete_after_30` records the client's *intent*; the scheduled action enters
`pending_approval` and a TCT staff member confirms it. The disable / groups / licence / archive steps
run immediately as they do now, so nothing the client actually needs on day one is delayed. This is
also the cheapest of all the changes proposed here and would have prevented the incident on its own.

### 8.10 Least-privilege review of the service principal

**Cannot be completed from the code — it is Entra configuration** (§6). What the code proves is which
permissions are *exercised*, which is the input to the review, not its conclusion. From the call sites
enumerated in §7 the app needs roughly `User.ReadWrite.All`, `Group.ReadWrite.All`,
`Directory.ReadWrite.All`, `Organization.Read.All`, and Files/Sites scopes for the OneDrive archive; a
`signInActivity` gate would additionally need `AuditLog.Read.All`.

Two questions to settle in the portal, not here:

1. Is anything granted that no call site uses? Anything unexercised should go.
2. `User.ReadWrite.All` is what makes `DELETE /users` possible, and there is **no narrower Graph
   application permission that permits disable-and-licence changes but forbids delete** — this needs
   verifying against current Microsoft documentation rather than assumed. If it holds, the split in
   §8.7 layer 3 becomes the mitigation: give the interactive app the broad scope and the scheduled-job
   app only what its jobs need, so a compromise of one credential cannot delete users.

### 8.11 Backfill

1. **Freeze first.** Before any code ships, gate the deletion branch behind a kill switch
   (`M365_SCHEDULED_DELETION_ENABLED`, default off) in the pattern already used by
   `EXO_AUTOMATION_ENABLED` and `CONNECTOR_*_WRITES_ENABLED`. Cheap, reversible, stops the bleeding
   tonight rather than after review.
2. **Enumerate** with the §1d query. Nothing can be decided about pending actions until someone has
   actually read that column.
3. **Verify every pending action individually** against live Graph, by hand, using the §8.3 checks.
4. **Backfill `m365_subject_lifecycle`** from `hr_requests`, matching on `target_user_id` where
   present and `target_upn` otherwise. Rows matched only by UPN are marked as such — the provenance of
   a weak match must survive the backfill.
5. **Any pending action that cannot be verified, or that resolves ambiguously, is suspended — not
   executed.** A pending action nobody can confirm is exactly the input this system handled worst.
6. Re-enable the kill switch only once §8.3 is live and tested.

### 8.12 Out of scope for this fix, but found on the way

Filed here so they are not lost; each needs its own decision.

| Finding | Where | Note |
|---|---|---|
| **`hr_requests_status_check` exists in production and nowhere in the repo**, and it rejects `'scheduled'` | §1e | Breaks every future-dated onboarding and offboarding. Live impact today. Highest-priority item in this table. |
| Offboarding never decrements the Pax8 subscription | item 10 | Confirms the billing admin's 2026-08-05 observation. TCT is paying for released seats. |
| `hr_requests` and `hr_audit_logs` are created by a request handler, not by `/api/migrations/run` | **`hr/submit/route.ts:85-125`** | The mechanism by which production schema and repo schema diverged. |
| `/api/hr/process` and the cron both **fail open** if `INTERNAL_SECRET` / `CRON_SECRET` are unset | **`hr/process/route.ts:647-656`** (`else { console.warn('… skipping auth check') }`); **`cron/.../route.ts:37-42`** | Whether they are set in production is undetermined (§6). The process route performs every Graph write in the system and is reachable by anyone if the secret is unset. |
| The deletion block's `catch` returns HTTP 200 and logs `(non-fatal)` | **`cron/.../route.ts:313-315`** | A failing deletion is invisible to health monitoring. |
| **This cron does not use `cron-wrapper.ts`** — it hand-rolls auth, unlike at least six sibling crons | **`cron/.../route.ts:32-42`** vs **`src/lib/cron-wrapper.ts:68`** | So the most destructive job in the system is the one missing the standardised auth, retry, timeout and `cron:<name>` log tagging. |
| **Licence removal cannot report what it actually removed.** It loops every tenant SKU calling `removeLicense` and swallows each failure as "wasn't assigned" (**`hr/process/route.ts:2158-2167`**; duplicated at **`hr/exchange-finalize.ts:208-216`**), so a real 4xx is indistinguishable from a no-op and the "Licences Removed" ticket note built from it (**`:2174-2177`**) may overstate. The per-user read that would fix it, `getUserAssignedLicenses` (**`graph.ts:540`**), exists and is used only for onboarding clones (**`:1367`**). | as cited | Same success-shaped-output family as the false recoverability claim. |
| A DDL `ALTER TABLE` runs on every cron invocation | **`cron/.../route.ts:204`** | Should move to `/api/migrations/run`. |

---

## 9 · Open questions for Kurtis

1. **Approve the kill switch tonight, ahead of the rest?** §8.11 step 1 is a few lines and stops any
   further scheduled deletion until the guards exist. Recommended.
2. **`hr_requests_status_check`** — this is breaking future-dated onboarding and offboarding right now
   (§1e), including Audrey McKinney today. Should it be fixed in this branch, or split into its own
   change ahead of this one? Recommended: split, and ship it first.
3. **§8.9 — does deletion require TCT approval?** Cheapest single change here, and it changes the
   client-facing form. Your call, not mine.
4. **§8.7 layer 3 — a separate app registration for scheduled jobs?** It is the only way to make
   "scheduled vs interactive" answerable from an Entra audit entry alone, and it costs an app
   registration plus per-tenant consent across every managed tenant.
5. **`signInActivity` as a gate** — do we hold `AuditLog.Read.All` on this app? If not, is adding it
   acceptable, or should the three zero-cost checks in §8.3 be the whole gate?
6. **Pax8 seat decrement on offboarding** — in scope for this fix, or its own change? Recommended: its
   own change; it is a billing correctness issue, not a safety one.
