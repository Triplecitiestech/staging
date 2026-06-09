# Session Summary

> **Last updated**: 2026-06-09. Autotask client hardening (retry + includeFields).
> **Branch**: `claude/friendly-euler-cn1z6r`.
> **Detailed handoff**: see `docs/SESSION_HANDOFF.md` first — this file is the quick state-of-the-world reference.

## Autotask client hardening (2026-06-09) — `src/lib/autotask.ts`

Prompted by a review of the open-source `tegwin/AutotaskMCP` server vs our integration (verdict: ours is more mature; two of its ideas were worth adopting). Changes:
- **`queryAll` accepts `includeFields`** and ticket queries (`getCompanyTickets`, `getTicket`, `getTicketByNumber`) now request only `TICKET_QUERY_FIELDS` (the `AutotaskTicket` interface fields) — without it Autotask returns ~80 fields + userDefinedFields per ticket on every reporting-sync pull.
- **Wired `resilience.ts` into the client**: GET/query/PATCH go through `withRetry` (2 retries, 1s base, transient-only — 429/5xx/timeout). POST deliberately not retried (non-idempotent creates would duplicate notes/time entries). Permanent 4xx surfaces immediately so entity-path fallback chains stay fast.
- **Pagination no longer silently truncates**: a page that fails after retries now throws (`Autotask pagination for X failed after N records`) instead of returning a partial set — this was the root cause of the "empty phases" gotcha. Callers (per-company ticket sync, fallback chains) already handle thrown errors at the right granularity.
- New unit tests `src/lib/autotask.test.ts` (mocked fetch: includeFields body, 429 retry, 404 no-retry, multi-page concat, truncation throw, PATCH retry, POST no-retry). Removed a stale "extended ticket fetch" comment in `reporting/sync.ts`. Gotchas updated (Autotask section).
- **Post-deploy verify**: tickets sync (`/admin/reporting` pipeline) runs green and SOC ingest still resolves tickets — first live run exercises `includeFields` against the real instance.
- Deferred (discussed, not built): ticket creation support, ticket-level time entries with role/billing fields, picklist cache TTL, MCP-style tool layer for AI agents.

## Customer portal ticket fixes (2026-06-09, same branch)

Operator-reported: portal open-ticket counts wrong + no visible time window. Fixes:
- **`isResolvedStatus(status, statusLabel?)` is now label-aware** (`src/lib/tickets/utils.ts`) — custom Autotask statuses ("Complete - No Notify") have new picklist IDs outside `[5,13,29]` and were counted as open. Customer adapter passes the live picklist label; staff adapter + SOC tickets route pass synced `statusLabel`.
- **CustomerDashboard**: 7/30/90-day history selector (default 90 = old behavior, 90 is max), filters closed count + list client-side (no API change — still one 90-day fetch). Open tickets always shown ("open now" caption); "Tickets Closed" captioned "last N days". Footer note: older history via Contact support (opens messenger).
- Mobile: header row is `flex-wrap`; cards unchanged grid. Verify at `sm` + `lg`.
- **`[skip-e2e]` used (2026-06-09, operator-approved)**: owner requested immediate production deploy; e2e gate (~30 min) skipped for the final push of this branch. Quality + secret-scan gates still ran. Changes were unit-tested (102 green) + built locally; owner verified live counts after deploy. Follow-up: gate restructure to smoke-on-merge + full-suite non-blocking (also requested by owner).

## Documents Hub (2026-05-30) — `/admin/documents`

New branded internal **Documents** feature: a hub that renders TCT content in the house brand (dark/cyan, Inter, glass cards) so everything the company publishes is visually consistent. First live document is the **Secure Boot 2023 Certificate Remediation** playbook at `/admin/documents/secure-boot-playbook` (full P1 operational playbook — phases 0/1/3/4/5, copy-ready ticket templates, PowerShell Detection + Remediation components, troubleshooting, UDF 10 status legend). Three placeholder cards (QBR / branded Marketing / Social dump) are stubbed "Coming soon". Files: `src/app/admin/documents/{page,loading}.tsx` + `secure-boot-playbook/page.tsx`, shared client islands `src/components/admin/documents/{CopyButton,Countdown,PhaseNav}.tsx`, "Documents" link in `AdminHeader`. Auth-gated (redirect to `/admin`); TECHNICIAN can view. e2e: both routes added to the `ADMIN_PAGES` smoke list. Also removed pre-existing forbidden orange from `src/constants/services.ts` (services gradients) and `src/lib/tickets/utils.ts` (priority badge). Branch: `claude/fervent-pasteur-TLwSp` (auto-merged to `main`).

## CFO Dashboard (2026-05-29) — see the "CFO Dashboard" section in `CLAUDE.md` + `docs/CFO_HANDOFF.md`

New financial dashboard at `/admin/cfo` (staff finance only). Ported the standalone Sequence+QuickBooks CFO tool into the app: `src/lib/cfo/*` (sequence-client, qb-auth/client/parse, compute, build, store, access, demo, hiring), `src/components/cfo/*`, `src/app/api/admin/cfo/*`, `/api/cron/cfo-rebuild`. Shipped: access gate (`view_cfo_dashboard` permission OR Entra finance group), live Sequence analytics, QuickBooks OAuth (encrypted tokens), settings (debts/categories/scheduled-outflows/QB+AR snapshots), demo mode (anonymized + scaled), print-to-PDF, what-if AR→debt simulator, hiring cost calculator (US vs PH), Sequence rate-gate + delta sync, financial-summary KPI row, QB-accrual revenue. **Live in production; QuickBooks connected** (production realm). Next focus: spending insight (Amex / pod-account statement ingestion) for anomaly detection. Branch: `claude/add-project-access-control-U9Tde`.

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
