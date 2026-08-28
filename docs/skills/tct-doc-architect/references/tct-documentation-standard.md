# TCT Documentation Standard

This is the standard for how Triple Cities Tech documents systems and processes in IT Glue. It exists so that our knowledge base is consistent, non-redundant, and equally readable by a technician and by an AI assistant. Conflicting or duplicated documentation is a defect: it confuses people, and it makes AI-assisted work unreliable because the model cannot tell which copy is authoritative.

This document is both the reference the tct-doc-architect skill enforces and the master standard that should live in IT Glue for the team to read.

## 1. Core principles

1. **One fact, one home.** Any given fact, step, threshold, or definition lives in exactly one document. Every other document that needs it links to that home rather than restating it. Restating is how copies drift apart.
2. **A system is a set, not a page.** Most systems and processes cannot be a single SOP. They are a hub ("start here") plus sub-SOPs that branch. Design the set, then write the pages.
3. **Structure is navigable.** A reader dropped into any document can tell what it is, where it sits in the set, and where to go next. Every doc links up to its hub and across to its siblings.
4. **Real content, inline.** Procedures live as text in the document body, not trapped in PDF attachments or "refer to the attached document" stubs. Attachments may supplement (screenshots), never replace, the written steps.
5. **Written for humans and AI.** Plain, direct language. Explain the "why" behind a critical step so it is not skipped. Avoid ambiguity that a model would resolve by guessing.
6. **Scannable before readable.** A technician mid-task does not read a document, they scan it for the step they are on. If the reader has to consume a paragraph to find out whether it contains an instruction, the document has failed regardless of how well written it is. Section 6 is not cosmetic; it is the difference between a document that gets used and one that gets ignored.
7. **Clear ownership of actions.** Documentation work is split between what an AI assistant can do and what a human must do in IT Glue. Every deliverable states which is which.

## 2. The hub-and-sub model

For any system or process that needs more than one document:

- **Hub ("START HERE") document.** Defines what the system is, the required sequence, and how the sub-SOPs fit together. It is the entry point and the index. Its title ends with `(START HERE)`. It carries: purpose, what the system is/what it is used for, the ordered deployment or execution sequence with each step linking to the relevant sub-SOP, a list of the sub-SOPs, official vendor resources, and completion/definition-of-done criteria.
- **Sub-SOPs.** Each covers one procedure or task within the system (install, alerting, a specific configuration, a correction). Each states at the top that it is part of the hub (with a link), covers its one job in full, and ends with a "Related SOPs" link list.
- **Process hubs that span systems.** A process like customer onboarding is a hub whose "steps" each point to a system's own hub (Domotz, Datto RMM, M365, RocketCyber, backup, etc.). The process hub does not contain the system procedures; it sequences and links to them. Each system remains its own cluster in its own folder.

## 3. Naming convention

- Every document in a system's set is prefixed with the system name and a spaced hyphen: `System - Topic`. Example: `Domotz - Setup Shared Alerts for Devices`.
- The hub adds the start-here marker: `System - <Overall Standard/Guide> (START HERE)`. Example: `Domotz - Deployment & Monitoring Standard (START HERE)`.
- Titles should be written so the set sorts and reads together. Avoid one-off titles that break the prefix pattern (e.g. "How to install and register a Domotz device" becomes `Domotz - Install & Register a Collector`).
- Use Title Case. Keep titles short and action- or topic-oriented. Do not put version numbers or dates in titles.
- **Retired documents** are prefixed `SUPERSEDED - ` so they are unmistakable in search results and folder listings, and carry a superseded notice in the body naming the document that replaced them.
- **Process SOPs that span systems** have no system prefix to use. Convention is still to be decided; until then, name them after the stage of work in Title Case (e.g. `Ordering Equipment After Customer Payment`) and keep the set consistent with its siblings.

## 4. Folder structure

- One folder per system, holding that system's whole set. Organize by folder, not by tags.
- HR SOPs live in the Human Resources folder. Follow any established folder home for a given domain.
- A process hub (e.g. onboarding) lives in its process folder and links out to each system folder's hub.

## 5. Anatomy of a good SOP body

Hub SOP:
1. Purpose (one paragraph; include the single most important principle of the system).
2. What the system is / what it is used for (and what it is explicitly not used for).
3. Required sequence - ordered steps, each linking to the sub-SOP that carries the detail. Flag the mandatory, most-missed steps.
4. Sub-SOP list (linked).
5. Official vendor resources.
6. Edge cases / notable conditions.
7. Completion requirements (definition of done).

