# 🚀 Complete Resend & Vercel Setup Guide

**Complete guide to set up email forms with Resend and deploy to Vercel**

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Local Development Setup](#local-development-setup)
3. [Resend Configuration](#resend-configuration)
4. [Domain Verification (Optional)](#domain-verification-optional)
5. [Vercel Deployment](#vercel-deployment)
6. [Testing](#testing)
7. [Troubleshooting](#troubleshooting)

---

## Overview

This project uses **Resend** to handle email notifications from two forms:
- **Contact Form** (`/contact`) → Sends to `NEXT_PUBLIC_CONTACT_EMAIL`
- **Questionnaire** ("Choosing a plan") → Sends to `NEXT_PUBLIC_QUESTIONNAIRE_EMAIL`

### Email Flow Diagram

```
┌─────────────────┐
│  Website Forms  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Resend API    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Your Inbox     │
│ (Gmail, etc.)   │
└─────────────────┘
```

---

## Local Development Setup

### Step 1: Create `.env.local` File

In your project root, create a file named `.env.local`:

```bash
# Copy the example file
copy env.example .env.local
```

Or create it manually with this content:

```env
# Resend API Configuration
# Get your API key from: https://resend.com/api-keys
RESEND_API_KEY=your_resend_api_key_here

# Email Recipients - Where form submissions are sent
NEXT_PUBLIC_CONTACT_EMAIL=info@triplecitiestech.com
NEXT_PUBLIC_QUESTIONNAIRE_EMAIL=info@triplecitiestech.com

# Sender Configuration (test domain - change after domain verification)
RESEND_FROM_EMAIL=onboarding@resend.dev
RESEND_FROM_NAME=Triple Cities Tech

# Company Information
NEXT_PUBLIC_CONTACT_PHONE=(607) 222-TCT1
NEXT_PUBLIC_COMPANY_NAME=Triple Cities Tech
NEXT_PUBLIC_WEBSITE_URL=https://www.triplecitiestech.com
```

### Step 2: Install Dependencies (if not already done)

```bash
npm install
```

---

## Resend Configuration

### Step 1: Create Resend Account

1. Go to [resend.com](https://resend.com)
2. Click **Sign Up** (free account available)
3. Verify your email address

### Step 2: Generate API Key

1. Log in to [Resend Dashboard](https://resend.com/home)
2. Navigate to [API Keys](https://resend.com/api-keys)
3. Click **Create API Key**
4. Configure:
   - **Name**: `Triple Cities Tech Production`
   - **Permission**: `Sending access`
5. Click **Create**
6. **IMPORTANT**: Copy the API key immediately (starts with `re_...`)
7. You won't see it again!

### Step 3: Add API Key to `.env.local`

Replace `your_resend_api_key_here` with your actual API key:

```env
RESEND_API_KEY=re_abc123xyz789your_actual_key
```

### Step 4: Configure Test Recipients (For Testing Only)

Since you're using the test domain `onboarding@resend.dev`, you must verify recipient emails:

1. Go to [Resend Settings > Recipients](https://resend.com/settings/recipients)
2. Click **Add Recipient**
3. Enter your email: `info@triplecitiestech.com`
4. Click **Send verification email**
5. Check your inbox and click the verification link
6. Repeat for any other test email addresses

**Note**: After domain verification, this step is not needed.

### Step 5: Test Locally

```bash
# Start development server
npm run dev
```

Visit your site and test both forms:
- Contact form at `/contact`
- Questionnaire ("Choosing a plan" section)

Check your email inbox for submissions! 📧

---

## Domain Verification (Optional but Recommended)

Verifying your domain allows you to:
- Send from your own domain (e.g., `noreply@triplecitiestech.com`)
- Send to any email address (not just verified test recipients)
- Improve email deliverability
- Look more professional

### Step 1: Add Domain in Resend

1. Go to [Resend Domains](https://resend.com/domains)
2. Click **Add Domain**
3. Enter your domain: `triplecitiestech.com` (without www or https)
4. Click **Add**

### Step 2: Add DNS Records

Resend will provide DNS records. You need to add these to your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.):

#### SPF Record
```
Type: TXT
Name: @
Value: v=spf1 include:_spf.resend.com ~all
```

#### DKIM Record
```
Type: TXT
Name: resend._domainkey
Value: [provided by Resend]
```

#### DMARC Record (Optional but recommended)
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:info@triplecitiestech.com
```

### Step 3: Verify Domain

1. After adding DNS records, return to Resend dashboard
2. Click **Verify** on your domain
3. Verification usually takes 5-60 minutes
4. You'll receive an email when complete

### Step 4: Update `.env.local`

After verification, update your sender email:

```env
RESEND_FROM_EMAIL=noreply@triplecitiestech.com
RESEND_FROM_NAME=Triple Cities Tech
```

Restart your dev server to apply changes.

---

## Vercel Deployment

### Prerequisites

- GitHub/GitLab/Bitbucket account
- Code pushed to a Git repository
- [Vercel account](https://vercel.com/signup) (free)

### Step 1: Push Code to Git Repository

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Ready for deployment"

# Push to GitHub (replace with your repo URL)
git remote add origin https://github.com/your-username/triple-cities-tech.git
git push -u origin main
```

**Important**: Make sure `.env.local` is in `.gitignore` (it already is!)

### Step 2: Import Project to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **Add New... > Project**
3. Select your Git provider (GitHub, GitLab, or Bitbucket)
4. **Authorize Vercel** to access your repositories
5. Find and **Import** your `triple-cities-tech` repository

### Step 3: Configure Project

Vercel will detect Next.js automatically:

- **Framework Preset**: Next.js (auto-detected)
- **Root Directory**: `./` (default)
- **Build Command**: `next build` (auto)
- **Output Directory**: `.next` (auto)

Click **Deploy** (but it will fail without environment variables)

### Step 4: Add Environment Variables

**Before deployment succeeds**, you need to add environment variables:

1. In Vercel dashboard, go to your project
2. Click **Settings** tab
3. Click **Environment Variables** in left sidebar
4. Add each variable:

#### Required Variables

| Name | Value | Environment |
|------|-------|-------------|
| `RESEND_API_KEY` | `re_your_actual_key` | Production, Preview, Development |
| `NEXT_PUBLIC_CONTACT_EMAIL` | `info@triplecitiestech.com` | Production, Preview, Development |
| `NEXT_PUBLIC_QUESTIONNAIRE_EMAIL` | `info@triplecitiestech.com` or `sales@triplecitiestech.com` | Production, Preview, Development |
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev` or `noreply@triplecitiestech.com` | Production, Preview, Development |
| `RESEND_FROM_NAME` | `Triple Cities Tech` | Production, Preview, Development |
| `NEXT_PUBLIC_CONTACT_PHONE` | `(607) 222-TCT1` | Production, Preview, Development |
| `NEXT_PUBLIC_COMPANY_NAME` | `Triple Cities Tech` | Production, Preview, Development |
| `NEXT_PUBLIC_WEBSITE_URL` | `https://www.triplecitiestech.com` | Production, Preview, Development |

**How to add each variable:**

1. Click **Add Another**
2. Enter **Name** (e.g., `RESEND_API_KEY`)
3. Enter **Value** (e.g., your actual API key)
4. Check all environments: **Production**, **Preview**, **Development**
5. Click **Save**
6. Repeat for all variables

### Step 5: Deploy

After adding all environment variables:

1. Go to **Deployments** tab
2. Click **... (three dots)** on the failed deployment
3. Click **Redeploy**

Or push a new commit:

```bash
git commit --allow-empty -m "Trigger Vercel deployment"
git push
```

Vercel will automatically build and deploy!

### Step 6: Configure Custom Domain (Optional)

1. In Vercel project settings, go to **Domains**
2. Click **Add Domain**
3. Enter: `triplecitiestech.com` and `www.triplecitiestech.com`
4. Follow instructions to add DNS records at your domain registrar
5. Vercel will automatically provision SSL certificates

**DNS Records for Custom Domain:**

Add these at your domain registrar:

```
Type: A
Name: @
Value: 76.76.21.21

Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

### Step 7: Update Environment Variables for Production

After deploying with custom domain, update:

```env
NEXT_PUBLIC_WEBSITE_URL=https://www.triplecitiestech.com
```

In Vercel:
1. Settings > Environment Variables
2. Edit `NEXT_PUBLIC_WEBSITE_URL`
3. Change to your production URL
4. Redeploy

---

## Testing

### Test Local Development

```bash
npm run dev
```

1. Visit `http://localhost:3000/contact`
2. Fill out contact form
3. Submit
4. Check your email inbox

### Test Production Deployment

1. Visit your Vercel URL or custom domain
2. Test both forms:
   - Contact form at `/contact`
   - Questionnaire at homepage ("Choosing a plan")
3. Check email inbox
4. Verify emails are received with correct formatting

### Check Resend Logs

Monitor email delivery:

1. Go to [Resend Dashboard > Emails](https://resend.com/emails)
2. View all sent emails
3. Check delivery status
4. Click on any email to see details

---

## Troubleshooting

### Issue: "Failed to send email"

**Solutions:**
- Check that `RESEND_API_KEY` is set correctly in Vercel environment variables
- Verify API key has "Sending access" permission
- Check Resend dashboard for error logs
- Ensure you didn't include quotes around the API key value

### Issue: Email not received

**Solutions:**
- Check spam/junk folder
- If using test domain, verify recipient email in Resend dashboard
- Check [Resend logs](https://resend.com/emails) for delivery status
- Verify email address is correct in environment variables

### Issue: Environment variables not working on Vercel

**Solutions:**
- Ensure variables are added to **all environments** (Production, Preview, Development)
- After adding variables, **redeploy** the project
- Variable names are case-sensitive
- Don't add quotes around values in Vercel dashboard

### Issue: Domain verification failing

**Solutions:**
- Wait 5-60 minutes for DNS propagation
- Check DNS records using [dnschecker.org](https://dnschecker.org)
- Ensure records are added to root domain, not subdomain
- Contact Resend support if issues persist

### Issue: Vercel deployment failing

**Solutions:**
- Check build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`
- Run `npm run build` locally to test
- Check that TypeScript has no errors
- Review error messages in deployment logs

### Issue: Forms not submitting

**Solutions:**
- Check browser console for JavaScript errors
- Verify API routes are accessible: `/api/contact` and `/api/questionnaire`
- Check network tab in browser DevTools
- Ensure form validation is passing

---

## Configuration Reference

### Email Recipient Options

#### Option 1: Different emails for each form
```env
NEXT_PUBLIC_CONTACT_EMAIL=support@triplecitiestech.com
NEXT_PUBLIC_QUESTIONNAIRE_EMAIL=sales@triplecitiestech.com
```

#### Option 2: Same email for both forms
```env
NEXT_PUBLIC_CONTACT_EMAIL=info@triplecitiestech.com
NEXT_PUBLIC_QUESTIONNAIRE_EMAIL=info@triplecitiestech.com
```

#### Option 3: Personal email (testing)
```env
NEXT_PUBLIC_CONTACT_EMAIL=info@triplecitiestech.com
NEXT_PUBLIC_QUESTIONNAIRE_EMAIL=info@triplecitiestech.com
```

### Sender Configuration

#### Development/Testing (Test Domain)
```env
RESEND_FROM_EMAIL=onboarding@resend.dev
RESEND_FROM_NAME=Triple Cities Tech
```

**Limitations:**
- Can only send to verified test recipients
- Not suitable for production

#### Production (Verified Domain)
```env
RESEND_FROM_EMAIL=noreply@triplecitiestech.com
RESEND_FROM_NAME=Triple Cities Tech
```

**Benefits:**
- Can send to any email address
- Professional appearance
- Better deliverability

---

## Security Best Practices

✅ **Never commit `.env.local`** - Already in `.gitignore`  
✅ **Use environment variables** - Don't hardcode API keys  
✅ **Rotate API keys** - Periodically update for security  
✅ **Monitor email logs** - Check for suspicious activity  
✅ **Use rate limiting** - Already implemented in API routes  
✅ **Validate inputs** - Already implemented with sanitization  
✅ **Enable 2FA** - On Resend and Vercel accounts  

---

## Deployment Checklist

Before going live, ensure:

- [ ] Resend account created
- [ ] API key generated and secured
- [ ] Domain verified (optional but recommended)
- [ ] DNS records added and verified
- [ ] `.env.local` configured locally
- [ ] Local testing completed successfully
- [ ] Code pushed to Git repository
- [ ] Vercel project imported
- [ ] All environment variables added to Vercel
- [ ] Production deployment successful
- [ ] Custom domain configured (if applicable)
- [ ] Production forms tested
- [ ] Email deliverability confirmed
- [ ] Spam folder checked
- [ ] Resend email logs reviewed
- [ ] Error monitoring set up

---

## Quick Reference Commands

```bash
# Local development
npm run dev

# Build for production
npm run build

# Start production server locally
npm start

# Deploy to Vercel (via Git push)
git add .
git commit -m "Update"
git push

# Check environment variables locally
echo $RESEND_API_KEY
```

---

## Support Resources

| Resource | URL |
|----------|-----|
| **Resend Dashboard** | [resend.com/home](https://resend.com/home) |
| **Resend Docs** | [resend.com/docs](https://resend.com/docs) |
| **Resend API Keys** | [resend.com/api-keys](https://resend.com/api-keys) |
| **Resend Domains** | [resend.com/domains](https://resend.com/domains) |
| **Resend Email Logs** | [resend.com/emails](https://resend.com/emails) |
| **Vercel Dashboard** | [vercel.com/dashboard](https://vercel.com/dashboard) |
| **Vercel Docs** | [vercel.com/docs](https://vercel.com/docs) |
| **DNS Checker** | [dnschecker.org](https://dnschecker.org) |

---

## File Structure

```
Triple Cities Tech/
├── .env.local                    # Local environment variables (never commit!)
├── env.example                   # Environment variables template
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── contact/
│   │   │   │   └── route.ts     # Contact form API endpoint
│   │   │   └── questionnaire/
│   │   │       └── route.ts     # Questionnaire API endpoint
│   └── config/
│       └── contact.ts            # Email configuration
├── package.json
└── vercel.json                   # Vercel configuration (optional)
```

---

## Email Templates

Both forms send professional HTML emails with:

### Contact Form Email Features
- Beautiful cyan gradient header
- Contact details card (Name, Email, Phone, Company)
- Message in formatted card
- Reply-to automatically set
- Dark theme with radiant effects
- Mobile responsive
- Plain text fallback

### Questionnaire Email Features
- Professional header with assessment title
- Interest type badge (Outsourcing/Internal Support)
- Contact information card
- Assessment responses organized by category
- Reply-to automatically set
- Dark theme matching brand
- Mobile responsive
- Plain text fallback

---

## Monitoring & Analytics

### Resend Dashboard Metrics

Monitor in [Resend Dashboard](https://resend.com/emails):
- Total emails sent
- Delivery rate
- Bounce rate
- Complaint rate
- Failed deliveries

### Vercel Analytics

Enable in Vercel dashboard:
- Page views
- Form submissions
- Performance metrics
- Error tracking

---

## Next Steps After Deployment

1. **Test thoroughly** - Submit multiple forms to ensure everything works
2. **Monitor logs** - Check Resend dashboard for email delivery
3. **Set up alerts** - Configure email notifications for errors
4. **Document for team** - Share this guide with team members
5. **Regular maintenance** - Review and update configurations quarterly
6. **Backup configs** - Save environment variable configurations
7. **Scale as needed** - Upgrade Resend plan if volume increases

---

## API Rate Limits

### Resend Free Plan
- **100 emails/day**
- **3,000 emails/month**

### Resend Pro Plan
- **50,000 emails/month**
- **Custom limits available**

### Built-in Rate Limiting (Our Implementation)
- Contact form: 5 requests per 15 minutes per IP
- Questionnaire: 2 requests per 15 minutes per IP (stricter)

---

## Production URLs

After deployment, your site will be available at:

- **Vercel URL**: `https://triple-cities-tech.vercel.app`
- **Custom Domain**: `https://www.triplecitiestech.com` (after DNS setup)

---

## Cost Summary

| Service | Free Tier | Paid Plans |
|---------|-----------|------------|
| **Resend** | 100 emails/day | From $20/month |
| **Vercel** | 100GB bandwidth | From $20/month |
| **Domain** | N/A (existing) | ~$10-15/year |
| **Total** | **Free** (for testing) | ~$40+/month (production) |

---

## Frequently Asked Questions

**Q: Can I use a different email provider instead of Resend?**  
A: Yes, but you'll need to modify the API routes. Resend is recommended for its simplicity and reliability.

**Q: Do I need to verify my domain?**  
A: Not required for testing, but highly recommended for production. It improves deliverability and professionalism.

**Q: Can I use the same API key for staging and production?**  
A: Yes, but it's better to create separate API keys for security and monitoring purposes.

**Q: How do I handle multiple recipient emails?**  
A: In the API routes, change `to: [email]` to `to: [email1, email2, email3]` for multiple recipients.

**Q: What happens if Resend is down?**  
A: The form will return an error. Consider implementing a fallback or queue system for critical applications.

**Q: Can I customize the email templates?**  
A: Yes! Edit the HTML in `src/app/api/contact/route.ts` and `src/app/api/questionnaire/route.ts`.

---

## Success Checklist

You're fully set up when:

✅ Local development works  
✅ Emails arrive in your inbox  
✅ Code is pushed to Git repository  
✅ Vercel deployment is successful  
✅ Environment variables are configured  
✅ Production forms are tested  
✅ Domain is verified (optional)  
✅ Custom domain is connected (optional)  
✅ Email deliverability is confirmed  
✅ Team is trained on the system  

---

## Conclusion

You now have a complete email notification system set up with:
- ✨ Beautiful, professional email templates
- 🔒 Secure API key management
- 🚀 Scalable infrastructure with Vercel
- 📧 Reliable email delivery with Resend
- 🎯 Separate routing for different form types
- 📱 Mobile-responsive emails
- 🛡️ Built-in security features

Your website is ready to receive and process customer inquiries!

---

**Created by BJANDCO**  
*Last Updated: October 2025*

For support or questions, refer to the official documentation or contact your development team.

