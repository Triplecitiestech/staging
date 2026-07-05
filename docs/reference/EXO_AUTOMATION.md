# Exchange Online Automation (shared-mailbox conversion + delegation)

*Added 2026-07-05. Owner setup required before enabling — the code ships disabled.*

## Why this exists

Microsoft Graph cannot convert a mailbox to shared, grant mailbox Full Access / Send As, or set forwarding — those are Exchange Online management operations (`Set-Mailbox`, `Add-MailboxPermission`, `Add-RecipientPermission`). The supported unattended path (per Microsoft Learn, ["App-only authentication in Exchange Online PowerShell"](https://learn.microsoft.com/en-us/powershell/exchange/app-only-auth-powershell-v2)) is Exchange Online PowerShell v3 with certificate-based app-only auth. Vercel cannot run PowerShell, so an **Azure Automation runbook** executes the Exchange work and reports back to the platform.

Two Microsoft rules shape the flow (["Convert a user mailbox to a shared mailbox"](https://learn.microsoft.com/en-us/microsoft-365/admin/email/convert-user-mailbox-to-shared-mailbox)):
- **A mailbox must still be licensed to convert it** — so the offboarding pipeline converts BEFORE removing licenses, and defers license removal whenever a conversion is outstanding.
- Shared mailboxes under 50 GB need no license afterwards; > 50 GB or litigation hold requires keeping a license (the runbook reports these as warnings).

## Architecture

```
Offboarding pipeline (/api/hr/process, keep_accessible + tenant enabled)
  └─ dispatchConvertToShared()  src/lib/exchange-online.ts
       ├─ INSERT exo_jobs row (per-job callback_token)
       ├─ Graph: resolve tenant's *.onmicrosoft.com domain
       └─ POST Azure Automation webhook ──► runbook Invoke-TctExoOffboardingJob.ps1
                                              ├─ Connect-ExchangeOnline (cert app-only)
                                              ├─ pre-checks (size, litigation hold)
                                              ├─ Set-Mailbox -Type Shared (idempotent)
                                              ├─ Add-MailboxPermission / Add-RecipientPermission
                                              ├─ VERIFY observed state (Get-Mailbox / Get-MailboxPermission)
                                              └─ POST /api/webhooks/exo-jobs (HMAC per-job token)
  └─ waitForExoJobCompletion() polls exo_jobs ≤ 120 s
       ├─ succeeded → [DONE] in PROVISIONING RESULTS → licenses removed normally
       ├─ failed    → [FAILED] + manual remediation; license removal deferred
       └─ timeout   → [QUEUED]; callback posts the confirmation note later; license removal deferred
```

Honesty guarantees: a job is only marked done by the runbook's *observed-state* callback; nothing is reported `[DONE]` at dispatch time. Tenants that aren't enabled keep today's `[MANUAL]` behavior unchanged.

## One-time Azure setup (operator)

1. **App registration** (TCT tenant, https://entra.microsoft.com → App registrations → New):
   - Name `TCT Exchange Automation`; supported account types: **Accounts in any organizational directory (multitenant)**.
   - API permissions → Add → **APIs my organization uses** → `Office 365 Exchange Online` → Application → **`Exchange.ManageAsApp`** → grant admin consent (TCT tenant).
   - Do NOT reuse the portal app (`M365_PORTAL_CLIENT_ID`) — separate blast radius.
2. **Certificate** (PowerShell 7, elevated — CNG certs are NOT supported, use `-KeySpec KeyExchange`):
   ```powershell
   $cert = New-SelfSignedCertificate -DnsName "exo-automation.triplecitiestech.com" -CertStoreLocation "cert:\CurrentUser\My" -NotAfter (Get-Date).AddYears(2) -KeySpec KeyExchange
   $cert | Export-PfxCertificate -FilePath tct-exo.pfx -Password (Get-Credential).password
   $cert | Export-Certificate -FilePath tct-exo.cer
   ```
   Upload `tct-exo.cer` to the app registration → Certificates & secrets. Record the expiry — rotation is an operator task.
3. **Azure Automation account** (TCT subscription):
   - Runtime environment: PowerShell 7.2, add the `ExchangeOnlineManagement` module (v3.2+).
   - Certificate asset **`TCT-EXO-Automation`**: upload `tct-exo.pfx` (exportable).
   - Variable asset **`TctExoAppId`**: the app registration's client ID.
   - Import runbook from `scripts/exo/Invoke-TctExoOffboardingJob.ps1`, publish it.
   - Add a **webhook** on the runbook (expiry ≤ 1 year — record the date); copy the URL once (it embeds the secret).
4. **Vercel env vars** (Production):
   - `EXO_AUTOMATION_ENABLED` = `true` (kill switch — leave unset/false to disable everything)
   - `EXO_AUTOMATION_WEBHOOK_URL` = the runbook webhook URL
   - `EXO_ENABLED_TENANTS` = comma-separated company slugs (start with ONE pilot tenant; `*` allows all)
5. **Database**: POST `https://www.triplecitiestech.com/api/migrations/run` (MIGRATION_SECRET auth) after deploy — creates `exo_jobs`.

## Per-tenant enablement (operator, once per customer)

Run `scripts/exo/Enable-TenantExoAutomation.ps1` in PowerShell 7:

```powershell
./scripts/exo/Enable-TenantExoAutomation.ps1 -CustomerTenantId <customer-tenant-guid> -AppId <app-client-id>
```

It walks through: (1) the admin-consent URL a customer-tenant admin must accept (`https://login.microsoftonline.com/<tenant-id>/adminconsent?client_id=<client-id>&scope=https://outlook.office365.com/.default`), (2) assigning **Exchange Recipient Administrator** (least-privilege sufficient role; NOT Exchange Administrator) to the app's service principal in the customer tenant, and (3, optional `-Verify`) an app-only `Connect-ExchangeOnline` smoke test. Then add the company slug to `EXO_ENABLED_TENANTS`.

Stricter scoping later: Exchange "RBAC for Applications" (custom role group + `New-ServicePrincipal` + `Add-RoleGroupMember` with the Mail Recipients role) — documented in the same Microsoft Learn article, Option 2.

## Pilot checklist

1. Enable ONE test tenant (consent + role + slug in `EXO_ENABLED_TENANTS`).
2. Submit a test offboarding with "Convert to shared mailbox — keep accessible" + a delegate.
3. Confirm: ticket shows `[DONE] Convert mailbox to shared + grant access…` (or `[QUEUED]` then a "Mailbox Converted to Shared" note), the mailbox shows as Shared in the M365 admin center, the delegate can open it, and licenses were removed AFTER conversion.
4. Kill-switch drill: set `EXO_AUTOMATION_ENABLED=false`, submit another test, confirm clean fallback to `[MANUAL]` with the license-deferral instruction.

## Failure modes

| Failure | Behavior |
|---|---|
| Kill switch off / tenant not in allowlist | `[MANUAL]` outcome, license removal deferred with instructions (no behavior regression) |
| Webhook dispatch fails / Graph domain lookup fails | `[FAILED]` + manual remediation steps; license removal deferred |
| Runbook errors (no consent/role, mailbox missing) | Callback marks job failed → `[FAILED]` (in-window) or failure note (late) |
| Runbook succeeds after the 120 s wait | `[QUEUED]` in results; callback posts internal + customer confirmation notes and a "remove the license now" reminder |
| Callback never arrives (runbook crashed before callback) | Job stays `dispatched`; ticket carries the QUEUED note telling staff a confirmation should follow — investigate the Automation job log |

Secrets: the certificate lives only in Azure Automation; the webhook URL and env flags only in Vercel. Callbacks are HMAC-signed with a per-job token (no shared long-lived callback secret). All jobs are audited in `exo_jobs` (raw-pg).
