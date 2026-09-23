# Customer mail setup: `notifyContact` on `autotask_add_customer_note`

*Created 2026-09-23. Owner: Kurtis.*

## Purpose

This setup lets the connector email a customer update to the ticket's contact from **support@triplecitiestech.com**.

It exists because Autotask cannot be asked to send that email. The note form's "Quick Notification" boxes have no REST field, and on 2026-09-22 live evidence showed that notes and time entries created through the connector never email the customer (`docs/gotchas.md` → Autotask Integration).

## Scope

- **What it does:** the tool sends one email to one recipient, and that recipient is always the ticket's own contact record.
- **What it cannot do:** the connector has no parameter for any other address, CC or BCC.
- **What it needs:** one dedicated Entra app holding exactly one right. That right is `Mail.Send`, and it is scoped by Exchange Application RBAC to the support mailbox only.

## Responsibilities

| Who | Does what |
|---|---|
| Kurtis, or anyone with Exchange Administrator plus Application Developer | Steps 1–6 |
| Vercel project admin | Step 7 (env vars) |
| Claude / the connector | Everything after that. The tool checks readiness before it writes anything. |

## Risks and prerequisites (read before starting)

- **Never grant `Mail.Send` through Entra API permissions or admin consent for this app.** Microsoft documents Entra grants and Application RBAC scopes as a **union**. A tenant-wide grant would let this app send as *any* person at TCT, and the mailbox scope would stop meaning anything. The right comes **only** from the Exchange role assignment in step 5. ([Microsoft: RBAC for Applications, FAQ](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac))
- **Allow time for the permission to take effect.** Exchange caches app permissions for **30 minutes to 2 hours**. The first send can fail with 403 even when the configuration is correct. `Test-ServicePrincipalAuthorization` bypasses that cache. (same source, "Limitations")
- **Secret or certificate:** Microsoft recommends a certificate over a client secret for production ([source](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-credentials)). This repo uses client secrets for its other dedicated apps (HR records, Scan Filer), and this app follows that convention. Moving to a certificate would need a code change.
- **You'll need:** an Exchange Online PowerShell v3 session (`Connect-ExchangeOnline`), and a role that can create app registrations.

## Procedure

### 1. Confirm the sender mailbox exists and note its type

```powershell
Connect-ExchangeOnline -Organization triplecitiestechcom.onmicrosoft.com
Get-EXOMailbox -Identity 'support@triplecitiestech.com' | Format-List DisplayName,PrimarySmtpAddress,RecipientTypeDetails
```

Either a user mailbox or a shared mailbox works. Stop here if the command finds nothing.

### 2. Register the app

Portal path verified against [Register an app](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app) on 2026-09-23:

1. Go to https://entra.microsoft.com and open **Entra ID** > **App registrations** > **New registration**.
2. Set **Name** to `TCT Customer Mail (connector)`.
3. Set **Supported account types** to **Single tenant only**.
4. Leave the redirect URI blank and select **Register**.
5. On **Overview**, record the **Application (client) ID** and the **Directory (tenant) ID**.
6. **Do not add any API permissions** (see Risks).

### 3. Create the client secret

Portal path verified against [Add credentials](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-credentials) on 2026-09-23:

1. In the app, open **Certificates & secrets** > **Client secrets** > **New client secret**.
2. Choose an expiry under 12 months (Microsoft's recommendation) and select **Add**.
3. Copy the **Value** immediately, because it is never shown again. It goes straight into Vercel in step 7 and never into a chat or a document.

### 4. Get the service principal's object ID

Take this from **Enterprise applications**, not App registrations; the two pages show different IDs.

```powershell
Connect-MgGraph -Scopes 'Application.Read.All'
$appId = '<Application (client) ID from step 2>'
$sp = Get-MgServicePrincipal -Filter "appId eq '$appId'"
$sp | Format-List DisplayName,AppId,Id
```

### 5. Scope `Mail.Send` to the support mailbox in Exchange

Cmdlets verified against [RBAC for Applications](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac) on 2026-09-23:

```powershell
$ErrorActionPreference = 'Stop'
$appId    = '<Application (client) ID>'
$objectId = '<service principal Id from step 4>'

New-ServicePrincipal -AppId $appId -ObjectId $objectId -DisplayName 'TCT Customer Mail (connector)'

New-ManagementScope -Name 'TCT-CustomerMail-SupportMailboxOnly' `
  -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'support@triplecitiestech.com'"

New-ManagementRoleAssignment -App $objectId -Role 'Application Mail.Send' `
  -CustomResourceScope 'TCT-CustomerMail-SupportMailboxOnly'
```

### 6. Prove the scope with a control mailbox

The control check is the evidence that the app can send only as support@. Don't skip it.

```powershell
Test-ServicePrincipalAuthorization -Identity 'TCT Customer Mail (connector)' -Resource 'support@triplecitiestech.com'
Test-ServicePrincipalAuthorization -Identity 'TCT Customer Mail (connector)' -Resource 'kurtis@triplecitiestech.com'
```

- The first command must show `Application Mail.Send` with **InScope True**.
- The second must show **InScope False**. If it shows True, **stop**: something is granting the app more than the one mailbox.

### 7. Set the Vercel environment variables (Production)

| Variable | Value |
|---|---|
| `CUSTOMER_MAIL_TENANT_ID` | Directory (tenant) ID from step 2 |
| `CUSTOMER_MAIL_CLIENT_ID` | Application (client) ID from step 2 |
| `CUSTOMER_MAIL_CLIENT_SECRET` | Secret value from step 3 |
| `CUSTOMER_MAIL_SENDER` | Optional. Defaults to `support@triplecitiestech.com`. Must match the scope in step 5. |
| `CONNECTOR_CUSTOMER_EMAIL_ENABLED` | `true`. This is the kill switch: anything else means off. |

Environment variables only apply to new deployments, so redeploy production after setting them.

### 8. First live test (one email, to TCT only)

1. Create a test ticket whose contact is a TCT person.
2. Ask Claude: *"Add a customer note to test ticket T… saying 'Test of connector email' and notify the contact."*
3. Expect all four of the following:
   - The response shows `customerNotified: true` with `customerEmail.status: "accepted"`.
   - An internal note titled **Customer emailed** appears on the ticket.
   - The message is in the support mailbox's **Sent Items**.
   - The TCT contact receives it.
4. Close the test ticket with **Complete - No Notify (52)**.

## What the tool does, in order

1. It refuses before writing anything if any of these is true: the kill switch is off, credentials are missing, the ticket has no contact, the contact is inactive, or the contact has no usable email.
2. It posts the customer-visible note (publish 1) and reads it back.
3. It sends **one** email. It never retries, because Graph `sendMail` is not idempotent.
4. It posts an internal note (publish 2) recording the recipient, sender, time and subject. Autotask's NotificationHistory never shows this email, because Autotask did not send it.

Graph returns **202 Accepted**, not "delivered" ([source](https://learn.microsoft.com/en-us/graph/api/user-sendmail)). A bounce arrives in the support mailbox.

## Escalation path

| Symptom | Meaning | Fix |
|---|---|---|
| `POLICY_BLOCKED`, "kill switch" | `CONNECTOR_CUSTOMER_EMAIL_ENABLED` is not exactly `true` | Step 7, then redeploy |
| `POLICY_BLOCKED`, "not configured" | A `CUSTOMER_MAIL_*` variable is missing | Step 7, then redeploy |
| `PERMISSION_DENIED`, "token fetch failed" | Wrong tenant ID, client ID or secret, or the secret expired | Step 3 (new secret), then step 7 |
| `PERMISSION_DENIED`, 403 on sendMail | RBAC assignment missing or still cached | Re-run step 6. If InScope is True, wait up to 2 hours (cache) |
| `TRANSIENT`, "timed out" | The email **may** have been sent | Check Sent Items in support@ **before** resending |
| Any failure after the note exists | The note is on the ticket, but the customer was not emailed | Don't re-run the tool, because that duplicates the note. Send from the note's Notification panel in Autotask. |

## Unknown: do customer replies thread into the ticket?

Customer replies go to support@. Whether they are appended to the ticket depends on Autotask **incoming email processing** for that mailbox. That setting is UI-only and was not checked. The subject always starts with `Ticket T…` so a human can match a reply either way.

## Related documentation

- `src/lib/customer-mail.ts`: the module, with the design reasoning in its header
- `src/lib/mcp-write-tools.ts` → `addCustomerNoteAndEmail`
- `docs/gotchas.md` → Autotask Integration (the notification evidence)
- `docs/reference/RAVEN_SCAN_FILING.md` §"Mail.Read": the same RBAC pattern, already set up once for the Scan Filer app
- Documents this change may affect: the **autotask-time-entry-writer** skill (Customer communication section) and any IT Glue SOP describing how technicians notify customers from Autotask
