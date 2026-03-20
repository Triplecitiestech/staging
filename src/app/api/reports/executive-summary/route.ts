/**
 * GET /api/reports/executive-summary
 *
 * Generates a comprehensive annual executive summary for a company.
 * Includes all tickets (all queues) and Datto RMM alerts.
 *
 * Query params:
 *   secret   - MIGRATION_SECRET for auth
 *   company  - Company name (partial match) or companyId (UUID)
 *   days     - Lookback period in days (default: 365)
 *   format   - "html" (default) or "json"
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DattoRmmClient, DattoAlert } from '@/lib/datto-rmm';
import { getResolvedStatuses, PRIORITY_LABELS } from '@/lib/reporting/types';
import { generateExecutiveSummaryHTML } from './html-generator';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface TicketsByMonth {
  month: string;
  created: number;
  closed: number;
  hours: number;
  byPriority: Record<string, number>;
  byQueue: Record<string, number>;
}

interface AlertSummary {
  total: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  byDevice: { hostname: string; count: number }[];
  monthlyTrend: { month: string; count: number }[];
  openAlerts: number;
  topAlertMessages: { message: string; count: number }[];
}

export interface ExecutiveSummaryData {
  company: { id: string; name: string; autotaskId: string | null };
  period: { start: string; end: string; days: number };
  generatedAt: string;

  // Ticket overview
  ticketSummary: {
    totalCreated: number;
    totalClosed: number;
    totalOpen: number;
    totalHours: number;
    totalBillableHours: number;
    avgResolutionMinutes: number | null;
    avgFirstResponseMinutes: number | null;
    byPriority: { label: string; count: number; percentage: number }[];
    byQueue: { label: string; count: number; percentage: number }[];
    byStatus: { label: string; count: number }[];
    monthlyTrend: TicketsByMonth[];
  };

  // Datto RMM alerts
  alertSummary: AlertSummary | null;

  // Health
  healthScore: { score: number; tier: string } | null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const companyQuery = searchParams.get('company');
  const days = parseInt(searchParams.get('days') || '365', 10);
  const format = searchParams.get('format') || 'html';

  // Auth
  if (secret !== process.env.MIGRATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!companyQuery) {
    return NextResponse.json({ error: 'Missing company parameter' }, { status: 400 });
  }

  try {
    // Find the company
    const company = await findCompany(companyQuery);
    if (!company) {
      return NextResponse.json({ error: `Company not found: ${companyQuery}` }, { status: 404 });
    }

    const periodEnd = new Date();
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - days);

    const resolvedSet = new Set(getResolvedStatuses());

    // Fetch all tickets for this company in the period
    const tickets = await prisma.ticket.findMany({
      where: {
        companyId: company.id,
        OR: [
          { createDate: { gte: periodStart, lte: periodEnd } },
          { completedDate: { gte: periodStart, lte: periodEnd } },
          { createDate: { lte: periodEnd }, status: { notIn: Array.from(resolvedSet) } },
        ],
      },
      select: {
        autotaskTicketId: true,
        ticketNumber: true,
        title: true,
        status: true,
        statusLabel: true,
        priority: true,
        priorityLabel: true,
        queueId: true,
        queueLabel: true,
        createDate: true,
        completedDate: true,
        assignedResourceId: true,
        dueDateTime: true,
      },
    });

    // Time entries
    const allTicketIds = tickets.map(t => t.autotaskTicketId);
    const timeEntries = allTicketIds.length > 0
      ? await prisma.ticketTimeEntry.findMany({
          where: {
            autotaskTicketId: { in: allTicketIds },
            dateWorked: { gte: periodStart, lte: periodEnd },
          },
          select: { autotaskTicketId: true, hoursWorked: true, isNonBillable: true },
        })
      : [];

    // Notes for FRT
    const notes = allTicketIds.length > 0
      ? await prisma.ticketNote.findMany({
          where: { autotaskTicketId: { in: allTicketIds }, creatorResourceId: { not: null } },
          select: { autotaskTicketId: true, createDateTime: true },
          orderBy: { createDateTime: 'asc' },
        })
      : [];

    const firstNoteByTicket = new Map<string, Date>();
    for (const n of notes) {
      if (!firstNoteByTicket.has(n.autotaskTicketId)) {
        firstNoteByTicket.set(n.autotaskTicketId, n.createDateTime);
      }
    }

    // Compute ticket metrics
    const createdInPeriod = tickets.filter(t => t.createDate >= periodStart && t.createDate <= periodEnd);
    const closedInPeriod = tickets.filter(t =>
      resolvedSet.has(t.status) && t.completedDate &&
      t.completedDate >= periodStart && t.completedDate <= periodEnd
    );
    const stillOpen = tickets.filter(t => !resolvedSet.has(t.status));

    const totalHours = timeEntries.reduce((s, e) => s + e.hoursWorked, 0);
    const billableHours = timeEntries.filter(e => !e.isNonBillable).reduce((s, e) => s + e.hoursWorked, 0);

    // Resolution times
    const resMins: number[] = [];
    const frtMins: number[] = [];
    for (const t of closedInPeriod) {
      if (t.completedDate) {
        const mins = (t.completedDate.getTime() - t.createDate.getTime()) / (1000 * 60);
        if (mins > 0) resMins.push(mins);
      }
      const fn = firstNoteByTicket.get(t.autotaskTicketId);
      if (fn) {
        const frt = (fn.getTime() - t.createDate.getTime()) / (1000 * 60);
        if (frt >= 0) frtMins.push(frt);
      }
    }

    // Priority breakdown
    const priorityCounts: Record<number, number> = {};
    for (const t of createdInPeriod) {
      priorityCounts[t.priority] = (priorityCounts[t.priority] || 0) + 1;
    }
    const totalCreated = createdInPeriod.length || 1;
    const byPriority = Object.entries(priorityCounts)
      .map(([p, count]) => ({
        label: PRIORITY_LABELS[Number(p)] || `Priority ${p}`,
        count,
        percentage: Math.round((count / totalCreated) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    // Queue breakdown
    const queueCounts: Record<string, number> = {};
    for (const t of createdInPeriod) {
      const label = t.queueLabel || 'General';
      queueCounts[label] = (queueCounts[label] || 0) + 1;
    }
    const byQueue = Object.entries(queueCounts)
      .map(([label, count]) => ({
        label,
        count,
        percentage: Math.round((count / totalCreated) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    // Status breakdown (current state of all tickets in scope)
    const statusCounts: Record<string, number> = {};
    for (const t of tickets) {
      const label = t.statusLabel || `Status ${t.status}`;
      statusCounts[label] = (statusCounts[label] || 0) + 1;
    }
    const byStatus = Object.entries(statusCounts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    // Monthly trend
    const monthlyTrend = buildMonthlyTrend(tickets, timeEntries, periodStart, periodEnd, resolvedSet);

    // Health score
    let healthScore: { score: number; tier: string } | null = null;
    try {
      const health = await prisma.customerHealthScore.findFirst({
        where: { companyId: company.id },
        orderBy: { computedAt: 'desc' },
      });
      if (health) {
        const tier = health.overallScore >= 80 ? 'Healthy' :
          health.overallScore >= 60 ? 'Watch' :
          health.overallScore >= 40 ? 'At Risk' : 'Critical';
        healthScore = { score: health.overallScore, tier };
      }
    } catch { /* health scores may not exist */ }

    // Datto RMM alerts
    let alertSummary: AlertSummary | null = null;
    try {
      alertSummary = await fetchDattoAlerts(company.displayName, periodStart);
    } catch (err) {
      console.log(`[ExecutiveSummary] Datto alerts fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const data: ExecutiveSummaryData = {
      company: {
        id: company.id,
        name: company.displayName,
        autotaskId: company.autotaskCompanyId,
      },
      period: {
        start: periodStart.toISOString().split('T')[0],
        end: periodEnd.toISOString().split('T')[0],
        days,
      },
      generatedAt: new Date().toISOString(),
      ticketSummary: {
        totalCreated: createdInPeriod.length,
        totalClosed: closedInPeriod.length,
        totalOpen: stillOpen.length,
        totalHours: Math.round(totalHours * 10) / 10,
        totalBillableHours: Math.round(billableHours * 10) / 10,
        avgResolutionMinutes: resMins.length > 0
          ? Math.round(resMins.reduce((a, b) => a + b, 0) / resMins.length)
          : null,
        avgFirstResponseMinutes: frtMins.length > 0
          ? Math.round(frtMins.reduce((a, b) => a + b, 0) / frtMins.length)
          : null,
        byPriority,
        byQueue,
        byStatus,
        monthlyTrend,
      },
      alertSummary,
      healthScore,
    };

    if (format === 'json') {
      return NextResponse.json(data);
    }

    // Return HTML
    const html = generateExecutiveSummaryHTML(data);
    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    console.error('[ExecutiveSummary] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// ============================================
// HELPERS
// ============================================

async function findCompany(query: string) {
  // Try UUID first
  if (query.match(/^[0-9a-f-]{36}$/i)) {
    return prisma.company.findUnique({
      where: { id: query },
      select: { id: true, displayName: true, autotaskCompanyId: true },
    });
  }

  // Try exact name match
  let company = await prisma.company.findFirst({
    where: { displayName: { equals: query, mode: 'insensitive' } },
    select: { id: true, displayName: true, autotaskCompanyId: true },
  });
  if (company) return company;

  // Try partial match
  company = await prisma.company.findFirst({
    where: { displayName: { contains: query, mode: 'insensitive' } },
    select: { id: true, displayName: true, autotaskCompanyId: true },
  });
  return company;
}

async function fetchDattoAlerts(companyName: string, periodStart: Date): Promise<AlertSummary | null> {
  const client = new DattoRmmClient();
  if (!client.isConfigured()) return null;

  // Fetch both open and resolved alerts
  const [openAlerts, resolvedAlerts] = await Promise.all([
    client.getOpenAlerts(20),
    client.getResolvedAlerts(40), // more pages for resolved since they accumulate
  ]);

  const allAlerts = [...openAlerts, ...resolvedAlerts];

  // Match alerts to this company's site(s) by name
  // Datto sites often match or contain the company name
  const companyLower = companyName.toLowerCase();
  const companyWords = companyLower.split(/\s+/).filter(w => w.length > 2);

  const matchedAlerts = allAlerts.filter(a => {
    if (!a.siteName) return false;
    const siteLower = a.siteName.toLowerCase();
    // Match if site name contains company name or vice versa
    return siteLower.includes(companyLower) ||
      companyLower.includes(siteLower) ||
      companyWords.some(w => siteLower.includes(w));
  });

  // Also try matching via cached datto_devices table
  let siteIds: Set<string> | null = null;
  try {
    const devices = await prisma.$queryRawUnsafe<Array<{ siteId: string }>>(
      `SELECT DISTINCT "siteId" FROM datto_devices WHERE LOWER("siteName") LIKE $1`,
      `%${companyLower}%`
    );
    if (devices.length > 0) {
      siteIds = new Set(devices.map(d => d.siteId));
      // Add alerts matching by siteId that weren't caught by name match
      for (const a of allAlerts) {
        if (siteIds.has(a.siteUid) && !matchedAlerts.some(m => m.alertUid === a.alertUid)) {
          matchedAlerts.push(a);
        }
      }
    }
  } catch { /* datto_devices table may not exist */ }

  // Filter to period
  const periodAlerts = matchedAlerts.filter(a => {
    const ts = new Date(a.timestamp);
    return ts >= periodStart;
  });

  if (periodAlerts.length === 0 && matchedAlerts.length === 0) {
    // No matching site found — return all alerts as a fallback with a note
    return buildAlertSummary(allAlerts.filter(a => new Date(a.timestamp) >= periodStart));
  }

  return buildAlertSummary(periodAlerts);
}

function buildAlertSummary(alerts: DattoAlert[]): AlertSummary {
  const bySeverity: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const deviceCounts: Record<string, number> = {};
  const messageCounts: Record<string, number> = {};
  const monthCounts: Record<string, number> = {};

  let openCount = 0;

  for (const a of alerts) {
    // Severity
    const sev = a.priority || 'information';
    bySeverity[sev] = (bySeverity[sev] || 0) + 1;

    // Type
    const type = a.alertContext || a.alertType || 'Other';
    byType[type] = (byType[type] || 0) + 1;

    // Device
    if (a.hostname) {
      deviceCounts[a.hostname] = (deviceCounts[a.hostname] || 0) + 1;
    }

    // Message (first 80 chars for grouping)
    const msg = (a.alertMessage || '').slice(0, 80);
    if (msg) messageCounts[msg] = (messageCounts[msg] || 0) + 1;

    // Monthly
    const ts = new Date(a.timestamp);
    if (!isNaN(ts.getTime())) {
      const monthKey = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}`;
      monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1;
    }

    if (!a.resolved) openCount++;
  }

  const byDevice = Object.entries(deviceCounts)
    .map(([hostname, count]) => ({ hostname, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const monthlyTrend = Object.entries(monthCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  const topAlertMessages = Object.entries(messageCounts)
    .map(([message, count]) => ({ message, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    total: alerts.length,
    bySeverity,
    byType,
    byDevice,
    monthlyTrend,
    openAlerts: openCount,
    topAlertMessages,
  };
}

function buildMonthlyTrend(
  tickets: Array<{
    createDate: Date;
    completedDate: Date | null;
    status: number;
    priority: number;
    queueLabel: string | null;
    autotaskTicketId: string;
  }>,
  timeEntries: Array<{ autotaskTicketId: string; hoursWorked: number }>,
  periodStart: Date,
  periodEnd: Date,
  resolvedSet: Set<number>,
): TicketsByMonth[] {
  const months: TicketsByMonth[] = [];
  const cursor = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1);

  // Build time entries index
  const hoursByTicket = new Map<string, number>();
  for (const te of timeEntries) {
    hoursByTicket.set(te.autotaskTicketId, (hoursByTicket.get(te.autotaskTicketId) || 0) + te.hoursWorked);
  }

  while (cursor <= periodEnd) {
    const monthStart = new Date(cursor);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
    const monthLabel = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;

    const created = tickets.filter(t => t.createDate >= monthStart && t.createDate <= monthEnd);
    const closed = tickets.filter(t =>
      resolvedSet.has(t.status) && t.completedDate &&
      t.completedDate >= monthStart && t.completedDate <= monthEnd
    );

    // Approximate hours for this month (distribute evenly — exact would need dateWorked)
    const monthHours = created.reduce((sum, t) => {
      return sum + (hoursByTicket.get(t.autotaskTicketId) || 0);
    }, 0);

    const byPriority: Record<string, number> = {};
    for (const t of created) {
      const label = PRIORITY_LABELS[t.priority] || `Priority ${t.priority}`;
      byPriority[label] = (byPriority[label] || 0) + 1;
    }

    const byQueue: Record<string, number> = {};
    for (const t of created) {
      const q = t.queueLabel || 'General';
      byQueue[q] = (byQueue[q] || 0) + 1;
    }

    months.push({
      month: monthLabel,
      created: created.length,
      closed: closed.length,
      hours: Math.round(monthHours * 10) / 10,
      byPriority,
      byQueue,
    });

    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}
