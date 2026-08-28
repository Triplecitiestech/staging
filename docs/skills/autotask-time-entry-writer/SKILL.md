---
name: autotask-time-entry-writer
description: "Use this skill whenever a Triple Cities Tech team member is directing Claude to work with Autotask: drafting, cleaning up, rewriting, or formatting time entries and ticket notes; creating a ticket; looking up a ticket, its notes, or a company's tickets; setting or recommending a status; setting a resolution; or closing/resolving a ticket. Covers both writing the text and performing the action through the Triple Cities Tech connector. This skill is human-directed - it acts only when a person is actively instructing Claude, never on its own."
---

# Autotask Ticket & Time Entry Writer

Use this skill whenever Kurtis or a Triple Cities Tech team member is directing Claude to do Autotask work: drafting or cleaning up time entries and notes, creating a ticket, looking things up, setting a status, setting a resolution, or closing a ticket. It covers both writing the text and performing the action live through the Triple Cities Tech MCP connector.

## Operating model (read this first)

This skill is human-directed. It runs only when a person is actively instructing Claude in a live conversation. It is not an automation, a background job, or an unattended agent - it does not watch queues, does not reply to tickets on its own, and takes no action between the user's messages. Every create, note, time entry, status change, resolution, or close happens because the user asked for it in this conversation. The full tool surface is available; the only gate is an explicit human confirmation before the final Complete on a live client ticket (see Closing).

The overriding goal is to produce professional Autotask records that follow TCT's documented SOPs and protect SLA compliance.

## A record is not complete until three things are true

Every time this skill touches a ticket, all three of the following must be handled in the same turn. Handling one and deferring the others produces a record that looks maintained and is not. This is the most common failure mode of this skill and the reason this section sits at the top.

1. **The work is written.** The time entry or note exists, in TCT format, with the correct role and billing code.
2. **The status describes reality.** Not the status it had before the work; the status that is true now. See Status discipline.
3. **The customer knows what they need to know.** If anything changed that they must act on or would expect to be told, it has been communicated - by a mechanism that actually delivers. See Customer communication.

Do not end a turn having done 1 without explicitly addressing 2 and 3. If 2 or 3 genuinely do not apply, say so and why. Silence on either is a defect, not a neutral omission.

## Diligence first - resolve context before asking

Do the work before asking the user for anything. Exhaust what the connector and conversation can answer, then act. The user is directing the work; they should not be doing lookups the tools can do.

Never ask the user for a ticket ID, ticket number, company ID, contact, role, billing code, status ID, or any other picklist value. These are all resolvable with the lookup tools. The user rarely knows an ID off the top of their head, and asking for one is a failure of this skill.

To find the right ticket from a client name or a described piece of work: run autotask_search_companies to resolve the company, then autotask_search_tickets with openOnly=true to list its open tickets. If exactly one open ticket matches the described work, use it and state which ticket you chose and why. If more than one could plausibly match, present the short list of open tickets (number, title, status) and let the user pick - do not ask them to supply an ID, and do not guess silently when it is genuinely ambiguous.

Infer role and billing code from the nature of the work and state the inference rather than asking: remote configuration or troubleshooting is Remote Support; onsite work is Onsite Support; travel is Travel; network infrastructure work maps to the Network Engineer role; general help desk work maps to the Help Desk role. Resolve the numeric IDs live (see Part 2) rather than hardcoding.

Only ask the user a question when a fact is genuinely unrecoverable from the tools or the conversation AND getting it wrong would create a misleading record or an incorrect live write - for example, an actual worked time window that cannot be reconstructed, or a real billing-classification ambiguity. When that happens, ask it once, bundled with the fully staged entry, not as a blocking question up front.

Default flow for any logging or action request: gather context from the conversation, resolve every ID and the target ticket through the tools, stage the complete entry, and present it once for a single approval. The approval to perform the live write is the only expected gate. Do not turn one instruction into a back-and-forth.

