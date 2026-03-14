# Customer Onboarding Portal Documentation

## Overview

The customer onboarding portal provides a secure, password-protected interface for customers to track their onboarding progress with Triple Cities Tech. Each customer accesses their dedicated portal via a custom URL and must authenticate with a unique password.

## Security Features

✅ **Server-side password validation** - Passwords never shipped to client
✅ **Secure session cookies** - HttpOnly, Secure (in production), SameSite
✅ **Brute-force protection** - Rate limiting with exponential backoff
✅ **No data leakage** - Onboarding data only served after authentication
✅ **Timing-safe password comparison** - Prevents timing attacks
✅ **Security event logging** - All auth attempts logged
✅ **IP-based rate limiting** - Per-company rate limits

## Architecture

### Routes

- **`/onboarding/[companyName]`** - Main onboarding portal page (dynamic route)
- **`/api/onboarding/auth`** - Password authentication endpoint (POST)
- **`/api/onboarding/data`** - Protected data endpoint (GET)
- **`/api/onboarding/logout`** - Session logout endpoint (POST)

### Components

- **`OnboardingPortal`** - Main container component with auth state management
- **`PasswordGate`** - Password entry form with error handling
- **`OnboardingTimeline`** - Visual timeline of onboarding phases

### Server-Only Files (Never Exposed to Client)

- **`lib/onboarding-data.ts`** - Password validation and onboarding data storage
- **`lib/onboarding-session.ts`** - Session management with secure cookies

## Setup Instructions

### 1. Set Environment Variables in Vercel

For each customer company, add a password environment variable:

1. Go to your Vercel project settings
2. Navigate to **Environment Variables**
3. Add variables in this format:

```
ONBOARDING_PASSWORD_ECOSPECT=YourSecurePassword123!
ONBOARDING_PASSWORD_ALL_SPEC_FINISHING=AnotherSecurePass456!
```

**Important naming rules:**
- Prefix: `ONBOARDING_PASSWORD_`
- Company slug in UPPERCASE
- Replace hyphens with underscores
- Example: `/onboarding/ez-red` → `ONBOARDING_PASSWORD_EZ_RED`

4. Set for all environments (Production, Preview, Development)
5. Click **Save**
6. Redeploy your application for changes to take effect

### 2. Add Customer Data

Edit `/src/lib/onboarding-data.ts` to add new customers to the `onboardingDatabase` Map:

```typescript
[
  'your-company-slug',
  {
    companySlug: 'your-company-slug',
    companyDisplayName: 'Your Company Name',
    currentPhaseId: 'phase-3', // The phase they're currently on
    lastUpdated: new Date().toISOString(),
    phases: [
      {
        id: 'phase-1',
        title: 'Welcome & Support Overview',
        description: 'Introduction to our support services',
        status: 'Complete',
        owner: 'TCT',
        details: [/* ... */],
      },
      // ... more phases
    ],
  },
]
```

### 3. Share URL with Customer

Once configured, share the URL with your customer:

```
https://www.triplecitiestech.com/onboarding/[company-slug]
```

Examples:
- `https://www.triplecitiestech.com/onboarding/ecospect`
- `https://www.triplecitiestech.com/onboarding/all-spec-finishing`

Also provide them with their unique password (communicate securely via email or phone).

## Usage

### Customer Experience

1. Customer visits `/onboarding/their-company`
2. Sees password entry form
3. Enters their unique password
4. On success:
   - Session cookie is set (12-hour lifetime)
   - Full onboarding timeline is displayed
   - Can see current phase, status, notes, next actions
   - Can expand/collapse phases for details
5. Can log out to clear session
6. Session automatically expires after 12 hours

### Admin/TCT Staff

To update onboarding status:

1. Edit `/src/lib/onboarding-data.ts`
2. Update phase statuses, notes, scheduled dates, etc.
3. Update `currentPhaseId` to reflect current phase
4. Update `lastUpdated` timestamp
5. Commit and push changes
6. Vercel will auto-deploy
7. Customer can refresh page to see updates

## Onboarding Phase Statuses

Available status values for each phase:

