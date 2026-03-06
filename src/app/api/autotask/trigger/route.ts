import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  AutotaskClient,
  AutotaskCompany,
  AutotaskContact,
  AutotaskProject,
  AutotaskProjectPhase,
  AutotaskTask,
  mapAtProjectStatus,
  mapAtTaskStatus,
  mapAtTaskPriority,
  generateSlug,
} from '@/lib/autotask';
import { ProjectStatus, PhaseStatus, TaskStatus, Priority } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SYSTEM_EMAIL = 'autotask-sync@triplecitiestech.com';

/**
 * Manual Autotask sync trigger - uses MIGRATION_SECRET as auth via query param.
 * This lets you trigger a sync from a browser URL without needing curl/Postman.
 *
 * GET /api/autotask/trigger?secret=YOUR_MIGRATION_SECRET
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  const expectedSecret = process.env.MIGRATION_SECRET;

  if (!secret || !expectedSecret || secret !== expectedSecret) {
    return NextResponse.json(
      { error: 'Unauthorized. Add ?secret=YOUR_MIGRATION_SECRET to the URL.' },
      { status: 401 }
    );
  }

  const startTime = Date.now();
  const errors: string[] = [];
  const stats = {
    companiesCreated: 0,
    companiesUpdated: 0,
    projectsCreated: 0,
    projectsUpdated: 0,
    contactsCreated: 0,
    contactsUpdated: 0,
    tasksCreated: 0,
    tasksUpdated: 0,
  };

  try {
    if (
      !process.env.AUTOTASK_API_USERNAME ||
      !process.env.AUTOTASK_API_SECRET ||
      !process.env.AUTOTASK_API_INTEGRATION_CODE ||
      !process.env.AUTOTASK_API_BASE_URL
    ) {
      return NextResponse.json(
        { error: 'Autotask API credentials not configured in Vercel env vars' },
        { status: 503 }
      );
    }

    const client = new AutotaskClient();

    // Check last successful sync
    const lastSync = await prisma.autotaskSyncLog.findFirst({
      where: { status: 'success' },
      orderBy: { startedAt: 'desc' },
    });

    const isIncremental = !!lastSync?.completedAt;
    const syncSince = lastSync?.completedAt ?? undefined;

    // 1. Sync Companies
    const atCompanies = isIncremental && syncSince
      ? await client.getCompaniesModifiedSince(syncSince)
      : await client.getActiveCompanies();

    for (const atCompany of atCompanies) {
      try {
        const result = await syncCompany(atCompany);
        if (result.created) stats.companiesCreated++;
        else stats.companiesUpdated++;

        const atContacts = await client.getContactsByCompany(atCompany.id);
        for (const atContact of atContacts) {
          try {
            const contactResult = await syncContact(atContact, result.companyId);
            if (contactResult.created) stats.contactsCreated++;
            else stats.contactsUpdated++;
          } catch (err) {
            errors.push(`Contact ${atContact.id}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } catch (err) {
        errors.push(`Company ${atCompany.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 2. Sync Projects
    const atProjects = isIncremental && syncSince
      ? await client.getProjectsModifiedSince(syncSince)
      : await client.getAllProjects();

    for (const atProject of atProjects) {
      try {
        let company = await prisma.company.findFirst({
          where: { autotaskCompanyId: String(atProject.companyID) },
        });

        if (!company) {
          try {
            const atCompany = await client.getCompany(atProject.companyID);
            const companyResult = await syncCompany(atCompany);
            if (companyResult.created) stats.companiesCreated++;
            else stats.companiesUpdated++;
            company = await prisma.company.findUnique({ where: { id: companyResult.companyId } });
          } catch (err) {
            errors.push(`Project ${atProject.id} - missing company ${atProject.companyID}: ${err instanceof Error ? err.message : String(err)}`);
            continue;
          }
        }

        if (!company) continue;

        const projectResult = await syncProject(atProject, company.id, client);
        if (projectResult.created) stats.projectsCreated++;
        else stats.projectsUpdated++;
        stats.tasksCreated += projectResult.tasksCreated;
        stats.tasksUpdated += projectResult.tasksUpdated;
      } catch (err) {
        errors.push(`Project ${atProject.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const duration = Date.now() - startTime;
    const syncStatus = errors.length === 0 ? 'success' : 'partial';

    await prisma.autotaskSyncLog.create({
      data: {
        syncType: isIncremental ? 'incremental' : 'full',
        status: syncStatus,
        ...stats,
        errors: errors.length > 0 ? JSON.stringify(errors) : null,
        durationMs: duration,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      syncType: isIncremental ? 'incremental' : 'full',
      stats,
      errors: errors.length > 0 ? errors : undefined,
      durationMs: duration,
    });
  } catch (err) {
    const duration = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    try {
      await prisma.autotaskSyncLog.create({
        data: {
          syncType: 'unknown',
          status: 'failed',
          ...stats,
          errors: JSON.stringify([errorMessage, ...errors]),
          durationMs: duration,
          completedAt: new Date(),
        },
      });
    } catch {
      // Don't fail if logging fails
    }

    return NextResponse.json(
      { error: 'Sync failed', message: errorMessage, errors },
      { status: 500 }
    );
  }
}

// ============================================
// SYNC HELPERS (same logic as cron endpoint)
// ============================================

async function syncCompany(
  atCompany: AutotaskCompany
): Promise<{ companyId: string; created: boolean }> {
  const atId = String(atCompany.id);

  const existing = await prisma.company.findFirst({
    where: { autotaskCompanyId: atId },
  });

  if (existing) {
    if (existing.displayName !== atCompany.companyName) {
      await prisma.company.update({
        where: { id: existing.id },
        data: { displayName: atCompany.companyName, autotaskLastSync: new Date() },
      });
    } else {
      await prisma.company.update({
        where: { id: existing.id },
        data: { autotaskLastSync: new Date() },
      });
    }
    return { companyId: existing.id, created: false };
  }

  let slug = generateSlug(atCompany.companyName);
  const slugExists = await prisma.company.findFirst({ where: { slug } });
  if (slugExists) slug = `${slug}-${atId}`;

  const randomPassword = crypto.randomBytes(16).toString('hex');
  const passwordHash = await bcrypt.hash(randomPassword, 10);

  const newCompany = await prisma.company.create({
    data: {
      slug,
      displayName: atCompany.companyName,
      passwordHash,
      autotaskCompanyId: atId,
      autotaskLastSync: new Date(),
    },
  });

  return { companyId: newCompany.id, created: true };
}

async function syncContact(
  atContact: AutotaskContact,
  companyId: string
): Promise<{ created: boolean }> {
  const atId = String(atContact.id);
  const name = `${atContact.firstName} ${atContact.lastName}`.trim();
  const email = atContact.emailAddress || `contact-${atId}@placeholder.local`;

  const existing = await prisma.companyContact.findFirst({
    where: { autotaskContactId: atId },
  });

  if (existing) {
    await prisma.companyContact.update({
      where: { id: existing.id },
      data: {
        name,
        email,
        title: atContact.title || existing.title,
        phone: atContact.mobilePhone || atContact.phone || existing.phone,
        phoneType: atContact.mobilePhone ? 'MOBILE' : atContact.phone ? 'WORK' : existing.phoneType,
      },
    });
    return { created: false };
  }

  const emailExists = await prisma.companyContact.findFirst({
    where: { companyId, email },
  });

  if (emailExists) {
    await prisma.companyContact.update({
      where: { id: emailExists.id },
      data: {
        name,
        title: atContact.title || emailExists.title,
        phone: atContact.mobilePhone || atContact.phone || emailExists.phone,
        autotaskContactId: atId,
      },
    });
    return { created: false };
  }

  await prisma.companyContact.create({
    data: {
      companyId,
      name,
      email,
      title: atContact.title,
      phone: atContact.mobilePhone || atContact.phone,
      phoneType: atContact.mobilePhone ? 'MOBILE' : atContact.phone ? 'WORK' : undefined,
      autotaskContactId: atId,
    },
  });

  return { created: true };
}

async function syncProject(
  atProject: AutotaskProject,
  companyId: string,
  client: AutotaskClient
): Promise<{ created: boolean; tasksCreated: number; tasksUpdated: number }> {
  const atId = String(atProject.id);

  const existing = await prisma.project.findFirst({
    where: { autotaskProjectId: atId },
  });

  const status = mapAtProjectStatus(atProject.status) as ProjectStatus;

  if (existing) {
    await prisma.project.update({
      where: { id: existing.id },
      data: {
        title: atProject.projectName,
        status,
        startedAt: atProject.startDateTime ? new Date(atProject.startDateTime) : existing.startedAt,
        completedAt: status === 'COMPLETED' && atProject.endDateTime
          ? new Date(atProject.endDateTime)
          : existing.completedAt,
        lastModifiedBy: SYSTEM_EMAIL,
        autotaskLastSync: new Date(),
      },
    });

    const taskStats = await syncProjectPhasesAndTasks(existing.id, atProject.id, client);
    return { created: false, tasksCreated: taskStats.tasksCreated, tasksUpdated: taskStats.tasksUpdated };
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { displayName: true },
  });

  let slug = generateSlug(`${company?.displayName || 'company'}-${atProject.projectName}`);
  const slugExists = await prisma.project.findFirst({ where: { slug } });
  if (slugExists) slug = `${slug}-at${atId}`;

  const newProject = await prisma.project.create({
    data: {
      companyId,
      projectType: 'CUSTOM',
      title: atProject.projectName,
      slug,
      status,
      startedAt: atProject.startDateTime ? new Date(atProject.startDateTime) : null,
      completedAt: status === 'COMPLETED' && atProject.endDateTime
        ? new Date(atProject.endDateTime) : null,
      estimatedDuration: atProject.estimatedHours ? `${atProject.estimatedHours} hours` : null,
      createdBy: SYSTEM_EMAIL,
      lastModifiedBy: SYSTEM_EMAIL,
      autotaskProjectId: atId,
      autotaskLastSync: new Date(),
    },
  });

  const taskStats = await syncProjectPhasesAndTasks(newProject.id, atProject.id, client);
  return { created: true, tasksCreated: taskStats.tasksCreated, tasksUpdated: taskStats.tasksUpdated };
}

async function syncProjectPhasesAndTasks(
  projectId: string,
  atProjectId: number,
  client: AutotaskClient
): Promise<{ tasksCreated: number; tasksUpdated: number }> {
  let tasksCreated = 0;
  let tasksUpdated = 0;

  let atPhases: AutotaskProjectPhase[] = [];
  try { atPhases = await client.getProjectPhases(atProjectId); } catch { /* no phases */ }

  let atTasks: AutotaskTask[] = [];
  try { atTasks = await client.getProjectTasks(atProjectId); } catch { /* no tasks */ }

  const phaseIdMap = new Map<number, string>();

  if (atPhases.length === 0 && atTasks.length > 0) {
    const defaultPhase = await getOrCreateDefaultPhase(projectId);
    for (const atTask of atTasks) {
      const result = await syncTask(atTask, defaultPhase.id);
      if (result.created) tasksCreated++;
      else tasksUpdated++;
    }
    return { tasksCreated, tasksUpdated };
  }

  for (let i = 0; i < atPhases.length; i++) {
    const localPhaseId = await syncPhase(atPhases[i], projectId, i);
    phaseIdMap.set(atPhases[i].id, localPhaseId);
  }

  for (const atTask of atTasks) {
    const localPhaseId = atTask.phaseID ? phaseIdMap.get(atTask.phaseID) : undefined;
    const phaseId = localPhaseId || (await getOrCreateDefaultPhase(projectId)).id;
    const result = await syncTask(atTask, phaseId);
    if (result.created) tasksCreated++;
    else tasksUpdated++;
  }

  return { tasksCreated, tasksUpdated };
}

