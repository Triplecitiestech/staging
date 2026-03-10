import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import {
  AutotaskClient,
  AutotaskCompany,
  AutotaskProject,
  AutotaskProjectPhase,
  AutotaskTask,
  AutotaskProjectNote,
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
 * Step 0: GET /api/autotask/trigger?secret=XXX&step=cleanup
 *   - Remove AT-synced companies that have no projects
 *
 * Step 1: GET /api/autotask/trigger?secret=XXX&step=companies
 *   - Syncs all active companies from Autotask
 *
 * Step 2: GET /api/autotask/trigger?secret=XXX&step=projects&page=1
 *   - Syncs projects with full phases, tasks, statuses, descriptions, and notes
 *   - 5 projects at a time to stay within timeout
 *
 * Step 3: GET /api/autotask/trigger?secret=XXX&step=contacts
 *   - Syncs contacts (auto-creates table if missing)
 *
 * Step 4: GET /api/autotask/trigger?secret=XXX&step=diagnose
 *   - Diagnostic: shows what the Autotask API returns for the first project
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  const expectedSecret = process.env.MIGRATION_SECRET;
  const isAdminSync = request.headers.get('x-admin-sync') === 'true';

  // Allow auth via secret OR via admin session
  let isAuthorized = false;
  if (secret && expectedSecret && secret === expectedSecret) {
    isAuthorized = true;
  } else if (isAdminSync) {
    const session = await auth();
    if (session?.user?.email) {
      const staffUser = await prisma.staffUser.findUnique({
        where: { email: session.user.email },
        select: { role: true, isActive: true },
      });
      if (staffUser?.isActive && (staffUser.role === 'ADMIN' || staffUser.role === 'MANAGER')) {
        isAuthorized = true;
      }
    }
  }

  if (!isAuthorized) {
    return NextResponse.json(
      { error: 'Unauthorized. Add ?secret=YOUR_MIGRATION_SECRET to the URL or use admin session.' },
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
  const secretParam = `secret=${encodeURIComponent(secret || '')}`;

  if (!step) {
    return NextResponse.json({
      message: 'Autotask sync trigger. Run these steps in order:',
      steps: [
        {
          step: 0,
          description: 'CLEANUP: Remove AT-synced companies that have no projects',
          url: `${baseUrl}/api/autotask/trigger?${secretParam}&step=cleanup`,
        },
        {
          step: 1,
          description: 'Sync companies that have projects in Autotask',
          url: `${baseUrl}/api/autotask/trigger?${secretParam}&step=companies`,
        },
        {
          step: 2,
          description: 'Sync all projects with phases, tasks, notes (5 at a time)',
          url: `${baseUrl}/api/autotask/trigger?${secretParam}&step=projects&page=1`,
        },
        {
          step: 3,
          description: 'Sync contacts for all companies (auto-creates table if needed)',
          url: `${baseUrl}/api/autotask/trigger?${secretParam}&step=contacts`,
        },
        {
          step: 4,
          description: 'MERGE: Deduplicate companies — move projects from non-AT duplicates into AT-synced companies, then delete the old ones',
          url: `${baseUrl}/api/autotask/trigger?${secretParam}&step=merge`,
        },
        {
          step: 5,
          description: 'RESYNC: Re-fetch phases and tasks from Autotask for all AT-synced projects (fixes empty phases)',
          url: `${baseUrl}/api/autotask/trigger?${secretParam}&step=resync&page=1`,
        },
        {
          step: 6,
          description: 'DIAGNOSE: Show raw Autotask API response for first project',
          url: `${baseUrl}/api/autotask/trigger?${secretParam}&step=diagnose`,
        },
      ],
    });
  }

  if (step === 'cleanup') {
    return handleCleanup();
  }

  const client = new AutotaskClient();

  if (step === 'companies') {
    return handleCompaniesSync(client);
  }

  if (step === 'projects') {
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);
    const result = await handleProjectsSync(client, page);

    const responseData = await result.json();
    if (responseData.projectsSynced === 5) {
      responseData.nextPage = `${baseUrl}/api/autotask/trigger?${secretParam}&step=projects&page=${page + 1}`;
      responseData.message = `Synced 5 projects. There may be more — click nextPage URL to continue.`;
    } else {
      responseData.message = `Done! Synced ${responseData.projectsSynced} projects. No more projects to sync.`;
    }

    return NextResponse.json(responseData);
  }

  if (step === 'contacts') {
    return handleContactsSync(client);
  }

  if (step === 'merge') {
    return handleMerge();
  }

  if (step === 'resync') {
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);
    const result = await handleResync(client, page);
    const responseData = await result.json();
    if (responseData.projectsProcessed === 5) {
      responseData.nextPage = `${baseUrl}/api/autotask/trigger?${secretParam}&step=resync&page=${page + 1}`;
      responseData.message = `Re-synced 5 projects. There may be more — click nextPage URL.`;
    } else {
      responseData.message = `Done! Re-synced ${responseData.projectsProcessed} projects.`;
    }
    return NextResponse.json(responseData);
  }

  if (step === 'diagnose') {
    return handleDiagnose(client);
  }

  return NextResponse.json({ error: `Unknown step: ${step}. Use cleanup, companies, projects, contacts, merge, resync, or diagnose.` }, { status: 400 });
}

