# Contact Form Spam Protection

This document explains the multi-layered spam protection implemented on the contact form.

## Overview

The contact form uses a **5-layer defense strategy** to prevent spam and abuse:

1. **Honeypot Field** - Hidden field that bots fill but humans can't see
2. **Time-based Validation** - Prevents instant form submissions
3. **Cloudflare Turnstile** - Modern CAPTCHA alternative
4. **Spam Keyword Detection** - Filters common spam phrases
5. **Rate Limiting** - Prevents abuse from single IPs

## Implementation Details

### 1. Honeypot Field
- Hidden field named "website" that is invisible to users
- Positioned off-screen using CSS
- Bots auto-fill all fields, including this one
- Any submission with this field filled is rejected

### 2. Time-based Validation
- Tracks when the form loads (`formLoadTime`)
- Requires minimum 3 seconds before submission
- Prevents automated instant submissions
- Validation happens both client-side and server-side

### 3. Cloudflare Turnstile
- Privacy-focused CAPTCHA alternative
- Invisible challenge for most users
- Validates on Cloudflare's servers
- Dark theme matching site design

### 4. Spam Keyword Detection
Server-side detection of common spam phrases:
- "seo services"
- "rank your website"
- "increase traffic"
- "buy now"
- "limited time offer"
- "click here"
- "make money"
- "work from home"
- "marketing services"
- "boost your sales"
- "improve your ranking"

### 5. Rate Limiting
- Existing rate limiting infrastructure
- Logs security events for monitoring
- Prevents repeated submissions from same IP

## Setup Instructions

### 1. Get Cloudflare Turnstile Keys

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to Turnstile
3. Create a new site
4. Copy your Site Key and Secret Key

### 2. Configure Environment Variables

Create a `.env.local` file (or update existing) with:

```env
# Cloudflare Turnstile
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your_site_key_here
TURNSTILE_SECRET_KEY=your_secret_key_here
```

### 3. Deploy

After adding the environment variables:

1. Commit your changes
2. Push to your repository
3. Add the environment variables to Vercel:
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Production + Preview)
   - Add `TURNSTILE_SECRET_KEY` (Production + Preview)
4. Redeploy

## Testing

### Test for False Positives

1. Fill out form normally
2. Wait at least 3 seconds
3. Complete Turnstile challenge
4. Submit - should succeed

### Test Spam Protection

**Honeypot Test:**
- Use browser dev tools to unhide and fill the "website" field
- Form should be rejected

**Time Validation Test:**
- Fill form and submit in under 3 seconds
- Should be rejected with "Please take your time" message

**Turnstile Test:**
- Block turnstile script in browser
- Form should show error about security verification

**Spam Keywords Test:**
- Include phrases like "SEO services" or "rank your website" in message
- Should be rejected with spam detection message

## Security Logging

All spam attempts are logged with:
- IP address
- User agent
- Timestamp
- Reason for rejection
- Severity level (high for spam)

Review logs in your application monitoring for patterns.

## Maintenance

### Update Spam Keywords

Edit `/src/app/api/contact/route.ts` and update the `spamKeywords` array:

```typescript
const spamKeywords = [
  'seo services',
  'your new keyword here',
  // ... add more
]
```

### Adjust Time Threshold

Edit `/src/app/api/contact/route.ts` line ~118:

```typescript
const minTime = 3000 // Change to desired milliseconds
```

## Development Mode

When `TURNSTILE_SECRET_KEY` is not set, Turnstile verification is skipped with a warning.

The test site key `1x00000000000000000000AA` always passes validation (use for testing only).

## User Experience

- **Legitimate Users:**
  - No noticeable impact
  - Turnstile typically shows no challenge
  - Form feels normal

- **Bots/Spammers:**
  - Blocked at multiple layers
  - Generic error messages (don't reveal which check failed)
  - Security events logged for monitoring

## Support

If legitimate users report issues:

1. Check Turnstile status
2. Review security logs for their IP
3. Temporarily lower time threshold if needed
4. Consider whitelisting specific IPs if necessary
