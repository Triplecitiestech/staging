# TCT Claude skills — versioned copies

These are copies of the account-level Claude skills that describe what the TCT
MCP connector can do. They are **not** loaded from here: Claude reads the
account-level skills. This directory exists so a connector change and the skill
text that describes it move together and can be diffed, rather than the skills
silently drifting from the tools.

**To apply an edit made here, re-upload the changed `SKILL.md` to the skill of
the same name in claude.ai.** Nothing here takes effect until that happens.

Captured 2026-08-28, alongside the `autotask_update_ticket` re-parent fix.

| Skill | Status |
|---|---|
| `autotask-time-entry-writer` | EDITED — `companyLocationID` added to the field list, the site-location behaviour of a company change documented, and a note that an Autotask HTTP 500 with a structured `errors[]` body is a request rejection and must not be retried |
| `autotask-troubleshooting-advisor` | EDITED — the hand-off for a mis-filed ticket now states that a company change also moves the site location, and asks for the specific site on a multi-site customer |
| `service-delivery-manager` | EDITED — ticket-hygiene defect list gains wrong site location, and the wrong-company finding now says the fix moves the location too. Still read-only; it names defects and hands the write to `autotask-time-entry-writer` |
| `tct-doc-architect` | UNCHANGED — verified, not assumed: it contains no ticket-field-correction guidance. Its only mentions of tickets are one worked example about an IT Glue asset trait and the rule that a record id always ships with a clickable link. Nothing in it was made wrong by this change |
