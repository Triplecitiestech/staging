# Claude Session Preferences & Workflow

**Repository**: Triplecitiestech/staging
**User**: Kurtis (Triple Cities Tech Development Lead)
**Last Updated**: 2026-01-29

This document contains preferences, workflows, and best practices for Claude Code sessions working on this project. Read this file at the start of every new session to understand the user's expectations and working style.

---

## Table of Contents

1. [Session Workflow](#session-workflow)
2. [Git Workflow](#git-workflow)
3. [Code Style & Standards](#code-style--standards)
4. [Common Patterns](#common-patterns)
5. [Deployment Process](#deployment-process)
6. [Testing & Verification](#testing--verification)
7. [Communication Style](#communication-style)
8. [Common Tasks](#common-tasks)
9. [Troubleshooting](#troubleshooting)

---

## Session Workflow

### Starting a New Session

1. **Read Documentation First**
   - Review `/PROJECT_OVERVIEW.md` for general project context
   - Review `/OLUJO_PROJECT.md` if working on Olujo-specific tasks
   - Review this file (`/CLAUDE_SESSION_PREFERENCES.md`) for workflow preferences

2. **Check Current Branch**
   - Run `git status` to understand current branch and state
   - Look for branch naming pattern: `claude/[description]-[sessionId]`

3. **Understand Context**
   - User may provide a summary of previous session work
   - If continuing previous work, ask for clarification on what was completed
   - Review recent commits with `git log --oneline -10`

---

## Git Workflow

### Branch Management

**Branch Naming Convention**:
```
claude/[description]-[sessionId]
```

**Examples**:
- `claude/review-website-issues-01BHnzh8LZ7mPDR2aYGwb8po`
- `claude/olujo-crm-build-02XyZ9w3LK7mNPQ1aHJkc9po`

**Rules**:
- ALWAYS develop on a `claude/*` branch
- NEVER push directly to `main` without explicit permission
- Branch name MUST start with `claude/` and end with session ID
- If branch doesn't exist, create it before starting work

### Commit Practices

**Commit Frequency**: Commit after completing each logical unit of work (e.g., after fixing one issue, adding one feature)

**Commit Message Format**:
```
[Short summary in imperative mood]

[Optional detailed description]
- [Bullet points for multiple changes]
- [Reference files or components affected]
```

**Examples**:
```bash
# Good commit messages
git commit -m "Add YouTube to CSP frame-src for MyGlue video embeds

- Update Content Security Policy to allow YouTube iframes
- Add https://www.youtube.com and https://youtube.com to frame-src
- Fixes video blocking issue on /myglue page"

git commit -m "Replace Jeff with Kellan in Olujo project plan"

git commit -m "Fix card spacing on livechat page feature cards

- Increase padding from p-6 to p-8
- Increase gap from gap-6 to gap-8"
```

### Push Strategy

**ALWAYS use**:
```bash
git push -u origin [branch-name]
```

**Retry Logic for Network Failures**:
- If push fails due to network errors, retry up to 4 times
- Use exponential backoff: 2s, 4s, 8s, 16s
- Example: try push → wait 2s if failed → try again → wait 4s if failed → etc.

**CRITICAL**: Branch must start with `claude/` and end with session ID, otherwise push will fail with 403

---

## Code Style & Standards

### TypeScript

- **Strict Mode**: Enabled - no `any` types allowed
- **Type Safety**: Always define proper interfaces/types
- **ESLint**: No warnings or errors allowed in build

**Bad**:
```typescript
const win = window as any
```

**Good**:
```typescript
interface ChatGenieWindow extends Window {
  chatgenie?: {
    default: {
      messenger: () => {
        show?: () => void;
      };
    };
  };
}
const win = window as ChatGenieWindow
```

### React/Next.js

- **Server Components by Default**: Use `'use client'` only when needed
- **File Organization**: Group related files in feature folders
- **Component Naming**: PascalCase for components, camelCase for utilities
- **Props**: Define explicit interfaces for component props

### Styling (Tailwind CSS)

- **Utility Classes**: Use Tailwind utilities, avoid custom CSS when possible
- **Responsive Design**: Mobile-first approach (base → `md:` → `lg:`)
- **Color Scheme**: Cyan/blue/purple gradients for primary actions, dark theme default
- **Spacing**: Use standard Tailwind spacing scale (4, 6, 8, 12, 16, etc.)

### Database (Prisma)

- **Migrations**: NEVER run `prisma migrate` on production
- **Production Changes**: Create API migration endpoints instead
- **Schema Changes**: Test on preview deployments first
- **Soft Deletes**: No hard deletes - use status fields or `deletedAt` timestamps

---

## Common Patterns

### Page Structure

Every public page should follow this pattern:

```typescript
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import PageHero from '@/components/shared/PageHero'
import Breadcrumbs from '@/components/seo/Breadcrumbs'

export default function PageName() {
  return (
    <main>
      <Header />
      <Breadcrumbs />

      <PageHero
        title="Page Title"
        subtitle="Page subtitle"
        textAlign="center"
        verticalPosition="center"
        imageBackground="/herobg.webp"
        showGradientTransition={false}
        titleClassName="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl"
      />

      {/* Page content sections */}

      <Footer />
    </main>
  )
}
```

### API Route Structure

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    // Validation
    // Business logic
    // Database operations

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json(
      { success: false, error: 'Error message' },
      { status: 500 }
    )
  }
}
```

### Responsive Grid Layouts

```typescript
// Single column on mobile, 2 on tablet, 3 on desktop
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

// Single column on mobile, 2 on tablet, 4 on desktop
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
```

---

## Deployment Process

### Automatic Deployment (Vercel)

1. **Preview Deployments**: Every push to any branch creates a preview
2. **Production Deployments**: Pushes to `main` auto-deploy to production
3. **Build Checks**: ESLint must pass, TypeScript must compile
4. **Environment Variables**: Managed in Vercel dashboard

### Manual Verification

After pushing changes, the user expects you to:

1. **Verify the push succeeded**
   ```bash
   git status
   git log --oneline -3
   ```

2. **Mention the deployment**
   > "Changes committed and pushed to `claude/[branch]`. Vercel will deploy automatically."

3. **Provide context on what was changed**
   > "Updated 3 files: [file1], [file2], [file3]. Changes include: [summary]."

---

## Testing & Verification

### Before Committing

✓ **Read files before editing** - Always use `Read` tool first
✓ **Check syntax** - Ensure no TypeScript/ESLint errors
✓ **Test locally if possible** - Run `npm run build` to catch errors
✓ **Review changes** - Use `git diff` to verify modifications

### After Committing

✓ **Confirm push** - Verify push succeeded with git status
✓ **Check build logs** - Watch Vercel deployment logs if accessible
✓ **Test on preview** - Suggest user test on preview deployment URL

---

## Communication Style

### Preferred Communication

- **Concise**: Short, direct responses
- **Action-Oriented**: Focus on what you're doing, not extensive explanations
- **Proactive**: Suggest improvements when you spot issues
- **Honest**: Admit when you don't know something or need clarification

### Response Format

**Good Example**:
> I'll update the CSP to allow YouTube embeds.
>
> [performs edit]
>
> Done! Updated `next.config.js` to add YouTube to the `frame-src` directive. Changes committed and pushed to your branch.

**Bad Example**:
> Thank you for bringing this to my attention! I can see that the Content Security Policy is blocking YouTube iframes. This is a common issue when embedding external content. Let me walk you through what I'm going to do step by step... [excessive explanation]

### When to Ask Questions

**DO ask when**:
- Requirements are unclear or ambiguous
- Multiple valid approaches exist and you need direction
- Making irreversible changes (like data deletion)
- User preferences conflict with best practices

**DON'T ask when**:
- It's a standard implementation decision
- Best practices clearly dictate the approach
- Previous context already provided the answer
- It's a minor styling or formatting choice

---

## Common Tasks

### Adding a New Page

1. Create file: `/src/app/[route]/page.tsx`
2. Add Header, Footer, Breadcrumbs, PageHero
3. Implement page content
4. Update navigation if needed
5. Commit with message: "Add [page name] page"

### Updating Content Security Policy

1. Edit `/next.config.js` → `headers()` function
2. Update BOTH dev and production CSP arrays
3. Test thoroughly (CSP errors break functionality)
4. Commit with message: "Add [domain] to CSP [directive]"

### Fixing TypeScript Errors

1. Read the error message carefully
2. Identify the file and line number
3. Create proper type/interface instead of using `any`
4. Commit with message: "Fix TypeScript error in [file]"

### Database Schema Changes

1. Edit `/prisma/schema.prisma`
2. Create migration locally: `npx prisma migrate dev --name [description]`
3. For production: Create API endpoint in `/api/[feature]/setup/migrate`
4. Commit schema + migration together

### Replacing Text Across Files

1. Use `Grep` to find all occurrences
2. Use `Edit` with `replace_all: true` for each file
3. Review changes with `git diff`
4. Commit with message: "Replace [old] with [new] in [context]"

---

## Troubleshooting

### Build Failures

**Error**: ESLint errors blocking build
**Solution**: Fix all linting errors, never disable ESLint rules

**Error**: TypeScript compilation errors
**Solution**: Add proper types, never use `any` or `@ts-ignore`

**Error**: Import path errors
**Solution**: Use `@/` alias for absolute imports from `/src`

### Git Push Failures

**Error**: 403 Forbidden
**Solution**: Check branch name starts with `claude/` and ends with session ID

**Error**: Network timeout
**Solution**: Retry with exponential backoff (2s, 4s, 8s, 16s)

**Error**: Rejected (non-fast-forward)
**Solution**: Pull latest changes first: `git pull origin [branch]`

### CSP Issues

**Error**: Content blocked by CSP
**Solution**: Add domain to appropriate directive in `next.config.js`

**Error**: Styles not loading
**Solution**: Check `style-src` directive allows necessary sources

**Error**: Scripts blocked
**Solution**: Check `script-src` and ensure `'unsafe-inline'` if needed

---

## Project-Specific Preferences

### Auto-Save & Deploy

✓ **Always commit and push** after completing each task
✓ **Use descriptive commit messages** with bullet points for multiple changes
✓ **Verify pushes succeeded** with git status after pushing
✓ **Mention Vercel deployment** in response to user

### Code Quality

✓ **Read before editing** - Always use Read tool first
✓ **No `any` types** - Define proper interfaces
✓ **No unused imports** - Clean up after yourself
✓ **No console.logs in production** - Remove debugging code

### Work Verification

✓ **Check your work** - Review diffs before committing
✓ **Test building** - Run `npm run build` locally if possible
✓ **Confirm deployment** - Mention that Vercel will auto-deploy

---

## Session Continuity

### Between Sessions

When a new session starts:

1. **Check for continuation** - Is this continuing previous work?
2. **Read recent commits** - Understand what was done last
3. **Check branch status** - Are there uncommitted changes?
4. **Review documentation** - Has anything changed in docs?

### Session Handoff

When ending a session (if user requests):

1. **Commit all work** - Don't leave uncommitted changes
2. **Push to remote** - Ensure all commits are pushed
3. **Summarize what was done** - List completed tasks
4. **Note any pending work** - What's left to do?

---

## Important Reminders

🔴 **NEVER**:
- Use `any` types in TypeScript
- Push directly to `main` without permission
- Hard delete database records
- Skip reading files before editing
- Leave uncommitted changes

✅ **ALWAYS**:
- Read files before editing
- Commit and push after completing tasks
- Use proper TypeScript types
- Verify git push succeeded
- Follow the branch naming convention
- Check for CSP issues when adding third-party content

---

## Quick Reference Commands

```bash
# Check current status
git status
git log --oneline -5

# Create and switch to new branch
git checkout -b claude/feature-name-sessionId

# Stage, commit, and push
git add .
git commit -m "Description of changes"
git push -u origin claude/feature-name-sessionId

# View recent changes
git diff
git show HEAD

# Check Prisma schema
npx prisma studio
npx prisma db pull
npx prisma generate
```

---

## User Feedback Patterns

The user values:
- ✓ Speed and efficiency
- ✓ Proactive problem-solving
- ✓ Clear, concise communication
- ✓ Following through on all tasks
- ✓ Remembering context within sessions

The user dislikes:
- ❌ Forgetting previously discussed items
- ❌ Verbose explanations
- ❌ Asking obvious questions
- ❌ Incomplete implementations
- ❌ Slow, forgetful sessions

---

**Remember**: This project is complex and growing. Always read this file at the start of a new session to ensure continuity and quality. The user expects you to be proactive, thorough, and efficient.

For Olujo-specific work, also read `/OLUJO_PROJECT.md` before starting.
For general project context, refer to `/PROJECT_OVERVIEW.md`.

---

**Last Updated**: 2026-01-29
**Maintained By**: Kurtis (Triple Cities Tech) via Claude Code sessions
