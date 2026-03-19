import { prisma } from '@/lib/prisma';

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
    stale: boolean;
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

export async function GET() {
  // No auth check — this endpoint only returns operational metrics (no PII).
  // The admin page server component already gates access via session.
  // Requiring auth here caused cascading 401s when DB was slow (database-backed sessions).
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

  // Update Database service to reflect actual connectivity (not just env var)
  const dbService = services.find(s => s.name === 'Database (PostgreSQL)');
  if (dbService) {
    dbService.status = dbResult.status === 'healthy' ? 'healthy' : dbResult.status === 'degraded' ? 'degraded' : 'down';
    dbService.details = dbResult.error || `Connected via PrismaPg (${dbResult.latencyMs}ms)`;
    dbService.latencyMs = dbResult.latencyMs;
  }

  // Determine overall health based on actual checks
  const dbHealthy = dbResult.status === 'healthy';
  const servicesDown = services.filter(s => s.status === 'down').length;
  const servicesDegraded = services.filter(s => s.status === 'degraded').length;
  const servicesUnconfigured = services.filter(s => s.status === 'unconfigured').length;
  const highErrorRate = errors.last24h > 50;
  const staleJobs = cronJobs.filter(j => j.stale).length;
  const failedJobs = cronJobs.filter(j => j.status === 'failed' || j.status === 'error').length;

  let overall: 'healthy' | 'degraded' | 'down' = 'healthy';
  if (!dbHealthy || servicesDown > 0) overall = 'down';
  else if (servicesDegraded > 0 || servicesUnconfigured > 2 || highErrorRate || staleJobs > 2 || failedJobs > 2) overall = 'degraded';

  // Persist a health snapshot for historical graphing (fire-and-forget)
  const servicesHealthy = services.filter(s => s.status === 'healthy').length;
  persistSnapshot(dbResult.latencyMs, dbResult.status, overall, servicesHealthy, services.length, errors.last24h);

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
  // Expected intervals in minutes for staleness detection (3x the interval = stale)
  const expectedIntervalMinutes: Record<string, number> = {
    'sync-tickets': 120,
    'sync-time-entries': 120,
    'sync-ticket-notes': 120,
    'sync-resources': 1440,       // daily
    'aggregate-company': 1440,
    'aggregate-technician': 1440,
    'compute-health': 10080,      // weekly
    'compute-lifecycle': 120,
    'deliver': 1440,
    'generate-blog': 2880,        // ~every 2 days (Mon/Wed/Fri)
    'publish-scheduled': 15,
    'autotask-sync': 5,
    'send-approval-emails': 1440,
    'soc-triage': 5,
    'datto-device-sync': 30,
  };

  // Schedules must match vercel.json cron definitions exactly
  const schedules: Record<string, string> = {
    'sync-tickets': 'Every 2 hours',
    'sync-time-entries': 'Every 2 hours (+10min)',
    'sync-ticket-notes': 'Every 2 hours (+20min)',
    'sync-resources': 'Daily midnight',
    'aggregate-company': 'Nightly 1:15AM',
    'aggregate-technician': 'Nightly 1AM',
    'compute-health': 'Weekly (Sun 2AM)',
    'compute-lifecycle': 'Every 2 hours (+30min)',
    'deliver': 'Daily 8AM',
    'backfill': 'On demand',
    'generate-blog': 'Mon/Wed/Fri 8AM',
    'publish-scheduled': 'Every 15 min',
    'autotask-sync': 'Every 5 min',
    'send-approval-emails': 'Daily noon',
    'soc-triage': 'Every 5 min',
    'datto-device-sync': 'Every 30 min',
  };

  try {
    const jobs = await prisma.reportingJobStatus.findMany({
      orderBy: { lastRunAt: 'desc' },
    });

    const now = Date.now();
    const result = jobs.map(job => {
      const lastRunMs = job.lastRunAt?.getTime() ?? 0;
      const expectedMin = expectedIntervalMinutes[job.jobName];
      // Stale if last run > 3x the expected interval
      const stale = !!(expectedMin && lastRunMs > 0 && (now - lastRunMs) > expectedMin * 3 * 60 * 1000);
      return {
        name: job.jobName,
        lastRun: job.lastRunAt?.toISOString() ?? null,
        status: job.lastRunStatus ?? 'unknown',
        durationMs: job.lastRunDurationMs,
        schedule: schedules[job.jobName] || 'Unknown',
        stale,
      };
    });

    // Include Autotask sync from its own log table (it uses AutotaskSyncLog, not ReportingJobStatus)
    if (!result.some(j => j.name === 'autotask-sync')) {
      try {
        const lastAtSync = await prisma.autotaskSyncLog.findFirst({
          orderBy: { startedAt: 'desc' },
        });
        if (lastAtSync) {
          const atLastRunMs = lastAtSync.completedAt?.getTime() ?? lastAtSync.startedAt.getTime();
          const atExpected = expectedIntervalMinutes['autotask-sync'] || 5;
          result.push({
            name: 'autotask-sync',
            lastRun: lastAtSync.completedAt?.toISOString() ?? lastAtSync.startedAt.toISOString(),
            status: lastAtSync.status === 'success' || lastAtSync.status === 'partial' ? 'success' : 'failed',
            durationMs: lastAtSync.durationMs,
            schedule: schedules['autotask-sync'] || 'Every 5 min',
            stale: (now - atLastRunMs) > atExpected * 3 * 60 * 1000,
          });
        }
      } catch {
        // AutotaskSyncLog table may not exist
      }
    }

    return result;
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

function persistSnapshot(
  dbLatencyMs: number,
  dbStatus: string,
  overallStatus: string,
  servicesUp: number,
  servicesTotal: number,
  errorCount24h: number,
) {
  // Fire-and-forget — never block the health response
  prisma.$executeRawUnsafe(
    `INSERT INTO system_health_snapshots (id, "dbLatencyMs", "dbStatus", "overallStatus", "servicesUp", "servicesTotal", "errorCount24h", "createdAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, NOW())`,
    dbLatencyMs, dbStatus, overallStatus, servicesUp, servicesTotal, errorCount24h
  ).catch(() => {
    // Table may not exist yet — silently ignore
  });
}