Sub-SOP:
1. One-line statement of what it covers and that it is part of the hub (linked).
2. The key principle or warning for this task, if there is a common failure mode.
3. The procedure, in numbered steps grouped into labeled phases (see section 6).
4. A troubleshooting or "if this goes wrong" section where useful.
5. Completion checklist.
6. Related SOPs (linked list).

## 6. Formatting for readability

This section is prescriptive. Deviating from it is what produces the wall-of-text failure mode.

### 6.1 Required document furniture

Every SOP body opens with, in this order:

1. A **`<p><strong>Purpose:</strong> ...</p>`** lead paragraph containing the single most important principle in bold.
2. A **`<p><strong>Process flow:</strong> ...</p>`** line showing the whole chain the document sits in, as a single arrow sequence, with the current stage in bold. Example: `Quote Sent → **Quote Accepted → Invoice → Payment Received** → Order Equipment → Receive Materials`.
3. A **`<p><strong>You are here:</strong> ...</p>`** line naming the current stage and linking the immediately preceding and following SOPs.

Every SOP body closes with, in this order: **If This Goes Wrong**, **Completion Checklist**, **Official Vendor Resources** (where product behavior is described), **Related SOPs**.

### 6.2 Headings, numbering and the navigation pane

IT Glue renders a navigation pane down the left side of every document, built automatically from the heading hierarchy. It is the single most useful thing on the page for a technician mid-task, and it is entirely a product of how headings are structured. Get this wrong and the document is unnavigable no matter how good the writing is.

- **Number every top-level section** and put the number in the heading text: `<h2>1) Purpose</h2>`, `<h2>2) Scope</h2>`, `<h2>3) Process Flow Overview</h2>`. Numbering makes sections referenceable - "see section 4" - which prose cross-references cannot do.
- **Top-level sections are `<h2>`.** Put an `<hr>` between every one.
- **Use `<h3>` for sub-blocks within a section**, lettered rather than numbered so the two levels stay visually distinct: `<h3>A. Record the Win - Quote Owner &amp; Rio</h3>`. This is what produces the second, indented level in the navigation pane. Do not avoid `<h3>` - a flat document of `<h2>` only produces a flat, unhelpful outline.
- **Name the owning role in the sub-block heading** where a procedure changes hands, so the reader knows who does the block before reading it.
- Do not go deeper than `<h3>`. A fourth level does not render usefully in the pane.

### 6.3 Steps are always numbered list items

- Every procedure step is an `<li><p>` inside an `<ol>`. **Never** write a step as a heading followed by paragraphs.
- Each step opens with a short bolded imperative label, then the detail: `<li><p><strong>Verify the delivery address.</strong> Autotask is the source of truth...</p></li>`.
- **One idea per step, and keep the step itself to one line.** "In Kaseya Quote Manager, create a new Quote." is a step. A three-sentence paragraph is not, even wrapped in `<li>` - that is still a wall of text, just numbered.
- **Demote all explanation to nested sub-bullets.** Caveats, the reason a step matters, and worked examples go in a `<ul>` inside the `<li>`, not fused into the instruction. Prefix a reason with `<em>Why:</em>` so the reader can skip or read it deliberately.
- If a step contains two instructions joined by "and then", split it.
- Group long procedures into labeled phases with an `<h2>Phase N - <label></h2>` heading each, and continue the numbering across phases with `<ol start="N">` so step references stay stable when phases are added.

### 6.4 Prose has a job, and it is not procedure

Use prose for Purpose, Scope, the "why" behind a critical step, and troubleshooting explanation. Do not use prose to carry procedure. The instruction in section 6 of earlier versions of this standard - "use prose, not bullet dumps" - applies to *explanation only* and has been consistently over-applied into prose-everything. It does not license writing steps as paragraphs.

### 6.5 Tables

Use an HTML table whenever the content is genuinely two- or three-dimensional. Roles and their ownership, decision matrices, policy thresholds, port or field references, and status mappings are all tables, not prose and not bullets. Use `<table border="1" cellpadding="6" cellspacing="0">` with a bolded header row, which renders cleanly in IT Glue.

### 6.6 Completion checklist

Every SOP ends with a `<ul>` checklist restating the verifiable outcome of each step in a few words, so the person doing the work can self-verify without rereading the procedure.

### 6.7 Autotask content is different

For content destined for Autotask (ticket notes, time entries), follow TCT's Autotask format instead: no bullets, prose, Actions Taken then Root Cause/Findings then Resolution then Next Steps/Escalation then Status. That format is for tickets, not for IT Glue SOPs. Do not let it leak into SOP formatting - this is a known and recurring source of the wall-of-text problem.

## 7. Cross-referencing rules

