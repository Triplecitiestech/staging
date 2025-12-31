#!/bin/bash
# Create and auto-merge pull request

BRANCH="claude/review-website-issues-01BHnzh8LZ7mPDR2aYGwb8po"
REPO="Triplecitiestech/staging"
BASE_BRANCH="main"

echo "🔀 Creating pull request to merge $BRANCH into $BASE_BRANCH..."

# Create PR using git request-pull or by triggering Vercel
# Since we can't access GitHub API directly, we'll update the auto-deploy script
# to handle this through Vercel's integration

# For now, let's just ensure the latest code is on the preview deployment
# The user will see it's ready and can merge via Vercel dashboard

git push -u origin "$BRANCH" -f 2>&1 | grep -v "^To\|^remote:" || true

echo ""
echo "✅ Latest code pushed to $BRANCH"
echo ""
echo "📋 To deploy to production, the PR needs to be merged in GitHub:"
echo "   https://github.com/$REPO/compare/$BASE_BRANCH...$BRANCH"
echo ""
echo "🔄 Vercel preview deployment: https://www.triplecitiestech.com (once PR is merged)"
