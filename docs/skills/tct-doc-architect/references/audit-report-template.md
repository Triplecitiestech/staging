# Audit Report Template

Use this structure for the Step 3 remediation plan. Present it in the conversation for approval before making any edits. Keep it concrete: real document IDs, real titles, real URLs.

---

## Documentation Audit: <System / Process>

### Scope
- Org: Triple Cities Tech (6942365)
- Folder(s): <folder name and id>
- Documents reviewed: <count>

### Current state (map)
A table or list of every doc in scope:
- ID - current title - folder (or ROOT, which is a defect) - body is real content or stub - what it actually covers - URL

### Problems found
Grouped by type, each with the specific docs involved:
- Redundancy: <which facts are duplicated where>
- Overlap with no clear boundary: <which docs, why they blur>
- Orphans: <docs nothing links to>
- Plain-text (non-linked) cross-references: <where>
- Naming drift: <which titles break the convention>
- Missing hub: <is there a clear START HERE?>
- Stub bodies / attachment-only content: <where>
- Formatting defects (section 6): <unnumbered headings, steps written as paragraphs, no `<h3>` sub-blocks so the nav pane is flat, missing Completion Checklist, missing Process flow / You are here>
- Root-level documents: <any doc with no folder>
- Unverified vendor click-paths: <UI steps with no source or verification date>

### Proposed target structure
The clean end state:
- Hub: `System - <...> (START HERE)` (doc id) - role
- Sub: `System - <...>` (doc id) - role
- ... in deployment/logical order
- Merges: <doc X folds into doc Y>
- Retirements: <doc Z prefixed SUPERSEDED, then deleted after fold-in>

### Cross-link map
For each doc, which other docs it should link to inline and list under Related SOPs.

### Naming changes
Old title -> new title, per doc id.

---

## Action split

### What Claude will do on approval
- <doc id>: rewrite body to section 6 structure, add inline links, add Completion Checklist.
- <doc id>: rename "<old>" -> "<new>".
- <doc id>: move from ROOT into <folder name> (<folder id>).
- <doc id>: publish and confirm read-back.
- ...

Claude renames, moves, and publishes directly — do not put those on the human's list. Report the read-back result for each move and publish; a `moved: false` or `published: false` means it did not apply and must be said plainly rather than reported as success.

### What you will do in IT Glue (Claude cannot, via the connector)
- Related Items: on <docs>, add the others (fastest: open doc, Add Related Item, search "<system>", add the rest).
- Delete: <doc id> "<title>" - reason, and "skim against <target> first; irreversible".
- Archive: <doc id> if retaining rather than deleting.

That is the complete list of human actions. If nothing falls into these three categories, say so explicitly rather than leaving the section blank.

---

Do not proceed to edits until the human approves this plan.
