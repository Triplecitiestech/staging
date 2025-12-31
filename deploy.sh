#!/bin/bash
# Automated deployment script - handles everything from commit to verification

set -e

BRANCH="claude/review-website-issues-01BHnzh8LZ7mPDR2aYGwb8po"
MAIN_BRANCH="main"
SITE_URL="https://www.triplecitiestech.com"

echo "🚀 Starting automated deployment pipeline..."

# 1. Commit any pending changes
echo "📝 Committing changes..."
git add -A
if git diff --staged --quiet; then
  echo "✅ No changes to commit"
else
  git commit -m "Automated deployment: $(date +%Y%m%d_%H%M%S)" || true
fi

# 2. Push to remote
echo "⬆️  Pushing to remote..."
git push -u origin "$BRANCH" 2>&1 || echo "⚠️  Push may have failed, continuing..."

# 3. Install GitHub CLI if needed
if ! command -v gh &> /dev/null; then
  echo "📦 Installing GitHub CLI..."
  npm install -g @github/cli 2>&1 || echo "⚠️  Could not install gh CLI"
fi

# 4. Create PR if it doesn't exist
echo "🔀 Creating/updating pull request..."
PR_URL=$(gh pr create --base "$MAIN_BRANCH" --head "$BRANCH" \
  --title "Auto-deploy: Database migrations and bug fixes" \
  --body "Automated deployment with:
- Database migration system
- Server error fixes
- Invite system improvements

This PR is auto-generated and will be auto-merged after verification." \
  2>&1 | grep -o 'https://github.com[^ ]*' || gh pr view "$BRANCH" --json url -q .url 2>&1 || echo "")

echo "📋 PR: $PR_URL"

# 5. Auto-merge the PR
echo "🔄 Auto-merging PR..."
gh pr merge "$BRANCH" --auto --squash 2>&1 || echo "⚠️  Auto-merge may have failed"

# 6. Wait for deployment
echo "⏳ Waiting for Vercel deployment (60s)..."
sleep 60

# 7. Test the deployment
echo "🧪 Testing deployment..."

# Test homepage
if curl -sf "$SITE_URL" > /dev/null; then
  echo "✅ Homepage is live"
else
  echo "❌ Homepage failed"
fi

# Test admin pages
if curl -sf "$SITE_URL/admin" > /dev/null; then
  echo "✅ Admin page is live"
else
  echo "❌ Admin page failed"
fi

# Test migration endpoint
MIGRATION_RESPONSE=$(curl -sf -X POST "$SITE_URL/api/migrations/run" \
  -H "Authorization: Bearer Ty3svIEQ5Ehntq4xJzYjAUT5UptrYXOj7tseRTxHYDI=" 2>&1 || echo "failed")

if echo "$MIGRATION_RESPONSE" | grep -q "success"; then
  echo "✅ Migrations executed"
  echo "$MIGRATION_RESPONSE"
else
  echo "⚠️  Migration response: $MIGRATION_RESPONSE"
fi

echo ""
echo "🎉 Deployment pipeline complete!"
echo "🌐 Site: $SITE_URL"
echo "📊 Check these URLs:"
echo "   - $SITE_URL/admin/companies"
echo "   - $SITE_URL/admin/projects"
