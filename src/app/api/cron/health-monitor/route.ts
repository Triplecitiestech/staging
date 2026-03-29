/**
 * Health Monitor Cron Job — Redesigned for Stability
 *
 * Runs every 30 minutes via Vercel Cron.
 *
 * KEY DESIGN PRINCIPLES:
 * 1. Sliding window evaluation — tracks last N check results per system
 * 2. Sustained failure required — 3+ consecutive failures before alerting
 * 3. Sustained recovery required — 2+ consecutive healthy before resolution email
 * 4. Cold-start tolerant — generous retries on DB checks
 * 5. Transient-aware — single failures NEVER trigger alerts
 * 6. Alert cooldown — 4 hours between repeated alerts for the same system
 *
 * GET /api/cron/health-monitor
 * Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';
import {
  generateCorrelationId,
  structuredLog,
  type LogContext,
} from '@/lib/resilience';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ADMIN_ALERT_EMAIL = 'kurtis@triplecitiestech.com';
const FROM_EMAIL = process.env.EMAIL_FROM || 'Triple Cities Tech <notifications@triplecitiestech.com>';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// --- Configuration ---

/** Number of consecutive failures before sending an alert */
const ALERT_FAILURE_THRESHOLD = 3;
/** Number of consecutive healthy checks before sending a resolution */
const RECOVERY_THRESHOLD = 2;
/** Minimum time between repeated alerts for the same system (ms) */
const ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours
/** Maximum check history entries to keep per system */
const MAX_HISTORY_ENTRIES = 10;

// --- Types ---

interface HealthCheck {
  system: string;
  status: 'healthy' | 'degraded' | 'down';
  details: string;
  selfHealAction?: string;
  selfHealResult?: string;
}

interface CheckHistoryEntry {
  status: string;
  checkedAt: string;
}

// --- Cron Auth + Handler ---

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const ctx: LogContext = { correlationId, operation: 'health-monitor' };

  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: HealthCheck[] = [];

  // Run all checks in parallel
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
    results.push({ system: 'Error Rate', status: 'healthy', details: 'Error rate check failed — treating as healthy (non-critical)' });
  }

  if (cronJobsResult.status === 'fulfilled') {
    for (const check of cronJobsResult.value) {
      results.push(check);
    }
  } else {
    // Cron job check failure is NOT an issue — the check itself failed, not the cron jobs
    results.push({ system: 'Cron Jobs', status: 'healthy', details: 'Cron job status check failed — treating as healthy (non-critical)' });
  }

  if (autotaskResult.status === 'fulfilled') {
    results.push(autotaskResult.value);
  } else {
    results.push({ system: 'Autotask API', status: 'healthy', details: 'Autotask check failed — treating as healthy (non-critical)' });
  }

  // Ensure the tracking table exists
  await ensureHealthTable();

  // Record each check result in the sliding window
  for (const result of results) {
    await recordCheckResult(result.system, result.status);
  }

  // Evaluate alerts based on sliding window
  const issues = results.filter(r => r.status !== 'healthy');
  const healthy = results.filter(r => r.status === 'healthy');

  // Determine which systems should trigger NEW alerts
  const systemsToAlert: HealthCheck[] = [];
  for (const issue of issues) {
    const shouldAlert = await shouldSendAlert(issue.system);
    if (shouldAlert) {
      systemsToAlert.push(issue);
    }
  }

  // Determine which systems should trigger RESOLUTION emails
  const systemsToResolve: HealthCheck[] = [];
  for (const h of healthy) {
    const shouldResolve = await shouldSendResolution(h.system);
    if (shouldResolve) {
      systemsToResolve.push(h);
    }
  }

  // Send alert emails
  if (systemsToAlert.length > 0) {
    await sendIssueAlertEmail(systemsToAlert);
    for (const s of systemsToAlert) {
      await recordAlertSent(s.system, s.status);
    }
    structuredLog.warn(
      { ...ctx, alertedSystems: systemsToAlert.map(s => s.system) },
      `Sent alerts for: ${systemsToAlert.map(s => s.system).join(', ')}`,
    );
  }

  // Send resolution emails
  if (systemsToResolve.length > 0) {
    await sendResolutionEmail(systemsToResolve);
    for (const s of systemsToResolve) {
      await clearAlert(s.system);
    }
    structuredLog.info(
      { ...ctx, resolvedSystems: systemsToResolve.map(s => s.system) },
      `Sent resolutions for: ${systemsToResolve.map(s => s.system).join(', ')}`,
    );
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    correlationId,
    checks: results.length,
    issues: issues.length,
    newAlertsSent: systemsToAlert.length,
    resolutionsSent: systemsToResolve.length,
    results,
  });
}