- **When to link vs when to merge.** If document B needs a fact that lives in document A, link to A. If two documents cannot state a clear boundary between what each owns - if a reader could not tell which to follow - they should be merged, not cross-linked. Overlap with no boundary is the signal to merge.
- **Inline links.** Every time a document mentions another SOP by name in its body, that mention is a hyperlink to the other doc. Anchor text = the other doc's title. Href = its ID-based URL.
- **Related SOPs list.** Every doc ends with a linked list of the other docs in its set.
- **Native Related Items.** In addition to body links, the IT Glue "Related Items" pane (right-hand side) should relate the docs in a set to each other. This is a human action in the UI.
- **ID-based URLs.** Always link using `https://triple-cities-tech.itglue.com/6942365/docs/<id>`. The ID is stable across title renames, so links survive renaming.

## 8. Redundancy and overlap - how to resolve

When two or more docs cover the same ground:
1. Decide the single authoritative home for each fact.
2. Fold unique content from the redundant doc into its rightful home(s) before removing anything.
3. Confirm nothing unique is lost - skim the doc being retired against its target(s).
4. Retire the redundant doc. Prefix its title `SUPERSEDED - ` and add a superseded notice to its body naming the replacement, then delete it in the IT Glue UI once the team has had time to notice. A retired doc that still exists unmarked and unlinked becomes an orphan and recreates the confusion.
5. Prefer editing existing documents over creating new ones. Creating a "clean version" alongside the old one is how duplication happens.

## 9. Vendor accuracy

- Where a doc describes how a product behaves or is configured, cite or link at least one official vendor document, and prefer the vendor's own current page over memory. Do not invent product capabilities, menu paths, or settings.
- Every UI navigation path in a procedure step carries its source and the date it was verified, either inline or in the Official Vendor Resources section. If a path cannot be verified against current vendor documentation, either omit the click-path and describe the outcome instead, or label the step UNVERIFIED and say what it is based on.
- Use platform-native terminology. For Autotask specifically: "Events" not "Triggers", and notification settings under the Notification tab.

## 10. The human / AI action split (always state this)

An AI assistant working through the TCT MCP connector **can**:
- Read documents, sections, org document lists, folder lists, Quick Notes; search documents (including an `includeArchived` flag and an `archived` attribute per document).
- Create documents, and rewrite or append document body sections.
- **Rename a document title** (`itglue_rename_document`).
- **Publish a document** (`itglue_publish_document`), read-back verified. Note that the `publish` flag on document creation does not reliably take effect - always follow a create with an explicit publish call and check the response.
- **Set native Related Items relationships** (`itglue_relate_items`). One call links BOTH panes - the API stores a single bidirectional relation and rejects the inverse with a 422, so never call it twice for the same pair. One pair per call, so a set of five documents needs ten calls.
- Read/create/update flexible assets.

It **cannot**:
- Delete a document.
- Archive a document.
- **Move a document between folders.** Not a connector defect - IT Glue's API has no capability for it. The vendor's developer reference marks `document_folder_id` as "Not permitted in PUT/PATCH, optional in POST" on both `PATCH /documents/:id` and the bulk `PATCH /documents`. `itglue_move_document` returns `UPSTREAM_UNSUPPORTED` / `fixableBy: vendor` and writes nothing; `itglue_rename_document` hard-fails if passed a folder id. **Folder placement is create-time only** - always pass `documentFolderId` to `itglue_create_document`, because a misplaced document can only be relocated by a human in the IT Glue UI.

Therefore every documentation deliverable ends with two explicit lists: **what the AI already did (with confirmation of what was published)** and **what the human must do in IT Glue (delete, archive, folder moves)** - with exact document IDs so the human can act without re-deriving anything.

**Verify capability against the live tool list, not against this section.** The connector is under active development and this section has been wrong in both directions - it once claimed Related Items were a manual action when a tool already existed, and claimed folder moves worked when they did not. Before telling anyone something is a manual action, confirm no tool exists for it.

## 11. Definition of done for a documented system

A system's documentation is complete when:
- There is one hub ("START HERE") and a coherent set of sub-SOPs, all in the system's folder.
- Titles follow the naming convention and sort as a set.
- Every body is real inline content, not a stub or attachment-only.
- Every body carries the required furniture from section 6.1, uses numbered `<h2>` sections and lettered `<h3>` sub-blocks so the IT Glue navigation pane renders two useful levels, and carries its procedure as short numbered steps with explanation in nested sub-bullets.
- Every SOP mention in a body is an inline link; every doc has a Completion Checklist and a Related SOPs list; native Related Items are set.
- There is no redundant or orphaned doc left in the set.
- Product behavior is backed by official vendor references, with verification dates.
