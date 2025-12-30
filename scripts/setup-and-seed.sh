#!/bin/bash
# Complete Database Setup Script
# Run this once to create tables and populate initial data

set -e

echo "🚀 Triple Cities Tech - Database Setup"
echo "========================================"
echo ""

# Load environment variables
if [ -f .env.local ]; then
    export $(cat .env.local | grep -v '^#' | xargs)
    echo "✅ Environment variables loaded from .env.local"
else
    echo "❌ Error: .env.local file not found"
    exit 1
fi

# Check required environment variables
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL not set in .env.local"
    exit 1
fi

echo ""
echo "Step 1: Installing dependencies..."
npm install

echo ""
echo "Step 2: Creating database tables..."
npx prisma db push

echo ""
echo "Step 3: Seeding initial data..."
npm run seed

echo ""
echo "✨ Setup complete!"
echo ""
echo "Database is ready with:"
echo "  • 1 admin staff user"
echo "  • 2 companies (Ecospect, All Spec Finishing)"
echo "  • 3 project templates (M365 Migration, Client Onboarding, TCT Fortress)"
echo ""
echo "Next steps:"
echo "  1. Run 'npm run dev' to start development server"
echo "  2. Visit http://localhost:3000/admin to access admin dashboard"
echo "  3. Configure Microsoft OAuth in .env.local (AZURE_AD_* variables)"
echo ""