// --- System Checks ---

async function checkDatabaseConnectivity(): Promise<HealthCheck> {
  // Try up to 3 times with exponential backoff — cold starts may need multiple attempts
  const maxAttempts = 3;
  let lastError: string | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const start = Date.now();
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      const latencyMs = Date.now() - start;

      if (latencyMs > 8000) {
        return {
          system: 'Database',
          status: 'degraded',
          details: `Database responding but slow (${latencyMs}ms latency)`,
        };
      }

      // If we recovered after retries, still report healthy — transient failures are expected
      return {
        system: 'Database',
        status: 'healthy',
        details: attempt > 0
          ? `Connected on attempt ${attempt + 1} (${latencyMs}ms) — initial failure was transient`
          : `Connected (${latencyMs}ms)`,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'unknown';
      if (attempt < maxAttempts - 1) {
        // Exponential backoff: 1s, 2s
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  return {
    system: 'Database',
    status: 'down',
    details: `Database unreachable after ${maxAttempts} attempts: ${lastError}`,
  };
}

async function checkErrorRate(): Promise<HealthCheck> {
  try {
    const tableCheck = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'error_logs') as exists`
    );
    if (!tableCheck[0]?.exists) {
      return {
        system: 'Error Rate',
        status: 'healthy',
        details: 'Error logging table not yet created — no errors tracked',
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

    if (totalErrorCount > 50) {
      const errorSummary = recentErrors
        .slice(0, 5)
        .map(e => `[${e.source}] ${e.message.slice(0, 100)} (x${e.count})${e.path ? ` at ${e.path}` : ''}`)
        .join('; ');

      return {
        system: 'Error Rate',
        status: totalErrorCount > 200 ? 'down' : 'degraded',
        details: `${totalErrorCount} errors in last hour. Top: ${errorSummary}`,
      };
    }

    return {
      system: 'Error Rate',
      status: 'healthy',
      details: `${totalErrorCount} errors in last hour`,
    };
  } catch {
    // If we can't check error rate, it's not a health issue
    return {
      system: 'Error Rate',
      status: 'healthy',
      details: 'Error rate check unavailable — treating as healthy',
    };
  }
}

async function checkCronJobHealth(): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];

  const criticalJobs: { name: string; displayName: string; maxAgeMinutes: number }[] = [
    { name: 'sync_tickets', displayName: 'sync-tickets', maxAgeMinutes: 360 },
    { name: 'sync_time_entries', displayName: 'sync-time-entries', maxAgeMinutes: 360 },
    { name: 'aggregate_company', displayName: 'aggregate-company', maxAgeMinutes: 2880 },
    { name: 'aggregate_technician', displayName: 'aggregate-technician', maxAgeMinutes: 2880 },
  ];

  try {
    const tableCheck = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reporting_job_status') as exists`
    );
    if (!tableCheck[0]?.exists) {
      checks.push({
        system: 'Cron Jobs',
        status: 'healthy',
        details: 'Job status table not yet created — treating as healthy',
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
        // Job never ran — this is NOT degraded, it's just not started yet
        checks.push({
          system: `Cron: ${expected.displayName}`,
          status: 'healthy',
          details: `Job "${expected.displayName}" has not run yet — will start on next cron cycle`,
        });
        continue;
      }

      const ageMinutes = (Date.now() - job.lastRunAt.getTime()) / (60 * 1000);
      const isStale = ageMinutes > expected.maxAgeMinutes;
      // "partial" status means some items succeeded — this is NOT a failure
      const isFailed = job.lastRunStatus === 'failed' || job.lastRunStatus === 'error';

      if (isStale && isFailed) {
        checks.push({
          system: `Cron: ${expected.displayName}`,
          status: 'degraded',
          details: `Job "${expected.displayName}" is stale AND failed (last ran ${Math.round(ageMinutes)} min ago, status: ${job.lastRunStatus})`,
        });
      } else if (isStale) {
        checks.push({
          system: `Cron: ${expected.displayName}`,
          status: 'degraded',
          details: `Job "${expected.displayName}" is stale (last ran ${Math.round(ageMinutes)} min ago, max ${expected.maxAgeMinutes} min)`,
        });
      } else {
        checks.push({
          system: `Cron: ${expected.displayName}`,
          status: 'healthy',
          details: `Last ran ${Math.round(ageMinutes)} min ago, status: ${job.lastRunStatus}`,
        });
      }
    }
  } catch {
    // If we can't check cron jobs, don't treat it as a health issue
    checks.push({
      system: 'Cron Jobs',
      status: 'healthy',
      details: 'Cron job status check unavailable — treating as healthy',
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

  try {
    const lastSync = await prisma.autotaskSyncLog.findFirst({
      orderBy: { startedAt: 'desc' },
      select: { status: true, startedAt: true, completedAt: true, errors: true },
    });

    if (!lastSync) {
      return {
        system: 'Autotask API',
        status: 'healthy',
        details: 'No sync logs found — sync may not have run yet',
      };
    }

    const ageMinutes = (Date.now() - lastSync.startedAt.getTime()) / (60 * 1000);

    // "partial" status is normal — some contacts may fail while the overall sync works
    // "failed" with transient error is also expected occasionally
    // Only report degraded if the LAST sync failed AND it's been a while
    if (lastSync.status === 'failed' && ageMinutes > 60) {
      return {
        system: 'Autotask API',
        status: 'degraded',
        details: `Last sync failed ${Math.round(ageMinutes)} min ago: ${lastSync.errors ?? 'unknown'}`,
      };
    }

    if (ageMinutes > 120) {
      return {
        system: 'Autotask API',
        status: 'degraded',
        details: `Autotask sync is stale — last ran ${Math.round(ageMinutes)} min ago`,
      };
    }

    return {
      system: 'Autotask API',
      status: 'healthy',
      details: `Last sync ${Math.round(ageMinutes)} min ago, status: ${lastSync.status}`,
    };
  } catch {
    // Can't check Autotask status — not a health issue itself
    return {
      system: 'Autotask API',
      status: 'healthy',
      details: 'Autotask sync status check unavailable — treating as healthy',
    };
  }
}

// --- Sliding Window State (DB-backed) ---

async function ensureHealthTable(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS health_monitor_state (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        system TEXT NOT NULL UNIQUE,
        -- JSON array of recent check results [{status, checkedAt}, ...]
        check_history JSONB NOT NULL DEFAULT '[]',
        -- Alert tracking
        last_alert_at TIMESTAMPTZ,
        last_alert_status TEXT,
        -- When was the last resolution email sent
        last_resolution_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } catch {
    // Table may already exist
  }
}

async function recordCheckResult(system: string, status: string): Promise<void> {
  try {
    const entry: CheckHistoryEntry = {
      status,
      checkedAt: new Date().toISOString(),
    };

    // Upsert: append to history, trim to MAX_HISTORY_ENTRIES
    await prisma.$executeRawUnsafe(`
      INSERT INTO health_monitor_state (id, system, check_history, updated_at)
      VALUES (gen_random_uuid()::text, $1, $2::jsonb, NOW())
      ON CONFLICT (system) DO UPDATE SET
        check_history = (
          SELECT jsonb_agg(elem)
          FROM (
            SELECT elem FROM jsonb_array_elements(
              health_monitor_state.check_history || $2::jsonb
            ) elem
            ORDER BY elem->>'checkedAt' DESC
            LIMIT ${MAX_HISTORY_ENTRIES}
          ) sub
        ),
        updated_at = NOW()
    `, system, JSON.stringify([entry]));
  } catch {
    // Non-critical
  }
}

async function getCheckHistory(system: string): Promise<CheckHistoryEntry[]> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ check_history: CheckHistoryEntry[] }[]>(
      `SELECT check_history FROM health_monitor_state WHERE system = $1`,
      system,
    );
    if (rows.length > 0 && Array.isArray(rows[0].check_history)) {
      return rows[0].check_history;
    }
  } catch {
    // Non-critical
  }
  return [];
}

/**
 * Should we send an alert for this system?
 * Only if:
 * 1. Last N checks have ALL been non-healthy (sustained failure)
 * 2. We haven't sent an alert in the last ALERT_COOLDOWN_MS
 */
async function shouldSendAlert(system: string): Promise<boolean> {
  try {
    const history = await getCheckHistory(system);
    if (history.length < ALERT_FAILURE_THRESHOLD) return false;

    // Check if last ALERT_FAILURE_THRESHOLD checks are all non-healthy
    const recentChecks = history
      .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))
      .slice(0, ALERT_FAILURE_THRESHOLD);

    const allFailing = recentChecks.every(c => c.status !== 'healthy');
    if (!allFailing) return false;

    // Check cooldown
    const rows = await prisma.$queryRawUnsafe<{ last_alert_at: Date | null }[]>(
      `SELECT last_alert_at FROM health_monitor_state WHERE system = $1`,
      system,
    );

    if (rows.length > 0 && rows[0].last_alert_at) {
      const elapsed = Date.now() - new Date(rows[0].last_alert_at).getTime();
      if (elapsed < ALERT_COOLDOWN_MS) return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Should we send a resolution email for this system?
 * Only if:
 * 1. We previously sent an alert for this system
 * 2. Last RECOVERY_THRESHOLD checks have ALL been healthy (sustained recovery)
 */
async function shouldSendResolution(system: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ last_alert_at: Date | null; last_resolution_at: Date | null }[]>(
      `SELECT last_alert_at, last_resolution_at FROM health_monitor_state WHERE system = $1`,
      system,
    );

    // No previous alert → no resolution needed
    if (rows.length === 0 || !rows[0].last_alert_at) return false;

    // Already resolved since last alert
    if (rows[0].last_resolution_at && rows[0].last_resolution_at > rows[0].last_alert_at) return false;

    // Check if last RECOVERY_THRESHOLD checks are all healthy
    const history = await getCheckHistory(system);
    if (history.length < RECOVERY_THRESHOLD) return false;

    const recentChecks = history
      .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))
      .slice(0, RECOVERY_THRESHOLD);

    return recentChecks.every(c => c.status === 'healthy');
  } catch {
    return false;
  }
}

