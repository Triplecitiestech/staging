# Azure AD Setup Guide for Microsoft OAuth Authentication

This guide walks you through setting up Microsoft OAuth authentication for the Triple Cities Tech admin dashboard.

## Prerequisites

- Microsoft 365 account with admin access
- Access to Azure Portal (https://portal.azure.com)

## Step 1: Register App in Azure AD

1. **Go to Azure Portal**
   - Visit: https://portal.azure.com
   - Sign in with your Microsoft 365 admin account

2. **Navigate to App Registrations**
   - Click on "Microsoft Entra ID" (formerly Azure AD)
   - In the left sidebar, click "App registrations"
   - Click "New registration"

3. **Register Your Application**
   - **Name**: `Triple Cities Tech Admin Portal`
   - **Supported account types**: Select "Accounts in this organizational directory only (Single tenant)"
   - **Redirect URI**:
     - Platform: `Web`
     - URL: `https://www.triplecitiestech.com/api/auth/callback/azure-ad`
   - Click "Register"

## Step 2: Configure Authentication

1. **Add Redirect URIs**
   - In your app registration, go to "Authentication" in the left sidebar
   - Under "Web" platform, add these redirect URIs:
     - `https://www.triplecitiestech.com/api/auth/callback/azure-ad`
     - `http://localhost:3000/api/auth/callback/azure-ad` (for local development)
   - Click "Save"

2. **Configure Token Settings**
   - Scroll down to "Implicit grant and hybrid flows"
   - Check "ID tokens" (for OpenID Connect authentication)
   - Click "Save"

## Step 3: Create Client Secret

1. **Go to Certificates & secrets**
   - In the left sidebar, click "Certificates & secrets"
   - Click "New client secret"
   - **Description**: `Admin Portal Secret`
   - **Expires**: 24 months (or your preference)
   - Click "Add"

2. **Copy the Secret**
   - **IMPORTANT**: Copy the secret **VALUE** immediately (it will only be shown once!)
   - Store it safely - you'll need it for environment variables

## Step 4: Get Required IDs

You'll need these three values for your environment variables:

1. **Application (client) ID**
   - Go to "Overview" in the left sidebar
   - Copy the "Application (client) ID"

2. **Directory (tenant) ID**
   - Still in "Overview"
   - Copy the "Directory (tenant) ID"

3. **Client Secret Value**
   - This is the value you copied in Step 3

## Step 5: Add Environment Variables to Vercel

1. **Go to Vercel Dashboard**
   - Visit: https://vercel.com/triplecitiestech/staging
   - Go to "Settings" → "Environment Variables"

2. **Add These Variables**
   ```
   AZURE_AD_CLIENT_ID=<your-application-client-id>
   AZURE_AD_CLIENT_SECRET=<your-client-secret-value>
   AZURE_AD_TENANT_ID=<your-directory-tenant-id>
   NEXTAUTH_SECRET=<generate-random-secret>
   NEXTAUTH_URL=https://www.triplecitiestech.com
   ```

3. **Generate NEXTAUTH_SECRET**
   - Run this command in terminal to generate a random secret:
     ```bash
     openssl rand -base64 32
     ```
   - Or use this online generator: https://generate-secret.vercel.app/32

4. **Save and Redeploy**
   - Click "Save" for each variable
   - Vercel will automatically redeploy your application

## Step 6: Add Your Email to Staff Users

Your email must be in the `staff_users` table to sign in. If you used a different email for Azure AD than the default admin email, update it:

1. **Using Prisma Studio** (recommended):
   ```bash
   npx prisma studio
   ```
   - Edit the admin user email to match your Microsoft account email
   - Click "Save"

2. **Or run this seed script** to add a new staff user:
   ```bash
   npm run seed
   ```
   - Update ADMIN_EMAIL in .env.local first

## Step 7: Test Authentication

1. **Visit the Admin Page**
   - Go to: https://www.triplecitiestech.com/admin
   - You should see "Sign in with Microsoft" button

2. **Click Sign In**
   - You'll be redirected to Microsoft login
   - Sign in with your Microsoft 365 account
   - Grant permissions if prompted

3. **Verify Success**
   - After successful login, you should see:
     - Your name and email
     - Your staff role (ADMIN, MANAGER, or VIEWER)
     - Access to admin features

## Troubleshooting

### Error: "AccessDenied"
**Solution**: Your email is not in the `staff_users` table or the account is inactive.
- Check database: `npx prisma studio`
- Verify your email matches exactly
- Ensure `isActive = true`

### Error: "Configuration"
**Solution**: Check environment variables in Vercel
- Verify all three Azure AD variables are set correctly
- Ensure NEXTAUTH_SECRET is set
- Check NEXTAUTH_URL matches your domain

### Error: "AADSTS50011: The redirect URI does not match"
**Solution**: The redirect URI in Azure AD doesn't match
- Go to Azure Portal → App Registration → Authentication
- Add exact URL: `https://www.triplecitiestech.com/api/auth/callback/azure-ad`
- Don't forget the `/api/auth/callback/azure-ad` part!

### Can't Find Microsoft Entra ID
**Solution**: It's the new name for Azure AD
- Look for "Microsoft Entra ID" in Azure Portal
- Or search for "Azure Active Directory"

## Security Best Practices

1. **Restrict Sign-in**
   - Only emails in `staff_users` table can sign in
   - Set `isActive = false` to revoke access immediately

2. **Rotate Secrets Regularly**
   - Change client secrets every 6-12 months
   - Update Vercel environment variables when you do

3. **Use Separate Tenants**
   - Consider using a separate Azure AD tenant for production
   - Never share client secrets in code or commits

## Local Development

For local testing, add these to `.env.local`:

```bash
AZURE_AD_CLIENT_ID=<same-as-vercel>
AZURE_AD_CLIENT_SECRET=<same-as-vercel>
AZURE_AD_TENANT_ID=<same-as-vercel>
NEXTAUTH_SECRET=<same-as-vercel>
NEXTAUTH_URL=http://localhost:3000
```

Make sure your Azure AD app has the localhost redirect URI configured!

## Next Steps

After authentication is working:
- ✅ You can now access the admin dashboard securely
- ⏳ Build project management features
- ⏳ Implement AI-powered project generation
- ⏳ Create customer portal management

## Support

If you encounter issues:
1. Check Vercel deployment logs
2. Check browser console for errors
3. Verify all environment variables are set correctly
4. Ensure your email is in the staff_users table
