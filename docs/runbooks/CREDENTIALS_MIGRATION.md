# Credentials Migration Runbook

**Purpose**: move third-party integration credentials from plaintext columns / MSP-global env vars into the encrypted, per-tenant `integration_credentials` table.

**Why**: SOC 2 CC6 (logical access) and CC7 (encryption + monitoring) both require secrets at rest to be encrypted and access to be logged. Today the M365 client secret is plaintext in `companies.m365_client_secret`, and every other vendor uses an MSP-global env var with no per-tenant isolation.

This runbook is the source of truth for the rollout. Update the status checkboxes below as each step completes.

---

## Status

| Wave | Scope | State |
|------|-------|-------|
| 0 | Zero-risk hygiene (docs, env.example, gitleaks) | ✅ shipped |
| 1 | Crypto module + credentials table (dormant) | ✅ shipped |
| 2 | Dual-write M365 + migration + verification | ⏳ pending |
| 3 | `MIGRATION_SECRET` / `CRON_SECRET` rotation | ⏳ pending (operator) |
| 4 | Soak + column null + drop | ⏳ pending (operator gate) |
| 5 | Other vendors onto per-tenant credentials | ⏳ future |
| 6 | KMS for master key, RLS, quarterly rotation | ⏳ future |

---

## What is in place today (Wave 1)

- `src/lib/crypto.ts` — AES-256-GCM envelope encryption with versioned keys (`v1`, `v2`, …). Unit-testable, isolated.
- `src/lib/credentials.ts` — `getCredential`, `setCredential`, `getCredentialWithFallback`, `listCompanyCredentials`, `deleteCredential`. Every read writes to `integration_credential_access_log`. Nothing imports this module yet; the dual-read pattern is dormant until Wave 2.
- Tables created idempotently by `src/lib/compliance/ensure-tables.ts`:
  - `integration_credentials (id, companyId, connectorType, encryptedValue, metadata, lastRotatedAt, createdAt, createdBy, updatedAt, updatedBy)` — UNIQUE on `(companyId, connectorType)`, FK → `companies.id` ON DELETE CASCADE.
  - `integration_credential_access_log (id, credentialId, companyId, connectorType, accessedBy, purpose, accessedAt)` — FK → `integration_credentials.id` ON DELETE CASCADE.
- `env.example` now lists every integration credential env var, including `ENCRYPTION_MASTER_KEY_V1` and `SAAS_ALERTS_WEBHOOK_TOKEN`.
- `.gitleaks.toml` + `.githooks/pre-commit` + `.github/workflows/ci.yml` (secret-scan job) block secret-shaped content before it hits git.
- Previously-committed values of `MIGRATION_SECRET` and `CRON_SECRET` are explicitly blocked by gitleaks rule `tct-migration-cron-secret`.

**None of the above changes runtime behaviour.** Vendor clients still read `process.env.*`. The Graph client still reads `companies.m365_client_secret`. The new code is additive and idle.

---

## Operator checklist — required before Wave 2 runs

These are one-time actions you have to do from the Vercel dashboard. Wave 2 code will fail loudly in any environment where step 1 is missing.

### 1. Generate and set `ENCRYPTION_MASTER_KEY_V1` in Vercel

