# Exchange Online Automation — Enablement Runbook

*Operator runbook for the offboarding mailbox-conversion automation. Owner: Kurtis. Last updated: 2026-07-05.*

## What this system is

Microsoft Graph cannot convert a mailbox to shared, grant Full Access / Send As, or set forwarding — those are Exchange Online management operations. The platform therefore dispatches those steps to an **Azure Automation runbook** (Exchange Online PowerShell v3, app-only certificate auth) over an HMAC-signed webhook; the runbook re-reads Exchange state after acting and POSTs the **observed** result to `https://www.triplecitiestech.com/api/hr/exchange-callback`. The offboarding ticket only ever records `[DONE]` after that verification; tenants that are not enabled keep today's `[MANUAL]` outcome.

Verified against Microsoft Learn (2026-07):

- **App-only auth for EXO PowerShell** (`Exchange.ManageAsApp`, multi-tenant consent URL, role options): learn.microsoft.com/en-us/powershell/exchange/app-only-auth-powershell-v2
- **Convert a user mailbox to shared** (license must be assigned at conversion; remove it after; 50 GB unlicensed limit; holds/archive need a license): learn.microsoft.com/en-us/microsoft-365/admin/email/convert-user-mailbox-to-shared-mailbox
- **Why not "RBAC for Applications"**: that feature (learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac) applies to **Graph/EWS protocols only** — it cannot grant PowerShell cmdlets. The documented least-privilege path for PowerShell app-only is a **custom role group with the `Mail Recipients` role** whose member is the app's Exchange service principal (app-only-auth doc, "Option 2"). That is what `Enable-TctExchangeTenant.ps1` sets up — never grant the app Exchange Administrator or Global Administrator.
- **Azure Automation webhooks** (token URL, `WebhookData`, 202 + JobIds, add-your-own-validation guidance — hence our HMAC envelope): learn.microsoft.com/en-us/azure/automation/automation-webhooks
- **Runbook runtime**: PowerShell **7.4** (7.1/7.2 are out of support). The EXO v3 module in Automation requires **PowerShellGet + PackageManagement uploaded alongside it**: learn.microsoft.com/en-us/azure/automation/automation-runbook-types

Repo pieces: `src/lib/exchange-online.ts` (dispatch/availability/job state), `src/lib/hr/exchange-finalize.ts` (verified finalization), `/api/hr/exchange-callback`, `/api/cron/exchange-jobs-reconcile` (15-min lost-callback backstop), `/api/hr/exchange-tenants` (enablement registry), `scripts/exchange-automation/*.ps1`.

---

## Part A — One-time TCT setup (~45 min)

### A1. App registration + certificate

1. On a Windows machine with PowerShell 7, run:
   ```powershell
   Install-Module Microsoft.Graph.Applications -Scope CurrentUser
   pwsh .\scripts\exchange-automation\New-TctExchangeAutomationApp.ps1 -OutputFolder C:\Secure\ExoAutomation
   ```
   Sign in as a TCT admin who can create app registrations. Record the **AppId**, **thumbprint**, **expiry date**, and the **consent URL template** it prints.
2. The `.pfx` (private key) is used ONCE in step A3, then deleted. It must never be committed, mailed, or stored outside Azure.

### A2. Azure Automation account

1. Azure portal (`https://portal.azure.com`) → **Automation Accounts** → **Create**: subscription = TCT's, resource group `rg-exchange-automation` (create), name `aa-tct-exchange-automation`, region **East US**. System-assigned managed identity is fine to leave on; the runbook does not use it.
2. In the account → **Runtime Environments (preview)** → create environment `exo-ps74`, language PowerShell, version **7.4**. Add packages:
   - `ExchangeOnlineManagement` (latest 3.x from the gallery)
   - `PowerShellGet` and `PackageManagement` (required for EXO v3 in Automation — see runtime doc above)
