# 🚀 Complete Resend Setup Guide - From Testing to Production

**Complete step-by-step guide from testing to production with domain verification**

**Created by BJANDCO**

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Phase 1: Testing Setup](#phase-1-testing-setup)
3. [Phase 2: Domain Verification](#phase-2-domain-verification)
4. [Phase 3: Production Configuration](#phase-3-production-configuration)
5. [Troubleshooting](#troubleshooting)

---

## Overview

This guide covers the complete setup process:

```
┌─────────────────────┐
│  Phase 1: Testing   │
│  Test Domain        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Phase 2: Verify    │
│  Your Domain        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Phase 3: Production│
│  Your Domain Email  │
└─────────────────────┘
```

**Estimated Time:**
- Phase 1 (Testing): 15 minutes
- Phase 2 (Domain Verification): 30-60 minutes (DNS propagation)
- Phase 3 (Production): 5 minutes

---

## Phase 1: Testing Setup

Use Resend's test domain to get your forms working quickly.

### Step 1.1: Create Resend Account

1. Go to [resend.com](https://resend.com)
2. Click **Sign Up** (free account available)
3. Verify your email address
4. Complete registration

---

### Step 1.2: Get API Key

1. Log in to [Resend Dashboard](https://resend.com/home)
2. Navigate to [API Keys](https://resend.com/api-keys)
3. Click **Create API Key**
4. Configure:
   - **Name**: `Triple Cities Tech Testing`
   - **Permission**: `Sending access`
5. Click **Create**
6. **IMPORTANT**: Copy the API key (starts with `re_...`)
7. Save it securely - you won't see it again!

**Example API Key:**
```
re_abc123xyz789yourActualKey456def
```

---

### Step 1.3: Add Test Recipients

Since you're using the test domain, you must verify recipient emails:

1. Go to [Resend Settings > Recipients](https://resend.com/settings/recipients)
2. Click **Add Recipient**
3. Enter your email: `info@triplecitiestech.com`
4. Click **Send verification email**
5. Check your inbox
6. Click the verification link in the email
7. Repeat for any other test email addresses

**Important:** Without this step, you won't receive test emails!

---

### Step 1.4: Configure Local Environment

Create `.env.local` file in your project root:

```env
# Resend API Key from Step 1.2
RESEND_API_KEY=re_your_actual_api_key_here

# Email Recipients
NEXT_PUBLIC_CONTACT_EMAIL=info@triplecitiestech.com
# NEXT_PUBLIC_QUESTIONNAIRE_EMAIL not needed (uses CONTACT_EMAIL)

# Sender Configuration - TEST DOMAIN
RESEND_FROM_EMAIL=onboarding@resend.dev
RESEND_FROM_NAME=Triple Cities Tech

# Company Information
NEXT_PUBLIC_CONTACT_PHONE=(607) 222-TCT1
NEXT_PUBLIC_COMPANY_NAME=Triple Cities Tech
NEXT_PUBLIC_WEBSITE_URL=https://www.triplecitiestech.com
```

---

### Step 1.5: Test Locally

```bash
# Start development server
npm run dev
```

1. Visit `http://localhost:3000/contact`
2. Fill out the contact form
3. Submit
4. Check `info@triplecitiestech.com` inbox for email

**Expected Result:**
```
✅ Form submits successfully
✅ Email received in your inbox
✅ Email from: Triple Cities Tech <onboarding@resend.dev>
✅ Reply-to: Customer's email
```

---

### Step 1.6: Add Environment Variables to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Click **Settings** tab
4. Click **Environment Variables** (left sidebar)

**Add each variable:**

#### Variable 1: RESEND_API_KEY
```
Name: RESEND_API_KEY
Value: re_your_actual_api_key_here
Environments: ☑ Production  ☑ Preview  ☑ Development
```
Click **Save**

#### Variable 2: NEXT_PUBLIC_CONTACT_EMAIL
```
Name: NEXT_PUBLIC_CONTACT_EMAIL
Value: info@triplecitiestech.com
Environments: ☑ Production  ☑ Preview  ☑ Development
```
Click **Save**

#### Variable 3: RESEND_FROM_EMAIL (Test Domain)
```
Name: RESEND_FROM_EMAIL
Value: onboarding@resend.dev
Environments: ☑ Production  ☑ Preview  ☑ Development
```
Click **Save**

#### Variable 4: RESEND_FROM_NAME
```
Name: RESEND_FROM_NAME
Value: Triple Cities Tech
Environments: ☑ Production  ☑ Preview  ☑ Development
```
Click **Save**

#### Variable 5: NEXT_PUBLIC_CONTACT_PHONE
```
Name: NEXT_PUBLIC_CONTACT_PHONE
Value: (607) 222-TCT1
Environments: ☑ Production  ☑ Preview  ☑ Development
```
Click **Save**

#### Variable 6: NEXT_PUBLIC_COMPANY_NAME
```
Name: NEXT_PUBLIC_COMPANY_NAME
Value: Triple Cities Tech
Environments: ☑ Production  ☑ Preview  ☑ Development
```
Click **Save**

#### Variable 7: NEXT_PUBLIC_WEBSITE_URL
```
Name: NEXT_PUBLIC_WEBSITE_URL
Value: https://www.triplecitiestech.com
Environments: ☑ Production  ☑ Preview  ☑ Development
```
Click **Save**

---

### Step 1.7: Deploy to Vercel

**If already deployed:**
1. Go to **Deployments** tab
2. Click **Redeploy** on latest deployment

**If first time deploying:**
1. Push code to GitHub (already done!)
2. Vercel auto-deploys

---

### Step 1.8: Test Production Deployment

1. Visit your Vercel URL: `https://your-project.vercel.app`
2. Fill out contact form
3. Check `info@triplecitiestech.com` for email

**✅ Phase 1 Complete! Your forms are working with test domain.**

---

## Phase 2: Domain Verification

Verify your domain to send emails from `@triplecitiestech.com` to any email address.

### Step 2.1: Add Domain in Resend

1. Go to [Resend Domains](https://resend.com/domains)
2. Click **Add Domain**
3. Enter your domain: `triplecitiestech.com`
   - ⚠️ Don't include `www` or `https://`
   - ⚠️ Just the domain: `triplecitiestech.com`
4. Click **Add**

Resend will now show DNS records you need to add.

---

### Step 2.2: Get DNS Records from Resend

After adding your domain, Resend provides 3 DNS records:

#### Record 1: SPF Record
```
Type: TXT
Name: @
Value: v=spf1 include:_spf.resend.com ~all
TTL: 3600 (or Auto)
```

#### Record 2: DKIM Record
```
Type: TXT
Name: resend._domainkey
Value: p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNA... (long string from Resend)
TTL: 3600 (or Auto)
```

#### Record 3: DMARC Record (Optional but Recommended)
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:info@triplecitiestech.com
TTL: 3600 (or Auto)
```

**Important:** Copy these exact values from your Resend dashboard!

---

### Step 2.3: Add DNS Records to Your Domain

The process varies by domain registrar. Here are guides for common providers:

#### If Using GoDaddy:

1. Log in to [GoDaddy](https://www.godaddy.com)
2. Go to **My Products**
3. Find `triplecitiestech.com` and click **DNS**
4. Click **Add** button

**Add Record 1 (SPF):**
- Type: `TXT`
- Name: `@`
- Value: `v=spf1 include:_spf.resend.com ~all`
- TTL: `1 Hour` (or default)
- Click **Save**

**Add Record 2 (DKIM):**
- Type: `TXT`
- Name: `resend._domainkey`
- Value: (paste the long string from Resend)
- TTL: `1 Hour` (or default)
- Click **Save**

**Add Record 3 (DMARC):**
- Type: `TXT`
- Name: `_dmarc`
- Value: `v=DMARC1; p=none; rua=mailto:info@triplecitiestech.com`
- TTL: `1 Hour` (or default)
- Click **Save**

---

#### If Using Namecheap:

1. Log in to [Namecheap](https://www.namecheap.com)
2. Go to **Domain List**
3. Click **Manage** next to `triplecitiestech.com`
4. Go to **Advanced DNS** tab

**Add Record 1 (SPF):**
- Type: `TXT Record`
- Host: `@`
- Value: `v=spf1 include:_spf.resend.com ~all`
- TTL: `Automatic`
- Click **✓** (checkmark)

**Add Record 2 (DKIM):**
- Type: `TXT Record`
- Host: `resend._domainkey`
- Value: (paste the long string from Resend)
- TTL: `Automatic`
- Click **✓** (checkmark)

**Add Record 3 (DMARC):**
- Type: `TXT Record`
- Host: `_dmarc`
- Value: `v=DMARC1; p=none; rua=mailto:info@triplecitiestech.com`
- TTL: `Automatic`
- Click **✓** (checkmark)

---

#### If Using Cloudflare:

1. Log in to [Cloudflare](https://www.cloudflare.com)
2. Select `triplecitiestech.com` domain
3. Go to **DNS** section
4. Click **Add record**

**Add Record 1 (SPF):**
- Type: `TXT`
- Name: `@`
- Content: `v=spf1 include:_spf.resend.com ~all`
- TTL: `Auto`
- Proxy status: `DNS only` (gray cloud)
- Click **Save**

**Add Record 2 (DKIM):**
- Type: `TXT`
- Name: `resend._domainkey`
- Content: (paste the long string from Resend)
- TTL: `Auto`
- Proxy status: `DNS only` (gray cloud)
- Click **Save**

**Add Record 3 (DMARC):**
- Type: `TXT`
- Name: `_dmarc`
- Content: `v=DMARC1; p=none; rua=mailto:info@triplecitiestech.com`
- TTL: `Auto`
- Proxy status: `DNS only` (gray cloud)
- Click **Save**

---

### Step 2.4: Wait for DNS Propagation

After adding DNS records:

1. **Wait**: 5-60 minutes (sometimes up to 24 hours)
2. DNS changes need to propagate globally
3. ☕ Take a coffee break!

**Check propagation status:**
- Use [DNSChecker.org](https://dnschecker.org)
- Enter: `resend._domainkey.triplecitiestech.com`
- Type: `TXT`
- Click **Search**
- Wait until most locations show the record

---

### Step 2.5: Verify Domain in Resend

1. Go back to [Resend Domains](https://resend.com/domains)
2. Find `triplecitiestech.com`
3. Click **Verify** button

**Possible Results:**

✅ **Success**: Domain verified!
- Status shows: ✓ Verified
- You'll receive a confirmation email
- Proceed to Phase 3

⚠️ **Pending**: Not ready yet
- DNS records haven't propagated
- Wait 15-30 more minutes
- Try again

❌ **Failed**: Issue with DNS records
- Double-check DNS records match exactly
- Check for typos
- Ensure TTL is set correctly
- Try again after fixing

---

### Step 2.6: Confirm Verification

Once verified, you should see:

```
✅ triplecitiestech.com - Verified
SPF: ✓ Valid
DKIM: ✓ Valid
DMARC: ✓ Valid (if added)
```

**✅ Phase 2 Complete! Your domain is verified.**

---

## Phase 3: Production Configuration

Switch from test domain to your verified domain.

### Step 3.1: Update Environment Variables in Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Click **Settings** → **Environment Variables**
4. Find `RESEND_FROM_EMAIL`

---

### Step 3.2: Change RESEND_FROM_EMAIL

**Current Value (Testing):**
```
RESEND_FROM_EMAIL = onboarding@resend.dev
```

**New Value (Production):**
```
RESEND_FROM_EMAIL = noreply@triplecitiestech.com
```

**How to update:**
1. Find `RESEND_FROM_EMAIL` in the list
2. Click **⋯** (three dots) → **Edit**
3. Change value to: `noreply@triplecitiestech.com`
4. Keep all environments checked: ☑ Production ☑ Preview ☑ Development
5. Click **Save**

**Alternative sender emails you can use:**
- `contact@triplecitiestech.com`
- `info@triplecitiestech.com`
- `support@triplecitiestech.com`
- `hello@triplecitiestech.com`
- Any `@triplecitiestech.com` email address

---

### Step 3.3: Update NEXT_PUBLIC_CONTACT_EMAIL (Optional)

If you want to use a professional email for receiving:

**Current Value:**
```
NEXT_PUBLIC_CONTACT_EMAIL = info@triplecitiestech.com
```

**Change to (Optional):**
```
NEXT_PUBLIC_CONTACT_EMAIL = info@triplecitiestech.com
```

**Or use different emails for each form:**
```
NEXT_PUBLIC_CONTACT_EMAIL = support@triplecitiestech.com
NEXT_PUBLIC_QUESTIONNAIRE_EMAIL = sales@triplecitiestech.com
```

---

### Step 3.4: Update Local Environment (Optional)

Update your `.env.local` file to match production:

```env
# Resend API Key (same)
RESEND_API_KEY=re_your_actual_api_key_here

# Email Recipients (optional - use professional email)
NEXT_PUBLIC_CONTACT_EMAIL=info@triplecitiestech.com

# Sender Configuration - YOUR DOMAIN (changed!)
RESEND_FROM_EMAIL=noreply@triplecitiestech.com
RESEND_FROM_NAME=Triple Cities Tech

# Company Information (same)
NEXT_PUBLIC_CONTACT_PHONE=(607) 222-TCT1
NEXT_PUBLIC_COMPANY_NAME=Triple Cities Tech
NEXT_PUBLIC_WEBSITE_URL=https://www.triplecitiestech.com
```

---

### Step 3.5: Redeploy to Vercel

After updating environment variables:

1. Go to **Deployments** tab in Vercel
2. Click **⋯** on the latest deployment
3. Click **Redeploy**
4. Wait for deployment to complete

**Or push a new commit:**
```bash
git commit --allow-empty -m "Update to production email configuration"
git push tct development
```

Vercel will auto-deploy with new variables.

---

### Step 3.6: Test Production Setup

1. Visit your live site
2. Fill out contact form with a test submission
3. Use ANY email address (no longer restricted to test recipients!)
4. Check the inbox specified in `NEXT_PUBLIC_CONTACT_EMAIL`

**Expected Result:**
```
✅ Form submits successfully
✅ Email received at your configured email
✅ Email from: Triple Cities Tech <noreply@triplecitiestech.com>
✅ Professional appearance with your domain
✅ Can send to ANY email address (not just verified)
```

---

### Step 3.7: Remove Test Recipients (Optional)

Now that your domain is verified, you can remove test recipients:

1. Go to [Resend Settings > Recipients](https://resend.com/settings/recipients)
2. Remove `info@triplecitiestech.com` from test recipients
3. You no longer need this restriction!

**✅ Phase 3 Complete! You're now in production!**

---

## Configuration Summary

### Testing vs Production Comparison

| Setting | Testing | Production |
|---------|---------|------------|
| **Sender Email** | `onboarding@resend.dev` | `noreply@triplecitiestech.com` |
| **Can Send To** | Verified test emails only | ANY email address |
| **Recipient Email** | `info@triplecitiestech.com` | `info@triplecitiestech.com` (optional) |
| **Appearance** | Generic | Professional with your brand |
| **Deliverability** | Good | Better |
| **Trust Factor** | Low | High ✨ |

---

## Email Examples

### Testing Email (Phase 1)
```
From: Triple Cities Tech <onboarding@resend.dev>
To: info@triplecitiestech.com
Subject: New Contact Form Submission from John Doe

[Email content...]
```
😐 Works but looks generic

### Production Email (Phase 3)
```
From: Triple Cities Tech <noreply@triplecitiestech.com>
To: customer@anycompany.com
Subject: New Contact Form Submission from John Doe

[Email content...]
```
✨ Professional and branded!

---

## Troubleshooting

### Issue: DNS Records Not Verifying

**Symptoms:**
- Resend shows "Pending" or "Failed" verification
- DNS checker doesn't show records

**Solutions:**
1. **Wait longer**: DNS can take 24-48 hours
2. **Check for typos**: Verify records match exactly
3. **Remove extra spaces**: In DNS values
4. **Check TTL**: Should be 3600 or Auto
5. **Contact support**: Your domain registrar or Resend

**Common mistakes:**
- Adding `www` to domain name
- Copying incomplete DKIM value
- Wrong record type (must be TXT)
- Typo in record name (`resend._domainkey`)

---

### Issue: Emails Not Received After Verification

**Symptoms:**
- Domain verified but emails not arriving
- No error messages in Vercel

**Solutions:**
1. **Check spam folder**: Emails might be filtered
2. **Verify environment variable**: Check `RESEND_FROM_EMAIL` is updated in Vercel
3. **Redeploy**: After changing variables
4. **Check Resend logs**: [resend.com/emails](https://resend.com/emails)
5. **Test sender email**: Try different `@triplecitiestech.com` address

---

### Issue: "Email service not configured" Error

**Symptoms:**
- Form shows error message
- 503 status code

**Solutions:**
1. **Check required variables**: All must be set in Vercel
   - `RESEND_API_KEY`
   - `NEXT_PUBLIC_CONTACT_EMAIL`
   - `RESEND_FROM_EMAIL`
   - `RESEND_FROM_NAME`
2. **Redeploy**: After adding variables
3. **Check spelling**: Variable names are case-sensitive
4. **Check API key**: Must be valid and active

---

### Issue: Can't Send to Non-Test Emails

**Symptoms:**
- Only verified test recipients receive emails
- Others don't receive anything

**Cause:**
- Still using test domain `onboarding@resend.dev`
- Domain not verified yet

**Solution:**
- Complete Phase 2 (Domain Verification)
- Update `RESEND_FROM_EMAIL` to your domain
- Redeploy

---

### Issue: Verification Stuck on Pending

**Try these steps:**

1. **Use DNS Checker**
   ```
   Visit: https://dnschecker.org
   Check: resend._domainkey.triplecitiestech.com
   Type: TXT
   ```

2. **Wait and Retry**
   - Wait 1 hour
   - Try verification again

3. **Check DNS Records**
   - Log into your domain registrar
   - Verify all 3 records are present
   - Check for typos

4. **Contact Resend Support**
   - Go to [Resend Support](https://resend.com/support)
   - Provide domain name
   - They can help troubleshoot

---

## Quick Reference: Environment Variables

### All Environment Variables for Vercel

| Variable | Testing Value | Production Value | Required |
|----------|---------------|------------------|----------|
| `RESEND_API_KEY` | `re_your_key` | `re_your_key` | ✅ YES |
| `NEXT_PUBLIC_CONTACT_EMAIL` | `info@triplecitiestech.com` | `info@triplecitiestech.com` | ✅ YES |
| `NEXT_PUBLIC_QUESTIONNAIRE_EMAIL` | (not set) | `sales@triplecitiestech.com` | ❌ Optional |
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev` | `noreply@triplecitiestech.com` | ✅ YES |
| `RESEND_FROM_NAME` | `Triple Cities Tech` | `Triple Cities Tech` | ✅ YES |
| `NEXT_PUBLIC_CONTACT_PHONE` | `(607) 222-TCT1` | `(607) 222-TCT1` | ❌ Optional |
| `NEXT_PUBLIC_COMPANY_NAME` | `Triple Cities Tech` | `Triple Cities Tech` | ❌ Optional |
| `NEXT_PUBLIC_WEBSITE_URL` | `https://...vercel.app` | `https://www.triplecitiestech.com` | ❌ Optional |

---

## Complete Checklist

### ✅ Phase 1: Testing (15 minutes)

- [ ] Create Resend account
- [ ] Get API key from Resend
- [ ] Add test recipients and verify email
- [ ] Create `.env.local` with test configuration
- [ ] Test locally (`npm run dev`)
- [ ] Add all 7 environment variables to Vercel
- [ ] Deploy to Vercel
- [ ] Test production deployment
- [ ] Confirm emails received

### ✅ Phase 2: Domain Verification (30-60 minutes)

- [ ] Add domain in Resend dashboard
- [ ] Copy DNS records from Resend
- [ ] Log into domain registrar
- [ ] Add SPF record to DNS
- [ ] Add DKIM record to DNS
- [ ] Add DMARC record to DNS (optional)
- [ ] Wait for DNS propagation (30-60 min)
- [ ] Check DNS with dnschecker.org
- [ ] Click "Verify" in Resend
- [ ] Confirm domain shows as verified

### ✅ Phase 3: Production (5 minutes)

- [ ] Update `RESEND_FROM_EMAIL` in Vercel
- [ ] Change to `noreply@triplecitiestech.com`
- [ ] Update `NEXT_PUBLIC_CONTACT_EMAIL` (optional)
- [ ] Update `.env.local` for local dev (optional)
- [ ] Redeploy to Vercel
- [ ] Test with real submission to any email
- [ ] Confirm professional email received
- [ ] Remove test recipients (optional)
- [ ] Monitor Resend dashboard for deliverability

---

## Monitoring & Maintenance

### Regular Checks

**Daily (First Week):**
- Check Resend dashboard for email logs
- Verify emails are being delivered
- Check spam folders

**Weekly:**
- Review delivery rates in Resend
- Check for bounced emails
- Monitor error logs in Vercel

**Monthly:**
- Review DNS records (ensure still active)
- Check Resend account limits
- Update API key if needed (security best practice)

---

## Success Criteria

You've successfully completed the setup when:

✅ Forms submit without errors  
✅ Emails arrive within 1-2 minutes  
✅ Emails from `@triplecitiestech.com` (your domain)  
✅ Can send to ANY email address  
✅ No spam filter issues  
✅ Professional appearance  
✅ Reply-to works correctly  
✅ No test recipient restrictions  

**Congratulations! Your email system is production-ready!** 🎉

---

## Additional Resources

- **Resend Documentation**: [resend.com/docs](https://resend.com/docs)
- **Resend Email Logs**: [resend.com/emails](https://resend.com/emails)
- **DNS Checker Tool**: [dnschecker.org](https://dnschecker.org)
- **Vercel Docs**: [vercel.com/docs](https://vercel.com/docs)
- **Security Audit**: See `SECURITY_AUDIT.md` in project

---

## Support

If you need help:

1. **Check Resend Logs**: [resend.com/emails](https://resend.com/emails) for email delivery status
2. **Check Vercel Logs**: In deployment logs for API errors
3. **Review This Guide**: Troubleshooting section above
4. **Contact Resend Support**: [resend.com/support](https://resend.com/support)
5. **Contact Vercel Support**: [vercel.com/support](https://vercel.com/support)

---

**Created by BJANDCO**  
**Last Updated**: October 2025  
**Version**: 1.0

---

## Quick Commands Reference

```bash
# Local development
npm run dev

# Check git status
git status

# Push to GitHub
git push tct development

# Check environment variables (local)
cat .env.local

# Test API endpoint (local)
curl -X POST http://localhost:3000/api/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@test.com","message":"Test"}'
```

---

**You're all set! From testing to production, your email system is complete!** 🚀✨

