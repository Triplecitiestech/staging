import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { prisma } = await import("@/lib/prisma")

    // Run the migration to remove foreign key constraints - one at a time
    await prisma.$executeRawUnsafe('ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_createdBy_fkey"')
    await prisma.$executeRawUnsafe('ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_lastModifiedBy_fkey"')
    await prisma.$executeRawUnsafe('ALTER TABLE "project_templates" DROP CONSTRAINT IF EXISTS "project_templates_createdBy_fkey"')
    await prisma.$executeRawUnsafe('ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_staffEmail_fkey"')

    return NextResponse.json({
      success: true,
      message: 'Foreign key constraints removed successfully'
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    console.error('Migration error:', error)
    return NextResponse.json({
      error: 'Migration failed',
      details: err.message || 'Unknown error',
      fullError: JSON.stringify(error, null, 2)
    }, { status: 500 })
  }
}
