/**
 * Health Monitor Cron Job
 * Runs every 15 minutes via Vercel Cron.
 *
 * Checks critical systems (DB, Autotask API, error rate, cron job health),
 * attempts self-healing for recoverable issues, and sends email alerts
 * to the admin when issues are detected or resolved.
 *
 * GET /api/cron/health-monitor
 * Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ADMIN_ALERT_EMAIL = 'kurtis@triplecitiestech.com';
const FROM_EMAIL = process.env.EMAIL_FROM || 'Triple Cities Tech <notifications@triplecitiestech.com>';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// --- Types ---

interface HealthCheck {
  system: string;
  status: 'healthy' | 'degraded' | 'down';
  details: string;
  selfHealAction?: string;
  selfHealResult?: string;
}

interface AlertRecord {
  system: string;
  alertedAt: string;
  status: string;
}

// --- Cron Auth + Handler ---

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: HealthCheck[] = [];
  const selfHealActions: string[] = [];

  // Run all checks
  const [dbResult, errorRateResult, cronJobsResult, autotaskResult] = await Promise.allSettled([
    checkDatabaseConnectivity(),
    checkErrorRate(),
    checkCronJobHealth(),
    checkAutotaskApi(),
  ]);

  // Collect results
  if (dbResult.status === 'fulfilled') {
    results.push(dbResult.value);
  } else {
    results.push({ system: 'Database', status: 'down', details: `Check failed: ${String(dbResult.reason)}` });
  }

  if (errorRateResult.status === 'fulfilled') {
    results.push(errorRateResult.value);
  } else {
    results.push({ system: 'Error Rate', status: 'degraded', details: `Check failed: ${String(errorRateResult.reason)}` });
  }

  if (cronJobsResult.status === 'fulfilled') {
    for (const check of cronJobsResult.value) {
      results.push(check);
    }
  } else {
    results.push({ system: 'Cron Jobs', status: 'degraded', details: `Check failed: ${String(cronJobsResult.reason)}` });
  }

  if (autotaskResult.status === 'fulfilled') {
    results.push(autotaskResult.value);
  } else {
    results.push({ system: 'Autotask API', status: 'degraded', details: `Check failed: ${String(autotaskResult.reason)}` });
  }

  // Collect self-heal actions for reporting
  for (const r of results) {
    if (r.selfHealAction) {
      selfHealActions.push(`[${r.system}] ${r.selfHealAction} => ${r.selfHealResult ?? 'pending'}`);
    }
  }

  // Determine issues and resolutions
  const issues = results.filter(r => r.status !== 'healthy');
  const healthy = results.filter(r => r.status === 'healthy');

  // Get previous alert state from DB
  const previousAlerts = await getPreviousAlerts();
  const previousAlertSystems = new Set(previousAlerts.map(a => a.system));

  // Systems that were previously alerted but are now healthy => send resolution
  const resolvedSystems = healthy.filter(r => previousAlertSystems.has(r.system));

  // Systems that have issues and were NOT alerted in last 2 hours => send alert
  // Also require 2+ consecutive failures (tracked via failure_count) to avoid transient noise
  const recentlyAlertedSystems = new Set(
    previousAlerts
      .filter(a => {
        const alertedAt = new Date(a.alertedAt).getTime();
        return Date.now() - alertedAt < 2 * 60 * 60 * 1000; // 2 hour cooldown
      })
      .map(a => a.system)
  );

  // Increment failure count for current issues, reset for healthy systems
  await updateFailureCounts(issues.map(i => i.system), healthy.map(h => h.system));
  const failureCounts = await getFailureCounts(issues.map(i => i.system));

  // Only alert if failure count >= 2 (means it failed on 2+ consecutive checks)
  const newIssues = issues.filter(r =>
    !recentlyAlertedSystems.has(r.system) && (failureCounts.get(r.system) ?? 0) >= 2
  );

  // Send alert emails for new issues
  if (newIssues.length > 0) {
    await sendIssueAlertEmail(newIssues);
    await recordAlerts(newIssues);
  }

  // Send resolution emails
  if (resolvedSystems.length > 0) {
    await sendResolutionEmail(resolvedSystems);
    await clearAlerts(resolvedSystems.map(r => r.system));
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    checks: results.length,
    issues: issues.length,
    newAlertsSent: newIssues.length,
    resolutionsSent: resolvedSystems.length,
    selfHealActions,
    results,
  });
}

// --- System Checks ---

async function checkDatabaseConnectivity(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    const latencyMs = Date.now() - start;

    if (latencyMs > 5000) {
      return {
        system: 'Database',
        status: 'degraded',
        details: `Database responding but slow (${latencyMs}ms latency)`,
      };
    }

    return {
      system: 'Database',
      status: 'healthy',
      details: `Connected (${latencyMs}ms)`,
    };
  } catch (err) {
    // Retry once
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await prisma.$queryRawUnsafe('SELECT 1');
      const latencyMs = Date.now() - start;
      return {
        system: 'Database',
        status: 'degraded',
        details: `Connection recovered on retry (${latencyMs}ms). Initial error: ${err instanceof Error ? err.message : 'unknown'}`,
        selfHealAction: 'Retried database connection',
        selfHealResult: 'Recovered on second attempt',
      };
    } catch {
      return {
        system: 'Database',
        status: 'down',
        details: `Database unreachable after retry: ${err instanceof Error ? err.message : 'unknown'}`,
        selfHealAction: 'Retried database connection',
        selfHealResult: 'Still failing - infrastructure issue requires manual intervention',
      };
    }
  }
}

async function checkErrorRate(): Promise<HealthCheck> {
  try {
    // Check if error_logs table exists first (migration may not have been applied)
    const tableCheck = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'error_logs') as exists`
    );
    if (!tableCheck[0]?.exists) {
      return {
        system: 'Error Rate',
        status: 'healthy',
        details: 'Error logging table not yet created (migration pending) — no errors tracked',
      };
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentErrors = await prisma.errorLog.findMany({
      where: { lastSeen: { gte: oneHourAgo } },
      orderBy: { count: 'desc' },
      take: 10,
      select: { message: true, source: true, count: true, path: true },
    });

    const totalErrorCount = recentErrors.reduce((sum, e) => sum + e.count, 0);

    if (totalErrorCount > 10) {
      const errorSummary = recentErrors
        .slice(0, 5)
        .map(e => `[${e.source}] ${e.message.slice(0, 100)} (x${e.count})${e.path ? ` at ${e.path}` : ''}`)
        .join('; ');

      return {
        system: 'Error Rate',
        status: totalErrorCount > 50 ? 'down' : 'degraded',
        details: `${totalErrorCount} errors in last hour. Top errors: ${errorSummary}`,
      };
    }

    return {
      system: 'Error Rate',
      status: 'healthy',
      details: `${totalErrorCount} errors in last hour (within normal range)`,
    };
  } catch (err) {
    return {
      system: 'Error Rate',
      status: 'degraded',
      details: `Could not check error rate: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
}

async function checkCronJobHealth(): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];

  // Critical cron jobs and their expected max age in minutes
  const criticalJobs: { name: string; displayName: string; maxAgeMinutes: number; retriggerPath?: string }[] = [
    { name: 'sync_tickets', displayName: 'sync-tickets', maxAgeMinutes: 360, retriggerPath: '/api/reports/jobs/sync-tickets' },
    { name: 'sync_time_entries', displayName: 'sync-time-entries', maxAgeMinutes: 360, retriggerPath: '/api/reports/jobs/sync-time-entries' },
    { name: 'aggregate_company', displayName: 'aggregate-company', maxAgeMinutes: 2880, retriggerPath: '/api/reports/jobs/aggregate-company' },
    { name: 'aggregate_technician', displayName: 'aggregate-technician', maxAgeMinutes: 2880, retriggerPath: '/api/reports/jobs/aggregate-technician' },
  ];

  try {
    // Check if reporting_job_status table exists first
    const tableCheck = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reporting_job_status') as exists`
    );
    if (!tableCheck[0]?.exists) {
      checks.push({
        system: 'Cron Jobs',
        status: 'healthy',
        details: 'Job status table not yet created (migration pending) — jobs may still be running but status is not tracked',
      });
      return checks;
    }

    const jobs = await prisma.reportingJobStatus.findMany({
      where: { jobName: { in: criticalJobs.map(j => j.name) } },
    });

    const jobMap = new Map(jobs.map(j => [j.jobName, j]));

    for (const expected of criticalJobs) {
      const job = jobMap.get(expected.name);

      if (!job || !job.lastRunAt) {
        checks.push({
          system: `Cron: ${expected.displayName}`,
          status: 'degraded',
          details: `Job "${expected.displayName}" has never run or is missing from job status table`,
        });
        continue;
      }

      const ageMinutes = (Date.now() - job.lastRunAt.getTime()) / (60 * 1000);
      const isStale = ageMinutes > expected.maxAgeMinutes;
      const isFailed = job.lastRunStatus === 'failed' || job.lastRunStatus === 'error';

      if (isStale || isFailed) {
        let selfHealAction: string | undefined;
        let selfHealResult: string | undefined;

        // Attempt self-healing: re-trigger stale aggregation jobs
        if (isStale && expected.retriggerPath) {
          selfHealAction = `Re-triggering stale job via ${expected.retriggerPath}`;
          selfHealResult = await retriggerCronJob(expected.retriggerPath);
        } else if (isFailed && expected.retriggerPath) {
          selfHealAction = `Re-triggering failed job via ${expected.retriggerPath}`;
          selfHealResult = await retriggerCronJob(expected.retriggerPath);
        }

        checks.push({
          system: `Cron: ${expected.displayName}`,
          status: 'degraded',
          details: isStale
            ? `Job "${expected.displayName}" is stale (last ran ${Math.round(ageMinutes)} min ago, max ${expected.maxAgeMinutes} min). Status: ${job.lastRunStatus ?? 'unknown'}`
            : `Job "${expected.displayName}" last status: ${job.lastRunStatus}`,
          selfHealAction,
          selfHealResult,
        });
      } else {
        checks.push({
          system: `Cron: ${expected.displayName}`,
          status: 'healthy',
          details: `Last ran ${Math.round(ageMinutes)} min ago, status: ${job.lastRunStatus}`,
        });
      }
    }
  } catch (err) {
    checks.push({
      system: 'Cron Jobs',
      status: 'degraded',
      details: `Could not check cron job statuses: ${err instanceof Error ? err.message : 'unknown'}`,
    });
  }

  return checks;
}

async function checkAutotaskApi(): Promise<HealthCheck> {
  const configured = !!(
    process.env.AUTOTASK_API_USERNAME &&
    process.env.AUTOTASK_API_SECRET &&
    process.env.AUTOTASK_API_INTEGRATION_CODE &&
    process.env.AUTOTASK_API_BASE_URL
  );

  if (!configured) {
    return {
      system: 'Autotask API',
      status: 'healthy',
      details: 'Autotask API not configured (skipping check)',
    };
  }

  // Check via the most recent sync log
  try {
    const lastSync = await prisma.autotaskSyncLog.findFirst({
      orderBy: { startedAt: 'desc' },
      select: { status: true, startedAt: true, completedAt: true, errors: true },
    });

    if (!lastSync) {
      return {
        system: 'Autotask API',
        status: 'degraded',
        details: 'No Autotask sync logs found - sync may not be running',
      };
    }

    const ageMinutes = (Date.now() - lastSync.startedAt.getTime()) / (60 * 1000);

    if (lastSync.status === 'failed' || lastSync.status === 'error') {
      return {
        system: 'Autotask API',
        status: 'degraded',
        details: `Last Autotask sync failed ${Math.round(ageMinutes)} min ago: ${lastSync.errors ?? 'unknown error'}`,
      };
    }

    if (ageMinutes > 60) {
      return {
        system: 'Autotask API',
        status: 'degraded',
        details: `Autotask sync is stale - last ran ${Math.round(ageMinutes)} min ago (expected every 15 min)`,
      };
    }

    return {
      system: 'Autotask API',
      status: 'healthy',
      details: `Last sync ${Math.round(ageMinutes)} min ago, status: ${lastSync.status}`,
    };
  } catch (err) {
    return {
      system: 'Autotask API',
      status: 'degraded',
      details: `Could not check Autotask sync status: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
}

// --- Self-Healing ---

async function retriggerCronJob(path: string): Promise<string> {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const headers: Record<string, string> = {};
    if (cronSecret) {
      headers['Authorization'] = `Bearer ${cronSecret}`;
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      headers,
    });

    if (response.ok) {
      return `Re-triggered successfully (HTTP ${response.status})`;
    }
    return `Re-trigger returned HTTP ${response.status}`;
  } catch (err) {
    return `Re-trigger failed: ${err instanceof Error ? err.message : 'unknown error'}`;
  }
}

// --- Alert State (DB-backed via health_monitor_alerts table) ---

async function ensureAlertTable(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS health_monitor_alerts (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        system TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        details TEXT,
        "alertedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } catch {
    // Table may already exist or DB may be down
  }
}

async function getPreviousAlerts(): Promise<AlertRecord[]> {
  await ensureAlertTable();
  try {
    const rows = await prisma.$queryRawUnsafe<{ system: string; alertedAt: Date; status: string }[]>(
      'SELECT system, "alertedAt", status FROM health_monitor_alerts'
    );
    return rows.map(r => ({
      system: r.system,
      alertedAt: r.alertedAt instanceof Date ? r.alertedAt.toISOString() : String(r.alertedAt),
      status: r.status,
    }));
  } catch {
    return [];
  }
}

async function recordAlerts(issues: HealthCheck[]): Promise<void> {
  await ensureAlertTable();
  for (const issue of issues) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO health_monitor_alerts (id, system, status, details, "alertedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, NOW())
         ON CONFLICT (system) DO UPDATE SET status = $2, details = $3, "alertedAt" = NOW()`,
        issue.system,
        issue.status,
        issue.details
      );
    } catch {
      // Best effort
    }
  }
}

async function clearAlerts(systems: string[]): Promise<void> {
  await ensureAlertTable();
  for (const system of systems) {
    try {
      await prisma.$executeRawUnsafe(
        'DELETE FROM health_monitor_alerts WHERE system = $1',
        system
      );
    } catch {
      // Best effort
    }
  }
}

// --- Failure Count Tracking (prevents alerting on single transient failures) ---

async function ensureFailureCountColumn(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE health_monitor_alerts ADD COLUMN IF NOT EXISTS failure_count INTEGER DEFAULT 0
    `);
  } catch {
    // Column may already exist or table not created yet
  }
}

async function updateFailureCounts(issueSystems: string[], healthySystems: string[]): Promise<void> {
  await ensureAlertTable();
  await ensureFailureCountColumn();

  // Increment failure count for systems with issues
  for (const system of issueSystems) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO health_monitor_alerts (id, system, status, failure_count, "alertedAt")
         VALUES (gen_random_uuid()::text, $1, 'tracking', 1, NOW())
         ON CONFLICT (system) DO UPDATE SET failure_count = COALESCE(health_monitor_alerts.failure_count, 0) + 1`,
        system
      );
    } catch {
      // Best effort
    }
  }

  // Reset failure count for healthy systems
  for (const system of healthySystems) {
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE health_monitor_alerts SET failure_count = 0 WHERE system = $1`,
        system
      );
    } catch {
      // Best effort
    }
  }
}

async function getFailureCounts(systems: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (systems.length === 0) return counts;

  try {
    const rows = await prisma.$queryRawUnsafe<{ system: string; failure_count: number }[]>(
      `SELECT system, COALESCE(failure_count, 0) as failure_count FROM health_monitor_alerts WHERE system = ANY($1)`,
      systems
    );
    for (const row of rows) {
      counts.set(row.system, row.failure_count);
    }
  } catch {
    // Return empty map if query fails
  }

  return counts;
}

// --- Email Sending ---

async function sendIssueAlertEmail(issues: HealthCheck[]): Promise<void> {
  if (!resend) {
    console.warn('[health-monitor] Resend not configured, cannot send alert email');
    return;
  }

  const summary = issues.length === 1
    ? issues[0].system
    : `${issues.length} systems need attention`;

  const subject = `[TCT Platform] \u26A0\uFE0F Issue Detected: ${summary}`;

  const issueRows = issues.map(issue => {
    const statusColor = issue.status === 'down' ? '#dc2626' : '#ea580c';
    const statusLabel = issue.status === 'down' ? 'DOWN' : 'DEGRADED';

    let selfHealHtml = '';
    if (issue.selfHealAction) {
      selfHealHtml = `
        <div style="margin-top:12px;padding:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;">
          <p style="font-size:13px;font-weight:600;color:#1e40af;margin:0 0 4px;">Automated Recovery Action</p>
          <p style="font-size:13px;color:#1e3a5f;margin:0 0 2px;"><strong>Action:</strong> ${issue.selfHealAction}</p>
          <p style="font-size:13px;color:#1e3a5f;margin:0;"><strong>Result:</strong> ${issue.selfHealResult ?? 'pending'}</p>
        </div>`;
    }

    return `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h3 style="margin:0;font-size:16px;color:#0f172a;">${issue.system}</h3>
          <span style="background:${statusColor};color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">${statusLabel}</span>
        </div>
        <p style="font-size:14px;color:#475569;margin:0;">${issue.details}</p>
        ${selfHealHtml}
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#7f1d1d 0%,#991b1b 100%);color:white;padding:24px 32px;">
      <h1 style="margin:0;font-size:18px;">\u26A0\uFE0F Platform Health Alert</h1>
      <p style="margin:4px 0 0;font-size:13px;opacity:0.8;">Triple Cities Tech \u2014 Automated Health Monitor</p>
    </div>
    <div style="padding:24px 32px;">
      <p style="font-size:14px;color:#475569;margin:0 0 20px;">
        The health monitor has detected issues with the following systems. Automated recovery actions have been attempted where possible.
      </p>
      ${issueRows}
      <div style="text-align:center;margin-top:24px;">
        <a href="${BASE_URL}/admin" style="display:inline-block;background:#0891b2;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
          View Admin Dashboard
        </a>
      </div>
    </div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8;">
      Triple Cities Tech Platform \u2022 Automated Health Monitor \u2022 Checks every 30 minutes
    </div>
  </div>
</body>
</html>`;

  const text = `PLATFORM HEALTH ALERT - Triple Cities Tech

Issues detected:

${issues.map(issue => {
  let entry = `${issue.system} [${issue.status.toUpperCase()}]
  ${issue.details}`;
  if (issue.selfHealAction) {
    entry += `\n  Automated action: ${issue.selfHealAction}\n  Result: ${issue.selfHealResult ?? 'pending'}`;
  }
  return entry;
}).join('\n\n')}

View dashboard: ${BASE_URL}/admin`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [ADMIN_ALERT_EMAIL],
      subject,
      html,
      text,
    });
    console.log(`[health-monitor] Alert email sent for: ${issues.map(i => i.system).join(', ')}`);
  } catch (err) {
    console.error('[health-monitor] Failed to send alert email:', err);
  }
}

async function sendResolutionEmail(resolved: HealthCheck[]): Promise<void> {
  if (!resend) {
    console.warn('[health-monitor] Resend not configured, cannot send resolution email');
    return;
  }

  const summary = resolved.length === 1
    ? resolved[0].system
    : `${resolved.length} systems recovered`;

  const subject = `[TCT Platform] \u2705 Issue Resolved: ${summary}`;

  const resolvedRows = resolved.map(r => `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3 style="margin:0;font-size:16px;color:#0f172a;">${r.system}</h3>
        <span style="background:#059669;color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">RESOLVED</span>
      </div>
      <p style="font-size:14px;color:#166534;margin:0;">${r.details}</p>
    </div>`
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#064e3b 0%,#059669 100%);color:white;padding:24px 32px;">
      <h1 style="margin:0;font-size:18px;">\u2705 Platform Health Restored</h1>
      <p style="margin:4px 0 0;font-size:13px;opacity:0.8;">Triple Cities Tech \u2014 Automated Health Monitor</p>
    </div>
    <div style="padding:24px 32px;">
      <p style="font-size:14px;color:#475569;margin:0 0 20px;">
        The following systems have recovered and are now operating normally.
      </p>
      ${resolvedRows}
      <div style="text-align:center;margin-top:24px;">
        <a href="${BASE_URL}/admin" style="display:inline-block;background:#059669;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
          View Admin Dashboard
        </a>
      </div>
    </div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8;">
      Triple Cities Tech Platform \u2022 Automated Health Monitor \u2022 Checks every 30 minutes
    </div>
  </div>
</body>
</html>`;

  const text = `PLATFORM HEALTH RESTORED - Triple Cities Tech

The following systems have recovered:

${resolved.map(r => `${r.system} [RESOLVED]\n  ${r.details}`).join('\n\n')}

View dashboard: ${BASE_URL}/admin`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [ADMIN_ALERT_EMAIL],
      subject,
      html,
      text,
    });
    console.log(`[health-monitor] Resolution email sent for: ${resolved.map(r => r.system).join(', ')}`);
  } catch (err) {
    console.error('[health-monitor] Failed to send resolution email:', err);
  }
}
