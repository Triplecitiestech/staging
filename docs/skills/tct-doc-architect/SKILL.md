---
name: tct-doc-architect
description: Use this skill whenever a Triple Cities Tech team member is auditing, cleaning up, restructuring, or creating IT Glue documentation and SOPs for a system, SaaS platform, or process - especially anything spanning more than one document. Trigger on requests like "audit our Domotz docs", "clean up the SOPs for X", "our onboarding docs are a mess", "is there overlap between these SOPs", "create a SOP for deploying Y", "we need a start-here doc", "standardize the naming on these", or whenever a new SOP risks overlapping existing docs. It maps a document set, finds redundancy, overlap, orphans, and broken cross-references, and produces a remediation plan plus a clear split of what Claude executes versus what the human must do in IT Glue. It also authors new SOPs to the TCT standard so they fit the existing hierarchy without new overlap. Human-directed and approval-gated - it proposes, the human approves, then Claude executes.
---

# TCT Documentation Architect

## What this skill is for

Triple Cities Tech's knowledge base lives in IT Glue. Most real systems (Domotz, Ubiquiti/UniFi, Microsoft 365, Datto RMM, RocketCyber, data backup, customer onboarding) cannot be captured in a single SOP. They need a "start here" document and a set of sub-SOPs that branch, with clear links between them. When that structure is missing, the same facts get restated across documents, the copies drift out of sync, and both humans and AI get conflicting instructions. Customer onboarding is the extreme case: it spiderwebs into dozens of system-specific SOPs.

This skill does two jobs:

1. **Audit and restructure** an existing document set - map it, find redundancy/overlap/orphans/broken links, and produce a remediation plan.
2. **Author** a new SOP that fits the standard and does not duplicate what already exists.

Underneath both is the **TCT Documentation Standard** (`references/tct-documentation-standard.md`) - the rules for what a good SOP looks like, the start-here/sub pattern, naming conventions, folder structure, formatting, and when to link versus merge. Read that file at the start of any run; it is the source of truth this skill enforces.

The standard also lives in IT Glue as doc 24227609, "TCT Documentation Standard (START HERE)". If the two ever disagree, the IT Glue copy is authoritative and this skill's copy needs updating.

## IT Glue is not just documents - survey the whole record first

**This is the most consequential rule in this skill and the easiest to skip.** IT Glue holds a client's knowledge across several different record types. Documents are only one of them. A run that reads `itglue_org_documents` and nothing else will draw false conclusions in both directions: it will report gaps that are already covered elsewhere, and it will author a document that duplicates or contradicts a flexible asset.

Before auditing or authoring anything for an organisation, survey these:

**Documents** - `itglue_org_documents` (full library, paginated), `itglue_search_documents`, `itglue_global_search`, `itglue_document_sections`, `itglue_list_document_folders`. All three document reads share the same archived behaviour - see Archived documents below, and read it before running any audit, because the default excludes rows and the page counts do not.

**Flexible assets** - the structured templates, and where most system and application detail actually lives. Call `itglue_flexible_asset_types` to list the account's types, then `itglue_org_flexible_assets` per relevant type for the org. There are roughly thirty types in this account. The ones that most often carry what you are about to write about: Applications, LAN, Internet/WAN, Wireless, Remote Access, Security, Backup, Printing, Voice/PBX, Licensing, Microsoft Licenses, Site Summary, Email, File Sharing, Active Directory, Vendors, Policies, Router, Switch, Wireless Access Point, Printers, NVR, Unifi Controller, Generic Asset. Read the traits with `itglue_get_flexible_asset` and the schema with `itglue_flexible_asset_type_fields`.

**Configurations** - `itglue_org_configurations` for devices and assets, including the workstation and server records that flexible assets link to.

**Quick Notes** - `itglue_get_quick_notes` returns the org's untruncated Quick Notes, which frequently hold the one caveat that matters.

