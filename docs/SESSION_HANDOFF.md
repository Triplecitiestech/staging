# Session Handoff — Compliance Workflow Build

> **Last updated**: 2026-05-17 (massive multi-slice push).
> **Branch**: `claude/review-workflow-architecture-DdCgz` (auto-merged to `main` after every commit).
> **Read this first** — everything you need to resume is here.

---

## Where the project stands

All 8 workflow steps are live + functional in production. The big-picture rebuild from "legacy dashboard with 4 tabs" to "guided 8-step workflow per customer" is done. Specific operator-feedback fixes have been shipped iteratively (see commit log on `main`).

**Production URL**: `https://www.triplecitiestech.com/admin/compliance`

### What the workflow looks like now
- `/admin/compliance` → thin customer picker (legacy `ComplianceDashboard.tsx` + `PolicyGenerationDashboard.tsx` deleted)
- `/admin/compliance/[companyId]` → workflow landing (progress bar + next-action card + **pending customer approvals panel**)
- 8 step pages: onboard, profile, connect, policies, assess, findings, changes, reassess
- `/admin/compliance/[companyId]/secure-score` → Microsoft Secure Score recommendations with per-row Remediate buttons (shipped #5b)

### What every customer-portal path exists for
- `/portal/policy-approval/[token]` → magic-link policy review page (customer approves/rejects, no login)

---

## Three open items the operator asked for in the last session — NOT YET DONE

The last operator instruction was **"do them all"** for these three. They were partially started but the session ran out of context. The user paused mid-Slice-A and asked for a handoff. Resume here.

### Slice A — SharePoint import: fetch + extract actual content (#3 in queue)
**Why**: Today the bulk-imported policies have content `[SHAREPOINT:<url>]` (a 50-byte placeholder). The AI analyzer runs against that string and produces shallow garbage. Operator never sees real coverage.

**Scope**:
- Add deps: `mammoth` for .docx text extraction (~600KB, MIT) + `pdf-parse` for PDFs (~3MB, MIT). Check `package.json` before reinstalling.
- New helper, probably `src/lib/compliance/policy-generation/sharepoint-fetch.ts`:
  - Given (companyId, sharepoint webUrl), use Graph `/drives/{driveId}/items/{itemId}/content` to download the file bytes
  - Extract text by extension: `.txt`/`.md` → utf-8 decode; `.docx` → `mammoth.extractRawText()`; `.pdf` → `pdf-parse`; `.doc`/`.rtf` → fallback message "unsupported format, please re-save as .docx"
- Update `importSelectedFiles` in `PolicyManager.tsx` AND/OR the `/api/compliance/policies` POST route to fetch + extract before storing
- The actual AI analysis already runs server-side after content is stored — that part doesn't change
- Stretch: parallelize the per-file extraction with a small pool (3-5 concurrent)

**Risk**: Extraction can be slow (5-30s per PDF). Server timeout (`maxDuration`) on `/api/compliance/policies` may need to bump. Consider doing the extraction client-side in PolicyManager OR fire-and-forget background.

### Slice B — Intune compliance policy executor (#1 in queue)
**Why**: Operator hit control 2.3 "Address Unauthorized Software" — needs an Intune compliance policy (technical), not a documentation policy. The `doc-primary-controls.ts` allowlist fix (shipped) suppresses the wrong option, but there's still no RIGHT option to offer. Need a real executor.

**Scope**:
- New file `src/lib/compliance/actions/executors/intune-compliance.ts`
- Catalog action `intune.create_compliance_policy.windows_baseline` (or similar) — Windows 10 compliance policy that requires:
  - Microsoft Defender Antivirus running + up to date
  - Real-time protection enabled
  - No active threats
  - Maybe: BitLocker enabled, secure boot, OS version min
- Graph API: `POST /v1.0/deviceManagement/deviceCompliancePolicies` with `windows10CompliancePolicy` body
- After create: POST assignment to `allDevicesAssignmentTarget` (same pattern as existing `intune-defender.ts`)
- `TCT_POLICY_MARKER` on displayName for idempotency
- Real previewer that counts enrolled Windows devices (already done in `intune-defender.ts` — copy the pattern)
- Register in `executors.ts` + `previewers.ts`
- Add `satisfiesControls` for cis-v8 controls 1.2, 2.3, 2.5, 4.1 (and similar)
- Permissions needed: `DeviceManagementConfiguration.ReadWrite.All` (same as existing Intune executor)

**Risk**: Compliance policies enforce DIFFERENT things from configuration profiles. Don't conflate the existing `intune-defender.ts` (configuration profile that turns the setting on) with this new one (compliance policy that marks the device non-compliant if it isn't). Different Graph endpoints, different shapes.

### Slice C — HIPAA / NIST 800-171 / CMMC / PCI doc-primary curation (#2 in queue)
**Why**: `doc-primary-controls.ts` currently only curates CIS v8. The "fail-open" branch makes `policy.generate_for_control` Remediate ALWAYS visible for those four frameworks — same conflation bug the operator caught for CIS, just hasn't been caught yet for those.

**Scope**:
- Mechanical curation work. Read each framework's mappings in `src/lib/compliance/policy-generation/framework-mappings.ts`
- For each (framework, controlId), decide if a written policy is the primary fix (add to allowlist) or if the technical control is (don't add)
- Add the cleared frameworks to `CURATED_FRAMEWORKS` in `doc-primary-controls.ts`
- HIPAA has the largest doc-primary surface (most are policy + procedure mandates). NIST/CMMC/PCI are more technical-heavy.

**Risk**: Curation judgment calls. When unsure, lean technical — operator can always create a backing doc manually from step 4.

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
