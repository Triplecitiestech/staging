/**
 * Daily aggregation jobs — roll up ticket lifecycle data into
 * per-technician and per-company daily metric tables.
 *
 * PERFORMANCE: Both technician and company aggregation use bulk SQL queries
 * to compute metrics for ALL entities in a single pass per day, avoiding
 * the N+1 query pattern that previously caused 504 timeouts.
 */

import { prisma } from '@/lib/prisma';
import { createJobTracker } from './job-status';
import { JOB_NAMES, getResolvedStatuses } from './types';
import { assertTableExists } from './sync';

// ============================================
// TECHNICIAN DAILY AGGREGATION
// ============================================

interface AggregationResult {
  rowsComputed: number;
  errors: string[];
}

/**
 * Compute daily technician metrics for a given date.
 * When no date is provided, backfills missing days with a time guard to avoid timeout.
 */
export async function aggregateTechnicianDaily(targetDate?: Date): Promise<AggregationResult & { remaining?: number }> {
  const finish = createJobTracker(JOB_NAMES.AGGREGATE_TECHNICIAN);
  const result: AggregationResult & { remaining?: number } = { rowsComputed: 0, errors: [] };
  const startTime = Date.now();

  try {
    await assertTableExists('resources');
    await assertTableExists('ticket_lifecycle');
    await assertTableExists('technician_metrics_daily');

    if (!targetDate) {
      const allDates = await getMissingAggregationDates('technician_metrics_daily');
      const BATCH_LIMIT = 7; // Conservative limit for 60s timeout
      const dates = allDates.slice(0, BATCH_LIMIT);
      result.remaining = Math.max(0, allDates.length - BATCH_LIMIT);

      for (const d of dates) {
        // Time guard: stop if we've used more than 45s to leave room for cleanup
        if (Date.now() - startTime > 45_000) {
          result.remaining = (result.remaining || 0) + (dates.length - dates.indexOf(d));
          break;
        }
        const sub = await aggregateTechnicianForDay(d);
        result.rowsComputed += sub.rowsComputed;
        result.errors.push(...sub.errors);
      }
      await finish({
        status: result.errors.length > 0 ? 'failed' : 'success',
        meta: { rowsComputed: result.rowsComputed, daysProcessed: dates.length, remaining: result.remaining, errorCount: result.errors.length },
        error: result.errors.length > 0 ? result.errors.slice(0, 10).join('; ') : undefined,
      });
      return result;
    }

    const sub = await aggregateTechnicianForDay(targetDate);
    result.rowsComputed = sub.rowsComputed;
    result.errors = sub.errors;

    await finish({
      status: result.errors.length > 0 ? 'failed' : 'success',
      meta: { rowsComputed: result.rowsComputed, date: startOfDay(targetDate).toISOString(), errorCount: result.errors.length },
      error: result.errors.length > 0 ? result.errors.slice(0, 10).join('; ') : undefined,
    });

    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await finish({ status: 'failed', error });
    throw err;
  }
}

// ============================================
// COMPANY DAILY AGGREGATION
// ============================================

/**
 * Compute daily company metrics for a given date.
 * When no date is provided, backfills missing days with a time guard.
 */
export async function aggregateCompanyDaily(targetDate?: Date): Promise<AggregationResult & { remaining?: number }> {
  const finish = createJobTracker(JOB_NAMES.AGGREGATE_COMPANY);
  const result: AggregationResult & { remaining?: number } = { rowsComputed: 0, errors: [] };
  const startTime = Date.now();

  try {
    await assertTableExists('ticket_lifecycle');
    await assertTableExists('company_metrics_daily');

    if (!targetDate) {
      const allDates = await getMissingAggregationDates('company_metrics_daily');
      const BATCH_LIMIT = 7;
      const dates = allDates.slice(0, BATCH_LIMIT);
      result.remaining = Math.max(0, allDates.length - BATCH_LIMIT);

      for (const d of dates) {
        if (Date.now() - startTime > 45_000) {
          result.remaining = (result.remaining || 0) + (dates.length - dates.indexOf(d));
          break;
        }
        const sub = await aggregateCompanyForDay(d);
        result.rowsComputed += sub.rowsComputed;
        result.errors.push(...sub.errors);
      }
      await finish({
        status: result.errors.length > 0 ? 'failed' : 'success',
        meta: { rowsComputed: result.rowsComputed, daysProcessed: dates.length, remaining: result.remaining, errorCount: result.errors.length },
        error: result.errors.length > 0 ? result.errors.slice(0, 10).join('; ') : undefined,
      });
      return result;
    }

    const sub = await aggregateCompanyForDay(targetDate);
    result.rowsComputed = sub.rowsComputed;
    result.errors = sub.errors;

    await finish({
      status: result.errors.length > 0 ? 'failed' : 'success',
      meta: { rowsComputed: result.rowsComputed, date: startOfDay(targetDate).toISOString(), errorCount: result.errors.length },
      error: result.errors.length > 0 ? result.errors.slice(0, 10).join('; ') : undefined,
    });

    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await finish({ status: 'failed', error });
    throw err;
  }
}

