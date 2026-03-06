import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  AutotaskClient,
  AutotaskCompany,
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
 * Manual Autotask sync trigger - runs in steps to avoid timeouts.
 *
 * Step 1: GET /api/autotask/trigger?secret=XXX&step=companies
 *   - Syncs all active companies from Autotask (creates new ones on our site)
 *
 * Step 2: GET /api/autotask/trigger?secret=XXX&step=projects
 *   - Syncs all projects (with phases and tasks), 10 at a time
 *   - Add &page=2, &page=3 etc. to get more batches
 *
 * Step 3 (optional): GET /api/autotask/trigger?secret=XXX&step=contacts
 *   - Syncs contacts for all AT-linked companies
 *
 * No step param: GET /api/autotask/trigger?secret=XXX
 *   - Shows instructions
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

  const step = request.nextUrl.searchParams.get('step');
  const baseUrl = request.nextUrl.origin;
  const secretParam = `secret=${encodeURIComponent(secret)}`;

  if (!step) {
    return NextResponse.json({
      message: 'Autotask sync trigger. Run these steps in order by clicking each link:',
      steps: [
        {
          step: 1,
          description: 'Sync companies that have projects in Autotask',
          url: `${baseUrl}/api/autotask/trigger?${secretParam}&step=companies`,
        },
        {
          step: 2,
          description: 'Sync all projects (page 1 of 10 projects at a time)',
          url: `${baseUrl}/api/autotask/trigger?${secretParam}&step=projects&page=1`,
        },
        {
          step: 3,
          description: 'Sync contacts for all companies (optional)',
          url: `${baseUrl}/api/autotask/trigger?${secretParam}&step=contacts`,
        },
      ],
    });
  }

  const client = new AutotaskClient();

  if (step === 'companies') {
    return handleCompaniesSync(client);
  }

  if (step === 'projects') {
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);
    const result = await handleProjectsSync(client, page);

    // Add next page link if there might be more
    const responseData = await result.json();
    if (responseData.projectsSynced === 10) {
      responseData.nextPage = `${baseUrl}/api/autotask/trigger?${secretParam}&step=projects&page=${page + 1}`;
      responseData.message = `Synced 10 projects. There may be more — click nextPage URL to continue.`;
    } else {
      responseData.message = `Done! Synced ${responseData.projectsSynced} projects. No more projects to sync.`;
    }

    return NextResponse.json(responseData);
  }

  if (step === 'contacts') {
    return handleContactsSync(client);
  }

  return NextResponse.json({ error: `Unknown step: ${step}. Use companies, projects, or contacts.` }, { status: 400 });
}

// ============================================
// STEP: COMPANIES
// ============================================