async function getOrCreateDefaultPhase(projectId: string): Promise<{ id: string }> {
  const existing = await prisma.phase.findFirst({
    where: { projectId, title: 'Tasks', autotaskPhaseId: null },
    select: { id: true },
  });
  if (existing) return existing;

  const maxPhase = await prisma.phase.findFirst({
    where: { projectId },
    orderBy: { orderIndex: 'desc' },
    select: { orderIndex: true },
  });

  return prisma.phase.create({
    data: {
      projectId,
      title: 'Tasks',
      description: 'Tasks imported from Autotask',
      orderIndex: (maxPhase?.orderIndex ?? -1) + 1,
      status: 'IN_PROGRESS' as PhaseStatus,
    },
    select: { id: true },
  });
}

async function syncPhase(
  atPhase: AutotaskProjectPhase,
  projectId: string,
  orderIndex: number
): Promise<string> {
  const atId = String(atPhase.id);

  const existing = await prisma.phase.findFirst({ where: { autotaskPhaseId: atId } });

  if (existing) {
    await prisma.phase.update({
      where: { id: existing.id },
      data: {
        title: atPhase.title,
        description: atPhase.description || existing.description,
        scheduledDate: atPhase.startDate ? new Date(atPhase.startDate) : existing.scheduledDate,
        estimatedDays: atPhase.estimatedHours ? Math.ceil(atPhase.estimatedHours / 8) : existing.estimatedDays,
        orderIndex: atPhase.sortOrder ?? orderIndex,
      },
    });
    return existing.id;
  }

  const newPhase = await prisma.phase.create({
    data: {
      projectId,
      title: atPhase.title,
      description: atPhase.description,
      orderIndex: atPhase.sortOrder ?? orderIndex,
      scheduledDate: atPhase.startDate ? new Date(atPhase.startDate) : null,
      estimatedDays: atPhase.estimatedHours ? Math.ceil(atPhase.estimatedHours / 8) : null,
      status: 'NOT_STARTED' as PhaseStatus,
      autotaskPhaseId: atId,
    },
  });

  return newPhase.id;
}

