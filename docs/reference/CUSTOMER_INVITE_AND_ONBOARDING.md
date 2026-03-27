# Customer Invite & Onboarding Guide

> How TCT staff add customers/companies to the portal, send invitations, and what the customer experience looks like at every step.

---

## Table of Contents

1. [Overview](#overview)
2. [Staff Roles & Permissions](#staff-roles--permissions)
3. [Customer Portal Roles](#customer-portal-roles)
4. [Step-by-Step: Adding a Company](#step-by-step-adding-a-company)
5. [Step-by-Step: M365 Onboarding](#step-by-step-m365-onboarding)
6. [Step-by-Step: Inviting a Customer](#step-by-step-inviting-a-customer)
7. [The Customer Experience](#the-customer-experience)
8. [Managing Access](#managing-access)
9. [Viewing the Portal as a Customer](#viewing-the-portal-as-a-customer)
10. [HR Automation](#hr-automation)
11. [Troubleshooting](#troubleshooting)

---

## Overview

Triple Cities Tech provides a **Customer Portal** where clients can:
- View their company's active projects, phases, and tasks
- Submit and track support tickets
- View ticket history and communication timelines
- Submit employee onboarding/offboarding requests (HR automation)
- Chat with support via Thread/ChatGenie

Access is managed through:
1. **Microsoft 365 SSO** — Customers sign in at `/portal` with their M365 account
2. **Contact invitations** — Individual email invitations sent to specific contacts with role-based access
3. **Portal roles** — CLIENT_MANAGER, CLIENT_USER, CLIENT_VIEWER

---

## Staff Roles & Permissions

TCT staff have one of four permission levels. Only **Super Admin** can change staff roles.

| Role | Label | What They Can Do |
|------|-------|-----------------|
| `SUPER_ADMIN` | **Super Admin** | Everything: manage staff roles, system settings, delete companies/projects, billing, all admin permissions |
| `ADMIN` | **Admin** | Manage companies/projects/contacts, invite customers, manage portal access, blog/SOC/marketing, view reports, Autotask sync |
| `BILLING_ADMIN` | **Billing Admin** | View companies/projects, manage billing, view reports, view contacts and staff |
| `TECHNICIAN` | **Technician** | View assigned projects/tasks, update task status, add notes, view companies/contacts |

### Who can invite customers?
- **Super Admin** and **Admin** can send portal invitations and manage customer roles
- **Billing Admin** and **Technician** can view contacts but cannot send invites

---

## Customer Portal Roles

Each customer contact has a portal role that controls what they can see and do:

| Role | Label | Access |
|------|-------|--------|
| `CLIENT_MANAGER` | **Manager** | Full access: view all company projects, submit & manage tickets, submit HR requests (onboarding/offboarding), manage contacts |
| `CLIENT_USER` | **User** | Standard: view company projects, submit & view tickets, view ticket timelines |
| `CLIENT_VIEWER` | **Viewer** | Read-only: view company projects, view tickets (cannot submit new ones) |

---

## Step-by-Step: Adding a Company

### From Autotask (Recommended)
Companies are automatically synced from Autotask PSA:
1. Go to **Admin > Autotask Sync** or trigger via API: `GET /api/autotask/trigger?secret=MIGRATION_SECRET&step=companies`
2. Companies with active projects in Autotask are imported with their contacts
3. The company gets a URL-friendly slug (e.g., `acme-manufacturing`)

### Manually
1. Go to **Admin > Companies**
2. Click **New Company**
3. Fill in: Company Name, Primary Contact, Contact Email
4. A slug is generated automatically
5. Save the company

### Adding Contacts to a Company
1. Contacts sync automatically from Autotask (via `?step=contacts`)
2. To add manually: go to company detail page → Contacts section → Add Contact
3. Each contact gets a default role of `CLIENT_USER`

---

## Step-by-Step: M365 Onboarding

Before a customer can use SSO login or HR automation, their M365 tenant must be configured:

1. Go to **Admin > Companies > [Company] > Onboard** (Tech Onboarding Wizard)
2. **Step 1: Autotask Sync** — Ensure the company data is synced
3. **Step 2: M365 App Registration** — In the customer's Azure AD:
   - Create an app registration named "TCT Portal Integration" (single tenant)
   - Add **Application permissions** (Microsoft Graph):
     - `User.ReadWrite.All`
     - `Group.ReadWrite.All`
     - `GroupMember.ReadWrite.All`
     - `Sites.ReadWrite.All`
     - `Organization.Read.All`
     - `DeviceManagementManagedDevices.Read.All`
     - `Device.Read.All`
   - Grant admin consent
   - Create a client secret
   - Enter tenant ID, client ID, and client secret into the wizard
4. **Step 3: Test Connection** — Verify the credentials work
5. **Step 4: Mark Complete** — Share the portal URL with the customer

---

## Step-by-Step: Inviting a Customer

### Method 1: Individual Contact Invite (Recommended)
Best for: Inviting specific people with specific roles.

1. Go to **Admin > Contacts** (User Management)
2. The **Client Contacts** tab shows all contacts across all companies
3. Find the contact(s) you want to invite
4. **Set their role first** — click the role badge (Manager/User/Viewer) to change it
5. **Send the invite:**
   - Click the **email icon** (envelope) next to the contact, OR
   - Check multiple contacts → click **Send Invite** button
6. **Preview first (optional):** Click the **eye icon** to preview the email before sending
7. The contact receives a branded email with:
   - Their name and company name
   - A link to sign in at the portal
   - Instructions to use their Microsoft 365 account
   - A list of what they can access

### Invite Statuses
| Status | Meaning |
|--------|---------|
| **Not Invited** | No invitation has been sent |
| **Pending** | Invitation email sent, awaiting first login |
| **Active** | Contact has logged into the portal at least once |
| **Declined** | Invitation bounced or was declined |

---

## The Customer Experience

### Step 1: Receives Invitation Email
The customer gets a professionally branded email that includes:
- Greeting with their name
- Their company name and what they can access
- A prominent "Access Your Portal" button
- Step-by-step instructions

### Step 2: Signs In with Microsoft 365
- Customer visits `/portal` (or clicks invite link)
- Clicks **"Sign in with Microsoft 365"**
- Redirected to Microsoft login (their email may be pre-filled from invite link)
- After M365 authentication, the system discovers their company automatically

### Step 3: Views the Customer Dashboard
After authentication, the customer sees:

**For first-time visitors:**
- An optional onboarding journey (5 guided steps, skippable)
- Quick overview of available features

**Dashboard includes:**
- **Get Support** — Opens live chat with TCT
- **Open Tickets** — Active support tickets with status indicators
- **Closed Tickets** — Historical ticket view
- **Needs Your Action** — Tickets waiting on customer response ("Awaiting Your Team")
- **Active Projects** — Company projects with phases and tasks
- **Employee Management** — Submit onboarding/offboarding requests (Manager role only)
- **Ticket Timeline** — Click any ticket to see full communication history (only external notes visible)

### What Customers CANNOT See
- Internal TCT notes (only external notes are visible)
- Other companies' data
- Staff-only administrative sections
- Internal task assignments or billing details

### Step 4: Ongoing Access
- Session lasts 8 hours
- Customer can return anytime to `/portal` and sign in
- No passwords to remember — uses existing M365 credentials

---

## Managing Access

### Changing a Customer's Role
1. Go to **Admin > Contacts**
2. Find the contact in the Client Contacts tab
3. Click their current role badge → select new role
4. Change is immediate — their next page load reflects new permissions

### Revoking Access
- **Deactivate a contact:** Mark them as inactive on the company detail page
- **Remove from portal:** Change role to `CLIENT_VIEWER` for minimum access
- **Remove M365 credentials:** Delete the company's M365 app registration

### Checking Portal Activity
The contacts page shows:
- **Invite Status** — Whether the contact has been invited and their response
- **Access Details** — When they were invited and when they last logged in

---

## Viewing the Portal as a Customer

TCT staff can impersonate the customer experience to see exactly what a customer sees:

### From the Contacts Page
1. Go to **Admin > Contacts**
2. Find any contact → click the **person icon** (impersonate)
3. The customer portal opens in a new tab showing that company's data

### From the Companies Page
1. Go to **Admin > Companies**
2. Click **View Portal** on any company
3. Opens the customer portal in a new tab

---

## HR Automation

Customers with **Manager** access can submit employee change requests through the portal:

### Employee Onboarding
- Creates M365 account (with temporary password, force change on first login)
- Assigns selected license (e.g., Microsoft 365 Business Premium)
- Adds to security groups, distribution lists
- Sets up SharePoint/OneDrive permissions
- **Scheduled onboarding**: If start date is in the future, account is created but locked. A cron job automatically unlocks the account on the start date.
- **Pax8 auto-procurement**: If no license seats are available, the system automatically orders a seat from Pax8 and polls Microsoft Graph for up to 5 minutes to confirm availability before assigning.

### Employee Offboarding
- Disables M365 account
- Removes licenses
- Removes group memberships
- Transfers data ownership (if configured)
- Creates Autotask ticket for tracking

### How It Works
1. Manager clicks "Employee Management" on their dashboard
2. Verifies their email (checked against company_contacts)
3. Fills out the step-by-step form (schema-driven wizard)
4. System processes the request:
   - Creates Autotask ticket
   - Executes M365 changes via Graph API
   - Sends confirmation email with results
5. Any steps requiring manual intervention are noted in the ticket

---

## Troubleshooting

### "Authentication failed" on portal login
- Verify company has M365 credentials configured (Admin > Companies > [Company] > Onboard)
- Check that the user's email domain matches a company contact
- For common SSO: ensure TCT's Azure AD app supports multi-tenant accounts

### "Could not find a company associated with your Microsoft account"
- The user's email domain doesn't match any company_contacts
- Add the contact: Admin > Companies > [Company] > Contacts > Add

### "Contact didn't receive the invite email"
- Check the contact's email address for typos
- Verify the Resend API key is configured (`RESEND_API_KEY`)
- Check the invite status — if it shows "Pending", the email was sent
- Try resending by clicking the email icon again

### "Customer can see too much / too little"
- Check their `customerRole` on the Contacts page
- Manager = full access, User = standard, Viewer = read-only
- Changes take effect on next page load

### "HR forms not showing"
- Only CLIENT_MANAGER and isPrimary contacts see Employee Management
- Manager must verify their email first
- Check that the company has M365 credentials configured

### "I can't change a staff member's role"
- Only **Super Admin** can change staff roles
- You cannot change your own role

### "New staff member got Technician by default"
- All new staff who sign in via Azure AD are auto-provisioned as **Technician**
- A Super Admin must upgrade their role if they need more access

---

**Last Updated**: March 2026
