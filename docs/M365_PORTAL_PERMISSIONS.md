# TCT Customer Portal — Microsoft Graph Permissions

> **Single grant list.** Hand this to a customer Global Admin once, ask
> them to consent on behalf of the organization, and every TCT compliance
> + onboarding flow has the access it needs. Built from a full audit of
> every Graph endpoint the codebase hits.

## How to grant (multi-tenant flow — preferred)

1. As a TCT engineer, hit:
   `https://www.triplecitiestech.com/api/admin/m365/consent?companyId=<id>`
2. Customer Global Admin signs in to Microsoft, sees the consent screen
   listing every scope below, clicks **Accept**.
3. Re-hit the page to confirm the green callback. `m365_consent_mode`
   flips to `multi_tenant`; `m365_consent_granted_at` is stamped.

## How to verify after granting

Microsoft 365 admin center → **Enterprise Applications** → **TCT
Customer Portal** → **Permissions**. Every scope below should be
listed as "Application" (NOT "Delegated") and "Consented".

If a Graph call returns 403 in a Remediate preview, the preview card
now names the specific scope that's missing. Grant it, re-consent.

---

## Required Application Permissions

Application (app-only) permissions, not delegated. All of these are
required — leaving any off will break at least one compliance flow.

### Identity & user management
| Scope | Used for |
|---|---|
| `User.ReadWrite.All` | Provision portal users, reset passwords, revoke sign-in sessions, disable accounts during offboarding |
| `Group.ReadWrite.All` | Read/create groups for license + CA scope (manager groups, break-glass exclusions) |
| `GroupMember.ReadWrite.All` | Add/remove users from CA-scope groups during onboarding/offboarding |
| `Directory.Read.All` | Read directory setting templates (for password-protection rules), look up org-wide config |
| `Directory.ReadWrite.All` | Write directory settings (password protection enable/disable) |
| `Organization.Read.All` | Read tenant org info + license SKU inventory for the dashboard |

### Sign-in / auth posture (reports)
| Scope | Used for |
|---|---|
| `AuditLog.Read.All` | `signInActivity` on user records, last-sign-in timeline |
| `Reports.Read.All` | `/reports/authenticationMethods/userRegistrationDetails`, `/reports/credentialUserRegistrationDetails` — MFA enrollment evidence |
| `UserAuthenticationMethod.Read.All` | Authentication-methods policy reads (used by the MFA evaluator) |

### Conditional Access + policies
| Scope | Used for |
|---|---|
| `Policy.Read.All` | Read existing CA policies, find TCT-managed ones for idempotency |
| `Policy.ReadWrite.ConditionalAccess` | Create/update/delete CA policies (MFA-all, block-legacy-auth) |

### Intune (device management)
| Scope | Used for |
|---|---|
| `DeviceManagementConfiguration.ReadWrite.All` | **Both** config profiles (Defender real-time) AND compliance policies (Windows baseline). The 403 you've been seeing on the Remediate preview is this scope. |
| `DeviceManagementManagedDevices.Read.All` | Enumerate enrolled devices, count Windows endpoints, sample encryption state |
| `Device.Read.All` | Azure AD device fallback when Intune list is empty |

### Security posture
| Scope | Used for |
|---|---|
| `SecurityEvents.Read.All` | `/security/secureScores` + `/security/secureScoreControlProfiles` — feeds the Secure Score Remediate page |

### SharePoint (policy library + publish)
| Scope | Used for |
|---|---|
| `Sites.Read.All` | SharePoint folder scan + per-file metadata fetch (policy import) |
| `Sites.ReadWrite.All` | Publish approved policies back to the customer's SharePoint library |
| `Files.ReadWrite.All` | Read original policy bytes from any drive + write published .docx |

### Mail (optional — only if customer portal magic-link approvals go through M365 SMTP)
| Scope | Used for |
|---|---|
| `Mail.Send` | Send customer-portal policy-approval magic links via the customer's Exchange Online instead of Resend (NOT currently wired up — flag if you want this) |

---

## Paste-friendly list (every scope above, in one place)

```
User.ReadWrite.All
Group.ReadWrite.All
GroupMember.ReadWrite.All
Directory.Read.All
Directory.ReadWrite.All
Organization.Read.All
AuditLog.Read.All
Reports.Read.All
UserAuthenticationMethod.Read.All
Policy.Read.All
Policy.ReadWrite.ConditionalAccess
DeviceManagementConfiguration.ReadWrite.All
DeviceManagementManagedDevices.Read.All
Device.Read.All
SecurityEvents.Read.All
Sites.Read.All
Sites.ReadWrite.All
Files.ReadWrite.All
```

---

## Permissions explicitly NOT requested

- `Mail.Read*` / `Calendars.*` — TCT does not read customer mail or calendars
- `User.Export.All` — bulk exports not used
- `Sites.FullControl.All` — narrower `Sites.ReadWrite.All` is sufficient
- `IdentityRiskyUser.Read.All` — identity protection feed not used today
- Delegated equivalents of anything above — all flows are app-only

If a customer is paranoid about specific scopes, the affected feature
table above tells you which one to drop and what breaks if you do.