// ============================================
// STEP: MERGE — deduplicate companies
// ============================================

async function handleMerge() {
  try {
    // Find all companies, grouped by normalized name
    const allCompanies = await prisma.company.findMany({
      select: {
        id: true,
        slug: true,
        displayName: true,
        autotaskCompanyId: true,
        primaryContact: true,
        contactTitle: true,
        contactEmail: true,
        createdAt: true,
        _count: { select: { projects: true } },
      },
      orderBy: { displayName: 'asc' },
    });

    // Group by normalized name (lowercase, trimmed)
    const nameGroups = new Map<string, typeof allCompanies>();
    for (const company of allCompanies) {
      const key = company.displayName.toLowerCase().trim();
      const group = nameGroups.get(key) || [];
      group.push(company);
      nameGroups.set(key, group);
    }

    // Find duplicates (groups with more than 1 company)
    const duplicateGroups = Array.from(nameGroups.entries())
      .filter(([, group]) => group.length > 1);

    if (duplicateGroups.length === 0) {
      return NextResponse.json({
        step: 'merge',
        message: 'No duplicate companies found.',
        totalCompanies: allCompanies.length,
      });
    }

    const mergeResults: Array<{
      name: string;
      winner: { id: string; slug: string; autotaskId: string | null; projects: number };
      absorbed: Array<{
        id: string;
        slug: string;
        autotaskId: string | null;
        projectsMoved: number;
        contactsMoved: number;
        deleted: boolean;
      }>;
    }> = [];
    const errors: string[] = [];
    let totalProjectsMoved = 0;
    let totalContactsMoved = 0;
    let totalCompaniesDeleted = 0;

    for (const [name, group] of duplicateGroups) {
      // Pick the winner: prefer the one WITH an autotaskCompanyId
      // If multiple have AT IDs, pick the one with more projects
      const withAt = group.filter((c) => c.autotaskCompanyId);
      const withoutAt = group.filter((c) => !c.autotaskCompanyId);

      let winner: typeof group[0];
      if (withAt.length > 0) {
        // Pick the AT-synced company with the most projects
        winner = withAt.sort((a, b) => b._count.projects - a._count.projects)[0];
      } else {
        // No AT company — pick the one with the most projects
        winner = group.sort((a, b) => b._count.projects - a._count.projects)[0];
      }

      const losers = group.filter((c) => c.id !== winner.id);

      const mergeResult: typeof mergeResults[0] = {
        name,
        winner: {
          id: winner.id,
          slug: winner.slug,
          autotaskId: winner.autotaskCompanyId,
          projects: winner._count.projects,
        },
        absorbed: [],
      };

      for (const loser of losers) {
        let projectsMoved = 0;
        let contactsMoved = 0;

        try {
          // Transfer contact info from loser to winner if winner is missing it
          if (!winner.primaryContact && loser.primaryContact) {
            await prisma.company.update({
              where: { id: winner.id },
              data: {
                primaryContact: loser.primaryContact,
                contactTitle: loser.contactTitle,
                contactEmail: loser.contactEmail,
              },
            });
          }

          // Move all projects from loser to winner
          const movedProjects = await prisma.project.updateMany({
            where: { companyId: loser.id },
            data: { companyId: winner.id },
          });
          projectsMoved = movedProjects.count;
          totalProjectsMoved += projectsMoved;

          // Move contacts from loser to winner (handle email collisions)
          try {
            const loserContacts = await prisma.companyContact.findMany({
              where: { companyId: loser.id },
            });
            for (const contact of loserContacts) {
              // Check if winner already has a contact with this email
              const existingContact = await prisma.companyContact.findFirst({
                where: { companyId: winner.id, email: contact.email },
              });
              if (existingContact) {
                // Delete the duplicate contact
                await prisma.companyContact.delete({ where: { id: contact.id } });
              } else {
                // Move contact to winner company
                await prisma.companyContact.update({
                  where: { id: contact.id },
                  data: { companyId: winner.id },
                });
                contactsMoved++;
                totalContactsMoved++;
              }
            }
          } catch {
            // company_contacts table may not exist
          }

          // Delete the loser company (now empty — projects/contacts moved)
          await prisma.company.delete({ where: { id: loser.id } });
          totalCompaniesDeleted++;

          mergeResult.absorbed.push({
            id: loser.id,
            slug: loser.slug,
            autotaskId: loser.autotaskCompanyId,
            projectsMoved,
            contactsMoved,
            deleted: true,
          });
        } catch (err) {
          errors.push(`Merge "${loser.displayName}" (${loser.id}) into "${winner.displayName}" (${winner.id}): ${err instanceof Error ? err.message : String(err)}`);
          mergeResult.absorbed.push({
            id: loser.id,
            slug: loser.slug,
            autotaskId: loser.autotaskCompanyId,
            projectsMoved,
            contactsMoved,
            deleted: false,
          });
        }
      }

      mergeResults.push(mergeResult);
    }

    return NextResponse.json({
      step: 'merge',
      duplicateGroupsFound: duplicateGroups.length,
      totalProjectsMoved,
      totalContactsMoved,
      totalCompaniesDeleted,
      mergeResults,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { step: 'merge', error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// ============================================
// STEP: RESYNC — re-fetch phases+tasks for all AT-synced projects
// ============================================

async function handleResync(client: AutotaskClient, page: number) {
  const startTime = Date.now();
  const errors: string[] = [];
  const pageSize = 5;

  // Get all AT-synced projects from our DB
  const atProjects = await prisma.project.findMany({
    where: { autotaskProjectId: { not: null } },
    select: {
      id: true,
      title: true,
      autotaskProjectId: true,
      _count: { select: { phases: true } },
    },
    orderBy: { createdAt: 'asc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  const projectDetails: Array<{
    name: string;
    atId: string;
    existingPhases: number;
    atPhasesFound: number;
    atTasksFound: number;
    phasesCreated: number;
    phasesUpdated: number;
    tasksCreated: number;
    tasksUpdated: number;
    emptyPhasesDeleted: number;
    errors: string[];
  }> = [];

  let totalPhasesCreated = 0;
  let totalPhasesUpdated = 0;
  let totalTasksCreated = 0;
  let totalTasksUpdated = 0;
  let totalEmptyPhasesDeleted = 0;

  for (const project of atProjects) {
    const atProjectId = parseInt(project.autotaskProjectId!, 10);
    const pLog = {
      name: project.title,
      atId: project.autotaskProjectId!,
      existingPhases: project._count.phases,
      atPhasesFound: 0,
      atTasksFound: 0,
      phasesCreated: 0,
      phasesUpdated: 0,
      tasksCreated: 0,
      tasksUpdated: 0,
      emptyPhasesDeleted: 0,
      errors: [] as string[],
    };

    try {
      // Fetch phases from Autotask
      let atPhases: AutotaskProjectPhase[] = [];
      try {
        atPhases = await client.getProjectPhases(atProjectId);
        pLog.atPhasesFound = atPhases.length;
      } catch (err) {
        pLog.errors.push(`Phases API: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Fetch tasks from Autotask
      let atTasks: AutotaskTask[] = [];
      try {
        atTasks = await client.getProjectTasks(atProjectId);
        pLog.atTasksFound = atTasks.length;
      } catch (err) {
        pLog.errors.push(`Tasks API: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Build phase map
      const phaseIdMap = new Map<number, string>();

      // Sync phases
      for (let i = 0; i < atPhases.length; i++) {
        try {
          const result = await syncPhase(atPhases[i], project.id, i);
          phaseIdMap.set(atPhases[i].id, result.phaseId);
          if (result.created) pLog.phasesCreated++;
          else pLog.phasesUpdated++;
        } catch (err) {
          pLog.errors.push(`Phase "${atPhases[i].title}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // If no phases but tasks exist, ensure default phase
      if (atPhases.length === 0 && atTasks.length > 0) {
        const defaultPhase = await getOrCreateDefaultPhase(project.id);
        for (const atTask of atTasks) {
          try {
            const result = await syncTask(atTask, defaultPhase.id);
            if (result.created) pLog.tasksCreated++;
            else pLog.tasksUpdated++;
          } catch (err) {
            pLog.errors.push(`Task "${atTask.title}": ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } else {
        // Sync tasks into correct phases
        for (const atTask of atTasks) {
          try {
            const localPhaseId = atTask.phaseID ? phaseIdMap.get(atTask.phaseID) : undefined;
            const phaseId = localPhaseId || (await getOrCreateDefaultPhase(project.id)).id;
            const result = await syncTask(atTask, phaseId);
            if (result.created) pLog.tasksCreated++;
            else pLog.tasksUpdated++;
          } catch (err) {
            pLog.errors.push(`Task "${atTask.title}": ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      // Clean up empty phases that have no tasks and no AT phase ID
      // (these are leftover default "Tasks" phases or broken phases)
      const emptyPhases = await prisma.phase.findMany({
        where: {
          projectId: project.id,
          tasks: { none: {} },
          comments: { none: {} },
          autotaskPhaseId: null,
        },
        select: { id: true, title: true },
      });

      for (const emptyPhase of emptyPhases) {
        try {
          await prisma.phase.delete({ where: { id: emptyPhase.id } });
          pLog.emptyPhasesDeleted++;
        } catch (err) {
          pLog.errors.push(`Delete empty phase "${emptyPhase.title}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Also update phase statuses based on their tasks
      const localPhases = await prisma.phase.findMany({
        where: { projectId: project.id },
        include: {
          tasks: { select: { status: true, completed: true } },
        },
      });

      for (const phase of localPhases) {
        if (phase.tasks.length === 0) continue;
        const allComplete = phase.tasks.every((t) => t.completed || t.status === 'REVIEWED_AND_DONE' || t.status === 'NOT_APPLICABLE');
        const anyInProgress = phase.tasks.some((t) => t.status === 'WORK_IN_PROGRESS' || t.status === 'ASSIGNED');
        const anyWaiting = phase.tasks.some((t) => t.status === 'WAITING_ON_CLIENT' || t.status === 'WAITING_ON_VENDOR');

        let newStatus: PhaseStatus;
        if (allComplete) {
          newStatus = 'COMPLETE';
        } else if (anyWaiting) {
          newStatus = 'WAITING_ON_CUSTOMER';
        } else if (anyInProgress) {
          newStatus = 'IN_PROGRESS';
        } else {
          newStatus = 'NOT_STARTED';
        }

        if (phase.status !== newStatus) {
          await prisma.phase.update({
            where: { id: phase.id },
            data: { status: newStatus },
          });
        }
      }

    } catch (err) {
      pLog.errors.push(err instanceof Error ? err.message : String(err));
    }

    totalPhasesCreated += pLog.phasesCreated;
    totalPhasesUpdated += pLog.phasesUpdated;
    totalTasksCreated += pLog.tasksCreated;
    totalTasksUpdated += pLog.tasksUpdated;
    totalEmptyPhasesDeleted += pLog.emptyPhasesDeleted;
    if (pLog.errors.length > 0) {
      errors.push(...pLog.errors.map((e) => `${project.title}: ${e}`));
    }
    projectDetails.push(pLog);
  }

  return NextResponse.json({
    step: 'resync',
    page,
    projectsProcessed: atProjects.length,
    totalPhasesCreated,
    totalPhasesUpdated,
    totalTasksCreated,
    totalTasksUpdated,
    totalEmptyPhasesDeleted,
    projectDetails,
    errors: errors.length > 0 ? errors : undefined,
    durationMs: Date.now() - startTime,
  });
}

// ============================================
// STEP: DIAGNOSE — show raw API responses for debugging
// ============================================

async function handleDiagnose(client: AutotaskClient) {
  const diagnostics: Record<string, unknown> = {};
  const errors: string[] = [];

  try {
    // Get first project
    const allProjects = await client.getAllProjects();
    diagnostics.totalProjects = allProjects.length;
    diagnostics.sampleProjects = allProjects.slice(0, 3).map((p) => ({
      id: p.id,
      name: p.projectName,
      status: p.status,
      companyID: p.companyID,
      description: p.description ? p.description.slice(0, 200) : null,
      startDateTime: p.startDateTime,
      endDateTime: p.endDateTime,
      estimatedHours: p.estimatedHours,
    }));

    if (allProjects.length > 0) {
      const testProject = allProjects[0];

      // Try to get phases
      try {
        const phases = await client.getProjectPhases(testProject.id);
        diagnostics.phases = {
          count: phases.length,
          items: phases.slice(0, 5).map((p) => ({
            id: p.id,
            title: p.title,
            description: p.description ? p.description.slice(0, 200) : null,
            startDate: p.startDate,
            dueDate: p.dueDate,
            estimatedHours: p.estimatedHours,
            sortOrder: p.sortOrder,
          })),
        };
      } catch (err) {
        diagnostics.phases = { error: err instanceof Error ? err.message : String(err) };
        errors.push(`Phases: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Try to get tasks
      try {
        const tasks = await client.getProjectTasks(testProject.id);
        diagnostics.tasks = {
          count: tasks.length,
          items: tasks.slice(0, 5).map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            phaseID: t.phaseID,
            description: t.description ? t.description.slice(0, 200) : null,
            startDateTime: t.startDateTime,
            endDateTime: t.endDateTime,
            estimatedHours: t.estimatedHours,
            completedDateTime: t.completedDateTime,
          })),
        };
      } catch (err) {
        diagnostics.tasks = { error: err instanceof Error ? err.message : String(err) };
        errors.push(`Tasks: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Try to get notes
      try {
        const notes = await client.getProjectNotes(testProject.id);
        diagnostics.notes = {
          count: notes.length,
          items: notes.slice(0, 5).map((n) => ({
            id: n.id,
            title: n.title,
            description: n.description ? n.description.slice(0, 200) : null,
            noteType: n.noteType,
            publish: n.publish,
            createDateTime: n.createDateTime,
          })),
        };
      } catch (err) {
        diagnostics.notes = { error: err instanceof Error ? err.message : String(err) };
        errors.push(`Notes: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Try to get task field info for status picklist
      try {
        const fieldInfo = await client.getFieldInfo('Tasks');
        const statusField = fieldInfo.fields?.find((f: { name: string }) => f.name === 'status');
        diagnostics.taskStatusPicklist = statusField?.picklistValues || 'status field not found';
      } catch (err) {
        try {
          const fieldInfo = await client.getFieldInfo('ProjectTasks');
          const statusField = fieldInfo.fields?.find((f: { name: string }) => f.name === 'status');
          diagnostics.taskStatusPicklist = statusField?.picklistValues || 'status field not found';
        } catch (err2) {
          diagnostics.taskStatusPicklist = {
            error: `Tasks: ${err instanceof Error ? err.message : String(err)}, ProjectTasks: ${err2 instanceof Error ? err2.message : String(err2)}`,
          };
        }
      }

      // Try project field info for status picklist
      try {
        const fieldInfo = await client.getFieldInfo('Projects');
        const statusField = fieldInfo.fields?.find((f: { name: string }) => f.name === 'status');
        diagnostics.projectStatusPicklist = statusField?.picklistValues || 'status field not found';
      } catch (err) {
        diagnostics.projectStatusPicklist = { error: err instanceof Error ? err.message : String(err) };
      }
    }

    return NextResponse.json({
      step: 'diagnose',
      diagnostics,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { step: 'diagnose', error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// ============================================
// STEP: CLEANUP — remove AT-synced companies with no projects
// ============================================

async function handleCleanup() {
  try {
    const atCompanies = await prisma.$queryRaw<Array<{
      id: string;
      display_name: string;
      autotask_company_id: string;
      project_count: bigint;
    }>>`
      SELECT c.id, c."displayName" AS display_name, c."autotaskCompanyId" AS autotask_company_id,
             COUNT(p.id) AS project_count
      FROM companies c
      LEFT JOIN projects p ON p."companyId" = c.id
      WHERE c."autotaskCompanyId" IS NOT NULL
      GROUP BY c.id, c."displayName", c."autotaskCompanyId"
    `;

    const toDelete = atCompanies.filter((c) => Number(c.project_count) === 0);
    const toKeep = atCompanies.filter((c) => Number(c.project_count) > 0);
    const errors: string[] = [];
    let companiesDeleted = 0;

    for (const company of toDelete) {
      try {
        // Delete all dependent records before removing the company
        // Each wrapped in try/catch in case the table doesn't exist yet
        const dependentTables = [
          { table: 'company_contacts', col: 'companyId' },
          { table: 'tickets', col: 'companyId' },
          { table: 'ticket_lifecycle', col: 'companyId' },
          { table: 'company_metrics_daily', col: 'companyId' },
          { table: 'customer_health_scores', col: 'companyId' },
          { table: 'business_reviews', col: 'companyId' },
        ];

        for (const dep of dependentTables) {
          try {
            await prisma.$executeRawUnsafe(
              `DELETE FROM ${dep.table} WHERE "${dep.col}" = $1`,
              company.id
            );
          } catch {
            // Table may not exist — that's fine
          }
        }

        await prisma.$executeRaw`DELETE FROM companies WHERE id = ${company.id}`;
        companiesDeleted++;
      } catch (err) {
        errors.push(`Failed to delete "${company.display_name}" (${company.id}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return NextResponse.json({
      step: 'cleanup',
      totalAtCompanies: atCompanies.length,
      companiesWithProjects: toKeep.length,
      companiesDeleted,
      errors: errors.length > 0 ? errors : undefined,
      deletedCompanies: toDelete.slice(0, 50).map((c) => ({
        name: c.display_name,
        autotaskId: c.autotask_company_id,
      })),
      keptCompanies: toKeep.map((c) => ({
        name: c.display_name,
        autotaskId: c.autotask_company_id,
        projects: Number(c.project_count),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { step: 'cleanup', error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
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
    // Ensure companyClassification column exists
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "companyClassification" TEXT`);
    } catch { /* column may already exist */ }

    // Ensure slaResolutionPlanMet column exists on ticket_lifecycle
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "ticket_lifecycle" ADD COLUMN IF NOT EXISTS "slaResolutionPlanMet" BOOLEAN`);
    } catch { /* column may already exist */ }

    // Only sync companies that have projects in Autotask
    const allProjects = await client.getAllProjects();
    const companyIds = Array.from(new Set(allProjects.map((p) => p.companyID)));

    // Resolve classification picklist labels from Autotask
    const classificationMap = new Map<number, string>();
    try {
      const entityInfo = await client.getFieldInfo('Companies');
      const classField = entityInfo.fields.find(f => f.name === 'classification');
      if (classField?.picklistValues) {
        for (const pv of classField.picklistValues) {
          if (pv.isActive) {
            classificationMap.set(Number(pv.value), pv.label);
          }
        }
      }
    } catch {
      // Non-fatal — classification resolution is best-effort
    }

    // Fetch each unique company
    const atCompanies: AutotaskCompany[] = [];
    for (const companyId of companyIds) {
      try {
        const company = await client.getCompany(companyId);
        // Resolve classification name from picklist
        if (company.classification && classificationMap.has(company.classification)) {
          company.classificationName = classificationMap.get(company.classification);
        }
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
// STEP: PROJECTS (paginated, 5 at a time — comprehensive sync)
// ============================================

async function handleProjectsSync(client: AutotaskClient, page: number) {
  const startTime = Date.now();
  const errors: string[] = [];
  let projectsCreated = 0;
  let projectsUpdated = 0;
  let phasesCreated = 0;
  let phasesUpdated = 0;
  let tasksCreated = 0;
  let tasksUpdated = 0;
  let notesCreated = 0;

  // Per-project detail tracking
  const projectDetails: Array<{
    name: string;
    atId: number;
    status: string;
    phases: number;
    tasks: number;
    notes: number;
    errors: string[];
  }> = [];

  try {
    const allProjects = await client.getAllProjects();
    const pageSize = 5; // Smaller page size for comprehensive sync
    const startIdx = (page - 1) * pageSize;
    const pageProjects = allProjects.slice(startIdx, startIdx + pageSize);

    for (const atProject of pageProjects) {
      const projectLog: typeof projectDetails[0] = {
        name: atProject.projectName,
        atId: atProject.id,
        status: mapAtProjectStatus(atProject.status),
        phases: 0,
        tasks: 0,
        notes: 0,
        errors: [],
      };

      try {
        // Find or create local company
        let company = await prisma.company.findFirst({
          where: { autotaskCompanyId: String(atProject.companyID) },
        });

        if (!company) {
          try {
            const atCompany = await client.getCompany(atProject.companyID);
            const companyResult = await syncCompany(atCompany);
            company = await prisma.company.findUnique({ where: { id: companyResult.companyId } });
          } catch (err) {
            const msg = `Missing company ${atProject.companyID}: ${err instanceof Error ? err.message : String(err)}`;
            projectLog.errors.push(msg);
            errors.push(`Project "${atProject.projectName}" - ${msg}`);
            projectDetails.push(projectLog);
            continue;
          }
        }

        if (!company) {
          projectLog.errors.push('Company not found after sync attempt');
          projectDetails.push(projectLog);
          continue;
        }

        const result = await syncProject(atProject, company.id, client);
        if (result.created) projectsCreated++;
        else projectsUpdated++;
        phasesCreated += result.phasesCreated;
        phasesUpdated += result.phasesUpdated;
        tasksCreated += result.tasksCreated;
        tasksUpdated += result.tasksUpdated;
        notesCreated += result.notesCreated;
        projectLog.phases = result.phasesCreated + result.phasesUpdated;
        projectLog.tasks = result.tasksCreated + result.tasksUpdated;
        projectLog.notes = result.notesCreated;
        if (result.errors.length > 0) {
          projectLog.errors = result.errors;
          errors.push(...result.errors.map((e) => `Project "${atProject.projectName}": ${e}`));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        projectLog.errors.push(msg);
        errors.push(`Project "${atProject.projectName}" (${atProject.id}): ${msg}`);
      }

      projectDetails.push(projectLog);
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
      phasesCreated,
      phasesUpdated,
      tasksCreated,
      tasksUpdated,
      notesCreated,
      projectDetails,
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
// STEP: CONTACTS (auto-creates table if missing)
// ============================================

async function handleContactsSync(client: AutotaskClient) {
  // Auto-create company_contacts table if it doesn't exist
  try {
    await prisma.$queryRaw`SELECT 1 FROM company_contacts LIMIT 1`;
  } catch {
    // Table doesn't exist — create it
    try {
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          CREATE TYPE "PhoneType" AS ENUM ('MOBILE', 'WORK');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "company_contacts" (
          "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
          "companyId" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "email" TEXT NOT NULL,
          "title" TEXT,
          "phone" TEXT,
          "phoneType" "PhoneType",
          "isPrimary" BOOLEAN NOT NULL DEFAULT false,
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "autotaskContactId" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "company_contacts_pkey" PRIMARY KEY ("id")
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "company_contacts_companyId_email_key" ON "company_contacts"("companyId", "email");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "company_contacts_autotaskContactId_key" ON "company_contacts"("autotaskContactId");
      `);
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_companyId_fkey"
            FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
    } catch (createErr) {
      return NextResponse.json({
        step: 'contacts',
        error: `Failed to auto-create company_contacts table: ${createErr instanceof Error ? createErr.message : String(createErr)}`,
      }, { status: 500 });
    }
  }

  const startTime = Date.now();
  const errors: string[] = [];
  let created = 0;
  let updated = 0;

  try {
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

        // Update company primaryContact/contactEmail with first real contact
        if (atContacts.length > 0) {
          const primaryContact = atContacts.find(c => c.emailAddress && !c.emailAddress.includes('@placeholder.local')) || atContacts[0];
          if (primaryContact) {
            const contactName = `${primaryContact.firstName} ${primaryContact.lastName}`.trim();
            const contactEmail = primaryContact.emailAddress || null;
            try {
              await prisma.company.update({
                where: { id: company.id },
                data: {
                  primaryContact: contactName,
                  ...(contactEmail ? { contactEmail } : {}),
                },
              });
            } catch {
              // Non-critical — don't fail the sync
            }
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

  // Persist classification from Autotask (e.g., "Platinum Managed Service")
  const classificationName = atCompany.classificationName || null;

  if (existing) {
    const updateData: Record<string, unknown> = { autotaskLastSync: new Date() };
    if (existing.displayName !== atCompany.companyName) {
      updateData.displayName = atCompany.companyName;
    }
    if (classificationName) {
      updateData.companyClassification = classificationName;
    }
    await prisma.company.update({
      where: { id: existing.id },
      data: updateData,
    });
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
      companyClassification: classificationName,
    },
  });

  return { companyId: newCompany.id, created: true };
}

interface SyncProjectResult {
  created: boolean;
  phasesCreated: number;
  phasesUpdated: number;
  tasksCreated: number;
  tasksUpdated: number;
  notesCreated: number;
  errors: string[];
}

async function syncProject(
  atProject: AutotaskProject,
  companyId: string,
  client: AutotaskClient
): Promise<SyncProjectResult> {
  const atId = String(atProject.id);
  const projectErrors: string[] = [];

  const existing = await prisma.project.findFirst({
    where: { autotaskProjectId: atId },
  });

  const status = mapAtProjectStatus(atProject.status) as ProjectStatus;

  let projectId: string;

  if (existing) {
    await prisma.project.update({
      where: { id: existing.id },
      data: {
        title: atProject.projectName,
        status,
        startedAt: atProject.startDateTime ? new Date(atProject.startDateTime) : existing.startedAt,
        completedAt: status === 'COMPLETED' && atProject.endDateTime
          ? new Date(atProject.endDateTime) : existing.completedAt,
        estimatedDuration: atProject.estimatedHours ? `${atProject.estimatedHours} hours` : existing.estimatedDuration,
        lastModifiedBy: SYSTEM_EMAIL,
        autotaskLastSync: new Date(),
      },
    });
    projectId = existing.id;
  } else {
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
    projectId = newProject.id;
  }

  // Sync phases and tasks — DO NOT silently eat errors
  const phaseTaskResult = await syncProjectPhasesAndTasks(projectId, atProject.id, client);
  projectErrors.push(...phaseTaskResult.errors);

  // Sync project notes as comments
  let notesCreated = 0;
  try {
    notesCreated = await syncProjectNotes(projectId, atProject.id, client);
  } catch (err) {
    projectErrors.push(`Notes: ${err instanceof Error ? err.message : String(err)}`);
  }

  // If project has a description from Autotask, store it as an internal comment
  if (atProject.description && !existing) {
    try {
      const existingDescComment = await prisma.comment.findFirst({
        where: {
          phaseId: null,
          taskId: null,
          content: atProject.description,
          authorEmail: SYSTEM_EMAIL,
        },
      });
      if (!existingDescComment) {
        // Find the first phase to attach the description to
        const firstPhase = await prisma.phase.findFirst({
          where: { projectId },
          orderBy: { orderIndex: 'asc' },
          select: { id: true },
        });
        if (firstPhase) {
          await prisma.comment.create({
            data: {
              phaseId: firstPhase.id,
              content: `[Autotask Project Description]\n\n${atProject.description}`,
              isInternal: true,
              authorEmail: SYSTEM_EMAIL,
              authorName: 'Autotask Sync',
            },
          });
          notesCreated++;
        }
      }
    } catch (err) {
      projectErrors.push(`Project description comment: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    created: !existing,
    phasesCreated: phaseTaskResult.phasesCreated,
    phasesUpdated: phaseTaskResult.phasesUpdated,
    tasksCreated: phaseTaskResult.tasksCreated,
    tasksUpdated: phaseTaskResult.tasksUpdated,
    notesCreated,
    errors: projectErrors,
  };
}

interface PhaseTaskSyncResult {
  phasesCreated: number;
  phasesUpdated: number;
  tasksCreated: number;
  tasksUpdated: number;
  errors: string[];
}

async function syncProjectPhasesAndTasks(
  projectId: string,
  atProjectId: number,
  client: AutotaskClient
): Promise<PhaseTaskSyncResult> {
  let phasesCreated = 0;
  let phasesUpdated = 0;
  let tasksCreated = 0;
  let tasksUpdated = 0;
  const errors: string[] = [];

  // Fetch phases — report errors instead of silently swallowing
  let atPhases: AutotaskProjectPhase[] = [];
  try {
    atPhases = await client.getProjectPhases(atProjectId);
  } catch (err) {
    errors.push(`Failed to fetch phases for AT project ${atProjectId}: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Fetch tasks — report errors instead of silently swallowing
  let atTasks: AutotaskTask[] = [];
  try {
    atTasks = await client.getProjectTasks(atProjectId);
  } catch (err) {
    errors.push(`Failed to fetch tasks for AT project ${atProjectId}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const phaseIdMap = new Map<number, string>();

  // If no phases but we have tasks, create a default phase
  if (atPhases.length === 0 && atTasks.length > 0) {
    const defaultPhase = await getOrCreateDefaultPhase(projectId);
    for (const atTask of atTasks) {
      try {
        const result = await syncTask(atTask, defaultPhase.id);
        if (result.created) tasksCreated++;
        else tasksUpdated++;
      } catch (err) {
        errors.push(`Task "${atTask.title}" (${atTask.id}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return { phasesCreated, phasesUpdated, tasksCreated, tasksUpdated, errors };
  }

  // Sync each phase
  for (let i = 0; i < atPhases.length; i++) {
    try {
      const result = await syncPhase(atPhases[i], projectId, i);
      phaseIdMap.set(atPhases[i].id, result.phaseId);
      if (result.created) phasesCreated++;
      else phasesUpdated++;
    } catch (err) {
      errors.push(`Phase "${atPhases[i].title}" (${atPhases[i].id}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // If no tasks and no phases, create at least one phase with the project info
  if (atPhases.length === 0 && atTasks.length === 0) {
    // No phases or tasks from Autotask — that's OK, just note it
    return { phasesCreated, phasesUpdated, tasksCreated, tasksUpdated, errors };
  }

  // Sync each task into the correct phase
  for (const atTask of atTasks) {
    try {
      const localPhaseId = atTask.phaseID ? phaseIdMap.get(atTask.phaseID) : undefined;
      const phaseId = localPhaseId || (await getOrCreateDefaultPhase(projectId)).id;
      const result = await syncTask(atTask, phaseId);
      if (result.created) tasksCreated++;
      else tasksUpdated++;
    } catch (err) {
      errors.push(`Task "${atTask.title}" (${atTask.id}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { phasesCreated, phasesUpdated, tasksCreated, tasksUpdated, errors };
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

function mapAtPhaseStatus(atPhase: AutotaskProjectPhase): PhaseStatus {
  // Determine phase status from its dates and scheduling
  if (atPhase.dueDate && new Date(atPhase.dueDate) < new Date()) {
    return 'COMPLETE';
  }
  if (atPhase.isScheduled) {
    return 'SCHEDULED';
  }
  if (atPhase.startDate && new Date(atPhase.startDate) <= new Date()) {
    return 'IN_PROGRESS';
  }
  return 'NOT_STARTED';
}

async function syncPhase(
  atPhase: AutotaskProjectPhase,
  projectId: string,
  orderIndex: number
): Promise<{ phaseId: string; created: boolean }> {
  const atId = String(atPhase.id);
  const status = mapAtPhaseStatus(atPhase);

  const existing = await prisma.phase.findFirst({ where: { autotaskPhaseId: atId } });

  if (existing) {
    await prisma.phase.update({
      where: { id: existing.id },
      data: {
        title: atPhase.title,
        description: atPhase.description || existing.description,
        status,
        scheduledDate: atPhase.startDate ? new Date(atPhase.startDate) : existing.scheduledDate,
        estimatedDays: atPhase.estimatedHours ? Math.ceil(atPhase.estimatedHours / 8) : existing.estimatedDays,
        orderIndex: atPhase.sortOrder ?? orderIndex,
      },
    });
    return { phaseId: existing.id, created: false };
  }

  const newPhase = await prisma.phase.create({
    data: {
      projectId,
      title: atPhase.title,
      description: atPhase.description,
      orderIndex: atPhase.sortOrder ?? orderIndex,
      scheduledDate: atPhase.startDate ? new Date(atPhase.startDate) : null,
      estimatedDays: atPhase.estimatedHours ? Math.ceil(atPhase.estimatedHours / 8) : null,
      status,
      autotaskPhaseId: atId,
    },
  });

  return { phaseId: newPhase.id, created: true };
}

async function syncTask(
  atTask: AutotaskTask,
  phaseId: string
): Promise<{ created: boolean }> {
  const atId = String(atTask.id);

  const existing = await prisma.phaseTask.findFirst({ where: { autotaskTaskId: atId } });

  const status = mapAtTaskStatus(atTask.status) as TaskStatus;
  const priority = mapAtTaskPriority(atTask.priority) as Priority;
  const isComplete = status === 'REVIEWED_AND_DONE' || status === 'NOT_APPLICABLE';

  if (existing) {
    await prisma.phaseTask.update({
      where: { id: existing.id },
      data: {
        taskText: atTask.title,
        status,
        priority,
        dueDate: atTask.endDateTime ? new Date(atTask.endDateTime) : existing.dueDate,
        completed: isComplete,
        completedAt: isComplete && atTask.completedDateTime
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
      completed: isComplete,
      completedAt: isComplete && atTask.completedDateTime
        ? new Date(atTask.completedDateTime) : null,
      notes: atTask.description,
      autotaskTaskId: atId,
    },
  });

  return { created: true };
}

/**
 * Sync Autotask project notes as Comments on the first phase.
 */
async function syncProjectNotes(
  projectId: string,
  atProjectId: number,
  client: AutotaskClient
): Promise<number> {
  let atNotes: AutotaskProjectNote[] = [];
  try {
    atNotes = await client.getProjectNotes(atProjectId);
  } catch {
    // Notes endpoint not available — OK
    return 0;
  }

  if (atNotes.length === 0) return 0;

  // Attach notes to the first phase of this project
  const firstPhase = await prisma.phase.findFirst({
    where: { projectId },
    orderBy: { orderIndex: 'asc' },
    select: { id: true },
  });

  if (!firstPhase) return 0;

  let created = 0;

  for (const note of atNotes) {
    // Check if we already imported this note (by matching content + author)
    const notePrefix = `[AT Note: ${note.title}]`;

    const alreadyExists = await prisma.comment.findFirst({
      where: {
        phaseId: firstPhase.id,
        content: { startsWith: notePrefix },
        authorEmail: SYSTEM_EMAIL,
      },
    });

    if (alreadyExists) continue;

    const content = note.description
      ? `${notePrefix}\n\n${note.description}`
      : notePrefix;

    // publish: 1=All (external), 2=Internal only
    const isInternal = note.publish !== 1;

    await prisma.comment.create({
      data: {
        phaseId: firstPhase.id,
        content,
        isInternal,
        authorEmail: SYSTEM_EMAIL,
        authorName: 'Autotask Sync',
        createdAt: note.createDateTime ? new Date(note.createDateTime) : new Date(),
      },
    });
    created++;
  }

  return created;
}
