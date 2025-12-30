# Triple Cities Tech - Project Status Platform Setup Guide

This guide will walk you through setting up the AI-powered project status platform.

## Overview

The platform consists of:
- **Customer-facing project status pages** at `/projects/{slug}`
- **Staff admin dashboard** at `/admin/projects` (M365 OAuth protected)
- **AI project generation** using Claude API
- **Audit logging** for all changes
- **Role-based access** (Admin, Manager, Viewer)

---

## Prerequisites

- Vercel account with project deployed
- Microsoft 365 admin access (for OAuth app registration)
- Anthropic API key (already have: `TCT-Project-Timeline-API`)

---

## Step 1: Create Vercel Postgres Database

### 1.1 In Vercel Dashboard

1. Go to your project: https://vercel.com/triplecitiestech/staging
2. Click **Storage** tab
3. Click **Create Database**
4. Select **Postgres**
5. Name it: `tct-projects-db`
6. Region: `US East` (close to your location)
7. Click **Create**

### 1.2 Get Database Credentials

1. After creation, click on your new database
2. Click the **`.env.local`** tab
3. Copy ALL the environment variables (about 7 variables)
4. They look like:
   ```
   POSTGRES_URL="postgres://default:abc123..."
   POSTGRES_PRISMA_URL="postgres://default:abc123..."
   POSTGRES_URL_NON_POOLING="postgres://default:abc123..."
   ...
   ```

### 1.3 Add to Vercel Project

1. Go to **Settings** > **Environment Variables**
2. Paste each variable:
   - `POSTGRES_URL`
   - `POSTGRES_PRISMA_URL`
   - `POSTGRES_URL_NON_POOLING`
   - `POSTGRES_USER`
   - `POSTGRES_HOST`
   - `POSTGRES_PASSWORD`
   - `POSTGRES_DATABASE`
3. Set all to **Production, Preview, and Development**
4. Click **Save**

### 1.4 Add to Local Development

1. Update `/home/user/staging/.env.local`
2. Replace the `REPLACE_ME` placeholders with actual values from Vercel
3. Save the file

---

## Step 2: Register Microsoft OAuth App

### 2.1 Go to Azure Portal

1. Open: https://portal.azure.com
2. Search for **App registrations**
3. Click **New registration**

### 2.2 Configure App

1. **Name:** `TCT Project Status Platform`
2. **Supported account types:** `Accounts in this organizational directory only (Single tenant)`
3. **Redirect URI:**
   - Type: `Web`
   - URI: `https://www.triplecitiestech.com/api/auth/callback/azure-ad`
4. Click **Register**

### 2.3 Get Client ID and Tenant ID

After registration, you'll see:
- **Application (client) ID** - copy this
- **Directory (tenant) ID** - copy this

### 2.4 Create Client Secret

1. In the app page, click **Certificates & secrets** (left sidebar)
2. Click **New client secret**
3. Description: `NextAuth Secret`
4. Expires: `24 months` (or your preference)
5. Click **Add**
6. **IMMEDIATELY COPY THE VALUE** - you won't see it again!

### 2.5 Set API Permissions

1. Click **API permissions** (left sidebar)
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Select **Delegated permissions**
5. Check:
   - `User.Read` (Read user profile)
   - `email` (View user email)
   - `openid` (Sign in)
   - `profile` (View user profile)
6. Click **Add permissions**
7. Click **Grant admin consent for [Your Organization]** (requires admin)

### 2.6 Add to Vercel

Go to **Settings** > **Environment Variables** and add:

```
AZURE_AD_CLIENT_ID=<your-client-id>
AZURE_AD_CLIENT_SECRET=<your-client-secret>
AZURE_AD_TENANT_ID=<your-tenant-id>
```

Set to **Production, Preview, and Development**

### 2.7 Add to Local .env.local

Update `.env.local` with the same values.

---

## Step 3: Generate Secrets

### 3.1 NextAuth Secret

In your terminal:
```bash
openssl rand -base64 32
```

Copy the output and add to Vercel environment variables:
```
NEXTAUTH_SECRET=<generated-secret>
```

