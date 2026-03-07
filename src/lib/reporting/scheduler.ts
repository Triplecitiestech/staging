/**
 * Report scheduling and delivery system.
 * Manages scheduled report generation, email delivery, and delivery logging.
 */

import { prisma } from '@/lib/prisma';
import { resolvePreset, ReportFilters } from './filters';
import {
  getEnhancedTechnicianReport,
  getEnhancedCompanyReport,
  getEnhancedDashboardReport,
  getEnhancedHealthReport,
} from './enhanced-services';
import { buildReportEmail } from './email-templates';

interface ScheduleConfig {
  preset?: string;
  companyId?: string;
  resourceId?: number;
}

// ============================================
// SCHEDULE MANAGEMENT
// ============================================

export async function getSchedules() {
  return prisma.reportSchedule.findMany({
    where: { isActive: true },
    orderBy: { nextRunAt: 'asc' },
  });
}

export async function getScheduleById(id: string) {
  return prisma.reportSchedule.findUnique({ where: { id } });
}

export async function createSchedule(data: {
  reportType: string;
  name: string;
  schedule: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  monthOfQuarter?: number;
  recipients: string[];
  config?: ScheduleConfig;
  createdBy: string;
}) {
  const nextRunAt = computeNextRunAt(data.schedule, data.dayOfWeek, data.dayOfMonth);

  return prisma.reportSchedule.create({
    data: {
      reportType: data.reportType,
      name: data.name,
      schedule: data.schedule,
      dayOfWeek: data.dayOfWeek ?? null,
      dayOfMonth: data.dayOfMonth ?? null,
      monthOfQuarter: data.monthOfQuarter ?? null,
      recipients: data.recipients,
      config: data.config ? JSON.parse(JSON.stringify(data.config)) : null,
      isActive: true,
      nextRunAt,
      createdBy: data.createdBy,
    },
  });
}

export async function updateSchedule(
  id: string,
  data: Partial<{
    name: string;
    schedule: string;
    dayOfWeek: number;
    dayOfMonth: number;
    recipients: string[];
    config: ScheduleConfig;
    isActive: boolean;
  }>,
) {
  const updates: Record<string, unknown> = { ...data };
  if (data.config) {
    updates.config = JSON.parse(JSON.stringify(data.config));
  }
  if (data.schedule || data.dayOfWeek !== undefined || data.dayOfMonth !== undefined) {
    const existing = await prisma.reportSchedule.findUnique({ where: { id } });
    if (existing) {
      updates.nextRunAt = computeNextRunAt(
        data.schedule || existing.schedule,
        data.dayOfWeek ?? existing.dayOfWeek ?? undefined,
        data.dayOfMonth ?? existing.dayOfMonth ?? undefined,
      );
    }
  }
  return prisma.reportSchedule.update({ where: { id }, data: updates });
}

export async function deleteSchedule(id: string) {
  return prisma.reportSchedule.update({
    where: { id },
    data: { isActive: false },
  });
}

// ============================================
// DELIVERY EXECUTION
// ============================================

/**
 * Process all due scheduled reports.
 * Called by the cron endpoint.
 */
export async function processScheduledReports(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  errors: string[];
}> {
  const now = new Date();
  const dueSchedules = await prisma.reportSchedule.findMany({
    where: {
      isActive: true,
      nextRunAt: { lte: now },
    },
  });

  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const schedule of dueSchedules) {
    try {
      await executeScheduledReport(schedule);
      succeeded++;

      // Update schedule
      const nextRun = computeNextRunAt(
        schedule.schedule,
        schedule.dayOfWeek ?? undefined,
        schedule.dayOfMonth ?? undefined,
      );
      await prisma.reportSchedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: now,
          lastRunStatus: 'success',
          nextRunAt: nextRun,
        },
      });
    } catch (err) {
      failed++;
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`${schedule.name}: ${errorMsg}`);

      await prisma.reportSchedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: now,
          lastRunStatus: 'failed',
          nextRunAt: computeNextRunAt(
            schedule.schedule,
            schedule.dayOfWeek ?? undefined,
            schedule.dayOfMonth ?? undefined,
          ),
        },
      });

      await prisma.reportDeliveryLog.create({
        data: {
          scheduleId: schedule.id,
          reportType: schedule.reportType,
          periodStart: now,
          periodEnd: now,
          recipientCount: schedule.recipients.length,
          status: 'failed',
          error: errorMsg,
        },
      });
    }
  }

  return { processed: dueSchedules.length, succeeded, failed, errors };
}

