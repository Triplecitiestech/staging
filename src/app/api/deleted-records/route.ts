import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';

/**
 * GET /api/deleted-records — List soft-deleted records
 * POST /api/deleted-records — Soft-delete an entity (with snapshot)
 */
export async function GET(request: NextRequest) {
  try {
    const { prisma } = await import('@/lib/prisma');
    const entityType = request.nextUrl.searchParams.get('entityType');

    interface DeletedWhere {
      restoredAt: null;
      entityType?: string;
    }

    const where: DeletedWhere = { restoredAt: null };
    if (entityType) where.entityType = entityType;

    const records = await prisma.deletedRecord.findMany({
      where,
      orderBy: { deletedAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ records });
  } catch (error) {
    console.error('Failed to fetch deleted records:', error);
    return NextResponse.json({ error: 'Failed to fetch deleted records' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { prisma } = await import('@/lib/prisma');
    const body = await request.json();
    const { entityType, entityId, deletedBy } = body;

    if (!entityType || !entityId || !deletedBy) {
      return NextResponse.json(
        { error: 'Missing required fields: entityType, entityId, deletedBy' },
        { status: 400 }
      );
    }

    // Snapshot the entity and related data before deletion
    let entityData: Prisma.InputJsonValue = {};
    let relatedData: Prisma.InputJsonValue = {};

    if (entityType === 'phase') {
      const phase = await prisma.phase.findUnique({
        where: { id: entityId },
        include: {
          tasks: true,
          comments: true,
          assignments: true,
        },
      });
      if (!phase) {
        return NextResponse.json({ error: 'Phase not found' }, { status: 404 });
      }
      entityData = JSON.parse(JSON.stringify(phase)) as Prisma.InputJsonValue;
      relatedData = JSON.parse(JSON.stringify({
        tasks: phase.tasks,
        comments: phase.comments,
        assignments: phase.assignments,
      })) as Prisma.InputJsonValue;

      // Create archive record first, then delete
      await prisma.deletedRecord.create({
        data: {
          entityType,
          entityId,
          entityData,
          relatedData,
          deletedBy,
        },
      });

      await prisma.phase.delete({ where: { id: entityId } });

    } else if (entityType === 'project') {
      const project = await prisma.project.findUnique({
        where: { id: entityId },
        include: {
          phases: {
            include: {
              tasks: true,
              comments: true,
              assignments: true,
            },
          },
          auditLogs: true,
        },
      });
      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      entityData = JSON.parse(JSON.stringify(project)) as Prisma.InputJsonValue;
      relatedData = JSON.parse(JSON.stringify({
        phases: project.phases,
        auditLogs: project.auditLogs,
      })) as Prisma.InputJsonValue;

      await prisma.deletedRecord.create({
        data: {
          entityType,
          entityId,
          entityData,
          relatedData,
          deletedBy,
        },
      });

      await prisma.project.delete({ where: { id: entityId } });

    } else if (entityType === 'comment') {
      const comment = await prisma.comment.findUnique({
        where: { id: entityId },
      });
      if (!comment) {
        return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
      }
      entityData = JSON.parse(JSON.stringify(comment)) as Prisma.InputJsonValue;

      await prisma.deletedRecord.create({
        data: {
          entityType,
          entityId,
          entityData,
          relatedData: {} as Prisma.InputJsonValue,
          deletedBy,
        },
      });

      await prisma.comment.delete({ where: { id: entityId } });

    } else {
      return NextResponse.json(
        { error: `Unsupported entity type: ${entityType}. Supported: phase, project, comment` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `${entityType} archived and deleted. Can be restored from the deleted records list.`,
    });
  } catch (error) {
    console.error('Failed to soft-delete record:', error);
    return NextResponse.json({ error: 'Failed to delete record' }, { status: 500 });
  }
}
