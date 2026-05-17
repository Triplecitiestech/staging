# Session Handoff — Compliance Workflow Build

> **Last updated**: 2026-05-17 (post resume-slices push).
> **Branch**: `claude/review-workflow-architecture-DdCgz` (auto-merged to `main` after every commit).
> **Read this first** — everything you need to resume is here.

---

## Where the project stands

All 8 workflow steps are live + functional in production. The big-picture rebuild from "legacy dashboard with 4 tabs" to "guided 8-step workflow per customer" is done. Specific operator-feedback fixes have been shipped iteratively (see commit log on `main`).

The three "resume" slices from the previous handoff are now SHIPPED. See "Recently shipped" below.

**Production URL**: `https://www.triplecitiestech.com/admin/compliance`

### What the workflow looks like now
- `/admin/compliance` → thin customer picker (legacy `ComplianceDashboard.tsx` + `PolicyGenerationDashboard.tsx` deleted)
- `/admin/compliance/[companyId]` → workflow landing (progress bar + next-action card + **pending customer approvals panel**)
- 8 step pages: onboard, profile, connect, policies, assess, findings, changes, reassess
- `/admin/compliance/[companyId]/secure-score` → Microsoft Secure Score recommendations with per-row Remediate buttons (shipped #5b)

### What every customer-portal path exists for
- `/portal/policy-approval/[token]` → magic-link policy review page (customer approves/rejects, no login)

---

## Recently shipped (this session)

The three resume slices are DONE and have been iterated on per operator feedback. Headline changes since the previous handoff:

### Slice A — SharePoint import → real content extraction (DONE)
- `mammoth` + `pdf-parse` added. New `src/lib/compliance/policy-generation/sharepoint-fetch.ts` does the fetch+extract by-id (preferred via `sharePointRef:{driveId,itemId}`) with a webUrl fallback for legacy callers. Extracts `.txt` / `.md` / `.docx` / `.pdf`; rejects `.doc` / `.rtf` with a "re-save as .docx" message.
- `/api/compliance/policies` POST bumped to `maxDuration=120`. Anthropic call dropped `quote`+`section` from per-control output, runs at 100s timeout with `max_tokens=6000`.
- Re-analyze flow no longer wipes the old analysis before the new one succeeds.
- **Per-policy original-bytes preservation**: SharePoint imports now save `sourceBytes` + `sourceMimeType` + `sourceFileName` so Download .docx serves a byte-perfect copy of the customer's source instead of a re-rendered approximation. Pasted / generated policies still use the renderer.
- Import button now hides after successful import (used to be re-clickable, creating duplicates).

### Slice B — Intune Windows 10 compliance policy executor (DONE)
- `src/lib/compliance/actions/executors/intune-compliance.ts` — Defender + signature + BitLocker + secure boot + firewall + code integrity baseline. Same idempotency-marker + allDevicesAssignment pattern as intune-defender.
- Catalog entries for apply + remove. Mapped to CIS v8 2.3, 4.1, 10.1. **NOT** 1.2 / 2.5 (operator caught the over-mapping; device-state baseline is wrong primitive for network-asset discovery + allowlisting).
- Live previewer counts enrolled Windows devices, samples `isEncrypted` to flag likely non-compliance.

### Slice C — HIPAA / NIST 800-171 / CMMC L1/L2 / PCI DSS doc-primary curation (DONE)
- Curated entries land in `src/lib/compliance/policy-generation/doc-primary-controls.ts`. Lookup now uses a per-framework prefix-strip table (HIPAA `hipaa-164.308-a1`, NIST `nist-3.1.1`, CMMC `cmmc-AC.L2-3.1.1`) instead of the broken-for-everything-except-CIS regex.

### Operator-feedback fixes after the slices

- **Graph 403 leaks**: new `formatGraphPreviewError()` in `src/lib/compliance/actions/executors/graph-error-format.ts`. Wired into Intune + CA + password-protection previewers. 403/401/429/404 now produce one-line actionable summaries (named scope to grant, where to grant it) instead of raw Graph JSON.
- **CIS 1.4 (DHCP Logging) re-routed** to UniFi gateways first (which actually serve DHCP), Domotz as fallback.
- **CIS 1.3 / 1.4 / 1.5 / 12.1 / 12.2 / 12.6 N/A logic** added for fully-cloud customers (profile has `onPremServers === 'no_servers'` AND `remoteAccess === 'cloud_only'`).
- **Old "tool deployed=false → control doesn't apply" logic fixed** — now returns `needs_review` with remediation hint, not bogus `not_applicable`.
- **Policy card UI**: bucket labels renamed ("Fully covered" / "Partially covered" / "Relevant gap" with rose tint), preamble explaining off-scope controls don't appear.
- **Docx renderer**: heading detection for numbered sections + Appendix lines that follow a blank-line (the wall-of-paragraphs fix when serving rendered docs).
- **Analysis summary**: when AI returns no `summary` field, synthesizes "Mapped N controls: X fully covered, Y partially addressed, Z relevant but not in this policy." Never dumps raw JSON.
- **Counts-show-0 bug**: derivation guard now treats empty arrays as missing, not falsy-truthy.
- **Download .docx returns JSON**: route never returns JSON in the download path. Falls back to plain-text on render failure (with the actual error in the header).
- **Remediate modal** now shows the originating control id under the action title ("Suggested for cis-v8 control 2.3").
- **Reviewer override**: per-finding manual status override is back on `/admin/compliance/[companyId]/findings`. New `FindingOverrideInline.tsx` — status dropdown + required justification + Save / Edit / Clear, mounted above the disposition toggle in each expanded row. Disposition button now self-explains its purpose ("workflow tracker — what are we doing about this?").
- **Comprehensive permissions list** at `docs/M365_PORTAL_PERMISSIONS.md` — single grant list of all 18 Graph scopes the codebase uses, built from a full `graphRequest` audit. Hand to a Global Admin once and the back-and-forth is over.

---

## Known loose ends going into the next session

1. **Per-control customer-impact text is still action-level**, not control-level. The Remediate modal now displays the originating control id at the top so the linkage is explicit, but the customer-impact paragraph itself comes from the action catalog's `impact.userFacing` string and reads the same regardless of which control surfaced it. A future fix would either:
   - Add a per-(action, control) override map in the catalog
   - Generate a control-specific paragraph at preview time via Anthropic
   Skipped this round because it's design-y; flag if the generic text becomes a real blocker.

2. **17 pre-existing imported policies have no `sourceBytes`** because they were imported before that column existed. They fall through to the docx-renderer (degraded formatting). **As of this session a `sourcePointer JSONB` column was added** so future SharePoint imports will store `{driveId, itemId, webUrl, fileName, mimeType}`, AND a "Re-sync from SharePoint" affordance was added to PolicyManager that re-pulls the source bytes for any policy that has a pointer. Pre-existing policies without a pointer still need a manual delete + re-import to enable byte-perfect download.

3. **`policy_org_profiles` + `compliance_customer_context` legacy tables** are operator-gated for deprecation (W16). Untouched this round.

4. **Per-tenant credential encryption** still plaintext (W5). Migration plan in `docs/runbooks/CREDENTIALS_MIGRATION.md`. Untouched this round.

---

## How to resume — important context

### Always read CLAUDE.md first
The project's `CLAUDE.md` at the repo root has the canonical engineering rules: never push to main directly, commit + push after every logical unit, run `npm run build` + `CI=true npx next build` before pushing, use the local dev loop for screenshots.

### Build command for CI-equivalent checks
```
CI=true npx next build
```
Use this — plain `npm run build` doesn't catch what Vercel catches. We've been bitten by this multiple times.

### The local preview loop (works)
```bash
# Docker daemon (dies between sessions in the sandbox)
sudo rm -f /var/run/docker.sock
(sudo dockerd > /tmp/dockerd.log 2>&1 &)
until docker info >/dev/null 2>&1; do sleep 2; done

# Postgres 16 — keep schema if container exists
docker start tct-pg 2>/dev/null || docker run -d --name tct-pg \
  -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=tct -p 5433:5432 postgres:16
until docker exec tct-pg pg_isready -U postgres >/dev/null 2>&1; do sleep 2; done

# Sync schema + seed (Tri-Bros + kflorance test tenants are pre-populated)
DATABASE_URL='postgresql://postgres:devpass@localhost:5433/tct' npx prisma db push --accept-data-loss
DATABASE_URL='postgresql://postgres:devpass@localhost:5433/tct' npx tsx scripts/local-seed.ts

# Dev server
rm -rf .next
(npm run dev > /tmp/devserver.log 2>&1 &)
until curl -sS -o /dev/null http://localhost:3000/; do sleep 2; done

# Screenshot harness — uses preinstalled chromium
DATABASE_URL='postgresql://postgres:devpass@localhost:5433/tct' npx tsx scripts/screenshot-cockpit.ts
# Read PNGs in /tmp/shots/ via the Read tool — Claude is multimodal
```

`.env.local` must exist (gitignored) with these keys; recreate if missing:
```
DATABASE_URL=postgresql://postgres:devpass@localhost:5433/tct
PRISMA_DATABASE_URL=postgresql://postgres:devpass@localhost:5433/tct
NODE_ENV=development
NEXTAUTH_SECRET=local-dev-nextauth-secret-not-real-0000000000
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_BASE_URL=http://localhost:3000
ONBOARDING_SIGNING_KEY=local-dev-onboarding-signing-key-000000000
MIGRATION_SECRET=local-dev-migration-secret
CRON_SECRET=local-dev-cron-secret
E2E_TEST_SECRET=local-dev-e2e-secret
ANTHROPIC_API_KEY=sk-local-dev-not-real
RESEND_API_KEY=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
NEXT_PUBLIC_CONTACT_EMAIL=local@example.com
AZURE_AD_CLIENT_ID=local-dev
AZURE_AD_CLIENT_SECRET=local-dev
AZURE_AD_TENANT_ID=local-dev
```

### Branch + push workflow
- Develop on the existing `claude/review-workflow-architecture-DdCgz` branch
- `git push -u origin claude/review-workflow-architecture-DdCgz` after every commit
- The auto-merge workflow merges to `main` ~10s later
- Run `git fetch origin main && git log origin/main -3 --oneline` to confirm the merge landed

### Don't re-do work
The catalog actions, executors, and previewers that **already exist as real (non-stub) implementations**:
- CA policies: MFA-all, Block Legacy Auth (apply/remove pairs)
- Password protection (enable/disable)
- Intune Defender realtime (apply/remove) — configuration profile, NOT compliance policy
- Policy generation for control (`policy.generate_for_control`)
- Policy publish to SharePoint (`policy.publish_to_sharepoint`)

Don't recreate any of these. The new Intune *compliance* policy executor (Slice B) is a separate Graph endpoint from the existing *configuration* profile executor.

### Operator's repeated UX preferences (gathered across many slices)
- **Be SPECIFIC in previews.** Not "Affects 1 entity" — say "Will create CA policy 'X' (state: enabled). 47 enabled users in scope; they will be prompted to enroll in MFA." Show users, groups, devices, exact policy names.
- **Distinguish technical vs documentation actions clearly.** Tag in the picker label (already shipped — keep the convention).
- **Surface state changes visibly.** No silent successes, no silent failures. Result cards, status badges, progress indicators.
- **Don't conflate concepts.** "Current step in workflow" vs "page I'm viewing" was the WorkflowNav bug. "Generate documentation policy" vs "create Intune compliance policy" was the Remediate bug. Lean on explicit labels.
- **Cards should be drillable.** If you show a count, make it clickable to filter.

### Doc-primary controls curation — operator's standard
A control is documentation-primary IF "writing the policy alone would satisfy the control without any technical tenant changes." Examples: 14.x security awareness training (the training PROGRAM is the policy), 17.x incident response (the IR PLAN is the policy), 3.1 data management process (the PROCESS docs are the control).

Counter-examples: 2.3 "Address Unauthorized Software" — needs Intune compliance enforcement, the doc is supplementary.

### What's deferred (DON'T scope-creep these in)
- IT Glue / My Glue publish handlers (operator already covered via the `.docx` download button — let it stand until they ask for direct API publish)
- Real customer-portal compliance landing for end-customers (today the magic-link review page is the only customer-facing surface)
- Per-customer encryption credential storage hardening (W5)
- Drop the legacy `policy_org_profiles` + `compliance_customer_context` tables (W16 — operator-gated)

---

## File map for the three open slices

| Slice | Files to touch | Files to read first |
|---|---|---|
| A · SharePoint fetch | New `src/lib/compliance/policy-generation/sharepoint-fetch.ts`; modify `src/app/api/compliance/policies/route.ts` POST + `src/components/compliance/PolicyManager.tsx` `importSelectedFiles` | `src/app/api/compliance/policies/sharepoint-scan/route.ts` (already uses graphRequest + drive lookup helpers) |
| B · Intune compliance | New `src/lib/compliance/actions/executors/intune-compliance.ts`; modify `src/lib/compliance/actions/catalog.ts` + `executors.ts` + `previewers.ts` | `src/lib/compliance/actions/executors/intune-defender.ts` (existing pattern to mirror — same Graph auth, same idempotency marker, same assignment shape) |
| C · Framework curation | Modify `src/lib/compliance/policy-generation/doc-primary-controls.ts` only | `src/lib/compliance/policy-generation/framework-mappings.ts` (the universe of mappings to triage) |

---

## Last 20 commits on `main` (most recent first)

```
f6b06eb Auto-merge
7113887 fix(compliance): three operator-feedback fixes
        — doc-primary controls allowlist (CIS v8)
        — SharePoint import shows progress + result card
        — Findings counter cards drill-filter
75c0906 Auto-merge
85063cf fix(compliance): specific Remediate preview + label documentation vs technical actions
8b1d9a1 Auto-merge
8839c1d fix(compliance): SharePoint scan recurses subfolders + surfaces empty state
1269632 Auto-merge
276457d fix(compliance): WorkflowNav highlights the page you're VIEWING, not the next-to-do step
56713ab Auto-merge
8468525 feat(compliance): #5b — Microsoft Secure Score Remediate automation
f2e5437 Auto-merge
8c68569 feat(compliance): C.2 — .docx download button (universal manual-upload path)
196a842 Auto-merge
360f0b0 feat(compliance): C.4.3 — pending-approvals visibility
1223580 Auto-merge
cbb387c feat(compliance): C.4.1+C.4.2 — wire customer approval into publish gate + status badge
45372c5 Auto-merge
bca1a92 feat(compliance): C.4 — customer-portal policy approval round-trip
b1aa906 Auto-merge
```

Full history: `git log origin/main --oneline`.