If the ticket you resolved is itself mis-filed - wrong company (including the `companyID 0` state an inbound email ticket can arrive in), wrong contact, wrong queue, wrong type - fix it as part of the same turn rather than logging work onto a broken record. See Correcting an existing ticket's fields. Flag the company and contact changes explicitly, because both move who Autotask emails.

## Source of Truth: TCT SOPs

The rules here come from three live TCT SOPs in IT Glue (org 6942365). When in doubt, read the current version rather than relying on memory:

Tier 1 Technician Ticket Handling & Prioritization - doc 21631312
Tier 2 Technician Ticket Handling & Prioritization - doc 20368978
SLA Commitments & Technician Responsibilities - doc 21363131 (authoritative status + SLA reference)

Read them with itglue_document_sections. If a rule here ever conflicts with the current SOP, the SOP wins - surface the discrepancy to the user.

Status handling in particular is SOP-governed, not a matter of judgement. When setting or recommending a status, the SLA Commitments document (21363131) is the authority on which status applies and what it does to the SLA clock. Read it rather than reasoning from the status label.

For how Autotask ITSELF works - what a field does, how SLA events/statuses behave, what a create/close actually triggers, or any product/configuration question - use the companion `autotask-knowledge` skill, which routes to Kaseya's official documentation and answers from the live page rather than from memory. This skill knows TCT's process and IDs; `autotask-knowledge` knows the platform. When a platform behavior is uncertain (e.g. whether a status pauses the SLA clock, or what a workflow rule Event will fire), confirm it there before acting rather than assuming.

## PART 1 - WRITING THE TIME ENTRY (core rules)

The goal is a professional Autotask time entry that can be pasted directly into Autotask.

### Core Output Rules

Write the time entry in clear professional paragraphs.

Never write the entry as a single block of text. Break it into short paragraphs separated by blank lines - one paragraph per logical section (Actions Taken, Root Cause/Findings, Resolution, Next Steps/Escalation Path, Status), each two to four sentences. This is the only formatting permitted - still no bullets, numbering, headings, or special characters.

When logging the entry live through the connector, include the literal blank lines in the summaryNotes value so the breaks are stored in Autotask itself. When handing the text to a human to paste manually, deliver it as a plain-text .txt file rather than chat text - copying from the chat window collapses blank lines, which pastes into Autotask as one unreadable block (verified 2026-07-17). Never present a time entry in chat as the copy source for a manual paste.

Do not use bullet points.

Do not use numbered lists.

Do not use markdown.

Do not use headings.

Do not use tables.

Do not use emojis.

Do not use special formatting.

Do not repeat the ticket description or issue statement unless necessary for context. The ticket already contains the issue description.

Do not invent troubleshooting steps, findings, root causes, vendor updates, customer responses, or resolutions that were not provided.

Do not exaggerate the work performed.

Use past tense.

Write objectively and professionally.

Keep the entry concise, but include all important technical, customer, vendor, billing, and next-step details.

### Preferred Structure

Although the final entry should not include headings, it should logically follow this order:

Actions Taken

Root Cause / Findings

Resolution

Next Steps / Escalation Path

Status

If one section does not apply, omit it naturally.

### What to Capture

What work was performed.

What systems, users, devices, vendors, applications, or services were involved.

What was reviewed, tested, changed, configured, escalated, verified, or communicated.

What was found.

What fixed the issue, if resolved.

What still needs to happen, if unresolved.

Who owns the next step.

Whether customer action, vendor action, or internal follow-up is required.

The current ticket status.

### Style Expectations

Write as though another technician may need to continue the ticket months later.

Make the entry useful for billing review.

Avoid vague language such as "worked on issue" or "checked things."

Use specific but accurate language.

Preserve important details from the user's notes.

Clean up grammar and wording from dictation.

Remove repetition and filler.

Do not add unnecessary explanation.

### Handling Unresolved Issues

If the issue is not resolved, clearly state what was completed, what remains outstanding, who owns the next step, and whether the ticket is waiting on the customer, vendor, internal review, or further troubleshooting.

### Handling Limited Notes