async function syncTask(
  atTask: AutotaskTask,
  phaseId: string
): Promise<{ created: boolean }> {
  const atId = String(atTask.id);

  const existing = await prisma.phaseTask.findFirst({ where: { autotaskTaskId: atId } });

  const status = mapAtTaskStatus(atTask.status) as TaskStatus;
  const priority = mapAtTaskPriority(atTask.priority) as Priority;

  if (existing) {
    await prisma.phaseTask.update({
      where: { id: existing.id },
      data: {
        taskText: atTask.title,
        status,
        priority,
        dueDate: atTask.endDateTime ? new Date(atTask.endDateTime) : existing.dueDate,
        completed: status === 'REVIEWED_AND_DONE',
        completedAt: status === 'REVIEWED_AND_DONE' && atTask.completedDateTime
          ? new Date(atTask.completedDateTime) : existing.completedAt,
        notes: atTask.description || existing.notes,
      },
    });
    return { created: false };
  }

  const maxTask = await prisma.phaseTask.findFirst({
    where: { phaseId, parentTaskId: null },
    orderBy: { orderIndex: 'desc' },
    select: { orderIndex: true },
  });

  await prisma.phaseTask.create({
    data: {
      phaseId,
      taskText: atTask.title,
      orderIndex: (maxTask?.orderIndex ?? -1) + 1,
      status,
      priority,
      dueDate: atTask.endDateTime ? new Date(atTask.endDateTime) : null,
      completed: status === 'REVIEWED_AND_DONE',
      completedAt: status === 'REVIEWED_AND_DONE' && atTask.completedDateTime
        ? new Date(atTask.completedDateTime) : null,
      notes: atTask.description,
      autotaskTaskId: atId,
    },
  });

  return { created: true };
}