3. **Runbooks** → **Create a runbook**: name `Invoke-TctExchangeJob`, type PowerShell, runtime environment `exo-ps74`. Paste the contents of `scripts/exchange-automation/Invoke-TctExchangeJob.ps1`, **Save**, **Publish**.

### A3. Automation assets

In the Automation account → **Certificates** / **Variables**:

1. **Certificates** → **Add a certificate**: name exactly `TctExchangeAutomation`, upload the `.pfx` from A1, enter its password, mark **exportable = No**. Then delete the local `.pfx`.
2. **Variables** — create:

   | Name | Encrypted | Value |
   |---|---|---|
   | `TctExoAppId` | No | AppId from A1 |
   | `TctExoDispatchSecret` | **Yes** | `[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))` — generate once, keep for A5 |
   | `TctExoCallbackSecret` | **Yes** | second value generated the same way |

### A4. Webhook

1. Runbook `Invoke-TctExchangeJob` → **Webhooks** → **Add webhook** → **Create new webhook**: name `platform-dispatch`, expiry as far out as allowed (diary the renewal), no parameter values.
2. **Copy the URL now — it is shown once.** It is a credential; store it only in Vercel (A5).

### A5. Platform configuration (Vercel)

1. `https://vercel.com/kurtis-florances-projects/staging` → **Settings → Environment Variables** (Production scope):

   | Variable | Value |
   |---|---|
   | `EXO_AUTOMATION_ENABLED` | `true` (the kill switch — set `false` to instantly degrade every tenant to `[MANUAL]`) |
   | `EXO_AUTOMATION_WEBHOOK_URL` | webhook URL from A4 |
   | `EXO_DISPATCH_SECRET` | same value as `TctExoDispatchSecret` |
   | `EXO_CALLBACK_SECRET` | same value as `TctExoCallbackSecret` |
   | `EXO_JOB_TIMEOUT_MINUTES` | optional, default `45` |

2. Redeploy (env changes need a fresh deploy), then create the tables:
   ```powershell
   Invoke-RestMethod -Uri 'https://www.triplecitiestech.com/api/migrations/run' -Method Post -Headers @{ Authorization = 'Bearer <MIGRATION_SECRET>' }
   ```
   Confirm the output lists `exo_tenant_config`, `hr_exchange_jobs`, and `hr_request_steps`.

---

## Part B — Per-customer-tenant enablement (~15 min + up to 2 h RBAC cache)

Prerequisites: the customer's tenant GUID and primary `.onmicrosoft.com` domain; a customer Global Admin for the consent click (or GDAP); their platform `companySlug` (the company's URL slug in the admin portal).

```powershell
Install-Module ExchangeOnlineManagement, Microsoft.Graph.Applications -Scope CurrentUser
pwsh .\scripts\exchange-automation\Enable-TctExchangeTenant.ps1 `
    -AppId <AppId from A1> `
    -CustomerTenantId <customer tenant GUID> `
    -OrganizationDomain <customer>.onmicrosoft.com `
    -CompanySlug <slug> `
    -PlatformBaseUrl https://www.triplecitiestech.com `
    -EnabledBy <your email>
```

The script walks through, in order: (1) the admin-consent URL, (2) locating the consented service principal, (3) `New-ServicePrincipal` + role group `TCT Exchange Automation` holding only **Mail Recipients** + membership, (4) verification that every runbook cmdlet is actually granted by that role in this tenant (aborts if not), (5) registration via `POST /api/hr/exchange-tenants`, (6) an end-to-end **probe job through the real runner**. A probe failure right after enablement is usually the ~2-hour Exchange RBAC cache — re-probe later:

```powershell
Invoke-RestMethod -Uri 'https://www.triplecitiestech.com/api/hr/exchange-tenants?action=probe' -Method Post `
  -Headers @{ Authorization = 'Bearer <MIGRATION_SECRET>' } -ContentType 'application/json' `
  -Body '{"companySlug":"<slug>"}'
