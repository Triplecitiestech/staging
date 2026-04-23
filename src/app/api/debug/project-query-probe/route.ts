import { NextRequest, NextResponse } from 'next/server'
import { checkSecretAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// Diagnostic endpoint — runs the exact Prisma queries that /admin/projects,
// /admin/projects/[id], and the customer portal use, and returns the actual
// error from each. Gated by MIGRATION_SECRET.
//
//   Invoke-RestMethod -Uri 'https://www.triplecitiestech.com/api/debug/project-query-probe' \
//     -Headers @{ Authorization = 'Bearer <MIGRATION_SECRET>' }
export async function GET(request: NextRequest) {
  const denied = checkSecretAuth(request)
  if (denied) return denied

  const { prisma } = await import('@/lib/prisma')

  const results: Record<string, unknown> = {}

  const probe = async (name: string, fn: () => Promise<unknown>) => {
    try {
      const start = Date.now()
      const value = await fn()
      results[name] = {
        ok: true,
        ms: Date.now() - start,
        count: Array.isArray(value) ? value.length : value ? 1 : 0,
        value,
      }
    } catch (e) {
      const err = e as { message?: string; code?: string; meta?: unknown }
      results[name] = {
        ok: false,
        message: err.message || String(e),
        code: err.code,
        meta: err.meta,
      }
    }
  }

  // 1. Admin projects list — primary query (with isVisibleToCustomer)
  await probe('admin_projects_primary', () =>
    prisma.project.findMany({
      select: {
        id: true,
        title: true,
        status: true,
        projectType: true,
        createdAt: true,
        aiGenerated: true,
        autotaskProjectId: true,
        isVisibleToCustomer: true,
        company: { select: { displayName: true, slug: true } },
        phases: {
          select: {
            status: true,
            tasks: {
              select: { status: true, completed: true },
              where: { parentTaskId: null },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })
  )

  // 2. Admin project detail — primary query (heavy include of all fields)
  await probe('admin_project_detail_primary', async () => {
    const sample = await prisma.project.findFirst({ select: { id: true } })
    if (!sample) return null
    return prisma.project.findUnique({
      where: { id: sample.id },
      include: {
        company: true,
        phases: {
          include: {
            tasks: {
              where: { parentTaskId: null },
              include: {
                comments: { orderBy: { createdAt: 'asc' } },
                assignments: { orderBy: { assignedAt: 'asc' } },
                subTasks: {
                  include: {
                    comments: { orderBy: { createdAt: 'asc' } },
                    assignments: { orderBy: { assignedAt: 'asc' } },
                    subTasks: {
                      include: {
                        comments: { orderBy: { createdAt: 'asc' } },
                        assignments: { orderBy: { assignedAt: 'asc' } },
                        subTasks: true,
                      },
                    },
                  },
                },
              },
              orderBy: { orderIndex: 'asc' },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    })
  })

  // 3. Portal primary — projects with isVisibleToCustomer on all levels
  await probe('portal_primary', async () => {
    const company = await prisma.company.findFirst({ select: { id: true } })
    if (!company) return null
    return prisma.project.findMany({
      where: { companyId: company.id, isVisibleToCustomer: true },
      include: {
        phases: {
          where: { isVisibleToCustomer: true },
          include: {
            tasks: {
              where: { isVisibleToCustomer: true, parentTaskId: null },
              select: {
                id: true,
                taskText: true,
                completed: true,
                orderIndex: true,
                notes: true,
                status: true,
                autotaskTaskId: true,
              },
            },
          },
        },
      },
      take: 3,
    })
  })

  // 4. Raw column check: do the three isVisibleToCustomer columns exist?
  await probe('column_check_phases_isVisibleToCustomer', async () => {
    const r = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'phases' AND column_name = 'isVisibleToCustomer'`
    )
    return r.length > 0 ? 'EXISTS' : 'MISSING'
  })
  await probe('column_check_phase_tasks_isVisibleToCustomer', async () => {
    const r = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'phase_tasks' AND column_name = 'isVisibleToCustomer'`
    )
    return r.length > 0 ? 'EXISTS' : 'MISSING'
  })
  await probe('column_check_projects_isVisibleToCustomer', async () => {
    const r = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'isVisibleToCustomer'`
    )
    return r.length > 0 ? 'EXISTS' : 'MISSING'
  })

  // 5. All columns on phases and phase_tasks (helps spot any other drift)
  await probe('phases_columns', async () => {
    return prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'phases' ORDER BY ordinal_position`
    )
  })
  await probe('phase_tasks_columns', async () => {
    return prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'phase_tasks' ORDER BY ordinal_position`
    )
  })
  await probe('projects_columns', async () => {
    return prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'projects' ORDER BY ordinal_position`
    )
  })
  await probe('companies_columns', async () => {
    return prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'companies' ORDER BY ordinal_position`
    )
  })

  // 6. Which schema(s) contain a 'projects' table? Helps detect search_path issues.
  await probe('projects_tables_by_schema', async () => {
    return prisma.$queryRawUnsafe<Array<{ table_schema: string; table_name: string }>>(
      `SELECT table_schema, table_name FROM information_schema.tables WHERE table_name = 'projects'`
    )
  })

  // 7. Current database + current_schema + search_path for this connection.
  await probe('connection_context', async () => {
    return prisma.$queryRawUnsafe<Array<Record<string, string>>>(
      `SELECT current_database() as db, current_schema() as schema, current_setting('search_path') as search_path`
    )
  })

  // 8. Explicit column check scoped to public schema.
  await probe('public_projects_columns', async () => {
    return prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name ILIKE 'isvisible%'`
    )
  })

  // 9. Prisma migration tracking — which migrations has prisma migrate deploy applied?
  await probe('prisma_migrations_recent', async () => {
    return prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
       FROM _prisma_migrations
       ORDER BY started_at DESC
       LIMIT 20`
    )
  })

  // 10. Specifically look up the two Apr 15 migrations that share a timestamp prefix.
  await probe('prisma_migrations_apr15', async () => {
    return prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count, logs
       FROM _prisma_migrations
       WHERE migration_name LIKE '20260415%' OR migration_name LIKE '%project_customer_visibility%' OR migration_name LIKE '%phase_customer_visibility%'`
    )
  })

  return NextResponse.json({ results }, { status: 200 })
}
