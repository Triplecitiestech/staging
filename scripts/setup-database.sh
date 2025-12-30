#!/bin/bash
# Database Setup Script
# Run this once to create all database tables

set -e

echo "🔄 Setting up database tables..."
echo ""

# Load environment variables
if [ -f .env.local ]; then
    export $(cat .env.local | grep -v '^#' | xargs)
fi

# Run Prisma DB Push
echo "📊 Creating database tables with Prisma..."
npx prisma db push

echo ""
echo "✅ Database setup complete!"
echo ""
echo "All tables created:"
echo "  - staff_users"
echo "  - companies"
echo "  - projects"
echo "  - phases"
echo "  - phase_tasks"
echo "  - audit_logs"
echo "  - project_templates"
echo ""
echo "Next step: Run 'npm run seed' to populate initial data"