async function handleCompaniesSync(client: AutotaskClient) {
  const startTime = Date.now();
  const errors: string[] = [];
  let created = 0;
  let updated = 0;

  try {
    // Only sync companies that have projects in Autotask
    const allProjects = await client.getAllProjects();
    const companyIds = Array.from(new Set(allProjects.map((p) => p.companyID)));

    // Fetch each unique company
    const atCompanies: AutotaskCompany[] = [];
    for (const companyId of companyIds) {
      try {
        const company = await client.getCompany(companyId);
        atCompanies.push(company);
      } catch (err) {
        errors.push(`Could not fetch company ${companyId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    for (const atCompany of atCompanies) {
      try {
        const result = await syncCompany(atCompany);
        if (result.created) created++;
        else updated++;
      } catch (err) {
        errors.push(`Company ${atCompany.id} (${atCompany.companyName}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await prisma.autotaskSyncLog.create({
      data: {
        syncType: 'companies',
        status: errors.length === 0 ? 'success' : 'partial',
        companiesCreated: created,
        companiesUpdated: updated,
        errors: errors.length > 0 ? JSON.stringify(errors) : null,
        durationMs: Date.now() - startTime,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      step: 'companies',
      totalFromAutotask: atCompanies.length,
      created,
      updated,
      errors: errors.length > 0 ? errors : undefined,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    return NextResponse.json(
      { step: 'companies', error: err instanceof Error ? err.message : String(err), errors },
      { status: 500 }
    );
  }
}

// ============================================
// STEP: PROJECTS (paginated, 10 at a time)
// ============================================

async function handleProjectsSync(client: AutotaskClient, page: number) {
  const startTime = Date.now();
  const errors: string[] = [];
  let projectsCreated = 0;
  let projectsUpdated = 0;
  let tasksCreated = 0;
  let tasksUpdated = 0;

  try {
    // Get all projects, then take a page of 10
    const allProjects = await client.getAllProjects();
    const pageSize = 10;
    const startIdx = (page - 1) * pageSize;
    const pageProjects = allProjects.slice(startIdx, startIdx + pageSize);

    for (const atProject of pageProjects) {
      try {
        // Find local company
        let company = await prisma.company.findFirst({
          where: { autotaskCompanyId: String(atProject.companyID) },
        });

        if (!company) {
          // Try to create the company
          try {
            const atCompany = await client.getCompany(atProject.companyID);
            const companyResult = await syncCompany(atCompany);
            company = await prisma.company.findUnique({ where: { id: companyResult.companyId } });
          } catch (err) {
            errors.push(`Project "${atProject.projectName}" - missing company ${atProject.companyID}: ${err instanceof Error ? err.message : String(err)}`);
            continue;
          }
        }

        if (!company) continue;

        const result = await syncProject(atProject, company.id, client);
        if (result.created) projectsCreated++;
        else projectsUpdated++;
        tasksCreated += result.tasksCreated;
        tasksUpdated += result.tasksUpdated;
      } catch (err) {
        errors.push(`Project "${atProject.projectName}" (${atProject.id}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await prisma.autotaskSyncLog.create({
      data: {
        syncType: `projects-page-${page}`,
        status: errors.length === 0 ? 'success' : 'partial',
        projectsCreated,
        projectsUpdated,
        tasksCreated,
        tasksUpdated,
        errors: errors.length > 0 ? JSON.stringify(errors) : null,
        durationMs: Date.now() - startTime,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      step: 'projects',
      page,
      totalProjectsInAutotask: allProjects.length,
      projectsSynced: pageProjects.length,
      projectsCreated,
      projectsUpdated,
      tasksCreated,
      tasksUpdated,
      errors: errors.length > 0 ? errors : undefined,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    return NextResponse.json(
      { step: 'projects', page, error: err instanceof Error ? err.message : String(err), errors },
      { status: 500 }
    );
  }
}

// ============================================
// STEP: CONTACTS
// ============================================

async function handleContactsSync(client: AutotaskClient) {
  const startTime = Date.now();
  const errors: string[] = [];
  let created = 0;
  let updated = 0;

  try {
    // Get all companies that have an autotask ID
    const companies = await prisma.company.findMany({
      where: { autotaskCompanyId: { not: null } },
      select: { id: true, autotaskCompanyId: true, displayName: true },
    });

    for (const company of companies) {
      if (!company.autotaskCompanyId) continue;
      try {
        const atContacts = await client.getContactsByCompany(parseInt(company.autotaskCompanyId, 10));
        for (const atContact of atContacts) {
          try {
            const name = `${atContact.firstName} ${atContact.lastName}`.trim();
            const email = atContact.emailAddress || `contact-${atContact.id}@placeholder.local`;
            const atId = String(atContact.id);

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
              updated++;
            } else {
              // Check email collision
              const emailExists = await prisma.companyContact.findFirst({
                where: { companyId: company.id, email },
              });

              if (emailExists) {
                await prisma.companyContact.update({
                  where: { id: emailExists.id },
                  data: { name, autotaskContactId: atId },
                });
                updated++;
              } else {
                await prisma.companyContact.create({
                  data: {
                    companyId: company.id,
                    name,
                    email,
                    title: atContact.title,
                    phone: atContact.mobilePhone || atContact.phone,
                    phoneType: atContact.mobilePhone ? 'MOBILE' : atContact.phone ? 'WORK' : undefined,
                    autotaskContactId: atId,
                  },
                });
                created++;
              }
            }
          } catch (err) {
            errors.push(`Contact ${atContact.id}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } catch (err) {
        errors.push(`Contacts for ${company.displayName}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await prisma.autotaskSyncLog.create({
      data: {
        syncType: 'contacts',
        status: errors.length === 0 ? 'success' : 'partial',
        contactsCreated: created,
        contactsUpdated: updated,
        errors: errors.length > 0 ? JSON.stringify(errors) : null,
        durationMs: Date.now() - startTime,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      step: 'contacts',
      created,
      updated,
      companiesProcessed: companies.length,
      errors: errors.length > 0 ? errors : undefined,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    return NextResponse.json(
      { step: 'contacts', error: err instanceof Error ? err.message : String(err), errors },
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
          ? new Date(atProject.endDateTime) : existing.completedAt,
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