Draft the best accurate entry the available information supports. Pull missing structured facts - the target ticket, company, role, billing code, status - from the connector rather than from the user (see Diligence first). Only when a substantive detail is both unrecoverable from the tools and the conversation AND necessary to keep the entry from being misleading, note the assumption inline in the staged draft, or ask it once alongside the finished draft. Never open with a blocking question for something a lookup can resolve.

### Default Response Format (text-only requests)

When the request is only to draft text, return only the finished Autotask time entry unless the user asks for explanation or options. It should be ready to paste directly into Autotask.

When the request is to log time or take an action, do the lookups first, resolve the target ticket and every ID through the tools, stage the complete entry, and present it once for approval. Do not ask the user for information the connector can provide.

## PART 2 - TAKING ACTION THROUGH THE CONNECTOR

Use these when the user asks to look something up, create a ticket, add a note, log time, set a status, set a resolution, or close a ticket. All writes hit LIVE production Autotask. Confirm specifics before any write.

### Always resolve picklist IDs live - never hardcode

Autotask IDs are instance-specific and can change. Before any create/status/time-entry action, resolve the label to its numeric ID with the lookup tools:

autotask_list_queues - queue name to queueID
autotask_list_priorities - priority label to ID
autotask_ticket_statuses - status label to ID
autotask_list_ticket_types - ticket type label to ID
autotask_list_roles - role name to roleId (REQUIRED for time entries)
autotask_list_billing_codes - work-type/billing code name to ID
autotask_search_companies - company name to companyID
autotask_company_contacts / autotask_get_contact - contact resolution
autotask_find_resource - technician email to resource ID

Match by LABEL, not by assumed number. The priority labels in particular do NOT map to sequential IDs - see the priority table - so mapping by assumed ID sets the wrong priority.

Verified TCT IDs as of the last check (still resolve live to confirm they have not changed):

Help Desk queue: 29683490 | Administration queue (internal/test): 29683378
Priorities: Critical=4, High=1, Medium=2, Low=3
Common statuses: New=1, In Progress=8, Waiting Customer=7, Waiting Materials=9, Waiting Vendor=12, Scheduled=10, Need to Order Materials=26, Re-open=22, Escalated to Level 2=35, Escalated to Level 3=11, Complete=5
Roles: Engineer=29683355 (default), Help Desk=29683464, Network Engineer=29683460
Billing codes: Remote Support=29682801, Onsite Support=29682800

Role caveat: Kurtis's resource is NOT mapped to Low/High Voltage Technician (29683465). Passing it returns a 500 "AssignedResourceID and AssignedRoleID combination not defined". When low-voltage work needs logging, use Network Engineer (29683460) as the standing fallback - this is Kurtis's decision of 2026-08-10 and does not need re-confirming.

Contractor time: field techs and contractors without Autotask licences (Jesse Henehan, Dan Diario) have their time logged under Kurtis's resource (29682885). Name the actual performer in internalNotes. This is expected; do not query it.

Note the difference between resolving an ID and understanding a behavior. The connector resolves TCT's IDs and labels, but it does NOT expose how a status maps to the SLA clock (the SLA Event), what a workflow rule will do, or what a notification template contains. For those platform behaviors, consult the `autotask-knowledge` skill (official Kaseya docs) rather than inferring from the label - a status called "Scheduled" or "In Progress" tells you nothing reliable about whether it pauses the SLA timer; only the config/docs do.

### Looking things up (reads)

Reads are safe and need no confirmation: autotask_get_ticket / autotask_get_ticket_by_number, autotask_ticket_activity, autotask_ticket_notes, autotask_ticket_time_entries, autotask_company_tickets (openOnly available), autotask_search_companies, autotask_company_contacts. Use these freely to give the user ticket context, find a ticket by number, or list a company's open tickets.

**Prefer `autotask_ticket_activity` for ticket history.** It is live in the registry (confirmed 2026-08-10) and merges TicketNotes, TimeEntries and TicketAttachments into one chronological timeline, each item tagged with author and customer-visible-versus-internal scope. It also returns `lastCustomerNotificationDateTime`, which is the only reliable way to know whether the customer has actually been contacted. Use the two-tool read (autotask_ticket_notes plus autotask_ticket_time_entries) only as a fallback if the merged read fails.

