import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'unconfigured';
  latencyMs?: number;
  details?: string;
  lastChecked: string;
}

interface SystemHealthResponse {
  overall: 'healthy' | 'degraded' | 'down';
  services: ServiceStatus[];
  database: {
    status: 'healthy' | 'degraded' | 'down';
    latencyMs: number;
    tables: { name: string; rowCount: number }[];
    connectionPool?: string;
  };
  cronJobs: {
    name: string;
    lastRun: string | null;
    status: string;
    durationMs: number | null;
    schedule: string;
  }[];
  errors: {
    last24h: number;
    unresolved: number;
    recentErrors: { message: string; source: string; count: number; lastSeen: string }[];
  };
  environment: {
    configured: string[];
    missing: string[];
    nodeEnv: string;
    region: string;
  };
  metrics: {
    totalProjects: number;
    activeProjects: number;
    totalCompanies: number;
    totalBlogPosts: number;
    totalStaffUsers: number;
  };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user?.role as string)) {
    return apiError('Unauthorized', 'system-health', 401);
  }

  const now = new Date().toISOString();

  // Run all checks concurrently
  const [
    dbCheck,
    tableCountsResult,
    cronJobsResult,
    errorsResult,
    metricsResult,
  ] = await Promise.allSettled([
    checkDatabase(),
    getTableCounts(),
    getCronJobStatuses(),
    getErrorStats(),
    getMetrics(),
  ]);

  const dbResult = dbCheck.status === 'fulfilled' ? dbCheck.value : { status: 'down' as const, latencyMs: 0, error: dbCheck.reason?.message };
  const tableCounts = tableCountsResult.status === 'fulfilled' ? tableCountsResult.value : [];
  const cronJobs = cronJobsResult.status === 'fulfilled' ? cronJobsResult.value : [];
  const errors = errorsResult.status === 'fulfilled' ? errorsResult.value : { last24h: 0, unresolved: 0, recentErrors: [] };
  const metrics = metricsResult.status === 'fulfilled' ? metricsResult.value : { totalProjects: 0, activeProjects: 0, totalCompanies: 0, totalBlogPosts: 0, totalStaffUsers: 0 };

  // Check service configurations
  const services = checkServices(now);

  // Determine overall health
  const dbHealthy = dbResult.status === 'healthy';
  const criticalServicesDown = services.filter(s => s.status === 'down' && ['Database', 'Authentication (Azure AD)'].includes(s.name)).length > 0;
  const degradedServices = services.filter(s => s.status === 'degraded' || s.status === 'unconfigured').length;
  const highErrorRate = errors.last24h > 50;

  let overall: 'healthy' | 'degraded' | 'down' = 'healthy';
  if (!dbHealthy || criticalServicesDown) overall = 'down';
  else if (degradedServices > 2 || highErrorRate) overall = 'degraded';

  // Check environment variables
  const envCheck = checkEnvironment();

  const response: SystemHealthResponse = {
    overall,
    services,
    database: {
      status: dbResult.status,
      latencyMs: dbResult.latencyMs,
      tables: tableCounts,
      connectionPool: dbResult.error || 'Connected via PrismaPg adapter',
    },
    cronJobs,
    errors,
    environment: envCheck,
    metrics,
  };

  return Response.json(response);
}

async function checkDatabase(): Promise<{ status: 'healthy' | 'degraded' | 'down'; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    const latencyMs = Date.now() - start;
    return {
      status: latencyMs > 2000 ? 'degraded' : 'healthy',
      latencyMs,
    };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

async function getTableCounts(): Promise<{ name: string; rowCount: number }[]> {
  try {
    const [projects, companies, phases, tasks, blogPosts, staffUsers, errorLogs, auditLogs] = await Promise.all([
      prisma.project.count(),
      prisma.company.count(),
      prisma.phase.count(),
      prisma.phaseTask.count(),
      prisma.blogPost.count(),
      prisma.staffUser.count(),
      prisma.errorLog.count().catch(() => 0),
      prisma.auditLog.count().catch(() => 0),
    ]);
    return [
      { name: 'Projects', rowCount: projects },
      { name: 'Companies', rowCount: companies },
      { name: 'Phases', rowCount: phases },
      { name: 'Tasks', rowCount: tasks },
      { name: 'Blog Posts', rowCount: blogPosts },
      { name: 'Staff Users', rowCount: staffUsers },
      { name: 'Error Logs', rowCount: errorLogs },
      { name: 'Audit Logs', rowCount: auditLogs },
    ];
  } catch {
    return [];
  }
}

async function getCronJobStatuses() {
  const schedules: Record<string, string> = {
    'sync-tickets': 'Every 2 hours',
    'sync-time-entries': 'Every 2 hours',
    'sync-ticket-notes': 'Every 2 hours',
    'sync-resources': 'Daily',
    'aggregate-company': 'Nightly',
    'aggregate-technician': 'Nightly',
    'compute-health': 'Nightly',
    'compute-lifecycle': 'Nightly',
    'deliver': 'Nightly',
    'backfill': 'On demand',
    'generate-blog': 'Mon/Wed/Fri 8AM',
    'publish-scheduled': 'Every 15 min',
    'autotask-sync': 'Every 5 min',
  };

  try {
    const jobs = await prisma.reportingJobStatus.findMany({
      orderBy: { lastRunAt: 'desc' },
    });

    return jobs.map(job => ({
      name: job.jobName,
      lastRun: job.lastRunAt?.toISOString() ?? null,
      status: job.lastRunStatus ?? 'unknown',
      durationMs: job.lastRunDurationMs,
      schedule: schedules[job.jobName] || 'Unknown',
    }));
  } catch {
    return [];
  }
}

async function getErrorStats() {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [last24h, unresolved, recentErrors] = await Promise.all([
      prisma.errorLog.count({ where: { lastSeen: { gte: oneDayAgo } } }),
      prisma.errorLog.count({ where: { resolved: false } }),
      prisma.errorLog.findMany({
        where: { lastSeen: { gte: oneDayAgo } },
        orderBy: { lastSeen: 'desc' },
        take: 10,
        select: { message: true, source: true, count: true, lastSeen: true },
      }),
    ]);

    return {
      last24h,
      unresolved,
      recentErrors: recentErrors.map(e => ({
        message: e.message.slice(0, 200),
        source: e.source ?? 'unknown',
        count: e.count,
        lastSeen: e.lastSeen.toISOString(),
      })),
    };
  } catch {
    return { last24h: 0, unresolved: 0, recentErrors: [] };
  }
}