Which types you survey depends on the topic, and you must state which ones you checked and which you did not. "I checked Applications and Remote Access, 2 of the roughly 30 asset types" is a complete and honest statement. "The org has thin documentation" after reading only the document list is a false claim.

Three specific failure patterns to avoid:

- **Concluding coverage from a partial read.** A document list is not an inventory of documentation, in exactly the way a monitoring platform's device list is not an inventory of what TCT manages. Name the tool and the record type behind any coverage claim.
- **Duplicating a flexible asset in prose.** If application detail already sits in an Applications asset, the new document must link to it and not restate it. Restated facts drift.
- **Missing a build or process requirement that only exists in an asset trait.** Real example (2026-08-10, Don Orall's Garage - Hancock): the FleetCross Applications asset recorded that every device must be registered individually with the vendor. That requirement appeared in no document, no ticket, and no quote. A workstation build planned from documents alone would have shipped without it.

Note also that credentials sometimes sit in plaintext in asset notes fields and document bodies, against the rule that they belong in password records. When you find that, report it - do not copy it forward into anything new.

## Formatting is the most common failure

Read section 6 of the standard before writing a single line of document body, and treat it as prescriptive rather than advisory. The recurring failure mode is producing correct content in an unusable shape - headings followed by stacked paragraphs, no numbered steps, no navigation structure. Specifically:

- Number every top-level section and put the number in the heading text: `<h2>1) Purpose</h2>`.
- Use `<h3>` for lettered sub-blocks: `<h3>A. Record the Win - Rio</h3>`. IT Glue builds a two-level navigation pane from `<h2>`/`<h3>`, and that pane is the most useful thing on the page. Do not flatten the hierarchy to avoid long sections.
- Every procedure step is an `<li><p>` in an `<ol>`, one line long, opening with a bolded imperative label.
- All caveats, examples and reasoning go in a nested `<ul>` inside the step, never fused into the instruction. Prefix reasons with `<em>Why:</em>`.
- Continue step numbering across sub-blocks with `<ol start="N">`.
- Open with Purpose, Process flow, and You are here. Close with If This Goes Wrong, Completion Checklist, Official Vendor Resources, Related SOPs.
- Tables for three-or-more-column data. Bolded-term bullets for two-column term-and-definition lists.

`references/sop-template.md` carries the skeletons. Use them.

## Archived documents

`itglue_search_documents`, `itglue_global_search` and `itglue_org_documents` all behave the same way here, and all three EXCLUDE archived documents by default (`includeArchived` defaults to false).

**An audit must pass `includeArchived: true` and then tag what it found.** The default is right for triage - a technician reading procedure should see live documents only - but it is wrong for an inventory. An overlap analysis, redundancy check or SOP inventory run on the default will silently miss archived rows, which means it can report a gap that an archived document already covers, or propose creating something that already exists in retired form. Say in the deliverable which mode you ran in.

**Read `doc.archived` before treating any document as current.** Prefer the top-level key, falling back to `doc.attributes.archived`: `doc.archived ?? doc.attributes?.archived`. The top-level key is the one being made uniform across all three tools; until that has shipped everywhere, a caller that reads only the top level on `itglue_org_documents` gets `undefined`, which is falsy, which reads as "not archived" - a retired SOP presented as current. The fallback costs nothing and closes that hole.

**IT Glue's `meta` counts include archived rows.** A filtered page can therefore return fewer documents than the page size. Read `archivedExcluded` for how many were dropped, and **never treat a short page as the end of the results** - that is a paging bug that silently truncates an audit.

Archiving is a state to read, not a state Claude can set. Archiving a document remains a human action in the IT Glue UI (see below).

## What Claude can and cannot do in IT Glue

The connector **can**: read documents, sections, org document lists, folder lists, and Quick Notes; search documents (with an `includeArchived` filter and a per-document `archived` flag); create documents; rewrite and append document body sections; **rename** a document title; **publish** a document; **set native Related Items relationships**; read org configurations; and read/create/update flexible assets.

The connector **cannot**: delete a document, or archive a document. Those remain human actions in the IT Glue UI. Both are `NOT_BUILT` rather than vendor limits - the API supports them and they have not been implemented - so describe them as not yet built, not as impossible.

The connector **cannot and will not** read or write IT Glue passwords. No tool touches the passwords resource, and passwords are excluded on both ends of `itglue_relate_items` and `itglue_upload_attachment`. This is a deliberate blast-radius decision, not an API limitation. Never promise credential retrieval, and do not raise it as a gap to fix.

**Folder placement is create-time only, permanently.** IT Glue's API cannot move an existing document between folders. Its developer reference marks `data[attributes][document_folder_id]` as "Not permitted in PUT/PATCH, optional in POST" on both `PATCH /documents/:id` and the bulk `PATCH /documents`. `itglue_move_document` stays registered so the reason is discoverable, but it writes nothing and returns `UPSTREAM_UNSUPPORTED` / `fixableBy: vendor`. Do not retry it, and do not raise it as a connector defect — it is a vendor limit, not something Claude Code can fix. `itglue_rename_document` now hard-fails if passed a `documentFolderId` rather than ignoring it silently.

**Therefore: always set `documentFolderId` on `itglue_create_document`.** It is the only API-supported placement, and a document created at the org root can only be relocated by a human in the IT Glue UI (Documents list, tick the row, Move). If the org has no suitable folder, create one with `itglue_create_document_folder` before creating the document - check `itglue_list_document_folders` first and reuse an existing folder over a near-duplicate name.

Three more behaviors to know:

- The `publish` flag on `itglue_create_document` does not reliably take effect. Always follow a create with an explicit `itglue_publish_document` call and check the response for `published: true`.
- `itglue_publish_document` is read-back verified. A response of `published: false` means IT Glue did not apply the change — report that, do not claim success.
- `itglue_relate_items` links **both** panes in a single call. The API stores one bidirectional relation and rejects the inverse with a 422. Do not call it a second time in the other direction. One pair per call, so a set of five documents needs ten calls.

Section edits land on the DRAFT only. `itglue_update_document_section` and `itglue_add_document_section` do not change what technicians see until `itglue_publish_document` is called. A section edit reported as done without a publish is a document nobody can read.

**Every deliverable must still clearly separate "What Claude did" from "What you need to do in IT Glue."** The human list is now short — delete, archive, and folder moves — but stating it explicitly is what stops the human wondering whether something is outstanding. Never tell the human to rename, publish, or relate something Claude has already done.

**Verify capability against the live tool list, not against this file.** The connector is under active development and this section has been wrong in both directions. Before telling the human something is a manual action, call `tct_connector_capabilities` and confirm no tool exists for it. A capability listed in neither `tools[]` nor `knownLimits` is UNKNOWN, not impossible - say so.

**Check whether something already exists before building or rewriting it.** An instruction to add a capability is not evidence the capability is absent. The `includeArchived` filter had been live since 2026-07-15 while a later handoff described it as new work; only its test coverage was missing. Read the current behaviour first and report what you found, rather than silently rebuilding something that already works. The same applies to documentation: check for the existing SOP before authoring a replacement.

**Tool lists are cached per session.** If a tool named in this file is not visible, that measures this client's cache, not the server. Reconnect the connector or start a fresh conversation before concluding the tool does not exist.

## Default posture: propose, then execute on approval

This skill is analyze-and-propose. It does not rewrite bodies, merge, or restructure until the human approves the plan. Reading is free and encouraged; writing waits for a go. Merges and deletes are especially sensitive because deletes are irreversible and cannot be done by the connector anyway - always confirm nothing unique is lost before recommending a delete.

When creating a genuinely new document at the human's request, creating it as an unpublished draft and presenting it for review is the safe default. Publish once they have seen it, unless they have already told you to publish without review.

## Workflow

### Step 0 - Load the standard

Read `references/tct-documentation-standard.md` in full before doing anything else. Everything below applies it.

### Step 1 - Scope the run

Confirm what you are pointing at: a single system/folder (e.g. "the Domotz folder"), a process that spans systems (e.g. onboarding), or a brand-new SOP to author. Get the IT Glue org id (TCT is 6942365; customer orgs resolve via `itglue_search_orgs`) and, if known, the folder. If the scope is a process that spiderwebs, treat the process doc as the hub and each system as its own cluster to be handled in turn rather than all at once.

### Step 2 - Survey the whole record, then map what exists

Build the picture before proposing anything. Follow the survey rule above - documents, flexible assets, configurations, and Quick Notes - not documents alone.

- Enumerate documents with `itglue_org_documents`, `itglue_search_documents`, and `itglue_global_search`.
- Read candidate document bodies with `itglue_document_sections`.
- List the account's flexible asset types with `itglue_flexible_asset_types`, then pull the org's assets for every type plausibly related to the topic with `itglue_org_flexible_assets`.
- Pull `itglue_org_configurations` where device or workstation context matters.
- Read `itglue_get_quick_notes`.

Record for each document: id, current title, URL, its folder (or that it sits at the org root, which is a defect), whether its body is real content or a stub, and what topics it actually covers. Record for each flexible asset: type, name, id, URL, and which facts it owns - so the new or revised documents can link to it instead of restating it.

Then analyze the set for the problems the standard defines:
- **Redundancy** - the same facts stated in more than one place, including a document restating a flexible asset.
- **Overlap** - two records that partly cover the same ground with no clear boundary or authority.
- **Orphans** - records nothing links to and that link nowhere.
- **Broken or plain-text cross-references** - a doc names another SOP or an asset but does not link to it.
- **Naming drift** - titles that do not follow the convention or do not sort as a set.
- **Missing hub** - a cluster with no clear "start here" document.
- **Stub bodies** - real content trapped in PDF attachments instead of inline text.
- **Formatting defects** - bodies that fail section 6: unnumbered headings, steps written as paragraphs, no navigation structure, missing checklist.
- **Root-level documents** - anything with no folder.
- **Stale asset traits** - an asset naming a host, path, or version that no longer matches live data from Datto RMM, UniFi, or Autotask. Cross-check where you can, and flag rather than silently correcting.
- **Credentials in the wrong place** - passwords in document bodies or asset notes fields instead of password records.

### Step 3 - Produce the remediation plan

Present a single clear plan using the template in `references/audit-report-template.md`. It must include the proposed target structure (hub + subs, in deployment/logical order), the naming changes, the redundancy/merge decisions, the cross-link map, and an explicit statement of which record types you surveyed and which you did not - and it must split every action into Claude's list and the human's list. Do not start editing until the human approves.

### Step 4 - Execute (only after approval)

- Rewrite document bodies via `itglue_update_document_section` (replaces a section in place - no new document, so no duplicate risk) or `itglue_add_document_section` to append.
- Note that `itglue_add_document_section` appends to the end. If content belongs at the top of a document - a superseded notice, for example - prepend it by rewriting the first section instead.
- Rename with `itglue_rename_document`, publish with `itglue_publish_document`. Check the read-back on each. Folder placement cannot be changed after create.
- Update a stale flexible asset with `itglue_update_flexible_asset`, passing only the changed traits - the tool GET-merges before PATCH because IT Glue's PATCH is otherwise destructive.
- Add inline hyperlinks to every SOP and flexible asset mention using anchor text = the record's approved title and href = its ID-based URL.
- Give every doc a Completion Checklist and a "Related SOPs" link list near the end of its body, and reference the relevant flexible assets there too.
- Never use a create call to "replace" an existing doc - update the existing section instead. (History: a create call once timed out and spawned a duplicate. Prefer update/add on existing docs.)

### Step 5 - Hand off

Deliver two lists explicitly. Example shape:

**What Claude did (already applied and published):**
- Rebuilt body of doc 18919820 inline, phased, with inline links added. Published and verified.
- Renamed doc 19986498 to "<new title>".
- Created doc 24601683 in the Workstations folder, published and verified.

**What you need to do in IT Glue (Claude cannot do these):**
- On each of the 5 docs, Add Related Item and attach the other 4 (fastest: open doc, Add Related Item, search "Domotz", add the rest).
- Delete doc <id> ("<title>") - redundant, content folded into <target docs>. Skim it once against <target> before deleting; deletes are irreversible.
- Move the 4 pre-existing root-level docs into the new folder - the API cannot move a document after create.

State the survey scope in the handoff as well: which record types were checked, and which were not.

### Authoring mode (new SOP)

When the request is to create a new SOP:

1. **Survey first, write second.** Run the Step 2 survey - documents AND flexible assets AND configurations AND Quick Notes - for the org and topic. If a hub or related subs exist, the new doc must fit that cluster and link to it. If the facts already live in a flexible asset, link to the asset rather than restating it. If drafting would duplicate an existing record, say so and propose extending it instead.
2. **Resolve the destination folder before creating.** Call `itglue_list_document_folders` and pass the matching id as `documentFolderId`. Create the folder first if none fits. Omitting it silently drops the document at the org root, which is a defect under section 4 of the standard and cannot be fixed by the API afterwards.
3. Draft to the standard: the section 6 formatting rules, purpose/scope up top, the start-here vs sub role stated, numbered steps in lettered sub-blocks, inline links to related SOPs and flexible assets, a Completion Checklist, a Related SOPs list, and TCT conventions (Autotask terms "Events" not "Triggers"; notification settings under the Notification tab; no manufactured filler).
4. Scope the document against what already exists. Say in the Scope section what this document does NOT cover and where that lives instead. This is what stops the next revision from swallowing a flexible asset's job.
5. Never put credentials in a document. If the source material contains them, leave them out and flag that they need a password record.
6. Create the document, publish explicitly, and confirm the read-back. Include a Revision History table and bump the version on every subsequent edit.

## TCT specifics to carry into every run

- Org: Triple Cities Tech, IT Glue org id 6942365. Doc URL pattern: `https://triple-cities-tech.itglue.com/6942365/docs/<id>`. Customer org docs follow the same pattern with the customer's org id.
- Flexible asset URL pattern: `https://triple-cities-tech.itglue.com/<orgId>/assets/<typeId>-<type-slug>/records/<assetId>`.
- Always give a clickable link alongside any record ID, never a bare ID. This applies to documents, folders, flexible assets, configurations, Autotask tickets, and Datto RMM devices.
- Storage is by **folder per system**, not tags. Keep a system's docs in that system's folder. HR SOPs go in the Human Resources folder. Nothing belongs at the org root.
- Deliver full updated documents, not partial fragments; separate SOPs for distinct processes.
- Link doc references by document **ID-based URL**, which survives renames.
- Reference at least one official vendor doc where product behavior is described, and record the date it was verified. Never write a UI click-path from memory - fetch the vendor's current page, or label the step UNVERIFIED.
- IT Glue retains version history indefinitely, so a prior published revision is always available as a fallback reference.

## Files in this skill

- `references/tct-documentation-standard.md` - the canonical standard this skill enforces. Mirrored in IT Glue as doc 24227609, which is authoritative if the two disagree. Read it at Step 0.
- `references/audit-report-template.md` - the exact structure for the Step 3 remediation plan, including the two-list human/AI split and the survey-scope statement.
- `references/sop-template.md` - the skeleton for a well-formed hub SOP and sub-SOP, with the naming convention and cross-link patterns.
