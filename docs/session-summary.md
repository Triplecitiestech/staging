# Session Summary

> **Last updated**: 2026-05-17. Multi-session compliance workflow build.
> **Branch**: `claude/review-workflow-architecture-DdCgz` (auto-merged to `main`).
> **Detailed handoff**: see `docs/SESSION_HANDOFF.md` first — this file is the quick state-of-the-world reference.

## State

All 8 workflow steps shipped + functional in production. Major operator-feedback iterations all complete. Three known follow-ups documented in the handoff and **not started yet** — the operator paused mid-Slice-A to conserve context.

## Workflow surface

```
/admin/compliance                    customer picker (no more legacy dashboard)
/admin/compliance/[id]               workflow landing (progress + next-action + pending approvals)
/admin/compliance/[id]/onboard       step 1
/admin/compliance/[id]/profile       step 2 (Customer Profile via question engine)
/admin/compliance/[id]/connect       step 3 (Tool Inventory + Live Data Feeds + Platform Mappings)
/admin/compliance/[id]/policies      step 4 (PolicyManager embedded — scan / single-add / library / publish / approval flow)
/admin/compliance/[id]/assess        step 5 (Run Assessment)
/admin/compliance/[id]/findings      step 6 (per-control with Remediate / Set disposition / drill-by-card)
/admin/compliance/[id]/changes       step 7 (in-flight log of executed remediations)
/admin/compliance/[id]/reassess      step 8 (latest-vs-baseline comparison)
/admin/compliance/[id]/secure-score  Microsoft Secure Score recs with per-row Remediate
/portal/policy-approval/[token]      customer-facing magic-link approval page
```

## What's real (not stubbed) in the action catalog

Executors that actually call Graph (not stubs):
- `m365.enforce_mfa_all_users` / `m365.revert_mfa_all_users` — CA policy
- `m365.block_legacy_authentication` / `m365.allow_legacy_authentication` — CA policy
- `m365.enable_password_protection` / `m365.disable_password_protection` — Directory Settings
- `defender.enable_real_time_protection` / `defender.disable_real_time_protection` — Intune configuration profile (NOT compliance policy)
- `policy.generate_for_control` — AI-generates a documentation policy via Claude
- `policy.publish_to_sharepoint` — Word .docx upload to customer's SharePoint

Each has a paired live previewer that queries Graph for actual user/device counts before apply.

## Customer-portal approval loop (closed end-to-end)

1. Operator clicks "Request customer approval" on a policy row
2. Server creates `compliance_policy_approvals` row + HMAC-signed magic link + Resend email
3. Customer clicks link → `/portal/policy-approval/[token]` (token-gated, no login)
4. Customer reads policy, approves or rejects with notes
5. Status surfaces back as a badge on the operator's policy row + a "Waiting on customer" panel on the workflow landing
6. When operator hits Publish: the executor checks the approval table as the AUTHORITATIVE gate. Operator-vouching checkbox is the fallback path only.

## Key files (most-relevant subsystem)

| Domain | Source of truth |
|---|---|
| Action catalog | `src/lib/compliance/actions/catalog.ts` |
| Executors | `src/lib/compliance/actions/executors.ts` (registry) + `executors/*.ts` (per action) |
| Previewers | `src/lib/compliance/actions/previewers.ts` (registry, same per-action files as executors) |
| Doc-primary control allowlist | `src/lib/compliance/policy-generation/doc-primary-controls.ts` |
| Policy approval store | `src/lib/compliance/policy-approval-store.ts` |
| Policy approval token | `src/lib/compliance/policy-approval-token.ts` |
| Workflow state derivation | `src/lib/compliance/workflow-state.ts` |
| SharePoint URL parser | `src/lib/compliance/sharepoint-url.ts` |
| .docx renderer for publish | `src/lib/compliance/policy-generation/docx-renderer.ts` |

## Open work — see `docs/SESSION_HANDOFF.md` for full scope

1. SharePoint import — fetch + extract actual file content (today: placeholder)
2. Intune compliance policy executor (technical fix for CIS 2.3 etc.)
3. doc-primary-controls.ts curation for HIPAA / NIST / CMMC / PCI

## Deferred (don't pull into scope unless asked)

- IT Glue / My Glue direct publish (`.docx` download covers it for now)
- Customer-facing portal compliance landing
- Per-tenant credential encryption hardening
- Dropping legacy `policy_org_profiles` + `compliance_customer_context` tables

---

> **Historical note**: this file used to be a detailed session-by-session journal. The current session's commit log on `main` is the most reliable history — see `git log origin/main --oneline`. The detailed prose handoff is in `docs/SESSION_HANDOFF.md`.
