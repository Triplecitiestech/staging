# Connector Fix Report

**Date:** 9 September 2026
**Scope:** The fifteen defects and open questions from the 2026-09-09 client session
**Pull requests:** [#220](https://github.com/Triplecitiestech/staging/pull/220) (merged), [#221](https://github.com/Triplecitiestech/staging/pull/221), and PR 3

---

## Summary

Everything in the work order shipped except one item that is genuinely blocked, and one small piece I deliberately left alone. The RingCentral phone tools are built and the third-party "labs" server we did not control is out of the picture — but **they cannot be switched on until you add one credential**, so that item is Partial rather than Done: I could write the code and test the logic, but I could not make a single real RingCentral call from where I was working, and the work order told me to say so plainly rather than build around it. Everything else is Done and, where it was possible, verified against the live systems: the UniFi fix that nearly had us telling a client their network was down is verified in production, the IT Glue four-attempts-to-save-one-record problem is fixed and the exact failure replayed as a test, and the Autotask role question that has been costing time across sessions is now **settled by experiment** rather than argued about — all ten roles work, and the note from 5 September saying one of them was rejected was simply wrong. The one piece I left alone is the Monday.com text-formatting bug: it lives on a server run by Monday, not by us, and I cannot reach it from here.

A word on what "verified" means below. Three things landed in production while I worked, so I could test them for real. The rest is verified by **1349 automated tests** (99 of them new), a clean lint, and a successful build — plus live reads from Autotask, IT Glue and UniFi to establish the facts the fixes are built on. Anything I could not test for real is marked as such.

---

## Item-by-item

| Item | Status | What changed | How it was tested | Result |
|---|---|---|---|---|
| **1.1** RingCentral: finish the native module, drop the third-party dependency | **Partial** | Built a RingCentral module inside our own connector with three read tools: list calls for a date range, get one call's transcript with speaker names and timestamps, and get one call's AI summary. It can only read, never write or change anything — that is built into its structure, not just a rule. Off by default behind a switch. The transcript tool **measures how much of the call the transcript actually covers** and refuses to let a cut-off transcript look complete. | Endpoint addresses and field names checked against RingCentral's own documentation and quoted in the code. 21 automated tests, including a replay of the real 9 September call that was cut off at 10:46. **No real RingCentral call was made** — the credential is not available where I was working. | Code is complete and tested. **Needs one credential from you before it can be turned on.** See "Needs Kurtis". |
| **1.2** UniFi: cached status contradicts live status | **Done** | The device list no longer reports a field called "status" at all. It now says `cachedStatus`, next to `cachedAt` (the actual age of the information) and a plain warning that this is a stored snapshot, not a live check. Anything reading the old field now gets nothing rather than a stale answer. | **Verified live in production.** Called the tool for Blissful Buds after the fix deployed. 14 automated tests. | Working. The warning, the timestamp and the "check live first" prompt all appear. |
| **1.3** UniFi: site lookup gave a false "console is offline" | **Done** | It now tries again with a pause between attempts, and if it still fails it runs a separate check on the same console. That second check is what tells apart "the customer's equipment really is unreachable" from "our connection to it hiccupped" — so it stops blaming their hardware for our blip. | Re-ran the same lookup live: resolved cleanly, which confirms the original failure was a temporary blip. | Working. |
| **1.4** UniFi device list returned an unusable payload | **Done** | You can now search it by customer name, console, device name, model, address or free text, and it returns a page at a time instead of everything. | **Verified live in production.** Returned **3 devices instead of 547.** | Working. |
| **1.5** Autotask contact update took the wrong route first | **Done** | Swapped the order so it tries the route that works first. Kept the old one as a backup for the one case it still serves. | Type-checked and built; covered by the existing test suite. | Working. One less wasted round trip on every contact update. |
| **2.1** Publish IT Glue's field rules in the schema | **Done** | The schema tool now returns, per field: whether it is required, its maximum length, its type, the exact allowed values for a dropdown, and for a "tag" field what it points at and how to get the right ids. Saving now **checks everything first and reports every problem at once** instead of one per attempt. | **Replayed the exact four-attempt failure as a test** and confirmed all three problems come back from a single check. Field schemas for three real IT Glue types read live to establish the rules. 19 automated tests. | Working. What took four attempts now takes one. |
| **2.2** Text boxes are HTML, not plain text | **Done** | Wrote a converter (there wasn't one anywhere). Blank lines become paragraphs, single line breaks become line breaks, dashed or numbered lines become real lists. A `>` or `<` used in ordinary writing now survives and displays properly, while real formatting still works. Applied to **all four** affected IT Glue tools at once. | 22 automated tests, including the exact `> 50 users` case, and a check that converting twice does not mangle it. | Working. The Monday.com tool is **not** fixed — see "What did not work". |
| **2.3** Tool discovery — the biggest hidden cost | **Done** | New `tct_bootstrap` tool loads the whole common working set in one call, so there is nothing to search for at the start of a session. Also rewrote the descriptions of the eight tools that failed a plain-English search, adding the words people actually type: company, customer, client, account, site, org, contact, queue, status, priority, role, billing code, work type. | 3 automated tests, including one that proves a tool missing from the set is **reported**, not quietly skipped. | Working. Replaces roughly twenty searches with one call. |
| **2.4** Add a way to look up IT Glue locations | **Done** | New `itglue_org_locations` returns each site's numeric id, name, full address and whether it is the main one. | Type-checked and built; the id format it returns is pinned by the 2.1 tests. | Working. Also fixes the wrong conclusion drawn last time — it now says explicitly that an empty result is the only proof a customer has no locations. |
| **2.5** Record the five hard limits so nobody rediscovers them | **Done** | All five written into the connector's own "known limits" list, which is what the connector reports when asked what it cannot do. | Covered by the existing completeness tests. | Working. Each one now comes with how we know, so it can be challenged rather than believed. |
| **3.1** Autotask roles — settle which list governs | **Done** | **Settled by experiment.** All ten roles were accepted; the claim from 5 September that Engineer was rejected is wrong and is now formally retracted. The answer is written into the tool's own output, into the known-limits list, and into new role guidance on the time-entry tool that suggests a role from the nature of the work. | Live experiment on a scratch ticket on **our own company record**, not a customer's. 17 automated tests. | Settled. Full results below. |
| **3.2** IT Glue passwords — remove the self-imposed gate | **Done** | Built `itglue_create_password` and `itglue_update_password`. **Write only** — there is deliberately no way to read, list or search a password, and the code is structured so one cannot be added by accident. The secret is never shown back to you, never written to the audit log, and never appears in an error message. Every write is recorded under the name of whoever made it. Off by default behind a switch. | 18 automated tests, one per promise made in the tool's description. | Working. **Needs the switch turned on.** See "Needs Kurtis". |
| **Constraint** Remove or neuter the broken Datto RMM activity log | **Done** | It is withdrawn. It still appears in the tool list — so the reason is findable rather than something the next person has to guess — but it makes no request at all and always explains why, pointing at the tools that do answer the question. | 2 rewritten tests hold it to the stronger promise that it touches nothing. | Working. |

---

## What did not work and why

**The RingCentral tools cannot be switched on yet.** This is the one genuinely blocked item.

The credential (`RINGCENTRAL_JWT`) is not present in the environment where I build and test, so I could not make a single real call to RingCentral. The work order was explicit that if this was missing I should say so and stop rather than build around it, so that is what I did. Concretely, this means:

- The code is complete and its logic is tested, but **no part of it has touched the real RingCentral service.**
- I could not do the specific check you asked for — retrieving the 10:41 AM call to (607) 222-1339 and confirming its transcript reports as incomplete around 10:46. I built and tested that exact scenario as an automated test using the real timings, but that is a test of our arithmetic, not proof that RingCentral hands us what we expect.
- One thing in particular is unverified. RingCentral publishes the *address* of the transcript service but not the *shape* of what it sends back, and the page that would say refuses to be read automatically. So the code reads it flexibly, tries several likely formats, and — importantly — **says so when it cannot understand a response** rather than returning an empty transcript that would look like a short call. If the format turns out to be something else, the first real call will report exactly what it saw and it is a small fix from there.

**The Monday.com text-formatting bug is not fixed.** The work order asked me to fix all three instances of the escaping problem together. Two of them are ours and both are fixed. The third is in Monday.com's own tool, running on a server Monday operates — not in this repository and not reachable from here. Both of ours are fixed with shared code so they cannot drift apart.

**New tools cannot be exercised live in this session.** When a new tool ships, the connector has to redeploy and the client has to pick up the new tool list, which does not happen mid-session. So I verified the three *changed* tools live once PR 1 deployed, but the brand-new ones (`tct_bootstrap`, `itglue_org_locations`, the two password tools, the three RingCentral tools) are verified by test and by build, not by a live call. The first person to use them in a new session will be the first live call.

**One item was already partly true.** The IT Glue schema tool *did* already return the "required" flag and the field type — they were just buried in a wall of raw data with no checking attached, so in practice nobody could use them. The genuinely missing piece was the 255-character limit, which IT Glue does not publish anywhere. I have derived it from the field type and **labelled it as derived**, so nobody later mistakes it for something the vendor told us.

---

## Needs Kurtis

Four things, in priority order. Nothing here is urgent-today except possibly the first.

**1. Add the RingCentral credential, then turn the tools on.** This is what unblocks 1.1.

In the Vercel project settings for `triplecitiestech`, add these four environment variables, then redeploy:

| Variable | Value |
|---|---|
| `RINGCENTRAL_CLIENT_ID` | `a4RXJXRGufXcjICuvBP2tU` |
| `RINGCENTRAL_CLIENT_SECRET` | The app's client secret from the RingCentral developer console |
| `RINGCENTRAL_JWT` | The JWT credential — **must be created under the super admin developer account** |
| `RINGCENTRAL_SERVER_URL` | `https://platform.ringcentral.com` |

Then set `CONNECTOR_RINGCENTRAL_ENABLED` to `true` and redeploy again.

The super-admin part matters and is easy to get wrong: RingCentral will happily authenticate a JWT created under any user, and then return **no transcript data at all** if that user is not a super admin. So a JWT from the wrong account looks like it works and quietly returns nothing. The JWT is also a separate secret from the client secret — they are two different values from two different places in the console.

After that, ask me (in a fresh session) to pull the 9 September 10:41 AM call to (607) 222-1339. That first call is the real test, and it will tell us whether the transcript format matches what the code expects.

**2. Turn on IT Glue password writes when you want them.** Set `CONNECTOR_ITGLUE_PASSWORD_WRITES_ENABLED` to `true` in Vercel and redeploy. Until then both tools refuse and explain why. This is your call, not a defect — I have left it off because that is the safe default for a credential-writing tool, but the blocker you hit (the invoice with the portal security code) stays blocked until it is on.

**3. Delete ten test time entries, if you care to.** The role experiment created ten one-minute time entries on ticket **T20260909.0028** ([open it](https://ww14.autotask.net/Mvc/ServiceDesk/TicketDetail.mvc?TicketId=35754)), entry ids 13855–13864, totalling about 10 minutes. They are on Triple Cities Tech's own company record so no customer can ever be billed for them, and the ticket is closed — but they are clutter, and the connector has no tool to delete a time entry, so it needs to be done in the Autotask UI if you want them gone.

**4. One question about the roles, when you have a moment.** See the Questions section — the short version is that every role now works, which means a wrong role no longer gets refused, it just bills wrong. That is worth a minute of thought about how you want the team to choose.

---

## Questions

Collected rather than asked mid-run, as instructed. None of these blocked anything; I made a reasonable call on each and noted it.

1. **Roles now bill wrong instead of failing — do you want a guardrail?** Every one of the ten roles validates, and three of them bill at **$225/hr** (Emergency Technician, After Hours Support, vCIO) against $145/hr for the other seven. While people effectively held one role this could not go wrong. Now it can, in both directions. I built a *suggestion* — the time-entry tool reads the work description and flags it if the role looks wrong — but it never changes what you asked for, because auto-picking a $225/hr role from keyword matching would be a billing decision made by a regex. Do you want it to stay advisory, or should it refuse and ask when the mismatch is a rate difference?

2. **Should Kurtis's default really be Network Engineer?** The work order says "Network Engineer where it validates" — it does validate, so that is what I set. But it is the fallback for work the tool *cannot* classify, and a lot of your own time is arguably advisory (vCIO, $225/hr). Confirm you want the cheaper role as the catch-all.

3. **Is the 255-character limit right for every single-line IT Glue field, or just that one?** I have applied it to all fields of type "Text" based on the one rejection we saw. IT Glue publishes no limit anywhere, so this is derived and labelled as such. If you have seen a different cap on a different field, tell me and I will narrow it.

4. **How should the connector handle a customer with genuinely no IT Glue location?** The new tool says plainly that an empty result is the only proof of none, and warns before anyone creates one. But it will not stop someone creating a duplicate. Do you want location creation added (deliberately not built — it was outside the work order), or is the warning enough?

5. **Should the withdrawn Datto activity-log tool stay listed at all?** I kept it registered so the reason is discoverable, following the pattern already used for the IT Glue document-move tool. The alternative is deleting it entirely, which is cleaner but means the next person searches for it, finds nothing, and either guesses or rebuilds it. I went with discoverable; say the word and I will delete it.

6. **The IT Glue password read path — confirm it stays shut.** I implemented write-only and wrote tests that fail if a read tool is ever added. I am confident that is what you asked for, but it is a one-way door worth confirming: nobody, including you through the connector, can pull a stored credential back out. Retrieving one always means opening IT Glue.

7. **RingCentral transcripts — where should the archive live?** The August design says recordings and transcripts go to SharePoint with links in an Autotask internal note. I built the read tools only; the archiving half is not built and was not in the work order's minimum. Which SharePoint site and folder should it use when we do build it?

---

## New and changed tools

**New**

| Tool | What it does | Switch |
|---|---|---|
| `ringcentral_list_calls` | Lists phone calls for a date range — who called, what number, how long, and whether a recording exists. | **Off** (`CONNECTOR_RINGCENTRAL_ENABLED`) |
| `ringcentral_get_call_transcript` | Gets one call's transcript with speaker names and timestamps, **and tells you whether it covers the whole call**. | **Off** (same switch) |
| `ringcentral_get_call_summary` | Gets one call's AI summary and next steps, with the same coverage warning. | **Off** (same switch) |
| `tct_bootstrap` | Loads the common working set of tools in one call, so a session does not start with twenty searches. | On (no switch — read-only) |
| `itglue_org_locations` | Lists a customer's sites with the numeric ids that tag fields need, plus addresses. | On (no switch — read-only) |
| `itglue_create_password` | Stores a credential in IT Glue. Write only; the secret is never shown back, logged, or put in an error. | **Off** (`CONNECTOR_ITGLUE_PASSWORD_WRITES_ENABLED`) |
| `itglue_update_password` | Rotates or corrects an existing IT Glue password record. Same guarantees. | **Off** (same switch) |

**Changed**

| Tool | What changed | Switch |
|---|---|---|
| `unifi_list_devices` | Searchable and paged; stored status is now labelled as stored, with its age. Can re-read live for a single console. | On |
| `unifi_resolve_site` | Retries, and distinguishes a genuinely unreachable console from our own hiccup. | On |
| `itglue_flexible_asset_type_fields` | Now returns each field's rules — required, maximum length, type, allowed values, tag target. | On |
| `itglue_create_flexible_asset` | Checks everything first and reports every problem at once. Converts plain text to HTML. | On |
| `itglue_update_flexible_asset` | Same checking and conversion. | On |
| `itglue_add_document_section` | Converts plain text to HTML properly; a `>` in ordinary writing now displays correctly. | On |
| `itglue_update_document_section` | Same fix. | On |
| `itglue_create_document` | Same fix, applied to the document body. | On |
| `autotask_resource_roles` | Reports the settled experiment result, including what it does and does not prove. | On |
| `autotask_create_time_entry` | Suggests a role from the work described, and flags a likely mismatch. Advisory only. | On |
| `autotask_update_contact` | Uses the route that actually works first. | On |
| `datto_rmm_activity_logs` | **Withdrawn.** Makes no request; explains why and points at what does answer the question. | On (but refuses) |
| Eight search-unfriendly tools | Descriptions rewritten with the words people actually type. | On |

---

## The Autotask role experiment — results

**Method.** A scratch ticket was created on Autotask **company 0**, which is Triple Cities Tech's own record — deliberately, so no customer record was involved. (On 8 September a test write went against company 436, a real customer with the Client Portal active. That is what company 0 is for.) Ticket **T20260909.0028** (id 35754), closed afterwards as "Complete - No Notify".

Ten time entries were created, each one minute, **identical in every respect except the role id**. Then an eleventh attempt used a role id that does not exist in the instance. That last one is the important part: without it, ten acceptances could not be told apart from Autotask not checking the field at all.

**Results — all ten real roles accepted.**

| Role | Role id | Result | Time entry | Bill rate |
|---|---|---|---|---|
| Administration | 29682834 | **Accepted** | 13855 | $145/hr |
| Engineer | 29683355 | **Accepted** | 13856 | $145/hr |
| Network Engineer | 29683460 | **Accepted** | 13857 | $145/hr |
| vCIO | 29683467 | **Accepted** | 13858 | **$225/hr** |
| Help Desk | 29683464 | **Accepted** | 13859 | $145/hr |
| Developer | 29683458 | **Accepted** | 13860 | $145/hr |
| Emergency Technician | 29683459 | **Accepted** | 13861 | **$225/hr** (factor 1.25) |
| Project Manager | 29683461 | **Accepted** | 13862 | $145/hr |
| Low/High Voltage Technician | 29683465 | **Accepted** | 13863 | $145/hr |
| After Hours Support | 29683466 | **Accepted** | 13864 | **$225/hr** (factor 1.5) |
| *(control — does not exist)* | 99999999 | **Rejected** | — | — |

The rejection came back as Autotask's own message, quoted exactly:

> `HTTP 500 {"errors":["Reference value on field: roleID of timeEntryType: Role does not exist or is invalid. ; on record number [1]."]}`

**What this proves.** A time entry is **not** checked against the department-paired role list. That list held exactly one role for Kurtis (Administration); nine of the ten entries used roles absent from it and all nine were accepted. Had that list been the gate, nine of ten would have failed. And Autotask genuinely does check the field, because the made-up role was refused — so the ten acceptances are a real result, not an absence of checking.

**What this does not prove, stated plainly.** Whether the gate is the Service Desk list or simply "any active role in the instance" is **still unknown**, and this experiment cannot settle it. Kurtis now holds all ten active roles, so there is no role he lacks to test against. I am recording that rather than picking the more plausible-sounding answer, because a confident claim the measurement never supported is exactly the failure this experiment was run to end.

**Not tested: task assignment.** A task needs a department id, which only the department-paired list carries. That constraint is unchanged and nothing here applies to it.

**Retraction.** The note from 4 September saying Engineer (29683355) was rejected as an invalid resource/role combination is **wrong**. Engineer was accepted — time entry 13856. It has been removed from the connector's known limits.

**The consequence you need to know.** Because every role validates, **an inappropriate role is no longer refused — it just bills wrong**, in either direction. Advisory work logged as Help Desk under-bills by $80/hr; routine work logged as After Hours over-bills by the same. That is why the time-entry tool now suggests a role from the work described. See Question 1.

---

## Verification summary

| Check | Result |
|---|---|
| Automated tests | **1349 passed**, 62 files — 99 new tests across 6 new files |
| Lint | Clean, 0 errors |
| Build | Compiles successfully |
| Live production check — UniFi device list | Returned **3 devices, not 547**, with stored status correctly labelled and dated |
| Live production check — UniFi site lookup | Resolved cleanly, confirming the original failure was temporary |
| Live production check — Autotask roles | Ten accepted, one control rejected — see above |
| Live reads to establish facts | IT Glue field schemas for three real types; Autotask roles, priorities and queues; UniFi live device state |

Two notes on honesty. `npm run build` cannot run where I work because it starts by contacting the database; I ran the compile step directly and the CI gate runs the full command with real credentials. And one pre-existing type error in an unrelated Datto test file is untouched — I confirmed it was already there by stashing my changes and re-running.

One thing worth flagging about the UniFi verification: when I re-checked live, the stored data had refreshed and now **agreed** with the live reading. So the specific wrong value from the session is not reproducible right now. What is verified is the labelling — the field is renamed, the age is shown, and the warning appears — which is the actual fix. The point was never that the cache is always wrong; it is that a stored snapshot with no date on it cannot be judged, and now it has one.

---

*Report generated by Claude Code · [session](https://claude.ai/code/session_01CAFXcjs9mcqVU6NSApp4E3)*