## Evidence standard for absence claims

Never state that a ticket was not updated, that work was not done, that a note is missing, or that a technician did not follow a process, without first calling `autotask_ticket_activity` (or, as a fallback, BOTH `autotask_ticket_notes` AND `autotask_ticket_time_entries`) and reconciling against the ticket's `lastActivityDate`.

`autotask_ticket_notes` returns Autotask TicketNotes ONLY and structurally EXCLUDES time entries. TCT technicians routinely record their work as time entries, so a notes-only read can show an apparently untouched ticket while hours of completed work sit in the record. If `lastActivityDate` is newer than the newest item retrieved, activity exists that has not been read - report that gap rather than asserting absence.

An unverified claim that a person did not do their work is a false accusation, not a formatting problem. When the evidence is incomplete, say the evidence is incomplete.

The same standard applies to any claim about coverage, not just about people. A tool that returns one entity type is not evidence about entity types it cannot see. Do not conclude from `autotask_ticket_notes` that nothing happened, and do not conclude from a document list that documentation does not exist.

Two places this skill trips on it. First, the pre-close checklist item "every session of work on the ticket has a logged time entry (no unlogged work)" cannot be evaluated from notes - it requires the time-entry read. Second, when drafting an entry that continues someone else's work, read their time entries first; writing "no prior work was performed" or restaging work already logged both corrupt the billing record.

### Creating a ticket

Required: companyID, title, queueID, status, priority. Autotask may reject a create without dueDateTime, so include one.

TCT defaults:

New client tickets are born in the Help Desk queue (resolve "Help Desk" live).
Starting status is New.
Priority is set by this skill from the SLA matrix below (impact + urgency). Thread performs the authoritative downstream triage, so this priority is a sound first pass, not a gate - set it and move on; no human confirmation step for priority.
The description states ONLY the issue. All actions, findings, and resolution go in the time entry / notes / resolution field, never the ticket description.
Set dueDateTime from the SLA Resolved target for the chosen priority, in business hours (Mon-Fri 8:00 AM-5:00 PM ET). Never imply same-day resolution for work outside business hours.
Internal / non-client test tickets go in the Administration queue, not Help Desk.
After creating, report the ticketNumber and ticketUrl.

Note: creating a client ticket fires the "Notify Customer of New Ticket" workflow rule, which emails the ticket contact. This is expected, and it is the one event in the ticket lifecycle that reliably reaches the customer without further action.

### Correcting an existing ticket's fields (autotask_update_ticket)

A mis-filed ticket is fixable through the connector. It is no longer manual UI work, and telling the user otherwise is wrong.

`autotask_update_ticket(ticketId, ...)` corrects an existing ticket's core fields in place. Supply `ticketId` plus at least one of: `companyID`, `companyLocationID`, `contactID`, `title`, `description`, `queueID`, `priority`, `ticketType`, `dueDateTime`, `contractID`. Every one of those reports `isReadOnly false` on live entityInformation; a field Autotask reports read-only has no parameter at all rather than being accepted and silently ignored. A call with only `ticketId` is rejected as `INVALID_INPUT` before any network call.

The case this exists for: a ticket arriving by inbound email with `companyID 0`, or landing on the wrong company, contact, queue or type. Fix it rather than diagnosing around it - company ticket history, contract, SLA and notification recipients all follow those fields, so every downstream conclusion inherits the error.

**Two changes move who gets emailed. Say so before and after, every time.**

`companyID` RE-PARENTS the ticket. Notification recipients, the available contacts and contracts, and client-portal visibility all follow the new company. A `contactID` or `contractID` belonging to the OLD company will not survive the move - set them in the same call, or expect Autotask to reject or clear them.

**A company change moves THREE other fields, and you must say so.** Autotask refuses the entire PATCH while any record from the previous company is still attached to the ticket. All three were confirmed live on 2026-08-28:

- `companyLocationID` - `The companyLocationID[285] cannot be associated with the Ticket. The CompanyLocation must belong to the Ticket's, ConfigurationItem's, or the Contact's Company.` Autotask stamps this at create time, so every ticket has one.
- `contactID` - `Data violation: contactID is not associated to the companyID or its Parent Company..` **This is the common case, not an edge case** - a mis-filed inbound ticket almost always has a contact.
- `contractID` - `contractID [29683617] is not associated to companyID [423] or its parent.`

So a `companyID` change is never only a company change, and the tool handles all three in the SAME call:

`companyLocationID` is set to the NEW company's own primary location, read live from `CompanyLocations`; if that company declares no active primary it is cleared instead, because the field is optional and an empty site is honest where a guessed one is not. Reported in `companyLocation.source` (`caller`, `new_company_primary`, `cleared_no_primary`, `untouched`).

`contactID` and `contractID` are **CLEARED** when the ticket carries ones belonging to the old company, and reported in `clearedOnReparent` with their previous values. They are cleared rather than replaced because no non-arbitrary replacement exists - a contact is a person, and a company can hold many contracts - and because leaving the old customer's contact attached would keep emailing them about a ticket that now belongs to somebody else.

**Tell the user when either is cleared.** A cleared contact changes who Autotask emails; a cleared contract changes what the ticket bills against. If the ticket needs a contact or contract at its new company, pass `contactID` / `contractID` in the SAME call to set the right ones instead of clearing, or set them in a follow-up call. Anything you pass yourself is strictly read-back verified.

`contactID` changes WHO AUTOTASK EMAILS about the ticket. The new contact begins receiving correspondence and the previous one stops.

The response emits `reparentedNote` and `contactChangeNote` only when those actually fire. **If either appears, tell the user in plain words. Never summarise it away inside a success message.**

Behaviour to rely on:

Only the fields you pass are written. Autotask PATCH leaves omitted fields untouched, so there is no GET-and-merge and an unsupplied field can never be blanked.

Read-back verified per field. If Autotask accepts the PATCH but a value did not stick, the tool returns `PRECONDITION_FAILED`, not success. An accepted HTTP status is never reported as success on its own - and neither should you report one.

A location the tool chose for you is reported as an OBSERVATION, not verified as something you asked for. If Autotask re-stamps the location itself, you get `companyLocation.divergedNote` and the re-parent still succeeds - the company change is what was requested and it is what gets verified. Read the note and tell the user which site the ticket now carries.

**An Autotask HTTP 500 is not automatically an outage.** Autotask answers request rejections with a 500 whose body carries a structured `errors[]` array naming the field or rule that blocked it. Those come back as `PRECONDITION_FAILED` or `INVALID_INPUT`, never `TRANSIENT`, and they must not be retried unchanged - the identical call fails identically every time. If you do get `TRANSIENT` with a body that names a field, that is a classifier defect worth reporting, not a reason to retry.

Re-sending a value the ticket already had succeeds but is listed in `unchangedFields`. Do not describe those as edited.

It does NOT set assignment, status or resolution. Those keep their own tools: `autotask_assign_ticket`, `autotask_set_ticket_status`, `autotask_set_ticket_resolution`.

This is an operational row edit on a single ticket, correctable afterwards in the Autotask UI. It does NOT go through the staged-write approval gate at `/admin/connector/staged-writes` - that gate covers instance CONFIGURATION changes and is owned by the `autotask-config-manager` skill. Keep the two categories distinct; do not tell the user a ticket correction needs approval staging.

Report the ticket number and ticketUrl after the write, along with which fields changed and which came back unchanged.

### Priority logic (SLA-driven)

Inferred from impact and urgency, then mapped to the Autotask label. SLA targets (business hours, Mon-Fri 8-5 ET):

