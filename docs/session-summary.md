# Session Summary

> **Last updated**: 2026-06-09. CLAUDE.md operating-manual restructure + deploy-pipeline reliability hardening.
> **Branch**: `claude/zealous-hypatia-4cfnyp` (gated auto-merge to `main`).
> **Detailed handoff**: see `docs/SESSION_HANDOFF.md` first — this file is the quick state-of-the-world reference.

## Pipeline Hardening + CLAUDE.md Restructure (2026-06-09)

Owner priority: reliability above all, fewest deploy iterations. Three commits on `claude/zealous-hypatia-4cfnyp`:

1. **CLAUDE.md restructured** to the operating-manual format (190 lines, A–G sections, dated decision log, Critical Gotchas digest). Full gotcha list + subsystem field notes moved verbatim to `docs/gotchas.md` — now mandatory bootstrap read #6.
2. **Auto-merge to main is now gated.** Previously any push to `claude/**` merged to main (= production) with zero checks. Now `auto-merge-claude.yml` requires: gitleaks secret-scan + quality gates (lint, `check:schema`, `next build`, vitest — reusable `.github/workflows/quality-gates.yml`, also used by `ci.yml`) + full Playwright e2e against the commit's Vercel preview (located via GitHub Deployments API). Schema-drift check also wired into the Vercel build (`vercel.json`) and local `npm run build`. Escape hatch: `[skip-e2e]` in the commit **subject line only** — first version checked the whole message and a commit *describing* the flag skipped its own e2e run (run 1056); fixed with a `flags` job reading `git log -1 --pretty=%s` (run 1057 = first true full-gate run).
3. **Migration retrofit prepared, not executed**: `docs/runbooks/MIGRATIONS_RETROFIT.md` (PowerShell, operator-run) baselines `_prisma_migrations` so `prisma migrate deploy` becomes real and the manual POST `/api/migrations/run` step disappears. `vercel.json` must NOT get `prisma migrate deploy` until the baseline is done. Expand-contract migration policy documented in CLAUDE.md + gotchas.

Operator completed: `E2E_TEST_SECRET` added to GitHub Actions secrets + Vercel (Preview scope) — authenticated e2e specs activate on pushes after the secret-enabled preview redeploy. Still open for operator: branch protection ruleset on `main`; run the migrations retrofit.

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