async function recordAlertSent(system: string, status: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE health_monitor_state SET last_alert_at = NOW(), last_alert_status = $2 WHERE system = $1`,
      system, status,
    );
  } catch {
    // Non-critical
  }
}

async function clearAlert(system: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE health_monitor_state SET last_resolution_at = NOW() WHERE system = $1`,
      system,
    );
  } catch {
    // Non-critical
  }
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

  const subject = `[TCT Platform] Issue Detected: ${summary}`;

  const issueRows = issues.map(issue => {
    const statusColor = issue.status === 'down' ? '#dc2626' : '#ea580c';
    const statusLabel = issue.status === 'down' ? 'DOWN' : 'DEGRADED';

    return `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h3 style="margin:0;font-size:16px;color:#0f172a;">${issue.system}</h3>
          <span style="background:${statusColor};color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">${statusLabel}</span>
        </div>
        <p style="font-size:14px;color:#475569;margin:0;">${issue.details}</p>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#7f1d1d 0%,#991b1b 100%);color:white;padding:24px 32px;">
      <h1 style="margin:0;font-size:18px;">Platform Health Alert</h1>
      <p style="margin:4px 0 0;font-size:13px;opacity:0.8;">Triple Cities Tech — Automated Health Monitor</p>
    </div>
    <div style="padding:24px 32px;">
      <p style="font-size:14px;color:#475569;margin:0 0 20px;">
        The health monitor has detected <strong>sustained issues</strong> (${ALERT_FAILURE_THRESHOLD}+ consecutive check failures) with the following systems.
      </p>
      ${issueRows}
      <div style="text-align:center;margin-top:24px;">
        <a href="${BASE_URL}/admin" style="display:inline-block;background:#0891b2;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
          View Admin Dashboard
        </a>
      </div>
    </div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8;">
      Triple Cities Tech Platform &bull; Health Monitor &bull; Checks every 30 minutes &bull; Alert cooldown: ${ALERT_COOLDOWN_MS / 3600000}h
    </div>
  </div>
</body>
</html>`;

  const text = `PLATFORM HEALTH ALERT - Triple Cities Tech

Sustained issues detected (${ALERT_FAILURE_THRESHOLD}+ consecutive failures):

${issues.map(issue => `${issue.system} [${issue.status.toUpperCase()}]\n  ${issue.details}`).join('\n\n')}

View dashboard: ${BASE_URL}/admin`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [ADMIN_ALERT_EMAIL],
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error('[health-monitor] Failed to send alert email:', err);
  }
}

async function sendResolutionEmail(resolved: HealthCheck[]): Promise<void> {
  if (!resend) return;

  const summary = resolved.length === 1
    ? resolved[0].system
    : `${resolved.length} systems recovered`;

  const subject = `[TCT Platform] Resolved: ${summary}`;

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
      <h1 style="margin:0;font-size:18px;">Platform Health Restored</h1>
      <p style="margin:4px 0 0;font-size:13px;opacity:0.8;">Triple Cities Tech — Automated Health Monitor</p>
    </div>
    <div style="padding:24px 32px;">
      <p style="font-size:14px;color:#475569;margin:0 0 20px;">
        The following systems have been <strong>consistently healthy</strong> for ${RECOVERY_THRESHOLD}+ consecutive checks.
      </p>
      ${resolvedRows}
    </div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8;">
      Triple Cities Tech Platform &bull; Health Monitor
    </div>
  </div>
</body>
</html>`;

  const text = `PLATFORM HEALTH RESTORED - Triple Cities Tech

${resolved.map(r => `${r.system} [RESOLVED]\n  ${r.details}`).join('\n\n')}`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [ADMIN_ALERT_EMAIL],
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error('[health-monitor] Failed to send resolution email:', err);
  }
}