// ============================================
// PER-DAY HELPERS — BULK SQL (no N+1 loops)
// ============================================

/**
 * Compute technician metrics for a single day using bulk SQL.
 * Runs ~6 queries total regardless of technician count (was ~13 per technician).
 */
async function aggregateTechnicianForDay(date: Date): Promise<AggregationResult> {
  const result: AggregationResult = { rowsComputed: 0, errors: [] };
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const resolvedStatuses = getResolvedStatuses();

  try {
    const resources = await prisma.resource.findMany({
      where: { isActive: true },
      select: { autotaskResourceId: true },
    });
    if (resources.length === 0) return result;

    const resourceIds = resources.map(r => r.autotaskResourceId);

    // 1. Bulk: tickets assigned (open as of dayEnd) per resource
    const assignedRows = await prisma.$queryRawUnsafe<Array<{ rid: number; cnt: bigint }>>(
      `SELECT "assignedResourceId" AS rid, COUNT(*)::bigint AS cnt
       FROM tickets
       WHERE "assignedResourceId" = ANY($1::int[])
         AND "createDate" <= $3
         AND ("completedDate" IS NULL OR "completedDate" > $3)
       GROUP BY "assignedResourceId"`,
      resourceIds, dayStart, dayEnd,
    );
    const assignedMap = new Map(assignedRows.map(r => [r.rid, Number(r.cnt)]));

    // 2. Bulk: tickets created per resource on this day
    const createdRows = await prisma.$queryRawUnsafe<Array<{ rid: number; cnt: bigint }>>(
      `SELECT "creatorResourceId" AS rid, COUNT(*)::bigint AS cnt
       FROM tickets
       WHERE "creatorResourceId" = ANY($1::int[])
         AND "createDate" >= $2 AND "createDate" <= $3
       GROUP BY "creatorResourceId"`,
      resourceIds, dayStart, dayEnd,
    );
    const createdMap = new Map(createdRows.map(r => [r.rid, Number(r.cnt)]));

    // 3. Bulk: tickets closed (completedDate in range) per resource from lifecycle
    const closedRows = await prisma.$queryRawUnsafe<Array<{ rid: number; cnt: bigint }>>(
      `SELECT "assignedResourceId" AS rid, COUNT(*)::bigint AS cnt
       FROM ticket_lifecycle
       WHERE "assignedResourceId" = ANY($1::int[])
         AND "isResolved" = true
         AND "completedDate" >= $2 AND "completedDate" <= $3
       GROUP BY "assignedResourceId"`,
      resourceIds, dayStart, dayEnd,
    );
    const closedMap = new Map(closedRows.map(r => [r.rid, Number(r.cnt)]));

    // 3b. Bulk: tickets closed via status history (null completedDate) per resource
    const closedNullDateRows = await prisma.$queryRawUnsafe<Array<{ rid: number; cnt: bigint }>>(
      `SELECT t."assignedResourceId" AS rid, COUNT(DISTINCT tsh."autotaskTicketId")::bigint AS cnt
       FROM ticket_status_history tsh
       JOIN tickets t ON t."autotaskTicketId" = tsh."autotaskTicketId"
       WHERE t."assignedResourceId" = ANY($1::int[])
         AND t."completedDate" IS NULL
         AND t.status = ANY($4::int[])
         AND tsh."changedAt" >= $2 AND tsh."changedAt" <= $3
         AND tsh."newStatus" = ANY($4::int[])
       GROUP BY t."assignedResourceId"`,
      resourceIds, dayStart, dayEnd, resolvedStatuses,
    );
    const closedNullMap = new Map(closedNullDateRows.map(r => [r.rid, Number(r.cnt)]));

    // 4. Bulk: reopened tickets per resource
    const reopenedRows = await prisma.$queryRawUnsafe<Array<{ rid: number; cnt: bigint }>>(
      `SELECT t."assignedResourceId" AS rid, COUNT(*)::bigint AS cnt
       FROM ticket_status_history tsh
       JOIN tickets t ON t."autotaskTicketId" = tsh."autotaskTicketId"
       WHERE t."assignedResourceId" = ANY($1::int[])
         AND tsh."changedAt" >= $2 AND tsh."changedAt" <= $3
         AND tsh."previousStatus" = ANY($4::int[])
         AND NOT (tsh."newStatus" = ANY($4::int[]))
       GROUP BY t."assignedResourceId"`,
      resourceIds, dayStart, dayEnd, resolvedStatuses,
    );
    const reopenedMap = new Map(reopenedRows.map(r => [r.rid, Number(r.cnt)]));

    // 5. Bulk: time entries per resource
    const timeRows = await prisma.$queryRawUnsafe<Array<{ rid: number; total: number; billable: number; nonbillable: number }>>(
      `SELECT "resourceId" AS rid,
              COALESCE(SUM("hoursWorked"), 0)::float AS total,
              COALESCE(SUM(CASE WHEN "isNonBillable" = false THEN "hoursWorked" ELSE 0 END), 0)::float AS billable,
              COALESCE(SUM(CASE WHEN "isNonBillable" = true THEN "hoursWorked" ELSE 0 END), 0)::float AS nonbillable
       FROM ticket_time_entries
       WHERE "resourceId" = ANY($1::int[])
         AND "dateWorked" >= $2 AND "dateWorked" <= $3
       GROUP BY "resourceId"`,
      resourceIds, dayStart, dayEnd,
    );
    const timeMap = new Map(timeRows.map(r => [r.rid, { total: r.total, billable: r.billable, nonbillable: r.nonbillable }]));

    // 6. Bulk: lifecycle metrics for resolved tickets per resource
    const lcRows = await prisma.$queryRawUnsafe<Array<{
      rid: number;
      avg_frt: number | null;
      avg_resolution: number | null;
      ftr_count: bigint;
      total_resolved: bigint;
    }>>(
      `SELECT "assignedResourceId" AS rid,
              AVG("firstResponseMinutes")::float AS avg_frt,
              AVG("fullResolutionMinutes")::float AS avg_resolution,
              COUNT(*) FILTER (WHERE "isFirstTouchResolution" = true)::bigint AS ftr_count,
              COUNT(*)::bigint AS total_resolved
       FROM ticket_lifecycle
       WHERE "assignedResourceId" = ANY($1::int[])
         AND "isResolved" = true
         AND "completedDate" >= $2 AND "completedDate" <= $3
       GROUP BY "assignedResourceId"`,
      resourceIds, dayStart, dayEnd,
    );
    const lcMap = new Map(lcRows.map(r => [r.rid, {
      avgFrt: r.avg_frt,
      avgResolution: r.avg_resolution,
      ftrCount: Number(r.ftr_count),
      totalResolved: Number(r.total_resolved),
    }]));

    // 7. Bulk: open ticket count per resource as of dayEnd
    const openRows = await prisma.$queryRawUnsafe<Array<{ rid: number; cnt: bigint }>>(
      `SELECT "assignedResourceId" AS rid, COUNT(*)::bigint AS cnt
       FROM tickets
       WHERE "assignedResourceId" = ANY($1::int[])
         AND "createDate" <= $3
         AND ("completedDate" IS NULL OR "completedDate" > $3)
         AND NOT (status = ANY($4::int[]))
       GROUP BY "assignedResourceId"`,
      resourceIds, dayStart, dayEnd, resolvedStatuses,
    );
    const openMap = new Map(openRows.map(r => [r.rid, Number(r.cnt)]));

    // Upsert all resources
    for (const resourceId of resourceIds) {
      try {
        const ticketsAssigned = assignedMap.get(resourceId) || 0;
        const ticketsCreated = createdMap.get(resourceId) || 0;
        const ticketsClosed = (closedMap.get(resourceId) || 0) + (closedNullMap.get(resourceId) || 0);
        const ticketsReopened = reopenedMap.get(resourceId) || 0;
        const time = timeMap.get(resourceId) || { total: 0, billable: 0, nonbillable: 0 };
        const lc = lcMap.get(resourceId) || { avgFrt: null, avgResolution: null, ftrCount: 0, totalResolved: 0 };
        const openTicketCount = openMap.get(resourceId) || 0;

        await prisma.technicianMetricsDaily.upsert({
          where: { resourceId_date: { resourceId, date: dayStart } },
          create: {
            resourceId, date: dayStart,
            ticketsAssigned, ticketsCreated, ticketsClosed, ticketsReopened,
            hoursLogged: time.total, billableHoursLogged: time.billable, nonBillableHoursLogged: time.nonbillable,
            avgFirstResponseMinutes: lc.avgFrt, avgResolutionMinutes: lc.avgResolution,
            firstTouchResolutions: lc.ftrCount, totalResolutions: ticketsClosed,
            openTicketCount, computedAt: new Date(),
          },
          update: {
            ticketsAssigned, ticketsCreated, ticketsClosed, ticketsReopened,
            hoursLogged: time.total, billableHoursLogged: time.billable, nonBillableHoursLogged: time.nonbillable,
            avgFirstResponseMinutes: lc.avgFrt, avgResolutionMinutes: lc.avgResolution,
            firstTouchResolutions: lc.ftrCount, totalResolutions: ticketsClosed,
            openTicketCount, computedAt: new Date(),
          },
        });
        result.rowsComputed++;
      } catch (err) {
        result.errors.push(`Resource ${resourceId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    result.errors.push(`TechDay ${dayStart.toISOString().split('T')[0]}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

/**
 * Compute company metrics for a single day using bulk SQL.
 * Runs ~8 queries total regardless of company count.
 */
async function aggregateCompanyForDay(date: Date): Promise<AggregationResult> {
  const result: AggregationResult = { rowsComputed: 0, errors: [] };
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const resolvedStatuses = getResolvedStatuses();

  try {
    const companies = await prisma.company.findMany({
      where: { autotaskCompanyId: { not: null } },
      select: { id: true },
    });
    if (companies.length === 0) return result;

    const companyIds = companies.map(c => c.id);

    // 1. Bulk: tickets created per company with priority breakdown
    const createdRows = await prisma.$queryRawUnsafe<Array<{
      cid: string; cnt: bigint; urgent: bigint; high: bigint; medium: bigint; low: bigint;
    }>>(
      `SELECT "companyId" AS cid, COUNT(*)::bigint AS cnt,
              COUNT(*) FILTER (WHERE priority = 1)::bigint AS urgent,
              COUNT(*) FILTER (WHERE priority = 2)::bigint AS high,
              COUNT(*) FILTER (WHERE priority = 3)::bigint AS medium,
              COUNT(*) FILTER (WHERE priority = 4)::bigint AS low
       FROM tickets
       WHERE "companyId" = ANY($1::text[])
         AND "createDate" >= $2 AND "createDate" <= $3
       GROUP BY "companyId"`,
      companyIds, dayStart, dayEnd,
    );
    const createdMap = new Map(createdRows.map(r => [r.cid, {
      total: Number(r.cnt), urgent: Number(r.urgent), high: Number(r.high),
      medium: Number(r.medium), low: Number(r.low),
    }]));

    // 2. Bulk: tickets closed (completedDate in range)
    const closedRows = await prisma.$queryRawUnsafe<Array<{ cid: string; cnt: bigint }>>(
      `SELECT "companyId" AS cid, COUNT(*)::bigint AS cnt
       FROM ticket_lifecycle
       WHERE "companyId" = ANY($1::text[])
         AND "isResolved" = true
         AND "completedDate" >= $2 AND "completedDate" <= $3
       GROUP BY "companyId"`,
      companyIds, dayStart, dayEnd,
    );
    const closedMap = new Map(closedRows.map(r => [r.cid, Number(r.cnt)]));

    // 2b. Bulk: tickets closed via status history (null completedDate)
    const closedNullRows = await prisma.$queryRawUnsafe<Array<{ cid: string; cnt: bigint }>>(
      `SELECT t."companyId" AS cid, COUNT(DISTINCT tsh."autotaskTicketId")::bigint AS cnt
       FROM ticket_status_history tsh
       JOIN tickets t ON t."autotaskTicketId" = tsh."autotaskTicketId"
       WHERE t."companyId" = ANY($1::text[])
         AND t."completedDate" IS NULL
         AND t.status = ANY($4::int[])
         AND tsh."changedAt" >= $2 AND tsh."changedAt" <= $3
         AND tsh."newStatus" = ANY($4::int[])
       GROUP BY t."companyId"`,
      companyIds, dayStart, dayEnd, resolvedStatuses,
    );
    const closedNullMap = new Map(closedNullRows.map(r => [r.cid, Number(r.cnt)]));

    // 3. Bulk: reopened tickets per company
    const reopenedRows = await prisma.$queryRawUnsafe<Array<{ cid: string; cnt: bigint }>>(
      `SELECT t."companyId" AS cid, COUNT(*)::bigint AS cnt
       FROM ticket_status_history tsh
       JOIN tickets t ON t."autotaskTicketId" = tsh."autotaskTicketId"
       WHERE t."companyId" = ANY($1::text[])
         AND tsh."changedAt" >= $2 AND tsh."changedAt" <= $3
         AND tsh."previousStatus" = ANY($4::int[])
         AND NOT (tsh."newStatus" = ANY($4::int[]))
       GROUP BY t."companyId"`,
      companyIds, dayStart, dayEnd, resolvedStatuses,
    );
    const reopenedMap = new Map(reopenedRows.map(r => [r.cid, Number(r.cnt)]));

    // 4. Bulk: time entries per company (join tickets to get companyId)
    const timeRows = await prisma.$queryRawUnsafe<Array<{ cid: string; support: number; billable: number }>>(
      `SELECT t."companyId" AS cid,
              COALESCE(SUM(te."hoursWorked"), 0)::float AS support,
              COALESCE(SUM(CASE WHEN te."isNonBillable" = false THEN te."hoursWorked" ELSE 0 END), 0)::float AS billable
       FROM ticket_time_entries te
       JOIN tickets t ON t."autotaskTicketId" = te."autotaskTicketId"
       WHERE t."companyId" = ANY($1::text[])
         AND te."dateWorked" >= $2 AND te."dateWorked" <= $3
       GROUP BY t."companyId"`,
      companyIds, dayStart, dayEnd,
    );
    const timeMap = new Map(timeRows.map(r => [r.cid, { support: r.support, billable: r.billable }]));

    // 5. Bulk: lifecycle metrics for resolved tickets
    const lcRows = await prisma.$queryRawUnsafe<Array<{
      cid: string; avg_frt: number | null; avg_resolution: number | null;
      total: bigint; ftr_count: bigint; reopen_count: bigint;
      sla_resp_met: bigint; sla_resp_total: bigint;
      sla_res_met: bigint; sla_res_total: bigint;
    }>>(
      `SELECT "companyId" AS cid,
              AVG("firstResponseMinutes")::float AS avg_frt,
              AVG("fullResolutionMinutes")::float AS avg_resolution,
              COUNT(*)::bigint AS total,
              COUNT(*) FILTER (WHERE "isFirstTouchResolution" = true)::bigint AS ftr_count,
              COUNT(*) FILTER (WHERE "reopenCount" > 0)::bigint AS reopen_count,
              COUNT(*) FILTER (WHERE "slaResponseMet" = true)::bigint AS sla_resp_met,
              COUNT(*) FILTER (WHERE "slaResponseMet" IS NOT NULL)::bigint AS sla_resp_total,
              COUNT(*) FILTER (WHERE "slaResolutionMet" = true)::bigint AS sla_res_met,
              COUNT(*) FILTER (WHERE "slaResolutionMet" IS NOT NULL)::bigint AS sla_res_total
       FROM ticket_lifecycle
       WHERE "companyId" = ANY($1::text[])
         AND "isResolved" = true
         AND "completedDate" >= $2 AND "completedDate" <= $3
       GROUP BY "companyId"`,
      companyIds, dayStart, dayEnd,
    );
    const lcMap = new Map(lcRows.map(r => [r.cid, {
      avgFrt: r.avg_frt, avgResolution: r.avg_resolution,
      total: Number(r.total), ftrCount: Number(r.ftr_count), reopenCount: Number(r.reopen_count),
      slaRespMet: Number(r.sla_resp_met), slaRespTotal: Number(r.sla_resp_total),
      slaResMet: Number(r.sla_res_met), slaResTotal: Number(r.sla_res_total),
    }]));

    // 6. Bulk: open tickets (backlog) per company with priority
    const openRows = await prisma.$queryRawUnsafe<Array<{
      cid: string; cnt: bigint; urgent: bigint; high: bigint;
    }>>(
      `SELECT "companyId" AS cid, COUNT(*)::bigint AS cnt,
              COUNT(*) FILTER (WHERE priority = 1)::bigint AS urgent,
              COUNT(*) FILTER (WHERE priority = 2)::bigint AS high
       FROM tickets
       WHERE "companyId" = ANY($1::text[])
         AND "createDate" <= $3
         AND ("completedDate" IS NULL OR "completedDate" > $3)
         AND NOT (status = ANY($4::int[]))
       GROUP BY "companyId"`,
      companyIds, dayStart, dayEnd, resolvedStatuses,
    );
    const openMap = new Map(openRows.map(r => [r.cid, {
      count: Number(r.cnt), urgent: Number(r.urgent), high: Number(r.high),
    }]));

    // Upsert all companies
    for (const companyId of companyIds) {
      try {
        const created = createdMap.get(companyId) || { total: 0, urgent: 0, high: 0, medium: 0, low: 0 };
        const ticketsClosed = (closedMap.get(companyId) || 0) + (closedNullMap.get(companyId) || 0);
        const ticketsReopened = reopenedMap.get(companyId) || 0;
        const time = timeMap.get(companyId) || { support: 0, billable: 0 };
        const lc = lcMap.get(companyId) || { avgFrt: null, avgResolution: null, total: 0, ftrCount: 0, reopenCount: 0, slaRespMet: 0, slaRespTotal: 0, slaResMet: 0, slaResTotal: 0 };
        const open = openMap.get(companyId) || { count: 0, urgent: 0, high: 0 };

        const firstTouchResolutionRate = lc.total > 0 ? (lc.ftrCount / lc.total) * 100 : null;
        const reopenRate = lc.total > 0 ? (lc.reopenCount / lc.total) * 100 : null;
        const slaResponseCompliance = lc.slaRespTotal > 0 ? (lc.slaRespMet / lc.slaRespTotal) * 100 : null;
        const slaResolutionCompliance = lc.slaResTotal > 0 ? (lc.slaResMet / lc.slaResTotal) * 100 : null;

        const metricsData = {
          ticketsCreated: created.total, ticketsClosed, ticketsReopened,
          ticketsCreatedUrgent: created.urgent, ticketsCreatedHigh: created.high,
          ticketsCreatedMedium: created.medium, ticketsCreatedLow: created.low,
          supportHoursConsumed: time.support, billableHoursConsumed: time.billable,
          avgFirstResponseMinutes: lc.avgFrt, avgResolutionMinutes: lc.avgResolution,
          firstTouchResolutionRate, reopenRate,
          slaResponseCompliance, slaResolutionCompliance,
          backlogCount: open.count, backlogUrgent: open.urgent, backlogHigh: open.high,
          computedAt: new Date(),
        };

        await prisma.companyMetricsDaily.upsert({
          where: { companyId_date: { companyId, date: dayStart } },
          create: { companyId, date: dayStart, ...metricsData },
          update: metricsData,
        });

        result.rowsComputed++;
      } catch (err) {
        result.errors.push(`Company ${companyId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    result.errors.push(`CompanyDay ${dayStart.toISOString().split('T')[0]}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

// ============================================
// DATE UTILITIES
// ============================================

/**
 * Find dates that have tickets but no aggregation rows yet.
 * Returns up to 90 days of missing dates, most recent first.
 */
async function getMissingAggregationDates(table: 'technician_metrics_daily' | 'company_metrics_daily'): Promise<Date[]> {
  const earliest = await prisma.ticket.findFirst({
    orderBy: { createDate: 'asc' },
    select: { createDate: true },
  });

  if (!earliest) return [yesterday()];

  const yest = yesterday();
  const start = startOfDay(earliest.createDate);
  const end = startOfDay(yest);

  let existingDates: Set<string>;
  if (table === 'technician_metrics_daily') {
    const rows = await prisma.technicianMetricsDaily.findMany({
      distinct: ['date'],
      select: { date: true },
    });
    existingDates = new Set(rows.map(r => r.date.toISOString().split('T')[0]));
  } else {
    const rows = await prisma.companyMetricsDaily.findMany({
      distinct: ['date'],
      select: { date: true },
    });
    existingDates = new Set(rows.map(r => r.date.toISOString().split('T')[0]));
  }

  const missing: Date[] = [];
  const current = new Date(start);

  while (current <= end && missing.length < 90) {
    const key = current.toISOString().split('T')[0];
    if (!existingDates.has(key)) {
      missing.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return missing;
}

function yesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}
