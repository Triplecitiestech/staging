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
 * Autotask Sync Cron Job
 * Runs every 5 minutes via Vercel Cron
 *
 * GET /api/cron/autotask-sync
 * Authorization: Bearer <AUTOTASK_SYNC_SECRET> or Vercel Cron header
 */
export async function GET(request: NextRequest) {
  return handleSync(request);
}

export async function POST(request: NextRequest) {
  return handleSync(request);
}

async function handleSync(request: NextRequest) {
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
    // Auth check - Vercel Cron sends Authorization: Bearer <CRON_SECRET>
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const syncSecret = process.env.AUTOTASK_SYNC_SECRET;

    if (!cronSecret && !syncSecret) {
      console.error('[Autotask Sync] No cron secret configured — CRON_SECRET or AUTOTASK_SYNC_SECRET must be set');
      return NextResponse.json({ error: 'Unauthorized: cron secret not configured' }, { status: 401 });
    } else if (authHeader) {
      const isValid =
        (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
        (syncSecret && authHeader === `Bearer ${syncSecret}`);
      if (!isValid) {
        console.error('[Autotask Sync] Invalid authorization');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } else {
      console.error('[Autotask Sync] Missing Authorization header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if Autotask credentials are configured
    if (
      !process.env.AUTOTASK_API_USERNAME ||
      !process.env.AUTOTASK_API_SECRET ||
      !process.env.AUTOTASK_API_INTEGRATION_CODE ||
      !process.env.AUTOTASK_API_BASE_URL
    ) {
      return NextResponse.json(
        { error: 'Autotask API credentials not configured' },
        { status: 503 }
      );
    }

    const client = new AutotaskClient();

    // Determine if this is an incremental or full sync
    const lastSync = await prisma.autotaskSyncLog.findFirst({
      where: { status: 'success' },
      orderBy: { startedAt: 'desc' },
    });

    const isIncremental = !!lastSync?.completedAt;
    const syncSince = lastSync?.completedAt ?? undefined;

    console.log(
      `[Autotask Sync] Starting ${isIncremental ? 'incremental' : 'full'} sync${
        syncSince ? ` (since ${syncSince.toISOString()})` : ''
      }`
    );

    // 1. Sync Companies
    const atCompanies = isIncremental && syncSince
      ? await client.getCompaniesModifiedSince(syncSince)
      : await client.getActiveCompanies();

    console.log(`[Autotask Sync] Found ${atCompanies.length} companies to sync`);

    for (const atCompany of atCompanies) {
      try {
        const result = await syncCompany(atCompany);
        if (result.created) stats.companiesCreated++;
        else stats.companiesUpdated++;

        // 2. Sync Contacts for this company
        const atContacts = await client.getContactsByCompany(atCompany.id);
        for (const atContact of atContacts) {
          try {
            const contactResult = await syncContact(atContact, result.companyId);
            if (contactResult.created) stats.contactsCreated++;
            else stats.contactsUpdated++;
          } catch (err) {
            const msg = `Contact sync error (AT ID ${atContact.id}): ${err instanceof Error ? err.message : String(err)}`;
            console.error(`[Autotask Sync] ${msg}`);
            errors.push(msg);
          }
        }
      } catch (err) {
        const msg = `Company sync error (AT ID ${atCompany.id}): ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[Autotask Sync] ${msg}`);
        errors.push(msg);
      }
    }

    // 3. Sync Projects
    const atProjects = isIncremental && syncSince
      ? await client.getProjectsModifiedSince(syncSince)
      : await client.getAllProjects();

    console.log(`[Autotask Sync] Found ${atProjects.length} projects to sync`);

    for (const atProject of atProjects) {
      try {
        // Find the local company for this project
        const company = await prisma.company.findFirst({
          where: { autotaskCompanyId: String(atProject.companyID) },
          select: { id: true },
        });

        if (!company) {
          // Company not synced yet - try to fetch and sync it
          try {
            const atCompany = await client.getCompany(atProject.companyID);
            const companyResult = await syncCompany(atCompany);
            if (companyResult.created) stats.companiesCreated++;
            else stats.companiesUpdated++;

            const projectResult = await syncProject(atProject, companyResult.companyId, client);
            if (projectResult.created) stats.projectsCreated++;
            else stats.projectsUpdated++;
            stats.tasksCreated += projectResult.tasksCreated;
            stats.tasksUpdated += projectResult.tasksUpdated;
          } catch (err) {
            const msg = `Project sync error - could not find/create company (AT Company ID ${atProject.companyID}): ${err instanceof Error ? err.message : String(err)}`;
            console.error(`[Autotask Sync] ${msg}`);
            errors.push(msg);
          }
          continue;
        }

        const projectResult = await syncProject(atProject, company.id, client);
        if (projectResult.created) stats.projectsCreated++;
        else stats.projectsUpdated++;
        stats.tasksCreated += projectResult.tasksCreated;
        stats.tasksUpdated += projectResult.tasksUpdated;
      } catch (err) {
        const msg = `Project sync error (AT ID ${atProject.id}): ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[Autotask Sync] ${msg}`);
        errors.push(msg);
      }
    }

    // Log the sync result
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

    console.log(
      `[Autotask Sync] Completed in ${duration}ms - ${JSON.stringify(stats)} - ${errors.length} errors`
    );

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
    const isConnectionError = errorMessage.includes('Failed to conn') ||
      errorMessage.includes('Connection terminated') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('timeout');

    console.error(`[Autotask Sync] Fatal error: ${errorMessage}`);

    // Log failed sync
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

    // Return 200 for transient connection errors so Vercel doesn't flag them as failures.
    // The sync will retry on the next cron invocation.
    if (isConnectionError) {
      return NextResponse.json({
        success: false,
        transient: true,
        message: `Transient connection error (will retry next cycle): ${errorMessage}`,
        durationMs: duration,
      });
    }

    return NextResponse.json(
      { error: 'Sync failed', message: errorMessage },
      { status: 500 }
    );
  }
}

// ============================================
// SYNC HELPERS
// ============================================

async function syncCompany(
  atCompany: AutotaskCompany
): Promise<{ companyId: string; created: boolean }> {
  const atId = String(atCompany.id);

  // Check if company already exists by Autotask ID
  const existing = await prisma.company.findFirst({
    where: { autotaskCompanyId: atId },
    select: { id: true, displayName: true },
  });

  if (existing) {
    // Update display name if changed
    if (existing.displayName !== atCompany.companyName) {
      await prisma.company.update({
        where: { id: existing.id },
        data: {
          displayName: atCompany.companyName,
          autotaskLastSync: new Date(),
        },
      });
    } else {
      await prisma.company.update({
        where: { id: existing.id },
        data: { autotaskLastSync: new Date() },
      });
    }

    return { companyId: existing.id, created: false };
  }

  // Create new company
  // Generate a unique slug
  let slug = generateSlug(atCompany.companyName);

  // Check for slug collisions
  const slugExists = await prisma.company.findFirst({ where: { slug }, select: { id: true } });
  if (slugExists) {
    slug = `${slug}-${atId}`;
  }

  // Generate a random password for the customer portal
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

  console.log(
    `[Autotask Sync] Created company: ${atCompany.companyName} (slug: ${slug})`
  );

  return { companyId: newCompany.id, created: true };
}

async function syncContact(
  atContact: AutotaskContact,
  companyId: string
): Promise<{ created: boolean }> {
  const atId = String(atContact.id);
  const name = `${atContact.firstName} ${atContact.lastName}`.trim();
  const email = atContact.emailAddress || `contact-${atId}@placeholder.local`;

  // Check if contact exists by Autotask ID
  const existing = await prisma.companyContact.findFirst({
    where: { autotaskContactId: atId },
    select: { id: true, title: true, phone: true, phoneType: true },
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

  // Check for email collision within same company
  const emailExists = await prisma.companyContact.findFirst({
    where: { companyId, email },
    select: { id: true, title: true, phone: true },
  });

  if (emailExists) {
    // Update existing contact with AT ID
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
  let tasksCreated = 0;
  let tasksUpdated = 0;

  // Check if project exists
  const existing = await prisma.project.findFirst({
    where: { autotaskProjectId: atId },
    select: { id: true, startedAt: true, completedAt: true },
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

    // Sync phases and tasks
    const taskStats = await syncProjectPhasesAndTasks(existing.id, atProject.id, client);
    tasksCreated = taskStats.tasksCreated;
    tasksUpdated = taskStats.tasksUpdated;

    return { created: false, tasksCreated, tasksUpdated };
  }

  // Create new project
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { displayName: true },
  });

  let slug = generateSlug(
    `${company?.displayName || 'company'}-${atProject.projectName}`
  );

  // Check slug collisions
  const slugExists = await prisma.project.findFirst({ where: { slug } });
  if (slugExists) {
    slug = `${slug}-at${atId}`;
  }

  const newProject = await prisma.project.create({
    data: {
      companyId,
      projectType: 'CUSTOM',
      title: atProject.projectName,
      slug,
      status,
      startedAt: atProject.startDateTime ? new Date(atProject.startDateTime) : null,
      completedAt: status === 'COMPLETED' && atProject.endDateTime
        ? new Date(atProject.endDateTime)
        : null,
      estimatedDuration: atProject.estimatedHours
        ? `${atProject.estimatedHours} hours`
        : null,
      createdBy: SYSTEM_EMAIL,
      lastModifiedBy: SYSTEM_EMAIL,
      autotaskProjectId: atId,
      autotaskLastSync: new Date(),
    },
  });

  console.log(`[Autotask Sync] Created project: ${atProject.projectName} (slug: ${slug})`);

  // Sync phases and tasks
  const taskStats = await syncProjectPhasesAndTasks(newProject.id, atProject.id, client);
  tasksCreated = taskStats.tasksCreated;
  tasksUpdated = taskStats.tasksUpdated;

  return { created: true, tasksCreated, tasksUpdated };
}

async function syncProjectPhasesAndTasks(
  projectId: string,
  atProjectId: number,
  client: AutotaskClient
): Promise<{ tasksCreated: number; tasksUpdated: number }> {
  let tasksCreated = 0;
  let tasksUpdated = 0;

  // Fetch phases from Autotask
  let atPhases: AutotaskProjectPhase[] = [];
  try {
    atPhases = await client.getProjectPhases(atProjectId);
  } catch (err) {
    console.error(`[Autotask Sync] Failed to fetch phases for project ${atProjectId}: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Fetch tasks from Autotask
  let atTasks: AutotaskTask[] = [];
  try {
    atTasks = await client.getProjectTasks(atProjectId);
  } catch (err) {
    console.error(`[Autotask Sync] Failed to fetch tasks for project ${atProjectId}: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Create a mapping of AT phase ID -> local phase ID
  const phaseIdMap = new Map<number, string>();

  // If there are no phases but there are tasks, create a default phase
  if (atPhases.length === 0 && atTasks.length > 0) {
    const defaultPhase = await getOrCreateDefaultPhase(projectId);
    // All tasks will be assigned to this default phase
    for (const atTask of atTasks) {
      const result = await syncTask(atTask, defaultPhase.id);
      if (result.created) tasksCreated++;
      else tasksUpdated++;
    }
    return { tasksCreated, tasksUpdated };
  }

  // Sync phases
  for (let i = 0; i < atPhases.length; i++) {
    const atPhase = atPhases[i];
    const localPhaseId = await syncPhase(atPhase, projectId, i);
    phaseIdMap.set(atPhase.id, localPhaseId);
  }

  // Sync tasks
  for (const atTask of atTasks) {
    const localPhaseId = atTask.phaseID
      ? phaseIdMap.get(atTask.phaseID)
      : undefined;

    // If task has a phase we don't have mapped, use default phase
    const phaseId = localPhaseId || (await getOrCreateDefaultPhase(projectId)).id;

    const result = await syncTask(atTask, phaseId);
    if (result.created) tasksCreated++;
    else tasksUpdated++;
  }

  return { tasksCreated, tasksUpdated };
}

async function getOrCreateDefaultPhase(projectId: string): Promise<{ id: string }> {
  // Check if a default "Tasks" phase already exists
  const existing = await prisma.phase.findFirst({
    where: {
      projectId,
      title: 'Tasks',
      autotaskPhaseId: null,
    },
    select: { id: true },
  });

  if (existing) return existing;

  // Get current max orderIndex
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

  const existing = await prisma.phase.findFirst({
    where: { autotaskPhaseId: atId },
    select: { id: true, description: true, scheduledDate: true, estimatedDays: true },
  });

  if (existing) {
    await prisma.phase.update({
      where: { id: existing.id },
      data: {
        title: atPhase.title,
        description: atPhase.description || existing.description,
        scheduledDate: atPhase.startDate ? new Date(atPhase.startDate) : existing.scheduledDate,
        estimatedDays: atPhase.estimatedHours
          ? Math.ceil(atPhase.estimatedHours / 8)
          : existing.estimatedDays,
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
      estimatedDays: atPhase.estimatedHours
        ? Math.ceil(atPhase.estimatedHours / 8)
        : null,
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

  const existing = await prisma.phaseTask.findFirst({
    where: { autotaskTaskId: atId },
    select: { id: true, dueDate: true, completedAt: true, notes: true },
  });

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
        completedAt:
          status === 'REVIEWED_AND_DONE' && atTask.completedDateTime
            ? new Date(atTask.completedDateTime)
            : existing.completedAt,
        notes: atTask.description || existing.notes,
      },
    });
    return { created: false };
  }

  // Get next orderIndex
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
      completedAt:
        status === 'REVIEWED_AND_DONE' && atTask.completedDateTime
          ? new Date(atTask.completedDateTime)
          : null,
      notes: atTask.description,
      autotaskTaskId: atId,
    },
  });

  return { created: true };
}
