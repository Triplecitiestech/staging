#!/bin/bash

# Script to fix Prisma imports in API routes to use dynamic imports

FILES=(
  "src/app/api/companies/[id]/invite/route.ts"
  "src/app/api/phases/[id]/route.ts"
  "src/app/api/projects/[id]/route.ts"
  "src/app/api/projects/route.ts"
  "src/app/api/tasks/[id]/route.ts"
)

for file in "${FILES[@]}"; do
  echo "Fixing $file..."

  # Remove the module-level Prisma imports and initialization
  sed -i '/^import.*PrismaClient.*from.*@prisma\/client/d' "$file"
  sed -i '/^import.*withAccelerate.*from.*@prisma\/extension-accelerate/d' "$file"
  sed -i '/^const prisma = new PrismaClient/,/\.\$extends(withAccelerate())$/d' "$file"

  # Add export const dynamic = 'force-dynamic' after the last import
  # Find the line number of the last import
  last_import=$(grep -n "^import" "$file" | tail -1 | cut -d: -f1)
  if [ -n "$last_import" ]; then
    sed -i "${last_import}a\\\\nexport const dynamic = 'force-dynamic'" "$file"
  fi

  # Add dynamic import at the beginning of each exported async function
  # This is trickier - we'll add it as the first line after the try block starts
  sed -i '/export async function.*{/,/try {/ {
    /try {/ a\    const { prisma } = await import('\''@/lib/prisma'\'')
  }' "$file"
done

echo "Done! Fixed ${#FILES[@]} files."