Also add to `.env.local`.

### 3.2 Session Signing Key

Generate another secret:
```bash
openssl rand -base64 32
```

Add to Vercel:
```
ONBOARDING_SIGNING_KEY=<generated-secret>
```

Also add to `.env.local`.

---

## Step 4: Add Anthropic API Key

### 4.1 In Vercel

Add to **Environment Variables**:
```
ANTHROPIC_API_KEY=<your-api-key-from-console.anthropic.com>
```

**Use the key you already created:** `TCT-Project-Timeline-API`

Set to **Production, Preview, and Development**

### 4.2 Already in .env.local

This is already added in your local `.env.local` file.

---

## Step 5: Run Database Migration

### 5.1 Generate Prisma Client

```bash
npx prisma generate
```

This creates the TypeScript types for your database.

### 5.2 Push Schema to Database

```bash
npx prisma db push
```

This creates all the tables in your Vercel Postgres database.

You should see output like:
```
✔ Generated Prisma Client
✔ Schema pushed to database
```

### 5.3 Verify with Prisma Studio (Optional)

```bash
npx prisma studio
```

Opens a GUI at http://localhost:5555 where you can view your database tables.

---

## Step 6: Seed Initial Data

### 6.1 Create Your Staff User

We'll create this via Claude - I'll build a seed script.

---

## Step 7: Deploy to Vercel

### 7.1 Commit Changes

```bash
git add .
git commit -m "Set up project platform with database, auth, and AI"
git push
```

### 7.2 Vercel Auto-Deploy

Vercel will automatically deploy your changes. Monitor at:
https://vercel.com/triplecitiestech/staging

---

## Step 8: Test Everything

### 8.1 Test Customer Portal (Existing)

1. Go to: https://www.triplecitiestech.com/onboarding/ecospect
2. Login with password: `YourSecurePassword123!`
3. Should still work (will migrate to DB next)

### 8.2 Test Staff Login

1. Go to: https://www.triplecitiestech.com/admin/login
2. Click "Sign in with Microsoft"
3. Should redirect to Microsoft login
4. After auth, should see admin dashboard

### 8.3 Test AI Generation

1. In admin dashboard, click "Create Project"
2. Fill in company details and project specifics
3. Click "Generate with AI"
4. Should see Claude generate a project plan in ~3 seconds

---

## Troubleshooting

### Database Connection Issues

**Error:** `Can't reach database server`

**Fix:**
- Verify `POSTGRES_PRISMA_URL` is set in Vercel
- Check database is in same region as functions (US East)
- Run `npx prisma db push` again

### Microsoft OAuth Issues

**Error:** `Redirect URI mismatch`

**Fix:**
- Verify redirect URI in Azure: `https://www.triplecitiestech.com/api/auth/callback/azure-ad`
- Must match exactly (no trailing slash)
- Check NEXTAUTH_URL in Vercel: `https://www.triplecitiestech.com`

### AI Generation Fails

**Error:** `Invalid API key`

**Fix:**
- Verify `ANTHROPIC_API_KEY` is set in Vercel
- Check API key is valid at https://console.anthropic.com
- Ensure API key has credits available

---

## Next Steps

After setup is complete, Claude will:

1. **Create seed script** to add:
   - Your staff user (admin role)
   - 3 project templates (M365 Migration, Onboarding, Fortress)
   - Migrate existing Ecospect and All Spec data to database

2. **Build admin dashboard** UI:
   - Project list
   - Create/edit projects
   - Phase management
   - Audit log viewer

3. **Build AI generation** service:
   - Project creation form
   - Claude API integration
   - Plan review & customization

4. **Update customer portal** to read from database instead of mock data

---

## Support

If you run into issues during setup:
1. Check Vercel deployment logs
2. Check browser console for errors
3. Ask Claude for help with specific error messages

---

**Ready? Let's set this up!** 🚀

Tell me when you've completed Step 1 (Vercel Postgres) and Step 2 (Microsoft OAuth), and I'll proceed with the code implementation.