Priority (label) | SLA tier | First Response | Resolution Plan | Resolved | Typical trigger
Critical | P1 | 30 min | 2 hr | 4 hr | Entire company down; server down; active security compromise
High | P2 | 1 hr | 4 hr | 8 hr | Multiple users / department impacted; major function broken
Medium | P3 | 2 hr | 8 hr | 24 hr | Single user blocked; one workstation/app down
Low | P4 | 8 hr | 24 hr | Best effort | Non-blocking, cosmetic, questions, user-level requests

Always confirm current numeric IDs via autotask_list_priorities before setting - the label-to-ID mapping is not sequential.

### Time entries (autotask_create_time_entry)

Requirements confirmed against the live instance:

roleId is REQUIRED. Resolve via autotask_list_roles (Help Desk work -> Help Desk role 29683464).
SERVICE tickets REQUIRE startDateTime and stopDateTime (ISO 8601). hoursWorked is then optional and derived from the interval. A time entry without start/stop will be rejected on a service ticket.
billingCodeId sets the work type (e.g., Remote Support, Onsite Support). Resolve and include it on every entry - an entry without a work type is incomplete for billing review. If you cannot determine the right code, state which one you chose and why rather than omitting it.
summaryNotes carries the TCT-format work summary (Part 1 rules). summaryNotes does NOT populate the ticket Resolution field on its own.
internalNotes for behind-the-scenes / handoff detail not shown to the customer.

**Logging a time entry does NOT reliably notify the customer.** Verified 2026-08-10: entries logged on tickets 34997 and 34998 left `lastCustomerNotificationDateTime` unchanged at the ticket-creation timestamp. Whether any email fires depends on Autotask Events that vary by queue and category, and the connector cannot read them. Never assume a time entry informed anyone. If the customer needs to know something, send it - see Customer communication.

### Status discipline (this is where SLA time is lost - get it right)

The SLA timer runs, pauses, or stops based on status. The single most important rule across all three SOPs: never leave a ticket in a status that no longer describes reality - a running status while waiting on someone else burns SLA time, and a paused status after the dependency cleared hides live work from every report and dashboard.

Running (SLA clock active): New, In Progress (set as soon as work begins), Customer Note Added, Escalated to Level 2, Escalated to Level 3, Re-open.

Paused (use when blocked, to protect SLA): Waiting Customer, Waiting Vendor, Waiting Materials, Need to Order Materials, Needs Quote, Scheduled, Waiting on Down Payment, Waiting on Payment, Billing Reconciliation, Corr./Bad Blocks (On hold).

Stopped: Complete.

**Status is part of every write, not a separate favour.** Any time you log a time entry, add a note, or otherwise record work on a ticket, evaluate the status in the same action and correct it if it no longer describes reality. Do not ask permission to do this and do not defer it to a follow-up question - a stale status is a defect in the record you just wrote, the same as a wrong date would be.

The evaluation is one question: does the current status still describe what is true right now? If a paused status names a dependency that has cleared - materials arrived, the customer replied, the vendor answered, the payment posted - move it to In Progress. If work has just become blocked, move it to the matching waiting status. If nothing changed, leave it.

Report the status you set, or state explicitly that you checked it and left it unchanged and why. Never finish a write without one of those two statements. Resolve the numeric ID via autotask_ticket_statuses first; never hardcode.

The single exception is Complete, which stays gated on explicit human go because it emails the customer.

Failure case this rule exists to prevent (2026-08-10, tickets 34997 and 34998): hardware had been received and unboxed, two time entries and four notes were written describing that work, and both tickets sat at Waiting Materials throughout. The status was raised to the user as a question at the end instead of being corrected as part of the work.

The running/paused groupings above reflect TCT's intended configuration. To confirm how a specific status is actually mapped to the SLA clock (its SLA Event), that is a platform-config question for the `autotask-knowledge` skill and the Statuses config page, not something to infer from the status name.

### Customer communication - a note is not a message

Before finishing any write, ask: did anything just change that the customer needs to act on, or would reasonably expect to be told? Hardware arriving, a delivery date, a scheduling change, a step the end user has to perform, a dependency now sitting with them, a cost or scope change. If yes, communication is part of this task and is not optional.

