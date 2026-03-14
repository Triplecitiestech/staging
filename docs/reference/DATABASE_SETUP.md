# Database Setup Guide

This guide walks you through setting up the Prisma Postgres database for the Triple Cities Tech Project Status Platform.

## Prerequisites

- Node.js 20+ installed
- npm installed
- `.env.local` file configured with database credentials

## Quick Setup (Recommended)

Run the automated setup script that creates tables and seeds initial data:

```bash
./scripts/setup-and-seed.sh
```

This script will:
1. Install dependencies
2. Create all database tables
3. Seed initial data (admin user, companies, templates)

## Manual Setup

If you prefer to run steps individually:

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Create Database Tables

```bash
npx prisma db push
```

This creates the following tables:
- `staff_users` - Admin/manager authentication
- `companies` - Client companies with portal passwords
- `projects` - Onboarding/migration projects
- `phases` - Project phases with tasks
- `phase_tasks` - Individual checklist items
- `audit_logs` - Track all changes
- `project_templates` - Reusable project templates

### Step 3: Seed Initial Data

```bash
npm run seed
```

This populates:
- **1 Admin User**: Uses `ADMIN_EMAIL` and `ADMIN_NAME` from env (defaults to admin@triplecitiestech.com)
- **2 Companies**:
  - Ecospect (password from `ONBOARDING_PASSWORD_ECOSPECT`)
  - All Spec Finishing (password from `ONBOARDING_PASSWORD_ALL_SPEC_FINISHING`)
- **3 Project Templates**:
  - Microsoft 365 Migration
  - New Client Onboarding
  - TCT Fortress Onboarding

## Verifying the Setup

After seeding, you can verify the data:

```bash
# Open Prisma Studio to browse the database
npx prisma studio
```

## Environment Variables

Required in `.env.local`:

```bash
# Database Connection (from Prisma Console)
DATABASE_URL="postgres://..."
POSTGRES_URL="postgres://..."
PRISMA_DATABASE_URL="prisma+postgres://..."

# Admin User (optional - has defaults)
ADMIN_EMAIL="your-email@triplecitiestech.com"
ADMIN_NAME="Your Name"

# Company Passwords (from legacy portal)
ONBOARDING_PASSWORD_ECOSPECT="..."
ONBOARDING_PASSWORD_ALL_SPEC_FINISHING="..."
```

## Troubleshooting

### "Can't reach database server"

- Verify `DATABASE_URL` is set correctly in `.env.local`
- Check your internet connection (Prisma Postgres is cloud-hosted)
- Ensure the database hasn't been deleted from Prisma Console

### "Prisma Client not generated"

```bash
npx prisma generate
```

### Resetting the Database

⚠️ **WARNING**: This deletes all data!

```bash
npx prisma db push --force-reset
npm run seed
```

## Next Steps

After database setup:

1. **Start Development Server**
   ```bash
   npm run dev
   ```

2. **Configure Microsoft OAuth**
   - Go to [Azure Portal](https://portal.azure.com) > App registrations
   - Create new app registration
   - Add redirect URI: `http://localhost:3000/api/auth/callback/azure-ad`
   - Copy Client ID, Client Secret, Tenant ID to `.env.local`

3. **Access Admin Dashboard**
   - Visit: http://localhost:3000/admin
   - Sign in with Microsoft account

4. **Test Customer Portal**
   - Visit: http://localhost:3000/status/ecospect
   - Use password from `ONBOARDING_PASSWORD_ECOSPECT`

## Database Schema

```
┌──────────────┐
│ staff_users  │──┐
└──────────────┘  │
                  │  ┌──────────────┐
                  ├──│ companies    │──┐
                  │  └──────────────┘  │
                  │                    │
┌──────────────┐  │  ┌──────────────┐ │
│   templates  │──┼──│   projects   │─┤
└──────────────┘  │  └──────────────┘ │
                  │         │          │
                  │         │          │
                  │  ┌──────────────┐ │
                  │  │    phases    │─┤
                  │  └──────────────┘ │
                  │         │          │
                  │  ┌──────────────┐ │
                  │  │ phase_tasks  │ │
                  │  └──────────────┘ │
                  │                    │
                  │  ┌──────────────┐ │
                  └──│  audit_logs  │─┘
                     └──────────────┘
```

## Files Reference

- `prisma/schema.prisma` - Database schema definition
- `prisma/seed.ts` - Seed script for initial data
- `prisma.config.ts` - Prisma configuration (Prisma 7)
- `scripts/setup-and-seed.sh` - Automated setup script
- `.env.local` - Environment variables (not in git)
