# Blog System Quick Setup Guide

## 🚀 Get Your Blog Running in 5 Minutes

### Step 1: Run Database Migration

1. Go to your **Vercel Dashboard** → **Storage** → **Your Postgres Database**
2. Click **SQL Editor** tab
3. Copy the entire contents of `migrations/001_add_blog_system.sql`
4. Paste into the SQL editor
5. Click **Run Query**
6. You should see: "Blog system tables created successfully!"

### Step 2: Set Environment Variables in Vercel

Go to **Vercel Dashboard** → **Your Project** → **Settings** → **Environment Variables**

Add these **required** variables:

```
BLOG_CRON_SECRET=<run this command: openssl rand -base64 32>
APPROVAL_EMAIL=kurtis@triplecitiestech.com
NEXT_PUBLIC_BASE_URL=https://www.triplecitiestech.com
```

You already have these (verify they're set):
```
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
```

### Step 3: Redeploy

Either:
- **Option A**: Push a small change to trigger redeploy
- **Option B**: Go to **Deployments** → Click **•••** → **Redeploy**

### Step 4: Test the Blog

Visit: **https://www.triplecitiestech.com/blog**

You should see an empty blog page (no posts yet).

### Step 5: Generate First Blog Post (Manual Test)

Once deployed, trigger the first blog generation:

```bash
curl -X POST https://www.triplecitiestech.com/api/cron/generate-blog \
  -H "Authorization: Bearer YOUR_BLOG_CRON_SECRET"
```

This will:
1. Fetch latest security news
2. Generate a blog post with AI
3. Email you at kurtis@triplecitiestech.com for approval

### Step 6: Approve Your First Post

1. Check email (may take 1-2 minutes)
2. Click **"Approve & Schedule"** button
3. Post will be scheduled for next Mon/Wed/Fri at 9 AM

## ✅ That's It!

Your blog is now running! The system will:
- Fetch news daily at 6 AM
- Generate posts Mon/Wed/Fri at 8 AM
- Email you for approval
- Auto-publish after approval

## 📱 Social Media (Optional - Set Up Later)

The blog works fine without social media. When you're ready:

1. Set up Facebook/Instagram tokens (see `BLOG_SYSTEM_README.md`)
2. Add these env vars:
   - `FACEBOOK_ACCESS_TOKEN`
   - `FACEBOOK_PAGE_ID`
   - `INSTAGRAM_ACCESS_TOKEN`
   - `INSTAGRAM_ACCOUNT_ID`
   - `LINKEDIN_ACCESS_TOKEN`
   - `LINKEDIN_ORG_ID`

The system will automatically start posting to configured platforms!

## 🔧 Troubleshooting

### Still getting 404?
- Make sure you ran the SQL migration
- Check Vercel logs for errors
- Verify `NEXT_PUBLIC_BASE_URL` is set

### No email received?
- Check spam folder
- Verify `RESEND_API_KEY` is set
- Check Resend dashboard for send logs

### Need help?
- Check `BLOG_SYSTEM_README.md` for full documentation
- Review Vercel function logs