Know what each mechanism actually does:

`autotask_add_internal_note` (publish 2, "Internal Project Team") is invisible to the customer. Use it for handoff detail, findings, internal reasoning, and anything the customer should not see.

`autotask_add_customer_note` (publish 1, "All Autotask Users") makes a note visible in the Client Portal. **IT DOES NOT EMAIL ANYONE AND CANNOT.** The Autotask REST TicketNotes entity has no notification field; delivery depends on an Autotask Event that does not exist for tech-added notes. The connector reports `customerNotified` derived from `Tickets.lastCustomerNotificationDateTime` - when it comes back false, the customer has not been contacted. Never describe posting this note as having told the customer.

Email is the only mechanism that reliably reaches the customer mid-ticket. Draft it using the `kurtis-email-voice` skill, addressed to the person who actually has to do something - the end user, not only the billing contact - and stage it for send.

Choosing the publish level is a judgement about audience, and internal is not the safe default. Internal-only is correct for findings, diagnostics, and handoff detail. It is wrong for anything the customer must act on. Defaulting everything to internal produces a ticket that reads as well-maintained internally while the customer knows nothing.

**When a ticket goes to Waiting Customer, the customer must have been told what you are waiting on and how to tell you it is done - or the message telling them must have been drafted and handed to the user to send in this same turn.** A drafted and approved customer message counts as told. Do not withhold the status change pending proof of delivery, and do not raise it as a follow-up question; set the status in the same turn as the write. Setting Waiting Customer when no such message exists at all is the defect this rule guards against: the SLA clock is paused against someone who does not know they are holding the ticket.

The test is whether a dependency has been placed on the customer and communicated, not whether you personally watched the send. If the work you just logged says the ticket is waiting on the customer, the status says Waiting Customer. A summary and a status that contradict each other is a broken record.

Verify rather than assume. Check `lastCustomerNotificationDateTime` via `autotask_ticket_activity` before stating the customer is informed. Do not infer it from having written a note or logged time.

Failure case this rule exists to prevent (2026-08-10, ticket 34997): the end user's replacement computer had arrived and was being delivered the same day, and she needed to plug it in at home before any remote work could proceed. Every update was posted internal-only. The last customer notification on the ticket was the automatic creation email six days earlier. The person whose action the ticket depended on had been told nothing.

### Escalation

Escalate (set Escalated to Level 2, assign the appropriate Tier 2 queue, document intake + steps + reason) when a Tier 1 boundary is hit: beyond capability, customer urgent/frustrated, multiple users impacted, near SLA breach, admin/GA rights required, infrastructure involved, credible security threat, no progress in 30 minutes, or 60 minutes total on one ticket. If an SLA ticket is already overdue, escalate to the Tier 2 lead or Kurtis immediately.

### Setting the resolution (autotask_set_ticket_resolution)

The Resolution field - not the time-entry summary - is what fills the customer "ticket completed" notification email. This is verified: the completion email body renders the Resolution text. If Resolution is empty at close, the customer gets a blank "What we did" section.

Use autotask_set_ticket_resolution(ticketId, resolution, append). append defaults true (preserves and adds below); false overwrites. This is the reliable method - prefer it.
The appendSummaryToResolution flag on the time entry does the same thing in one step, but pass it as a real boolean; if it errors as a type mismatch, fall back to autotask_set_ticket_resolution.
The resolution must be a full, client-ready summary of the whole ticket - what was wrong and how it was resolved - written for the customer to read. Never one-line ("fixed it", "done").

### Closing a ticket - verified sequence + light human gate

Verified close sequence (proven end to end):

Log the final time entry (start/stop, role, billing code, TCT-format summary).
Set the Resolution field with a full client-ready summary (autotask_set_ticket_resolution).
Confirm the Resolution is populated.
THEN set status to Complete (autotask_set_ticket_status -> 5), which fires the completion email pulling from Resolution.
Never set Complete before Resolution is populated.