async function executeScheduledReport(schedule: {
  id: string;
  reportType: string;
  name: string;
  schedule: string;
  recipients: string[];
  config: unknown;
}) {
  const config = (schedule.config || {}) as ScheduleConfig;

  // Determine date range based on schedule frequency
  const preset =
    config.preset ||
    (schedule.schedule === 'weekly' ? 'last_7_days' : schedule.schedule === 'monthly' ? 'last_30_days' : 'last_90_days');

  const dateRange = resolvePreset(preset as 'last_7_days' | 'last_30_days' | 'last_90_days');

  const filters: ReportFilters = {
    dateRange,
    preset: preset as ReportFilters['preset'],
    companyId: config.companyId,
    resourceId: config.resourceId,
    includeComparison: true,
    includeTrend: true,
    includeBreakdown: true,
  };

  // Generate report data based on type
  let reportData: unknown;
  switch (schedule.reportType) {
    case 'technician_weekly':
    case 'technician_monthly':
      reportData = await getEnhancedTechnicianReport(filters);
      break;
    case 'company_weekly':
    case 'company_monthly':
      reportData = await getEnhancedCompanyReport(filters);
      break;
    case 'dashboard_weekly':
    case 'dashboard_monthly':
      reportData = await getEnhancedDashboardReport(filters);
      break;
    case 'health_weekly':
    case 'health_monthly':
      reportData = await getEnhancedHealthReport(filters);
      break;
    default:
      reportData = await getEnhancedDashboardReport(filters);
  }

  // Build email
  const { subject, html } = buildReportEmail(schedule.reportType, schedule.name, reportData, dateRange);

  // Send via Resend
  const { Resend } = await import('resend');
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY not configured');
  }

  const resend = new Resend(resendApiKey);
  const fromEmail = process.env.REPORT_FROM_EMAIL || 'reports@triplecitiestech.com';

  await resend.emails.send({
    from: fromEmail,
    to: schedule.recipients,
    subject,
    html,
  });

  // Log delivery
  await prisma.reportDeliveryLog.create({
    data: {
      scheduleId: schedule.id,
      reportType: schedule.reportType,
      periodStart: dateRange.from,
      periodEnd: dateRange.to,
      recipientCount: schedule.recipients.length,
      status: 'sent',
    },
  });
}

// ============================================
// NEXT RUN COMPUTATION
// ============================================

function computeNextRunAt(
  schedule: string,
  dayOfWeek?: number,
  dayOfMonth?: number,
): Date {
  const now = new Date();
  const next = new Date(now);

  switch (schedule) {
    case 'daily':
      next.setUTCDate(next.getUTCDate() + 1);
      next.setUTCHours(8, 0, 0, 0); // 8 AM UTC
      break;
    case 'weekly': {
      const targetDay = dayOfWeek ?? 1; // Monday
      let daysUntil = targetDay - now.getUTCDay();
      if (daysUntil <= 0) daysUntil += 7;
      next.setUTCDate(next.getUTCDate() + daysUntil);
      next.setUTCHours(8, 0, 0, 0);
      break;
    }
    case 'monthly': {
      const targetDate = dayOfMonth ?? 1;
      next.setUTCMonth(next.getUTCMonth() + 1);
      next.setUTCDate(Math.min(targetDate, daysInMonth(next.getUTCFullYear(), next.getUTCMonth())));
      next.setUTCHours(8, 0, 0, 0);
      break;
    }
    case 'quarterly': {
      const currentQ = Math.floor(now.getUTCMonth() / 3);
      const nextQMonth = (currentQ + 1) * 3;
      next.setUTCMonth(nextQMonth);
      next.setUTCDate(dayOfMonth ?? 1);
      next.setUTCHours(8, 0, 0, 0);
      break;
    }
    default:
      next.setUTCDate(next.getUTCDate() + 7);
      next.setUTCHours(8, 0, 0, 0);
  }

  return next;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

// ============================================
// DELIVERY HISTORY
// ============================================

export async function getDeliveryHistory(scheduleId?: string, limit: number = 20) {
  return prisma.reportDeliveryLog.findMany({
    where: scheduleId ? { scheduleId } : {},
    orderBy: { sentAt: 'desc' },
    take: limit,
  });
}
