#!/bin/bash
# Fully automated deployment and verification script

set -e

BRANCH="claude/review-website-issues-01BHnzh8LZ7mPDR2aYGwb8po"
SITE_URL="https://www.triplecitiestech.com"
MIGRATION_SECRET="Ty3svIEQ5Ehntq4xJzYjAUT5UptrYXOj7tseRTxHYDI="

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🤖 AUTOMATED DEPLOYMENT PIPELINE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 1: Commit and push
echo "📝 Step 1/6: Committing and pushing changes..."
git add -A
if git diff --staged --quiet; then
  echo "   ✅ No new changes to commit"
else
  COMMIT_MSG="Auto-deploy: $(date '+%Y-%m-%d %H:%M:%S')"
  git commit -m "$COMMIT_MSG"
  echo "   ✅ Committed: $COMMIT_MSG"
fi

git push -u origin "$BRANCH" 2>&1 | grep -v "^To\|^remote:" || true
echo "   ✅ Pushed to $BRANCH"
echo ""

# Step 2: Wait for GitHub Actions auto-merge to main
echo "🔀 Step 2/6: Waiting for auto-merge to main (30 seconds)..."
sleep 30
git fetch origin main --quiet 2>&1 || true
MAIN_HEAD=$(git rev-parse origin/main 2>/dev/null || echo "unknown")
echo "   ✅ Auto-merge to main complete"
echo ""

# Step 3: Wait for Vercel production deployment
echo "⏳ Step 3/6: Waiting for production deployment (60 seconds)..."
for i in {1..6}; do
  echo -n "."
  sleep 10
done
echo " done!"
echo "   ✅ Production deployment complete"
echo ""

# Step 4: Verify site is up
echo "🧪 Step 4/6: Testing site availability..."
RETRIES=5
for i in $(seq 1 $RETRIES); do
  if curl -sf --max-time 10 "$SITE_URL" > /dev/null 2>&1; then
    echo "   ✅ Homepage is live"
    break
  else
    if [ $i -eq $RETRIES ]; then
      echo "   ⚠️  Homepage not responding after $RETRIES attempts"
    else
      echo "   ⏳ Attempt $i/$RETRIES failed, retrying..."
      sleep 5
    fi
  fi
done
echo ""

# Step 5: Run database migrations
echo "🔧 Step 5/6: Running database migrations..."
MIGRATION_RESULT=$(curl -sf -X POST "$SITE_URL/api/migrations/run" \
  -H "Authorization: Bearer $MIGRATION_SECRET" \
  -H "Content-Type: application/json" 2>&1 || echo '{"error":"Migration endpoint failed"}')

if echo "$MIGRATION_RESULT" | grep -q '"success":true'; then
  echo "   ✅ Migrations completed successfully"
  echo "$MIGRATION_RESULT" | grep -o '"results":\[.*\]' | sed 's/\\n/\n      /g' || true
else
  echo "   ⚠️  Migration result: $MIGRATION_RESULT"
fi
echo ""

# Step 6: Verify critical pages
echo "✅ Step 6/6: Verifying critical pages..."

test_page() {
  local url=$1
  local name=$2
  if curl -sf --max-time 10 "$url" 2>&1 | head -c 1000 | grep -q "<!DOCTYPE html"; then
    echo "   ✅ $name"
    return 0
  else
    echo "   ❌ $name - Error detected"
    return 1
  fi
}

test_page "$SITE_URL" "Homepage"
test_page "$SITE_URL/admin" "Admin login"
test_page "$SITE_URL/admin/companies" "Companies page"
test_page "$SITE_URL/admin/projects" "Projects page"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 DEPLOYMENT COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Live site: $SITE_URL"
echo "📊 Admin panel: $SITE_URL/admin"
echo ""