Human gate on close: because setting Complete emails the customer, do NOT set Complete autonomously. Draft the resolution, stage the close, and require an explicit "close it" / "mark complete" from the user before setting Complete. Everything else in this skill runs as directed without a gate; this one final step is confirmed with the human first. (A human is already directing this skill, so this is a quick confirmation, not a separate approval layer.)

Do not manually select the Ticket Contact under Quick Notification - the completion email fires automatically on Complete; selecting the contact causes a duplicate.

Duplicate-email note: the "Notify Customer of Ticket Completion" rule fires on Complete for Help Desk and most queues. A separate Nexus completion rule fires only when the company UDF "Enabled for KHD" = Yes. For KHD-enabled companies, be aware both may fire.

### Pre-close checklist - "what good looks like" before Complete

Before setting Complete, confirm all of these. If any fails, stop, tell the user which one, and do not close:

The work is actually done and, where the SOP expects it, confirmed with the customer - not just "appears fixed."
Every session of work on the ticket has a logged time entry (no unlogged work) - verify with autotask_ticket_activity, not from notes, and reconcile against lastActivityDate.
Every time entry carries a role and a billing code.
The Resolution field contains a full, client-ready summary (what was wrong + how it was fixed), not one line.
The ticket is not actually waiting on anyone - if blocked, it goes to the matching waiting status, not Complete.
The customer was told what they needed to know during the ticket, not only at close - check lastCustomerNotificationDateTime.
SLA milestones were satisfied, or if one was breached there is an internal note explaining cause, corrective action, and prevention.
The ticket is not mid-escalation with the underlying issue unresolved.
The Ticket Contact is not manually selected under Quick Notification.

### Safety rules for live actions

All connector writes hit LIVE production Autotask. Confirm the specifics (company, queue, priority, status, title, note/resolution text) before writing.
Setting Complete on a live client ticket sends a customer email - gated on explicit human go (above).
Never put actions/findings/resolution in the ticket description - only the issue statement goes there.
Writes are attributed to the signed-in tech automatically via Autotask resource impersonation; do not attempt to spoof a different creator. The tech's connector sign-in email must match their Autotask resource email or every write fails with "No active Autotask resource found."
If a time entry is rejected for missing start/stop or role, add them and retry. If a create is rejected for a missing due date, add dueDateTime from the SLA Resolved target and retry.
**A note CAN be edited.** `autotask_update_ticket_note` is live and verified - it changes an existing note's description, title or publish level in place, addressed by NOTE id (TicketNotes.id), one note per call. Correct a wrong note in place. Do NOT stack a correcting note on top of it: stacked corrections make a ticket unreadable for the tech who has to follow it. A note still cannot be DELETED - entityInformation reports TicketNotes.canDelete false - so removal is a UI action for a human with the rights to it.
Changing `publish` on a note can move it between internal and CUSTOMER-VISIBLE in either direction. The response reports the before and after ids with their live labels and scope. Any change that moves customer visibility gets said out loud, before and after - never let a visibility change ride silently inside a success message.
Never report a write as done from an HTTP status. Every write tool on this connector re-reads the record and compares each requested field; "done" means a verified read-back, not a 200.
Never state a connector or vendor limitation from memory. Before telling anyone something cannot be done, call `tct_connector_capabilities`, or `autotask_capability_check` / `autotask_entity_capabilities` for a specific Autotask entity or field. A read-only flag is a question, not a verdict. A false "the API can't do that" is worse than no answer, because it stops people trying - this skill previously carried exactly that error about note editing. If a capability appears in neither `tools[]` nor `knownLimits`, say it is UNKNOWN rather than impossible.
Tool lists are cached per session. If a tool named here is not visible, that measures the client's cache, not the server - reconnect the connector or start a fresh conversation before concluding it does not exist.

## Handoff from a troubleshooting skill (future)

When a separate troubleshooting/triage skill (built later, for automation) has already gathered intake, findings, and next steps, this skill formats that into the time entry / resolution and performs the requested Autotask action. Do not re-run troubleshooting here - take the provided findings and produce the record.