```powershell
# Windows PowerShell — generate a 32-byte base64 key
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

Paste the output into Vercel env vars for **all three** environments (Production, Preview, Development). If Preview is missing the key, Preview deploys will crash on first credential read. Confirm by redeploying Preview and watching logs.

⚠️ **Do not lose this key.** Every encrypted row is useless without it. Back it up to your password manager the moment you generate it.

### 2. Rotate `MIGRATION_SECRET` and `CRON_SECRET` (Wave 3)

The prior values were checked into `CLAUDE.md`. They have been scrubbed from the current revision but remain in git history, so anyone who ever cloned the repo has them. **Assume they are compromised** and rotate both.

Rotation procedure (dual-accept, no downtime):

1. Generate new values:
   ```powershell
   # MIGRATION_SECRET — 32 bytes, base64
   [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
   # CRON_SECRET — 32 bytes, hex
   -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
   ```
2. In Vercel, **add** new env vars alongside the old ones: `MIGRATION_SECRET_NEW`, `CRON_SECRET_NEW`.
3. Ask Claude to update `src/lib/api-auth.ts` so `checkSecretAuth` accepts either the old or the new value. Deploy.
4. Trigger a cron job manually (e.g. hit `/api/cron/health-monitor` with `Authorization: Bearer <new>`). Confirm 200.
5. In Vercel: replace the original `MIGRATION_SECRET` / `CRON_SECRET` values with the new ones. Remove the `*_NEW` env vars.
6. Ask Claude to revert `checkSecretAuth` to single-value mode. Deploy.
7. Verify `/api/cron/health-monitor` still runs. Wait one cron cycle (~30 minutes) to be sure.

### 3. Enable the gitleaks pre-commit hook locally (one-time per developer)

```bash
git config core.hooksPath .githooks
# Install gitleaks:
#   Windows:  scoop install gitleaks
#   macOS:    brew install gitleaks
```

CI runs the same scan automatically on PRs via `.github/workflows/ci.yml`.

---

## Wave 2 — Migrate M365 credentials off the companies table

**Goal**: every company's M365 client secret lives encrypted in `integration_credentials`, with zero break to the M365 token-exchange flow.

### 2a. Dual-write (Claude ships code, you approve PR)

Update the PUT handler in `src/app/api/admin/companies/[id]/m365/route.ts` so that when an admin saves M365 credentials, it writes to BOTH:
- the legacy `companies.m365_client_secret` column (unchanged)
- the new `integration_credentials` table via `setCredential(...)`

New companies configured after this deploy will have their secret in both places. Old companies still only have it in the column.

### 2b. Dual-read (same PR as 2a)

Update `src/lib/graph.ts` (and `src/lib/graph-tct.ts` if applicable) so the credential lookup order is:

1. `getCredential(companyId, 'microsoft_graph', { accessedBy: 'graph-client', purpose: 'token-exchange' })`
2. If that returns null, fall back to reading `companies.m365_client_secret`.
3. Log a structured warning every time the fallback fires — surfaces in ErrorLog so we can see migration progress.

### 2c. Verification endpoint (same PR)

Add `GET /api/admin/compliance/credentials/verify` (auth: staff session) that, for every company with `m365_client_secret IS NOT NULL`:
- reads the credential via the dual-read path
- attempts a Graph token exchange
- returns `{ companyId, displayName, source: 'per_tenant' | 'legacy_column' | 'none', verified: boolean, error?: string }`

Run it manually before migration, record the output. Run it again after migration — every company should flip from `legacy_column` to `per_tenant` and `verified: true`.

### 2d. Migration script (Claude runs with your approval)

`scripts/migrate-m365-credentials.ts`:
```ts
// Copies plaintext companies.m365_client_secret into encrypted
// integration_credentials rows. Leaves the original column untouched
// so rollback is trivial.
```

Run in two steps:
1. Against a single test company first (`--company-id=<id>`). Verify with the endpoint from 2c.
2. Against all companies once 1 is green. Re-run the verify endpoint.

### 2e. Soak

Leave the system in dual-read mode for at least 7 days. Watch the ErrorLog for fallback warnings. Zero fallbacks in a week = safe to proceed.

---

## Wave 3 — Operator-gated cutover

1. ✅ All companies' credentials verified via per-tenant path.
2. `pg_dump` the `companies` table as a rollback safety net.
3. Run `UPDATE companies SET m365_client_secret = NULL WHERE m365_client_secret IS NOT NULL` — nulls the column values but keeps the column so rollback is still possible without a schema change.
4. Watch for 24 hours. If anything breaks, refill from backup.
5. Claude writes a Prisma migration that drops the column. You approve. Deploy.

---

## Wave 5 — Other vendors (opportunistic, not blocking)

Today every non-M365 vendor uses MSP-global env vars. That is acceptable for an MSP-internal tool with a single Datto instance, single IT Glue tenant, etc. Move to per-tenant credentials **only** when you have a customer that:
- owns their own Datto / IT Glue / etc. instance, OR
- requires cryptographic separation from other customers for SOC 2 Type II attestation.

When you cross that bridge, the pattern is identical to Wave 2 for each vendor:
1. Add `set + get` calls using `connectorType: 'datto_rmm'` etc.
2. Dual-read in the vendor client using `getCredentialWithFallback(companyId, 'datto_rmm', ctx, { envVarName: 'DATTO_RMM_API_KEY' })`.
3. Migrate per customer.

---

## Wave 6 — Long-term hardening

- Move `ENCRYPTION_MASTER_KEY_V1` into AWS KMS / GCP KMS / HashiCorp Vault. Use envelope encryption so only data keys live in the app; the master key never leaves KMS.
- Row-level security on `integration_credentials` keyed on a session variable set by middleware.
- Key rotation playbook: issue `v2`, re-encrypt every row, retire `v1`. Practice this once even without a compromise — the procedure must be exercised.
- Quarterly rotation policy for MSP-global env-var keys (Datto, IT Glue, etc.).
- Remove the `?secret=` query-param fallback from `checkSecretAuth()` after auditing every caller.

---

## Rollback procedures

### If Wave 2c verification surfaces failures

Simply don't proceed. The legacy column still holds the original secret; the dual-read path keeps using it. Delete any bad rows in `integration_credentials` and investigate.

### If Wave 2b dual-read has a bug in production

Add a feature flag `USE_PER_TENANT_CREDENTIALS=false` at the top of `getCredentialWithFallback`; return `null` for per-tenant path, forcing the env-var fallback. Redeploy. All integrations revert to the legacy path.

### If the master key is lost

Encrypted rows become unrecoverable. Existing callers fall back to the legacy column (for M365) or env vars (for MSP vendors). You can re-key by:
1. Generate a new master key, set as `ENCRYPTION_MASTER_KEY_V2`.
2. Ask each admin to re-enter their M365 credentials — `setCredential` will encrypt with `v2`.
3. Delete old `v1` ciphertext that can't be decrypted.

Losing the key ≠ losing data, but it does mean every tenant has to re-enter their integration creds.

### If `MIGRATION_SECRET` rotation is done incorrectly

Symptoms: cron jobs 401, migration endpoints 401. Fix: set `MIGRATION_SECRET` back to the previous value in Vercel env. The dual-accept code from step 3 above will accept it and traffic recovers within one deploy cycle.

---

## Contacts / Ownership

- **Runbook owner**: platform eng (update when team expands)
- **Master key custody**: you (personal password manager + one offline backup)
- **Auditor-facing doc**: this file is the source of truth; link it from the SOC 2 evidence binder once complete

Last updated: Wave 1 shipped on the `claude/review-compliance-architecture-VLlgG` branch.