async function getMetrics() {
  const [totalProjects, activeProjects, totalCompanies, totalBlogPosts, totalStaffUsers] = await Promise.all([
    prisma.project.count(),
    prisma.project.count({ where: { status: 'ACTIVE' } }),
    prisma.company.count(),
    prisma.blogPost.count(),
    prisma.staffUser.count(),
  ]);

  return { totalProjects, activeProjects, totalCompanies, totalBlogPosts, totalStaffUsers };
}

function checkServices(now: string): ServiceStatus[] {
  const services: ServiceStatus[] = [];

  // Database
  services.push({
    name: 'Database (PostgreSQL)',
    status: process.env.DATABASE_URL ? 'healthy' : 'unconfigured',
    details: process.env.DATABASE_URL ? 'Vercel Postgres via PrismaPg' : 'DATABASE_URL not set',
    lastChecked: now,
  });

  // Anthropic API
  services.push({
    name: 'AI (Anthropic Claude)',
    status: process.env.ANTHROPIC_API_KEY ? 'healthy' : 'unconfigured',
    details: process.env.ANTHROPIC_API_KEY ? 'API key configured (claude-haiku-4-5, claude-opus-4)' : 'ANTHROPIC_API_KEY not set',
    lastChecked: now,
  });

  // Autotask
  const atConfigured = !!(process.env.AUTOTASK_API_USERNAME && process.env.AUTOTASK_API_SECRET && process.env.AUTOTASK_API_INTEGRATION_CODE);
  services.push({
    name: 'Autotask PSA',
    status: atConfigured ? 'healthy' : 'unconfigured',
    details: atConfigured ? 'REST API credentials configured' : 'Autotask API credentials missing',
    lastChecked: now,
  });

  // Azure AD
  const azureConfigured = !!(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET && process.env.AZURE_AD_TENANT_ID);
  services.push({
    name: 'Authentication (Azure AD)',
    status: azureConfigured ? 'healthy' : 'unconfigured',
    details: azureConfigured ? 'OAuth2 configured' : 'Azure AD credentials missing',
    lastChecked: now,
  });

  // Resend
  services.push({
    name: 'Email (Resend)',
    status: process.env.RESEND_API_KEY ? 'healthy' : 'unconfigured',
    details: process.env.RESEND_API_KEY ? 'API key configured' : 'RESEND_API_KEY not set',
    lastChecked: now,
  });

  // Turnstile
  const turnstileConfigured = !!(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  services.push({
    name: 'Bot Protection (Turnstile)',
    status: turnstileConfigured ? 'healthy' : 'unconfigured',
    details: turnstileConfigured ? 'Site + secret keys configured' : 'Turnstile keys missing',
    lastChecked: now,
  });

  return services;
}

function checkEnvironment() {
  const required = [
    'DATABASE_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL',
    'AZURE_AD_CLIENT_ID', 'AZURE_AD_CLIENT_SECRET', 'AZURE_AD_TENANT_ID',
    'ANTHROPIC_API_KEY', 'RESEND_API_KEY',
    'TURNSTILE_SECRET_KEY', 'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
    'NEXT_PUBLIC_BASE_URL',
  ];

  const optional = [
    'AUTOTASK_API_USERNAME', 'AUTOTASK_API_SECRET', 'AUTOTASK_API_INTEGRATION_CODE',
    'AUTOTASK_API_BASE_URL', 'MIGRATION_SECRET',
    'PRISMA_DATABASE_URL',
  ];

  const configured: string[] = [];
  const missing: string[] = [];

  for (const v of required) {
    if (process.env[v]) configured.push(v);
    else missing.push(v);
  }
  for (const v of optional) {
    if (process.env[v]) configured.push(v);
  }

  return {
    configured,
    missing,
    nodeEnv: process.env.NODE_ENV || 'unknown',
    region: process.env.VERCEL_REGION || process.env.AWS_REGION || 'local',
  };
}