```

To **disable** a tenant (degrades to `[MANUAL]`, never blocks offboarding):

```powershell
Invoke-RestMethod -Uri 'https://www.triplecitiestech.com/api/hr/exchange-tenants' -Method Post `
  -Headers @{ Authorization = 'Bearer <MIGRATION_SECRET>' } -ContentType 'application/json' `
  -Body '{"companySlug":"<slug>","organizationDomain":"<customer>.onmicrosoft.com","enabled":false}'
```

---

## Part C — Pilot checklist (run in a TEST tenant first)

1. [ ] Part B completed; probe returned `probeOk: true`.
2. [ ] Create a disposable licensed test user with a few mails in the mailbox.
3. [ ] Submit an offboarding through the customer portal for that user with **"Convert to Shared Mailbox — Keep Accessible"** and one delegate.
4. [ ] Verify the Autotask ticket's PROVISIONING RESULTS shows `[QUEUED] Convert mailbox to shared…` and `[QUEUED] Remove Microsoft 365 licenses (after mailbox conversion is confirmed)` — and that the customer note says **In Progress**, not complete.
5. [ ] Within ~10 min: ticket gains **"Mailbox Conversion Completed (automated)"** (internal) and **"Shared Mailbox Ready"** (customer) notes; requester receives the confirmation email.
6. [ ] Verify independently in the customer tenant: `Get-Mailbox <upn> | Select RecipientTypeDetails` = `SharedMailbox`; `Get-MailboxPermission <upn>` shows the delegate; the license is gone (M365 admin center → user → Licenses).
7. [ ] Ticket closed automatically (only if nothing else manual was on the form).
8. [ ] Failure drill: temporarily disable the webhook in Azure → run another test offboarding → dispatch fails → ticket shows `[FAILED]` + manual checklist at raised priority. Re-enable the webhook.
9. [ ] Timeout drill: stop the runbook job right after dispatch (Azure portal → Jobs → Stop) → within ~1 h the reconcile cron posts "Mailbox Conversion TIMED OUT — Manual Completion Required" and raises priority.
10. [ ] Only after all of the above: enable real customer tenants one at a time.

---

## Part D — Operations

- **Kill switch**: set `EXO_AUTOMATION_ENABLED=false` in Vercel + redeploy. Every keep_accessible offboarding degrades to `[MANUAL]` with the reason attached. Jobs already dispatched still finish (callback keeps working).
- **Lost callbacks**: `/api/cron/exchange-jobs-reconcile` (every 15 min) times out jobs older than `EXO_JOB_TIMEOUT_MINUTES` (45): failed step + manual instructions + priority escalation. A callback that arrives after that posts a "Late Exchange Automation Result Received" note instead of silently flipping anything.
- **Certificate rotation** (before the expiry recorded in A1): re-run A1 (new cert on the same app via the portal or `Update-MgApplication`), upload the new `.pfx` over the `TctExchangeAutomation` asset, verify with a probe. No per-tenant work needed.
- **Webhook renewal**: extend/recreate before expiry (A4) and update `EXO_AUTOMATION_WEBHOOK_URL`.
- **Secret rotation**: generate new values, update the Automation variable and the Vercel env var together, redeploy.
- **Job history**: `GET /api/hr/exchange-tenants` (Bearer `MIGRATION_SECRET`) lists tenants + probe state; job rows live in `hr_exchange_jobs`; runner-side logs are in the Automation account's **Jobs** blade. Note: Azure logs runbook input, which includes target/delegate UPNs — that is TCT's own Azure tenant and acceptable; never add message bodies or credentials to the payload.
- **Known limits (phase 1)**: forwarding (`forward_to_manager` / `forward_to_specific`) is still `[MANUAL]` — phase 2 adds it to the same runner once conversion is piloted. On-prem-hybrid mailboxes (`RemoteUserMailbox`) will fail the runbook's `Get-Mailbox` and surface as `[FAILED]` → manual; that is correct behavior, do the conversion on-prem.