- **Not Started** - Phase hasn't begun
- **Scheduled** - Phase scheduled for future date
- **In Progress** - Currently working on this phase
- **Waiting on Customer** - Blocked, waiting for customer action
- **Requires Customer Coordination** - Needs customer involvement
- **Discussed** - Phase has been discussed with customer
- **Complete** - Phase finished

## Security Best Practices

### Password Requirements

- Use strong, unique passwords for each customer (minimum 16 characters recommended)
- Include uppercase, lowercase, numbers, and special characters
- Never reuse passwords across customers
- Store passwords securely in Vercel environment variables only
- Communicate passwords to customers via secure channels

### Rate Limiting

Built-in protection includes:

- **5 attempts per 15 minutes** per IP + company combination
- **Exponential backoff** after 3 consecutive failures
- **Generic error messages** ("Invalid password") with no hints
- **Security event logging** for monitoring

### Session Management

- **12-hour cookie lifetime** - Users must re-authenticate after 12 hours
- **HttpOnly cookies** - Not accessible via JavaScript
- **Secure flag in production** - Only sent over HTTPS
- **SameSite: lax** - CSRF protection
- **Path-scoped** - Cookie only sent to `/onboarding` routes

## Troubleshooting

### "Invalid password" error

- Verify environment variable is set correctly in Vercel
- Check company slug matches exactly (case-insensitive, but must match)
- Ensure underscores replace hyphens in env var name
- Verify password doesn't have leading/trailing spaces
- Try redeploying after setting environment variables

### "Company not found" or 404 error

- Check that company exists in `onboardingDatabase` in `lib/onboarding-data.ts`
- Verify company slug in URL matches slug in database (case-insensitive)
- Ensure code has been committed and deployed

### Rate limit errors

- Wait 15 minutes for rate limit to reset
- Check security logs for IP address of blocked user
- If legitimate, wait for automatic reset
- Consider increasing rate limit in `api/onboarding/auth/route.ts` if needed

### Data not updating

- Ensure changes committed to `lib/onboarding-data.ts`
- Verify Vercel deployment succeeded
- Have customer hard-refresh page (Ctrl+Shift+R or Cmd+Shift+R)
- Check that customer is authenticated (session may have expired)

## Adding a New Customer

Complete checklist:

1. ✅ Add company data to `onboardingDatabase` in `/src/lib/onboarding-data.ts`
2. ✅ Set `ONBOARDING_PASSWORD_[COMPANY_SLUG]` in Vercel environment variables
3. ✅ Deploy changes to Vercel
4. ✅ Test the URL: `/onboarding/[company-slug]`
5. ✅ Share URL and password with customer securely
6. ✅ Update status regularly as onboarding progresses

## File Structure

```
src/
├── app/
│   ├── api/
│   │   └── onboarding/
│   │       ├── auth/route.ts          # Password authentication
│   │       ├── data/route.ts          # Protected data endpoint
│   │       └── logout/route.ts        # Session logout
│   └── onboarding/
│       └── [companyName]/
│           └── page.tsx               # Dynamic route page
├── components/
│   └── onboarding/
│       ├── OnboardingPortal.tsx       # Main portal container
│       ├── PasswordGate.tsx           # Auth form
│       └── OnboardingTimeline.tsx     # Timeline component
├── lib/
│   ├── onboarding-data.ts            # Server-only data & passwords
│   └── onboarding-session.ts         # Session management
└── types/
    └── onboarding.ts                 # TypeScript types
```

## Future Enhancements

Potential improvements for v2:

- Database backend (PostgreSQL, MongoDB) instead of in-memory Map
- Redis for session storage (serverless-compatible)
- Email notifications when status changes
- Customer notes/feedback submission
- File upload for documents
- Automated status updates from integrations
- Multi-user access (multiple contacts per company)
- Audit log of changes
- Export to PDF functionality

## Support

For questions or issues with the onboarding portal:

- **Technical issues**: Contact your development team
- **Customer access issues**: Verify password and share URL again
- **Feature requests**: Submit to development team

---

**Version**: 1.0
**Last Updated**: December 2024
**Author**: Triple Cities Tech Development Team
