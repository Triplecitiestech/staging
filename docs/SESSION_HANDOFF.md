# Session Handoff — Compliance Workflow Rebuild

> Last updated 2026-05-15 (fourth session). **Read this first.** Direction
> changed mid-session: the cockpit UI was pulled off prod, the operator
> chose to rebuild it as a guided linear workflow.
> Latest branch: **`claude/review-workflow-architecture-DdCgz`** (prior:
> `4UiVX`). Prior branches have been auto-merged to `main`.

## What changed in this session — read before doing anything

1. **Cockpit is GONE from prod** (commit `59878df`). All 8 pages at
   `/admin/compliance/[companyId]/*` were deleted. They were the wrong
   shape — dashboard of tiles instead of the guided
   onboard → policies → assess → findings → propose → send → reassess
   loop the project was meant to deliver. Real issues the operator
   flagged: no nav entry, cards not drillable, raw slugs in tool
   inventory (`datto_edr`, `bullphish`), policies not openable, no
   "push CA policies / config profiles / changes" surface anywhere.

2. **Test-tenant reset feature SHIPPED** (commit `38781db`). New page at
   `/admin/compliance/test-tenant` lets SUPER_ADMIN flag a company as
   `isTestTenant=true` and wipe it back to clean slate.
   - **kflorance** is the designated production test tenant per the
     operator. After deploy the operator runs `POST /api/migrations/run`
     (Bearer MIGRATION_SECRET) to add the column, then flags kflorance
     via the new UI.
   - Reset wipes 17 compliance/policy tables + form_responses +
     company_contacts + M365 columns + onboarding state. Preserves
     Company row + slug + Autotask link. Wizard restarts at step 1.
   - Hard-gated: SUPER_ADMIN, `isTestTenant=true`, slug confirmation in
     the body. Triple-locked.
   - Local-verified end-to-end against `scripts/local-seed.ts`
     (kflorance stand-in inserted on each seed run).

3. **Policy Library zero-counts fix** (commit `5c98adf`). Cards always
   showed 0 because the SELECT hit non-existent columns. Now uses
   `LEFT JOIN LATERAL` against `compliance_policy_analyses` with
   `jsonb_array_length()`.

## What's pulled from the open list

These earlier-noted "still open" items are now moot because the cockpit
is gone:
- ~~Posture % counts `needs_review` as failing~~ (cockpit-only display)
- ~~"Massively regressed" gap closure~~ (operator made the call: rebuild)
- ~~Revert cockpit off prod vs leave it~~ (reverted)

## Pre-slice-1 work that's done — DON'T redo this

- Local preview loop (Docker + Postgres + seed + dev server + screenshot
  harness) is proven end-to-end. Full reproduce steps below.
- kflorance stand-in in seed has `isTestTenant=true` plus a baseline of
  form_responses + connectors + audit_log rows so reset has something
  to wipe.
