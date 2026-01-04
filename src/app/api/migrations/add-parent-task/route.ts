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

    // Add parentTaskId column for subtask support
    await prisma.$executeRawUnsafe('ALTER TABLE "phase_tasks" ADD COLUMN IF NOT EXISTS "parentTaskId" TEXT')

    // Add foreign key constraint for subtasks
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'phase_tasks_parentTaskId_fkey'
        ) THEN
          ALTER TABLE "phase_tasks" ADD CONSTRAINT "phase_tasks_parentTaskId_fkey"
          FOREIGN KEY ("parentTaskId") REFERENCES "phase_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `)

    return NextResponse.json({
      success: true,
      message: 'parentTaskId column added successfully'
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
