import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Migration endpoint to add missing phase_tasks fields
 * GET /api/projects/setup/migrate
 */
export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma');

    console.log('🔧 Running project migration: Adding missing phase_tasks fields...');

    // Create enums if they don't exist
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "TaskStatus" AS ENUM (
          'NOT_STARTED',
          'ASSIGNED',
          'WORK_IN_PROGRESS',
          'WAITING_ON_VENDOR',
          'WAITING_ON_CLIENT',
          'NEEDS_REVIEW',
          'STUCK',
          'INFORMATION_RECEIVED',
          'REVIEWED_AND_DONE',
          'ITG_DOCUMENTED',
          'NOT_APPLICABLE'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "PhaseOwner" AS ENUM ('TCT', 'CUSTOMER', 'BOTH');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add missing columns to phase_tasks
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "phase_tasks"
        ADD COLUMN IF NOT EXISTS "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
        ADD COLUMN IF NOT EXISTS "isVisibleToCustomer" BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "assignedTo" TEXT,
        ADD COLUMN IF NOT EXISTS "assignedToName" TEXT,
        ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
        ADD COLUMN IF NOT EXISTS "responsibleParty" "PhaseOwner";
    `);

    console.log('✅ Migration completed successfully!');

    return NextResponse.json({
      success: true,
      message: 'Missing phase_tasks fields added successfully!',
      fields: [
        'status',
        'isVisibleToCustomer',
        'assignedTo',
        'assignedToName',
        'dueDate',
        'priority',
        'responsibleParty'
      ]
    });
  } catch (error) {
    console.error('❌ Migration failed:', error);

    return NextResponse.json(
      {
        error: 'Migration failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