- `companies.isTestTenant` column added in Prisma schema AND
  `/api/migrations/run` (because raw SQL is the only thing that
  actually applies on prod — see the "prisma migrate deploy does NOT
  actually run" gotcha in CLAUDE.md). Operator must POST to
  `/api/migrations/run` after auto-merge to populate the column.
- `/admin/projects/new` had a fully-typed explicit Company select that
  required adding `isTestTenant: true` to satisfy the Prisma type. Done.

## Slice 1 — DESIGN PROPOSAL (not built yet, awaiting operator review)

**Operator's chosen direction** (from session 4 AskUserQuestion):
- Linear wizard with numbered steps
- Push-changes is a dedicated step in the workflow
- Ship in slices: first slice = shell + onboard/profile/connect steps
- Then add policies/assess/findings/changes/reassess in subsequent
  slices, one PR per slice

**URL space proposal** (the cockpit space is now empty — reclaim it):
```
/admin/compliance                              ← legacy guided dashboard
                                                  (entry point, customer
                                                  dropdown). Stays.
/admin/compliance/[companyId]                  ← workflow landing page:
                                                  shows current step,
                                                  progress, journey
                                                  timeline (assessments
                                                  done + next due)
/admin/compliance/[companyId]/onboard          ← step 1: Autotask link
                                                  + M365 consent. Likely
                                                  embeds the existing
                                                  /admin/companies/[id]/onboard
                                                  flow rather than
                                                  duplicating it.
/admin/compliance/[companyId]/profile          ← step 2: Customer
                                                  Profile editor
                                                  (industry, frameworks,
                                                  PHI/PII/CUI, employee
                                                  count, etc.). Writes
                                                  form_responses with
                                                  schema_type='customer_profile'.
/admin/compliance/[companyId]/connect          ← step 3: Connectors +
                                                  tool inventory. Real
                                                  human-readable labels
                                                  per connector, with
                                                  a verify-status row
                                                  and a deploy-state
                                                  checklist.
/admin/compliance/[companyId]/policies         ← step 4 (NEXT slice):
                                                  drillable list +
                                                  view content + edit
                                                  + generate from gap.
/admin/compliance/[companyId]/assess           ← step 5 (NEXT slice)
/admin/compliance/[companyId]/findings         ← step 6 (NEXT slice)
/admin/compliance/[companyId]/changes          ← step 7 (NEXT slice):
                                                  THE missing "push CA
                                                  policies / config
                                                  profiles" surface.
                                                  Wires up the existing
                                                  Change Management
                                                  backend (P0–P5).
/admin/compliance/[companyId]/reassess         ← step 8 (NEXT slice)
```

**Shared layout** (slice 1 deliverable):
- Persistent left nav at desktop / collapsible at mobile, showing all 8
  steps with state (✓ done · ▶ current · — locked).
- Top breadcrumb: Compliance › Company › Step name.
- Prev/Next buttons at the bottom of each step that advance state.
- Step state derived from durable DB data (per CLAUDE.md gotcha:
  "Wizard step status must derive from durable DB state, not in-session
  button clicks"). Specifically:
  - Step 1 done when `autotaskCompanyId IS NOT NULL` AND
    (`m365_consent_granted_at IS NOT NULL` OR `m365_setup_status='verified'`)
  - Step 2 done when form_responses has a customer_profile row with all
    required keys filled
  - Step 3 done when at least one compliance_connector is `verified` AND
    at least one compliance_company_tool row exists
  - Steps 4+ define their own gates (out of scope this slice)

**Slice 1 acceptance criteria** (what "done" means):
1. Visiting `/admin/compliance/[companyId]` shows the journey landing
   page with step nav + current-step pointer (against kflorance
   post-reset, all steps locked except step 1).
2. Step 1 (Onboard) renders. If the existing onboarding wizard at
   `/admin/companies/[id]/onboard` is usable as-is, embed it; otherwise
   surface a "Continue setup →" link to it.
3. Step 2 (Profile) renders a form bound to the customer_profile
   form_responses keys. Save persists. Reload shows the saved values.
4. Step 3 (Connect) renders the connector list with human-readable
   labels (no raw slugs), each row showing verify status + a way to
   trigger re-verify. Tool inventory section uses display labels.
5. All three steps are screenshot-verified at desktop + mobile BEFORE
   commit, on a clean kflorance post-reset.
6. CI=true npx next build passes.

**Open design questions to resolve before building** (ask operator):
- Should the workflow landing page replace `/admin/compliance/[id]`
  exactly, or live at `/admin/compliance/[id]/workflow` so the URL
  doesn't 404-collide with the recently-deleted cockpit landing?
  Recommendation: claim `/admin/compliance/[id]` — the URL space is
  free now and it's the natural home.
- Where does the customer-side counterpart of the workflow live? Does
  step 7 (Send + apply) need a corresponding `/portal/[company]/...`
  customer view, or is that out of scope for slice 1?
- Connector display labels: is there an existing registry mapping
  `datto_edr` → "Datto EDR", `bullphish` → "BullPhish", etc., or does
  the slice need to ship one? (Likely needs one — search
  `src/lib/compliance` for any existing tool/connector metadata.)
- Should the persistent left nav be a new component or extend an
  existing layout? Check `src/app/admin/layout.tsx` and any existing
  wizard layouts before inventing one.

**Hard rule for the next session**: build slice 1 against kflorance
on the local loop, screenshot-verify the landing + all three step
pages at desktop + mobile, commit + push. Do NOT batch slices.

## TL;DR of where things stand

A long multi-session push built out the entire compliance subsystem:
- **Backend (P0–P5): shipped, on production, working.** Customer Profile
  consolidation, finding dispositions, the full Change-Management lifecycle
  (preview + license preconditions + email delivery + verification cron +
  audit + rollback), 6 frameworks (CIS v8 + IG1/2/3, CMMC L1, CMMC L2,
  HIPAA, NIST 800-171, PCI DSS), framework auto-detect. The operator ran
  the customer-profile backfill and confirmed bundle email delivery.
- **Cockpit UI (P2, 8 pages): shipped to production but BAD.** The operator
  reviewed it and said the system "massively regressed" — disjointed UI,
  missing data. **It was built without ever being rendered in a browser**
  (only Playwright auth-status checks, which verify nothing visual). This
  is the problem to fix.

## What the operator is unhappy about (confirmed from one screenshot)

Screenshot was the cockpit landing page for "Tri-Bros Transportation"
(`/admin/compliance/4944a84d-535c-4772-a7a8-affaa8376697`). Even there:
1. **`CIS Controls v8 — IGIG1`** — label bug. `frameworkLabel()` does
   `'cis-v8-ig1'.replace('cis-v8-', 'IG').toUpperCase()` → `IGIG1`.
   Should be `IG1`. This bad helper is **copy-pasted into several of the
   new pages** — grep `frameworkLabel` across `src/app/admin/compliance/`.
2. **Panel disagreement** — POSTURE shows "37 review", FINDINGS panel shows
   "32 REVIEW" for the same assessment. Two different queries
   (`compliance_assessments.manualReviewControls` vs a live count of
   `compliance_findings WHERE status IN ('needs_review','partial')`).
   Never reconciled.
3. **Misleading 28% posture score** — `passed / total` counts
   `needs_review` controls as not-passing, so a mostly-fine customer
   shows 28%. Design flaw, not just a bug.
The operator says the *other 7 pages* are likely worse — unverified.

## Already fixed this session

- **`getCustomerProfileAnswers` shadowing bug** — commit `a27ee90`, shipped.
  It used to return a non-empty `form_responses` row "as-is, no merge with
  legacy", so a partial row (e.g. customer-context-only) shadowed all of
  `policy_org_profiles`. Now it layers: legacy merge = base, form_responses
  overlays per-key. This was a real "missing data" source feeding the
  engine + policy generator.
- **Vercel build fix** — commit `9e58e16`. `CI=true` flips ESLint warnings
  to errors; 7 `<a>`→`<Link>` swaps unblocked the build. **Lesson: always
  run `CI=true npx next build` locally — plain `next build` does not catch
  what Vercel catches.**

## The root-cause fix in progress: hermetic local preview loop

The reason the UI is bad: I never saw it. The fix is a local environment
where the next session CAN see it (Claude is multimodal — it can read PNG
screenshots via the Read tool; it just needs to generate them).

**Why not screenshot production:** `/api/test/auth` (the e2e session
endpoint) is behind the same Vercel edge firewall (`403 host_not_allowed`)
that blocks `/api/migrations/*` and `/api/cron/*`. Preview deploys are
also protected. So an external Playwright runner can't authenticate.
The answer is a fully local app.

### THE LOCAL LOOP WORKS — full reproduce steps

The loop is built and proven end-to-end (edit → re-screenshot → verify).
From a fresh sandbox, reproduce it like this:

```bash
# 1. Docker daemon (the bg process dies between sessions — restart it)
sudo rm -f /var/run/docker.sock
(sudo dockerd > /tmp/dockerd.log 2>&1 &)
until docker info >/dev/null 2>&1; do sleep 2; done

# 2. Postgres 16 — if container 'tct-pg' already exists, `docker start tct-pg`
#    keeps the schema; otherwise create fresh:
docker run -d --name tct-pg -e POSTGRES_PASSWORD=devpass \
  -e POSTGRES_DB=tct -p 5433:5432 postgres:16
until docker exec tct-pg pg_isready -U postgres >/dev/null 2>&1; do sleep 2; done

# 3. Recreate .env.local (gitignored — contents below), then sync schema:
DATABASE_URL='postgresql://postgres:devpass@localhost:5433/tct' \
  npx prisma db push --accept-data-loss
DATABASE_URL='postgresql://postgres:devpass@localhost:5433/tct' \
  npx prisma generate

# 4. Seed (tsx resolves the @/ alias fine — no extra flags needed):
DATABASE_URL='postgresql://postgres:devpass@localhost:5433/tct' \
  npx tsx scripts/local-seed.ts

# 5. Dev server (reads .env.local automatically):
(npm run dev > /tmp/devserver.log 2>&1 &)
until curl -sS -o /dev/null http://localhost:3000/; do sleep 3; done

# 6. Screenshot harness — committed at scripts/screenshot-cockpit.ts.
#    Captures all 10 compliance pages at desktop + mobile into /tmp/shots/.
npx tsx scripts/screenshot-cockpit.ts
```

Then **Read** the PNGs in `/tmp/shots/` — Claude is multimodal, it can
see them. That IS the review loop.

Notes / gotchas confirmed this session:
- The Playwright-pinned chromium can't be downloaded in the sandbox, but
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` is pre-installed
  and the harness already points `executablePath` at it.
- `scripts/local-seed.ts` reuses `ensureComplianceTables()` — it creates
  the raw-SQL compliance tables AND inserts a realistic data spread for
  company `4944a84d-535c-4772-a7a8-affaa8376697` (Tri-Bros Transportation).
- `npm run seed` (the committed prisma seed) does NOT work locally — it's
  hardcoded for Prisma Accelerate. Use `scripts/local-seed.ts` instead.
- `CI=true npx next build` against the local non-SSL Postgres logs
  blog/sitemap TLS errors during static generation — harmless, unrelated,
  does not happen on Vercel. "✓ Compiled successfully" is the line to check.

### What's been done with the loop so far

- Reviewed all 10 pages (8 cockpit + diagnostics + legacy) at desktop +
  mobile. **Finding: the pages render with data and consistent styling —
  NOT "massively broken."** Real bugs exist; "white screen / missing
  everything" does not (in the local seed env).
- **Fixed + screenshot-verified** (commit `36f09cf`):
  - `IGIG1` label bug → `IG1` (cockpit + findings pages)
  - Cockpit POSTURE vs FINDINGS count mismatch — FINDINGS panel now
    derives from the same `assessmentRows` POSTURE uses
- **Fixed + screenshot-verified** (commit `5c98adf`, session 3):
  - Policy Library cards rendered `0` even with rows in the DB.
    `loadPolicies` selected `analyzedControlsCovered/Partial/Missing`
    from `compliance_policies` — those columns don't exist there (they
    live on `compliance_policy_analyses` as JSONB arrays). The silent
    `catch { return [] }` swallowed the error so the UI lied with "no
    policies." Fixed with a LEFT JOIN LATERAL + `jsonb_array_length()`;
    catch now logs before returning `[]`.
- **Still open** (seen but not yet fixed):
  - Posture % counts `needs_review` as not-passing → understates score.
    Decide: should the denominator exclude needs_review / not_applicable?
  - The gap between the operator's "massively regressed" and what the
    loop shows = rough-but-functional. Next session MUST ask the operator
    for 1-2 specific worst pages/states, OR walk every page state the
    seed doesn't cover (a SENT bundle, awaiting_customer items, a
    framework with 100+ findings, error states).

### Next actions, in order

1. Reproduce the loop (steps above).
2. Ask the operator: which specific page/state looked worst? Close the
   gap between "rough-but-functional" (what the loop shows) and
   "massively regressed" (their experience).
3. Fix pages **one at a time, screenshot-verified before each commit.**
4. Decide per page: fix-forward / rebuild / revert. Do NOT guess.

### Recreate `.env.local` (gitignored — not in the repo)

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

If the sandbox is fresh, also re-run: `sudo dockerd &`, then
`docker run -d --name tct-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=tct -p 5433:5432 postgres:16`,
wait for `pg_isready`, then `DATABASE_URL=... npx prisma db push --accept-data-loss`,
then `npx prisma generate`, then the seed.

## The 8 cockpit pages to review (all under `src/app/admin/compliance/`)

| Route | File | Notes |
|---|---|---|
| `/[companyId]` | `[companyId]/page.tsx` | landing — the screenshotted one |
| `/[companyId]/findings` | `[companyId]/findings/page.tsx` | + `components/compliance/FindingDispositionRow.tsx` |
| `/[companyId]/assessments` | `[companyId]/assessments/page.tsx` | + `components/compliance/RunAssessmentButton.tsx` |
| `/[companyId]/changes` | `[companyId]/changes/page.tsx` | |
| `/[companyId]/changes/new` | `[companyId]/changes/new/page.tsx` | + `components/compliance/NewBundleForm.tsx` |
| `/[companyId]/changes/[bundleId]` | `[companyId]/changes/[bundleId]/page.tsx` | + `components/compliance/BundleComposer.tsx` |
| `/[companyId]/connections` | `[companyId]/connections/page.tsx` | |
| `/[companyId]/policies` | `[companyId]/policies/page.tsx` | |
| `/diagnostics` | `diagnostics/page.tsx` | TCT-only, not per-customer |

Shared bug: the `frameworkLabel()` helper is duplicated across these with
the `IGIG1` defect. Fix once, ideally extract to a shared util.

## Process rules — agreed with the operator, do not violate

1. **One page at a time.** Never batch UI again.
2. **Screenshot-verify before commit**, not after. The local loop exists
   for exactly this.
3. **No auto-merge of unreviewed UI.** Work on the branch; only let a page
   reach production after it has been screenshot-reviewed.
4. **`CI=true npx next build`** before every push — mirrors Vercel.

## Pending decision for the operator

Whether to revert the cockpit UI off production now, or leave it (the
legacy `/admin/compliance` dashboard is untouched and is still the default
entry point — the cockpit lives at separate `/[companyId]` URLs, so it is
not breaking existing workflows). This session deferred the decision until
the pages can actually be seen. Revisit after the screenshot review.

## Everything else still open (lower priority — see docs/current-tasks.md)

- **C13 real Graph executor handlers** — 8 stubs; needs operator
  test-tenant green-light per action.
- **W13/W15** — delete legacy intake UIs; blocked on a real Profile editor.
- **W16** — drop legacy `policy_org_profiles` + `compliance_customer_context`
  tables; operator-gated, after soak.
- **P6 carryovers** — DOCX/SharePoint/ZIP policy export, policy editing UI,
  customer attestation UI, customer portal compliance card.
- **Security hardening** — `CRON_SECRET` rotation (operator did
  `MIGRATION_SECRET`), per-tenant credential encryption Waves 2-5, audit
  guards on `/admin/setup` etc., CSP violation reporting.
