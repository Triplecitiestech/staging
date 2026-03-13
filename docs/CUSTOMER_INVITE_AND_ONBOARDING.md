# Customer Invite & Onboarding Guide

> How TCT staff add customers/companies to the portal, send invitations, and what the customer experience looks like at every step.

---

## Table of Contents

1. [Overview](#overview)
2. [Staff Roles & Permissions](#staff-roles--permissions)
3. [Customer Portal Roles](#customer-portal-roles)
4. [Step-by-Step: Adding a Company](#step-by-step-adding-a-company)
5. [Step-by-Step: Inviting a Customer](#step-by-step-inviting-a-customer)
6. [The Customer Experience](#the-customer-experience)
7. [Managing Access](#managing-access)
8. [Viewing the Portal as a Customer](#viewing-the-portal-as-a-customer)
9. [Troubleshooting](#troubleshooting)

---

## Overview

Triple Cities Tech provides a **Customer Portal** where clients can:
- View their company's active projects, phases, and tasks
- Submit and track support tickets
- View ticket history and communication timelines
- See announcements and project milestones

Access is managed through two systems:
1. **Company credentials** — A shared password for the company portal (`/onboarding/{company-slug}`)
2. **Contact invitations** — Individual email invitations sent to specific contacts with role-based access

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

### How to change a staff member's role
1. Go to **Admin > Contacts** (User Management page)
2. Click the **TCT Staff** tab
3. Only a Super Admin will see the role as a clickable badge
4. Click the role badge → select new role from dropdown
5. The change takes effect immediately

---

## Customer Portal Roles

Each customer contact has a portal role that controls what they can see and do:

| Role | Label | Access |
|------|-------|--------|
| `CLIENT_MANAGER` | **Manager** | Full access: view all company projects, submit & manage tickets, manage other contacts for their company |
| `CLIENT_USER` | **User** | Standard: view company projects, submit & view tickets, view ticket timelines |
| `CLIENT_VIEWER` | **Viewer** | Read-only: view company projects, view tickets (cannot submit new ones) |

---

## Step-by-Step: Adding a Company

### From Autotask (Recommended)
Companies are automatically synced from Autotask PSA:
1. Go to **Admin > Autotask Sync** or trigger via API: `GET /api/autotask/trigger?secret=MIGRATION_SECRET&step=companies`
2. Companies with active projects in Autotask are imported with their contacts
3. The company gets a URL-friendly slug (e.g., `acme-manufacturing`)
4. A portal password is auto-generated

### Manually
1. Go to **Admin > Companies**
2. Click **New Company**
3. Fill in: Company Name, Primary Contact, Contact Email
4. A slug and portal password are generated automatically
5. Save the company

### Adding Contacts to a Company
1. Contacts sync automatically from Autotask (via `?step=contacts`)
2. To add manually: go to company detail page → Contacts section → Add Contact
3. Each contact gets a default role of `CLIENT_USER`

---

## Step-by-Step: Inviting a Customer

There are two ways to invite customers:

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
   - A link to the company portal
   - Instructions to log in with the company password
   - A list of what they can access

### Method 2: Company Credentials Email
Best for: Sending the company portal password to the primary contact.

1. Go to **Admin > Companies**
2. Find the company → click **Send Credentials**
3. This generates a new portal password and emails it to the company's primary contact email
4. The contact receives the portal URL and password

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
- Security notice (they can only see their company's data)

### Step 2: Visits the Portal URL
The portal URL is: `https://www.triplecitiestech.com/onboarding/{company-slug}`

Example: `https://www.triplecitiestech.com/onboarding/acme-manufacturing`

### Step 3: Enters Company Password
- The login page shows the company name
- Customer enters the shared company password
- Password was provided in the credentials email or by their IT contact at TCT

### Step 4: Views the Customer Dashboard
After authentication, the customer sees:

**For first-time visitors:**
- An optional onboarding journey (5 guided steps, skippable)
- Quick overview of available features

**Dashboard includes:**
- **Project overview** — All company projects with phases and task status
- **Support tickets** — Active and historical tickets
- **Ticket timeline** — Click any ticket to see full communication history (only external/customer-visible notes)
- **Submit tickets** — Create new support requests (Manager and User roles only)
- **Company stats** — Project completion, open tickets, etc.

### What Customers CANNOT See
- Internal TCT notes (only external notes are visible)
- Other companies' data
- Staff-only administrative sections
- Internal task assignments or billing details

### Step 5: Ongoing Access
- Session lasts 12 hours
- Customer can return anytime to the same URL
- No account creation required — just company password

---

## Managing Access

### Changing a Customer's Role
1. Go to **Admin > Contacts**
2. Find the contact in the Client Contacts tab
3. Click their current role badge → select new role
4. Change is immediate — their next page load reflects new permissions

### Revoking Access
- **Deactivate a contact:** Mark them as inactive on the company detail page
- **Change company password:** Send new credentials via Companies page → Send Credentials (old password stops working)
- **Remove from portal:** Change role to `CLIENT_VIEWER` for minimum access

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

### From Direct URL
1. Go to: `https://www.triplecitiestech.com/api/admin/portal-access?company={slug}`
2. Must be logged in as Admin or Super Admin
3. Redirects to the customer portal with an admin session

---

## Troubleshooting

### "Contact didn't receive the invite email"
- Check the contact's email address for typos
- Verify the Resend API key is configured (`RESEND_API_KEY`)
- Check the invite status — if it shows "Pending", the email was sent
- Try resending by clicking the email icon again

### "Customer can't log in"
- Verify the company has a password set (all companies should)
- Send new credentials via Companies page → Send Credentials
- Check the company slug matches the URL they're using

### "Customer can see too much / too little"
- Check their `customerRole` on the Contacts page
- Manager = full access, User = standard, Viewer = read-only
- Changes take effect on next page load

### "I can't change a staff member's role"
- Only **Super Admin** can change staff roles
- You cannot change your own role
- You cannot deactivate your own account

### "New staff member got Technician by default"
- All new staff who sign in via Azure AD are auto-provisioned as **Technician**
- A Super Admin must upgrade their role if they need more access
