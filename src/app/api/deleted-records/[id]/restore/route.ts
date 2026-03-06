import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/deleted-records/[id]/restore — Restore a soft-deleted record
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { prisma } = await import('@/lib/prisma');
    const { id } = await params;
    const body = await request.json();
    const { restoredBy } = body;

    if (!restoredBy) {
      return NextResponse.json({ error: 'restoredBy is required' }, { status: 400 });
    }

    const record = await prisma.deletedRecord.findUnique({
      where: { id },
    });

    if (!record) {
      return NextResponse.json({ error: 'Deleted record not found' }, { status: 404 });
    }

    if (record.restoredAt) {
      return NextResponse.json({ error: 'Record has already been restored' }, { status: 400 });
    }

    const entityData = record.entityData as Record<string, unknown>;
    const relatedData = (record.relatedData || {}) as Record<string, unknown>;

    if (record.entityType === 'comment') {
      await prisma.comment.create({
        data: {
          id: record.entityId,
          phaseId: entityData.phaseId as string | null,
          taskId: entityData.taskId as string | null,
          content: entityData.content as string,
          isInternal: entityData.isInternal as boolean,
          authorEmail: entityData.authorEmail as string,
          authorName: entityData.authorName as string,
          createdAt: new Date(entityData.createdAt as string),
          updatedAt: new Date(),
        },
      });
    } else if (record.entityType === 'phase') {
      // Restore phase (without relations — they cascade-deleted)
      await prisma.phase.create({
        data: {
          id: record.entityId,
          projectId: entityData.projectId as string,
          title: entityData.title as string,
          description: (entityData.description as string) || null,
          status: entityData.status as 'NOT_STARTED' | 'SCHEDULED' | 'WAITING_ON_CUSTOMER' | 'IN_PROGRESS' | 'REQUIRES_CUSTOMER_COORDINATION' | 'DISCUSSED' | 'COMPLETE',
          orderIndex: entityData.orderIndex as number,
          customerNotes: (entityData.customerNotes as string) || null,
          internalNotes: (entityData.internalNotes as string) || null,
          isVisibleToCustomer: (entityData.isVisibleToCustomer as boolean) ?? true,
          createdAt: new Date(entityData.createdAt as string),
          updatedAt: new Date(),
        },
      });

      // Restore tasks
      const tasks = (relatedData.tasks || []) as Array<Record<string, unknown>>;
      for (const task of tasks) {
        await prisma.phaseTask.create({
          data: {
            id: task.id as string,
            phaseId: record.entityId,
            taskText: task.taskText as string,
            completed: task.completed as boolean,
            orderIndex: task.orderIndex as number,
            status: (task.status as 'NOT_STARTED') || 'NOT_STARTED',
            isVisibleToCustomer: (task.isVisibleToCustomer as boolean) ?? true,
            priority: (task.priority as 'MEDIUM') || 'MEDIUM',
            createdAt: new Date(task.createdAt as string),
            updatedAt: new Date(),
          },
        });
      }
    } else if (record.entityType === 'project') {
      // Restore project only (phases must be restored separately if needed)
      await prisma.project.create({
        data: {
          id: record.entityId,
          companyId: entityData.companyId as string,
          projectType: entityData.projectType as 'ONBOARDING' | 'M365_MIGRATION' | 'FORTRESS' | 'CUSTOM',
          title: entityData.title as string,
          slug: entityData.slug as string,
          status: entityData.status as 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED',
          createdBy: entityData.createdBy as string,
          lastModifiedBy: entityData.lastModifiedBy as string,
          createdAt: new Date(entityData.createdAt as string),
          updatedAt: new Date(),
        },
      });
    } else {
      return NextResponse.json(
        { error: `Restore not supported for entity type: ${record.entityType}` },
        { status: 400 }
      );
    }

    // Mark as restored
    await prisma.deletedRecord.update({
      where: { id },
      data: {
        restoredAt: new Date(),
        restoredBy,
      },
    });

    return NextResponse.json({
      success: true,
      message: `${record.entityType} restored successfully`,
    });
  } catch (error) {
    console.error('Failed to restore record:', error);
    return NextResponse.json({ error: 'Failed to restore record' }, { status: 500 });
  }
}
