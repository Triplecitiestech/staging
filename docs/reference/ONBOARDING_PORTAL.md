# Customer Portal Documentation

## Overview

The customer portal provides a secure interface for customers to track support tickets, view projects, manage employee changes (HR requests), and communicate with Triple Cities Tech. Authentication is handled via **Microsoft 365 SSO** — customers sign in with their existing M365 account.

## Security Features

- **Microsoft 365 SSO** — Customers authenticate with their existing M365 credentials
- **Per-company Azure AD app registrations** — Each customer has their own app registration for SSO
- **Common SSO endpoint** — `/portal` uses Azure AD common endpoint for email-less login
- **HMAC-signed session cookies** — HttpOnly, Secure, SameSite
- **Role-based access control** — CLIENT_MANAGER, CLIENT_USER, CLIENT_VIEWER
- **8-hour session lifetime** — Auto-expires, requires re-authentication
- **Contact verification** — User's email matched against company_contacts

## Portal URLs

| URL | Purpose |
|-----|---------|
| `/portal` | Main login page — "Sign in with Microsoft 365" button |
| `/portal/[company]/dashboard` | Company dashboard (after SSO) |
| `/portal/[company]/[function]` | Function-specific pages |
| `/api/portal/auth/sso` | Initiates common SSO flow |
| `/api/portal/auth/login?company=<slug>` | Per-company SSO flow (with login_hint) |
| `/api/portal/auth/callback` | OAuth callback handler |
| `/api/portal/auth/logout` | Session logout |

### Legacy URLs (still functional)

| URL | Purpose |
|-----|---------|
| `/onboarding/[companyName]` | Legacy customer portal — still works, no password required |

## Authentication Flows

### Flow 1: Common SSO (from /portal)
1. Customer visits `/portal`
2. Clicks "Sign in with Microsoft 365"
3. Redirected to `/api/portal/auth/sso` → Azure AD common endpoint
4. Microsoft prompts for their M365 credentials
5. Callback extracts email from token
6. Company discovered from email domain or tenant ID
7. Session cookie set, redirected to `/portal/[company]/dashboard`

### Flow 2: Per-Company SSO (from invite link)
1. Customer clicks invite link → `/api/portal/auth/login?company=<slug>&login_hint=email`
2. Redirected to company's specific Azure AD tenant
3. Email pre-filled from login_hint
4. Callback uses company's M365 credentials for token exchange
5. Session cookie set, redirected to dashboard

### Flow 3: Staff Impersonation
1. Staff visits `/api/admin/portal-access?company=<slug>`
2. Must be authenticated as Admin or Super Admin
3. Creates impersonation session, redirects to customer portal

## Setup: Adding a New Customer to Portal

### Prerequisites
- Company exists in the database (synced from Autotask or created manually)
- Company has M365 tenant configured (via Tech Onboarding Wizard)

### Steps
1. **Sync or create company** — Via Autotask sync or Admin > Companies > New
2. **Run M365 onboarding** — Go to Admin > Companies > [Company] > Onboard
   - Step 1: Autotask sync (ensures company data exists)
   - Step 2: Enter M365 app registration credentials (tenant ID, client ID, client secret)
   - Step 3: Test connection
   - Step 4: Mark complete
3. **Sync contacts** — Run Autotask contact sync or add manually
4. **Set portal roles** — On Admin > Contacts, set each contact's portal role
5. **Send invites** — Click email icon on contact to send branded invitation
6. **Customer signs in** — Via `/portal` or direct invite link

### Required M365 App Permissions

The customer's Azure AD app registration needs these **Application permissions**:

| Permission | Purpose |
|-----------|---------|
| User.ReadWrite.All | Create/manage M365 user accounts |
| Group.ReadWrite.All | Manage security and M365 groups |
| GroupMember.ReadWrite.All | Add/remove group memberships |
| Sites.ReadWrite.All | SharePoint site access and permissions |
| Organization.Read.All | Read license SKUs for assignment |
| DeviceManagementManagedDevices.Read.All | Intune managed device inventory |
| Device.Read.All | Azure AD device fallback |

**Not required** (previously listed but removed):
- ~~Mail.ReadWrite~~ — Not used
- ~~Directory.ReadWrite.All~~ — Not used

## Components

| Component | File | Purpose |
|-----------|------|---------|
| CustomerDashboard | `src/components/onboarding/CustomerDashboard.tsx` | Main dashboard with tickets, projects, stats |
| HrRequestSection | `src/components/onboarding/HrRequestSection.tsx` | Employee management card |
| HrRequestCards | `src/components/onboarding/HrRequestCards.tsx` | Action cards + form renderer |
| FormRenderer | `src/components/onboarding/FormRenderer.tsx` | Schema-driven step-by-step wizard |
| OnboardingJourney | `src/components/onboarding/OnboardingJourney.tsx` | First-time login guided tour |
| TicketTimeline | `src/components/tickets/TicketTimeline.tsx` | Chronological ticket comms trail |

## Customer Dashboard Features

- **Get Support** — Opens Thread/ChatGenie live chat widget
- **Open Tickets** — Filterable ticket list with status labels
- **Closed Tickets** — Historical ticket view
- **Needs Your Action** — Tickets waiting on customer response
- **Active Projects** — Company projects with phases and tasks
- **Employee Management** — Submit onboarding/offboarding requests (manager access)
- **Ticket Timeline** — Click any ticket for full communication history

## HR Automation (Employee Management)

Customers with manager access can submit:
- **New Employee Onboarding** — Creates M365 account, assigns licenses, sets up groups
- **Employee Offboarding** — Disables account, removes licenses, transfers data

Features:
- **Scheduled onboarding** — Future start date = account created but locked, cron unlocks on start date
- **Pax8 auto-procurement** — If no license seats available, auto-orders from Pax8 and polls Microsoft Graph for up to 5 minutes to confirm availability
- **Autotask ticket creation** — Every request creates a ticket for tracking
- **Clone from existing user** — Copy groups, licenses, and settings from a template user

## Session Management

| Setting | Value |
|---------|-------|
| Cookie name | `portal_session` |
| Lifetime | 8 hours |
| Signing | HMAC-SHA256 (NEXTAUTH_SECRET) |
| HttpOnly | Yes |
| Secure | Yes (production) |
| SameSite | Lax |

## Troubleshooting

### "Authentication failed" on portal login
- Verify company has M365 credentials configured (Admin > Companies > [Company] > Onboard)
- Check that the user's email domain matches a company contact
- For common SSO: ensure TCT's Azure AD app is set to multi-tenant

### "Could not find a company associated with your Microsoft account"
- The user's email domain doesn't match any company_contacts
- Add the contact: Admin > Contacts > [Company] > Add Contact

### Customer can't see tickets
- Verify their portal role is CLIENT_USER or CLIENT_MANAGER
- Check that their contact record is active (isActive = true)

### HR forms not showing
- Only CLIENT_MANAGER and isPrimary contacts see Employee Management
- Manager must verify their email first (checked against company_contacts)

---

**Last Updated**: March 2026
**Author**: Triple Cities Tech Development Team
