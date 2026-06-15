/**
 * GET /api/reports/tbr-export
 *
 * Technology Business Review (TBR) data export for a single company, pulled
 * LIVE from Autotask (and Datto RMM) — independent of the reporting sync's
 * rolling cache window, so it can return multi-year history.
 *
 * Read-only. Auth: MIGRATION_SECRET (Authorization: Bearer <secret>, or ?secret=).
 *
 * Query params:
 *   company     - Company name (partial, case-insensitive). Required unless companyId given.
 *   companyId   - Exact Autotask company ID (skips the name search; use to disambiguate).
 *   years       - Lookback window in years (default 3, clamped 1–10).
 *   hours       - "true" to also total labor hours from time entries (slower). Default off.
 *   datto       - "false" to skip Datto RMM device/alert collection. Default on.
 *   alertPages  - Max Datto alert pages to scan per stream (default 40 ≈ 10k alerts).
 *   format      - "json" (default) or "html" (a printable report).
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { checkSecretAuth } from '@/lib/api-auth';
import { AutotaskClient, AutotaskCompany, AutotaskTicket } from '@/lib/autotask';
import { DattoRmmClient } from '@/lib/datto-rmm';
import { PRIORITY_LABELS } from '@/lib/reporting/types';
import { matchesCompanyName } from '@/utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Overall time guard so we always return something within the function budget.
const OVERALL_DEADLINE_MS = 52_000;

// ============================================
// RESPONSE SHAPES
// ============================================

interface CountPct {
  label: string;
  count: number;
  percentage: number;
}

interface YearRow {
  year: number;
  created: number;
  closed: number;
}

interface MonthRow {
  month: string; // YYYY-MM
  created: number;
  closed: number;
}

interface TbrExportData {
  company: { autotaskId: number; name: string; classification: string | null };
  period: { years: number; start: string; end: string; generatedAt: string };
  definitions: Record<string, string>;
  tickets: {
    totalCreated: number;
    openCreatedInPeriod: number;
    closed: number;
    byYear: YearRow[];
    byMonth: MonthRow[];
    byQueue: CountPct[];
    byPriority: CountPct[];
    byStatus: CountPct[];
    byIssueType: CountPct[];
    bySubIssueType: CountPct[];
    bySource: CountPct[];
    sourceSplit: { reactive: number; proactive: number; other: number };
    backlog: {
      open: number;
      agingOver7Days: number;
      agingOver30Days: number;
      urgentOpen: number;
      highOpen: number;
    };
    resolution: {
      avgHours: number | null;
      medianHours: number | null;
      byPriority: { priority: string; avgHours: number | null; count: number }[];
    };
    labor: {
      available: boolean;
      complete: boolean;
      totalHours: number;
      billableHours: number;
      nonBillableHours: number;
      entries: number;
      note: string | null;
    };
  };
  datto: DattoSection;
}

interface DattoSection {
  available: boolean;
  note: string | null;
  matchedSites: { name: string; uid: string; devicesCount: number }[];
  devices: {
    managed: number;
    online: number;
    servers: number;
    workstations: number;
    byOS: CountPct[];
    byType: CountPct[];
    patchFullyPatched: number;
    patchesInstalledTotal: number;
    rebootRequired: number;
    antivirusInstalled: number;
  };
  alerts: {
    periodResolved: number;
    openNow: number;
    byType: CountPct[];
    byPriority: CountPct[];
    monthly: { month: string; count: number }[];
    topDevices: { hostname: string; count: number }[];
    capped: boolean;
  };
}

// ============================================
// HANDLER
// ============================================

export async function GET(request: NextRequest) {
  // Allow either a logged-in staff session (admin UI / shareable links for the
  // team) OR the MIGRATION_SECRET (scripts / PowerShell). Staff session first so
  // internal links never need to carry a secret.
  const session = await auth();
  if (!session?.user?.email) {
    const denied = checkSecretAuth(request);
    if (denied) return denied;
  }

  const startTime = Date.now();
  const sp = request.nextUrl.searchParams;
  const companyQuery = sp.get('company');
  const companyIdParam = sp.get('companyId');
  const years = Math.min(10, Math.max(1, parseInt(sp.get('years') || '3', 10) || 3));
  const wantHours = sp.get('hours') === 'true';
  const wantDatto = sp.get('datto') !== 'false';
  const alertPages = Math.min(200, Math.max(1, parseInt(sp.get('alertPages') || '40', 10) || 40));
  const format = sp.get('format') || 'json';

  if (!companyQuery && !companyIdParam) {
    return NextResponse.json(
      { error: 'Provide ?company=<name> (partial match) or ?companyId=<autotaskId>' },
      { status: 400 },
    );
  }

  let client: AutotaskClient;
  try {
    client = new AutotaskClient();
  } catch (err) {
    return NextResponse.json(
      { error: `Autotask client not configured: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  try {
    // 1. Resolve the company (live, from Autotask) ------------------------------
    let company: AutotaskCompany | null = null;
    if (companyIdParam) {
      company = await client.getCompany(parseInt(companyIdParam, 10));
    } else if (companyQuery) {
      let matches = await client.searchCompanies(companyQuery);
      if (matches.length === 0) {
        // Fallback: Autotask `contains` is literal, so punctuation/spacing
        // differences (e.g. "Tribros" vs "Tri-Bros Transportation") miss.
        // Retry with a normalized, punctuation-insensitive match across all
        // active companies.
        const nq = normalizeName(companyQuery);
        if (nq.length >= 2) {
          const all = await client.getActiveCompanies();
          matches = all.filter(c => {
            const nc = normalizeName(c.companyName);
            return nc.includes(nq) || nq.includes(nc);
          });
        }
      }
      if (matches.length === 0) {
        return NextResponse.json(
          { error: `No active Autotask company matches "${companyQuery}".` },
          { status: 404 },
        );
      }
      const exact = matches.find(m => normalizeName(m.companyName) === normalizeName(companyQuery));
      if (!exact && matches.length > 1) {
        return NextResponse.json({
          ambiguous: true,
          message: `"${companyQuery}" matched ${matches.length} companies. Re-run with the exact name or ?companyId=<id>.`,
          matches: matches.map(m => ({ id: m.id, name: m.companyName })),
        });
      }
      company = exact || matches[0];
    }
    if (!company) {
      return NextResponse.json({ error: 'Company could not be resolved.' }, { status: 404 });
    }

    const periodEnd = new Date();
    const periodStart = new Date();
    periodStart.setFullYear(periodStart.getFullYear() - years);

    // 2. Resolve picklist labels (status / priority / queue / source / issue type) --
    const ticketFields = await client.getFieldInfo('Tickets');
    const fields = ticketFields.fields || [];
    const statusMap = buildLabelMap(fields, 'status');
    const priorityMap = buildLabelMap(fields, 'priority');
    const queueMap = buildLabelMap(fields, 'queueID');
    const sourceMap = buildLabelMap(fields, 'source');
    const issueTypeMap = buildLabelMap(fields, 'issueType');
    const subIssueTypeMap = buildLabelMap(fields, 'subIssueType');
    const closedStatusIds = buildClosedStatusIds(fields);

    // Company classification (service tier) — best effort.
    let classification: string | null = null;
    if (typeof company.classification === 'number') {
      try {
        const companyFields = await client.getFieldInfo('Companies');
        const classMap = buildLabelMap(companyFields.fields || [], 'classification');
        classification = classMap.get(company.classification) || null;
      } catch {
        /* classification label is optional */
      }
    }

    // 3. Pull the full ticket history (live, paginated) -------------------------
    const tickets = await client.getCompanyTicketsCreatedSince(company.id, periodStart);

    // 4. Aggregate ticket metrics ----------------------------------------------
    const ticketSummary = aggregateTickets(
      tickets, periodStart, periodEnd,
      { statusMap, priorityMap, queueMap, sourceMap, issueTypeMap, subIssueTypeMap, closedStatusIds },
    );

    // 5. Labor hours (optional, time-budgeted) ----------------------------------
    let labor = ticketSummary.labor;
    if (wantHours && tickets.length > 0) {
      const ids = tickets.map(t => t.id);
      const { entries, completed } = await client.getTimeEntriesByTicketIds(ids, {
        deadlineMs: startTime + OVERALL_DEADLINE_MS - 8_000,
      });
      const total = entries.reduce((s, e) => s + (e.hoursWorked || 0), 0);
      const billable = entries.filter(e => !e.isNonBillable).reduce((s, e) => s + (e.hoursWorked || 0), 0);
      labor = {
        available: true,
        complete: completed,
        totalHours: round1(total),
        billableHours: round1(billable),
        nonBillableHours: round1(total - billable),
        entries: entries.length,
        note: completed ? null : 'Partial — stopped early to stay within the time budget. Re-run for full totals.',
      };
    }

    // 6. Datto RMM (optional) ---------------------------------------------------
    let datto: DattoSection;
    if (wantDatto) {
      datto = await buildDattoSection(company.companyName, periodStart, periodEnd, alertPages);
    } else {
      datto = emptyDatto('Skipped (datto=false).');
    }

    const data: TbrExportData = {
      company: { autotaskId: company.id, name: company.companyName, classification },
      period: {
        years,
        start: periodStart.toISOString().split('T')[0],
        end: periodEnd.toISOString().split('T')[0],
        generatedAt: new Date().toISOString(),
      },
      definitions: {
        totalCreated: 'Tickets whose Autotask createDate falls within the period.',
        closed: 'Tickets with a completedDate set (resolved at some point).',
        open: 'Tickets created in the period whose current status is not Complete/Closed/Resolved/Cancelled.',
        proactiveVsReactive: 'Derived from the Autotask ticket Source: monitoring/RMM/automation = proactive; phone/email/portal/web = reactive.',
        resolutionTime: 'completedDate − createDate, for tickets closed in the period.',
        dattoDevices: 'Current snapshot of Datto RMM device inventory (not historical).',
        dattoAlerts: 'Datto RMM alerts within the period, as far back as Datto retains them.',
      },
      tickets: { ...ticketSummary, labor },
      datto,
    };

    if (format === 'html') {
      return new NextResponse(renderHtml(data), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[tbr-export] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// ============================================
// PICKLIST HELPERS
// ============================================

interface FieldLike {
  name: string;
  picklistValues?: Array<{ value: string; label: string }>;
}

function buildLabelMap(fields: FieldLike[], fieldName: string): Map<number, string> {
  const map = new Map<number, string>();
  const field = fields.find(f => f.name === fieldName);
  if (field?.picklistValues) {
    for (const pv of field.picklistValues) {
      const v = parseInt(pv.value, 10);
      if (!Number.isNaN(v)) map.set(v, pv.label);
    }
  }
  return map;
}

function buildClosedStatusIds(fields: FieldLike[]): Set<number> {
  const ids = new Set<number>();
  const statusField = fields.find(f => f.name === 'status');
  if (statusField?.picklistValues) {
    for (const pv of statusField.picklistValues) {
      if (/complete|closed|resolved|cancel|done/i.test(pv.label)) {
        const v = parseInt(pv.value, 10);
        if (!Number.isNaN(v)) ids.add(v);
      }
    }
  }
  // Autotask default "Complete" status is 5 — ensure it is always treated as closed.
  ids.add(5);
  return ids;
}

// ============================================
// TICKET AGGREGATION
// ============================================

interface PicklistMaps {
  statusMap: Map<number, string>;
  priorityMap: Map<number, string>;
  queueMap: Map<number, string>;
  sourceMap: Map<number, string>;
  issueTypeMap: Map<number, string>;
  subIssueTypeMap: Map<number, string>;
  closedStatusIds: Set<number>;
}

function aggregateTickets(
  tickets: AutotaskTicket[],
  periodStart: Date,
  periodEnd: Date,
  maps: PicklistMaps,
): TbrExportData['tickets'] {
  const total = tickets.length;
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 86_400_000;
  const thirtyDaysAgo = now - 30 * 86_400_000;

  const byQueue = new Map<string, number>();
  const byPriority = new Map<string, number>();
  const byStatus = new Map<string, number>();
  const byIssueType = new Map<string, number>();
  const bySubIssueType = new Map<string, number>();
  const bySource = new Map<string, number>();
  const sourceSplit = { reactive: 0, proactive: 0, other: 0 };
  const yearMap = new Map<number, { created: number; closed: number }>();
  const monthMap = new Map<string, { created: number; closed: number }>();

  let openCount = 0;
  let agingOver7 = 0;
  let agingOver30 = 0;
  let urgentOpen = 0;
  let highOpen = 0;
  let closedCount = 0;

  const resByPriority = new Map<string, number[]>();
  const allResHours: number[] = [];

  for (const t of tickets) {
    const created = new Date(t.createDate);
    const completed = t.completedDate ? new Date(t.completedDate) : null;
    const isClosed = (t.status != null && maps.closedStatusIds.has(t.status)) || !!completed;

    // Queue
    const queueLabel = t.queueID != null ? (maps.queueMap.get(t.queueID) || `Queue ${t.queueID}`) : 'Unassigned';
    byQueue.set(queueLabel, (byQueue.get(queueLabel) || 0) + 1);

    // Priority
    const priorityLabel = maps.priorityMap.get(t.priority) || PRIORITY_LABELS[t.priority] || `Priority ${t.priority}`;
    byPriority.set(priorityLabel, (byPriority.get(priorityLabel) || 0) + 1);

    // Status (current)
    const statusLabel = maps.statusMap.get(t.status) || `Status ${t.status}`;
    byStatus.set(statusLabel, (byStatus.get(statusLabel) || 0) + 1);

    // Issue type / sub-issue type
    if (t.issueType != null) {
      const l = maps.issueTypeMap.get(t.issueType) || `Issue ${t.issueType}`;
      byIssueType.set(l, (byIssueType.get(l) || 0) + 1);
    }
    if (t.subIssueType != null) {
      const l = maps.subIssueTypeMap.get(t.subIssueType) || `Sub-issue ${t.subIssueType}`;
      bySubIssueType.set(l, (bySubIssueType.get(l) || 0) + 1);
    }

    // Source + reactive/proactive split
    if (t.source != null) {
      const l = maps.sourceMap.get(t.source) || `Source ${t.source}`;
      bySource.set(l, (bySource.get(l) || 0) + 1);
      sourceSplit[sourceClass(l)]++;
    } else {
      sourceSplit.other++;
    }

    // Year + month (created)
    const cy = created.getFullYear();
    const cm = `${cy}-${pad2(created.getMonth() + 1)}`;
    getOrInit(yearMap, cy).created++;
    getOrInit(monthMap, cm).created++;

    // Closed bucketing
    if (completed) {
      closedCount++;
      const wy = completed.getFullYear();
      const wm = `${wy}-${pad2(completed.getMonth() + 1)}`;
      getOrInit(yearMap, wy).closed++;
      getOrInit(monthMap, wm).closed++;

      const resHours = (completed.getTime() - created.getTime()) / 3_600_000;
      if (resHours >= 0) {
        allResHours.push(resHours);
        const arr = resByPriority.get(priorityLabel) || [];
        arr.push(resHours);
        resByPriority.set(priorityLabel, arr);
      }
    }

    // Open backlog (created in period, not closed)
    if (!isClosed) {
      openCount++;
      if (created.getTime() <= sevenDaysAgo) agingOver7++;
      if (created.getTime() <= thirtyDaysAgo) agingOver30++;
      const sev = severityOf(priorityLabel);
      if (sev === 'urgent') urgentOpen++;
      else if (sev === 'high') highOpen++;
    }
  }

  // byYear / byMonth as sorted arrays
  const byYear: YearRow[] = Array.from(yearMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, v]) => ({ year, created: v.created, closed: v.closed }));

  const byMonth: MonthRow[] = buildMonthSeries(periodStart, periodEnd, monthMap);

  const resolutionByPriority = [1, 2, 3, 4]
    .map(p => maps.priorityMap.get(p) || PRIORITY_LABELS[p] || `Priority ${p}`)
    .filter((label, idx, self) => self.indexOf(label) === idx)
    .map(label => {
      const arr = resByPriority.get(label) || [];
      return { priority: label, avgHours: arr.length ? round1(arr.reduce((a, b) => a + b, 0) / arr.length) : null, count: arr.length };
    })
    .filter(r => r.count > 0);

  return {
    totalCreated: total,
    openCreatedInPeriod: openCount,
    closed: closedCount,
    byYear,
    byMonth,
    byQueue: toCountPct(byQueue, total),
    byPriority: toCountPct(byPriority, total),
    byStatus: toCountPct(byStatus, total),
    byIssueType: toCountPct(byIssueType, total),
    bySubIssueType: toCountPct(bySubIssueType, total),
    bySource: toCountPct(bySource, total),
    sourceSplit,
    backlog: { open: openCount, agingOver7Days: agingOver7, agingOver30Days: agingOver30, urgentOpen, highOpen },
    resolution: {
      avgHours: allResHours.length ? round1(allResHours.reduce((a, b) => a + b, 0) / allResHours.length) : null,
      medianHours: median(allResHours.slice().sort((a, b) => a - b)),
      byPriority: resolutionByPriority,
    },
    labor: {
      available: false,
      complete: false,
      totalHours: 0,
      billableHours: 0,
      nonBillableHours: 0,
      entries: 0,
      note: 'Hours not requested. Add &hours=true to total labor from time entries (slower).',
    },
  };
}

// ============================================
// DATTO RMM
// ============================================

function emptyDatto(note: string): DattoSection {
  return {
    available: false,
    note,
    matchedSites: [],
    devices: { managed: 0, online: 0, servers: 0, workstations: 0, byOS: [], byType: [], patchFullyPatched: 0, patchesInstalledTotal: 0, rebootRequired: 0, antivirusInstalled: 0 },
    alerts: { periodResolved: 0, openNow: 0, byType: [], byPriority: [], monthly: [], topDevices: [], capped: false },
  };
}

async function buildDattoSection(
  companyName: string,
  periodStart: Date,
  periodEnd: Date,
  alertPages: number,
): Promise<DattoSection> {
  const client = new DattoRmmClient();
  if (!client.isConfigured()) {
    return emptyDatto('Datto RMM not configured (DATTO_RMM_API_KEY / DATTO_RMM_API_SECRET unset).');
  }

  try {
    const [sitesRes, openRes, resolvedRes] = await Promise.allSettled([
      client.getSites(),
      client.getOpenAlerts(alertPages),
      client.getResolvedAlerts(alertPages),
    ]);

    const sites = sitesRes.status === 'fulfilled' ? sitesRes.value : [];
    const openAlerts = openRes.status === 'fulfilled' ? openRes.value : [];
    const resolvedAlerts = resolvedRes.status === 'fulfilled' ? resolvedRes.value : [];
    const capped = (openAlerts.length >= alertPages * 250) || (resolvedAlerts.length >= alertPages * 250);

    const matchedSites = sites.filter(s => matchesCompanyName(companyName, s.name));
    if (matchedSites.length === 0) {
      return {
        ...emptyDatto(`No Datto RMM site matched "${companyName}". Check the site name in Datto, or map it manually.`),
        available: false,
      };
    }
    const matchedUids = new Set(matchedSites.map(s => s.uid));

    // Devices per matched site
    const deviceResults = await Promise.allSettled(matchedSites.map(s => client.getSiteDevices(s.uid)));
    const devices = deviceResults.flatMap(r => (r.status === 'fulfilled' ? r.value : []));

    const byOS = new Map<string, number>();
    const byType = new Map<string, number>();
    let online = 0, servers = 0, patchFully = 0, patchInstalled = 0, reboot = 0, av = 0;
    for (const d of devices) {
      const os = d.operatingSystem?.includes('Windows Server') ? 'Windows Server'
        : d.operatingSystem?.includes('Windows') ? 'Windows'
        : d.operatingSystem?.includes('Mac') ? 'macOS'
        : d.operatingSystem?.includes('Linux') ? 'Linux'
        : (d.operatingSystem || 'Unknown');
      byOS.set(os, (byOS.get(os) || 0) + 1);
      const type = (d.deviceType || 'unknown').toLowerCase().includes('server') ? 'Server'
        : (d.deviceType || 'unknown').toLowerCase().includes('laptop') ? 'Laptop'
        : (d.deviceType || 'unknown').toLowerCase().includes('desktop') ? 'Desktop'
        : (d.deviceType || 'Unknown');
      byType.set(type, (byType.get(type) || 0) + 1);
      if (d.online) online++;
      if (type === 'Server') servers++;
      if (d.patchStatus === 'FullyPatched') patchFully++;
      patchInstalled += d.patchesInstalled || 0;
      if (d.rebootRequired) reboot++;
      if (d.antivirusProduct) av++;
    }

    // Alerts within period for matched sites
    const inScope = [...resolvedAlerts, ...openAlerts].filter(a =>
      (matchedUids.has(a.siteUid) || matchesCompanyName(companyName, a.siteName)),
    );
    const periodAlerts = inScope.filter(a => {
      const ts = new Date(a.timestamp);
      return !isNaN(ts.getTime()) && ts >= periodStart && ts <= periodEnd;
    });
    const resolvedInPeriod = periodAlerts.filter(a => a.resolved);
    const openNow = inScope.filter(a => !a.resolved).length;

    const alertType = new Map<string, number>();
    const alertPriority = new Map<string, number>();
    const alertDevice = new Map<string, number>();
    const alertMonth = new Map<string, number>();
    for (const a of resolvedInPeriod) {
      alertType.set(a.alertType || 'unknown', (alertType.get(a.alertType || 'unknown') || 0) + 1);
      alertPriority.set(a.priority || 'information', (alertPriority.get(a.priority || 'information') || 0) + 1);
      if (a.hostname) alertDevice.set(a.hostname, (alertDevice.get(a.hostname) || 0) + 1);
      const ts = new Date(a.timestamp);
      if (!isNaN(ts.getTime())) {
        const mk = `${ts.getFullYear()}-${pad2(ts.getMonth() + 1)}`;
        alertMonth.set(mk, (alertMonth.get(mk) || 0) + 1);
      }
    }

    return {
      available: true,
      note: capped ? `Alert scan capped at ${alertPages} pages per stream — increase &alertPages= for deeper history.` : null,
      matchedSites: matchedSites.map(s => ({ name: s.name, uid: s.uid, devicesCount: s.devicesCount })),
      devices: {
        managed: devices.length,
        online,
        servers,
        workstations: devices.length - servers,
        byOS: toCountPct(byOS, devices.length),
        byType: toCountPct(byType, devices.length),
        patchFullyPatched: patchFully,
        patchesInstalledTotal: patchInstalled,
        rebootRequired: reboot,
        antivirusInstalled: av,
      },
      alerts: {
        periodResolved: resolvedInPeriod.length,
        openNow,
        byType: toCountPct(alertType, resolvedInPeriod.length),
        byPriority: toCountPct(alertPriority, resolvedInPeriod.length),
        monthly: Array.from(alertMonth.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([month, count]) => ({ month, count })),
        topDevices: Array.from(alertDevice.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([hostname, count]) => ({ hostname, count })),
        capped,
      },
    };
  } catch (err) {
    return emptyDatto(`Datto RMM fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ============================================
// SMALL HELPERS
// ============================================

function getOrInit<K>(map: Map<K, { created: number; closed: number }>, key: K) {
  let v = map.get(key);
  if (!v) { v = { created: 0, closed: 0 }; map.set(key, v); }
  return v;
}

function buildMonthSeries(start: Date, end: Date, monthMap: Map<string, { created: number; closed: number }>): MonthRow[] {
  const rows: MonthRow[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}`;
    const v = monthMap.get(key) || { created: 0, closed: 0 };
    rows.push({ month: key, created: v.created, closed: v.closed });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return rows;
}

function toCountPct(counts: Map<string, number>, total: number): CountPct[] {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count, percentage: total > 0 ? round1((count / total) * 100) : 0 }));
}

function sourceClass(label: string): 'reactive' | 'proactive' | 'other' {
  const s = label.toLowerCase();
  if (s.includes('monitor') || s.includes('alert') || s.includes('rmm') || s.includes('automation') || s.includes('proactive')) return 'proactive';
  if (s.includes('phone') || s.includes('email') || s.includes('portal') || s.includes('web') || s.includes('verbal') || s.includes('person') || s.includes('chat') || s.includes('client')) return 'reactive';
  return 'other';
}

function severityOf(label: string): 'urgent' | 'high' | 'other' {
  const l = label.toLowerCase();
  if (l.includes('critical') || l.includes('urgent')) return 'urgent';
  if (l.includes('high')) return 'high';
  return 'other';
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? round1((sorted[mid - 1] + sorted[mid]) / 2) : round1(sorted[mid]);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Lowercase and strip non-alphanumerics for punctuation-insensitive name matching. */
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ============================================
// HTML REPORT
// ============================================

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtHours(h: number | null): string {
  if (h === null) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${round1(h)} hrs`;
  return `${round1(h / 24)} days`;
}

function table(headers: string[], rows: string[][]): string {
  const head = headers.map(h => `<th>${esc(h)}</th>`).join('');
  const body = rows.map(r => `<tr>${r.map((c, i) => `<td${i === 0 ? '' : ' class="num"'}>${c}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function countTable(title: string, rows: CountPct[]): string {
  if (rows.length === 0) return `<h3>${esc(title)}</h3><p class="muted">No data.</p>`;
  return `<h3>${esc(title)}</h3>` + table(
    ['Category', 'Count', '%'],
    rows.map(r => [esc(r.label), String(r.count), `${r.percentage}%`]),
  );
}

function renderHtml(d: TbrExportData): string {
  const t = d.tickets;
  const dt = d.datto;
  const card = (label: string, value: string, sub = '') =>
    `<div class="card"><div class="cv">${esc(value)}</div><div class="cl">${esc(label)}</div>${sub ? `<div class="cs">${esc(sub)}</div>` : ''}</div>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TBR Data — ${esc(d.company.name)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;background:#f1f5f9;margin:0;padding:32px;line-height:1.5}
  .wrap{max-width:920px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)}
  header{background:linear-gradient(135deg,#0f172a,#0e7490);color:#fff;padding:32px}
  header .kicker{font-size:12px;letter-spacing:1px;color:#67e8f9;font-weight:700}
  header h1{margin:6px 0 4px;font-size:24px}
  header .meta{color:#cbd5e1;font-size:14px}
  .body{padding:28px 32px}
  h2{font-size:16px;color:#0e7490;border-bottom:2px solid #e2e8f0;padding-bottom:6px;margin:32px 0 12px}
  h3{font-size:13px;color:#334155;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.5px}
  .cards{display:flex;flex-wrap:wrap;gap:12px;margin:8px 0 4px}
  .card{flex:1;min-width:150px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px}
  .cv{font-size:26px;font-weight:800;color:#0f172a}
  .cl{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
  .cs{font-size:11px;color:#94a3b8;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin:6px 0 4px;font-size:13px}
  th,td{text-align:left;padding:7px 10px;border-bottom:1px solid #eef2f7}
  th{background:#f8fafc;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
  td.num,th:nth-child(n+2){text-align:right}
  .muted{color:#94a3b8;font-size:13px}
  .note{background:#ecfeff;border:1px solid #a5f3fc;border-radius:8px;padding:10px 14px;font-size:13px;color:#155e75;margin:10px 0}
  footer{padding:20px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8}
  footer dt{font-weight:700;color:#64748b;margin-top:6px}
  @media print{body{background:#fff;padding:0}.wrap{box-shadow:none}}
</style></head>
<body><div class="wrap">
<header>
  <div class="kicker">TRIPLE CITIES TECH · TECHNOLOGY BUSINESS REVIEW</div>
  <h1>${esc(d.company.name)}</h1>
  <div class="meta">${esc(d.period.start)} → ${esc(d.period.end)} (${d.period.years} yr)${d.company.classification ? ' · ' + esc(d.company.classification) : ''} · generated ${esc(d.period.generatedAt.split('T')[0])}</div>
</header>
<div class="body">

  <h2>Headline numbers</h2>
  <div class="cards">
    ${card('Tickets (created)', String(t.totalCreated), `${d.period.years}-year total`)}
    ${card('Tickets closed', String(t.closed))}
    ${card('Currently open', String(t.backlog.open), `${t.backlog.agingOver30Days} aging >30d`)}
    ${card('Support hours', t.labor.available ? String(t.labor.totalHours) : '—', t.labor.available ? `${t.labor.billableHours} billable` : 'add &hours=true')}
    ${card('Devices managed', dt.available ? String(dt.devices.managed) : '—', dt.available ? `${dt.devices.servers} servers` : 'Datto')}
    ${card('Alerts resolved', dt.available ? String(dt.alerts.periodResolved) : '—', 'Datto RMM')}
  </div>

  <h2>Ticket volume by year</h2>
  ${table(['Year', 'Created', 'Closed'], t.byYear.map(y => [String(y.year), String(y.created), String(y.closed)]))}

  <h2>What kinds of tickets</h2>
  ${countTable('By queue', t.byQueue)}
  ${countTable('By issue type', t.byIssueType)}
  ${t.bySubIssueType.length ? countTable('By sub-issue type', t.bySubIssueType.slice(0, 15)) : ''}
  ${countTable('By priority', t.byPriority)}
  ${countTable('By current status', t.byStatus)}

  <h2>How work arrived (reactive vs. proactive)</h2>
  <div class="cards">
    ${card('Reactive', String(t.sourceSplit.reactive), 'phone / email / portal')}
    ${card('Proactive', String(t.sourceSplit.proactive), 'monitoring / RMM')}
    ${card('Other', String(t.sourceSplit.other))}
  </div>
  ${countTable('By source', t.bySource)}

  <h2>Service performance</h2>
  <div class="cards">
    ${card('Avg resolution', fmtHours(t.resolution.avgHours))}
    ${card('Median resolution', fmtHours(t.resolution.medianHours))}
  </div>
  ${t.resolution.byPriority.length ? table(['Priority', 'Avg resolution', 'Closed'], t.resolution.byPriority.map(r => [esc(r.priority), fmtHours(r.avgHours), String(r.count)])) : ''}

  <h2>Open backlog</h2>
  ${table(['Metric', 'Count'], [
    ['Open (created in period)', String(t.backlog.open)],
    ['Aging > 7 days', String(t.backlog.agingOver7Days)],
    ['Aging > 30 days', String(t.backlog.agingOver30Days)],
    ['Urgent / critical open', String(t.backlog.urgentOpen)],
    ['High open', String(t.backlog.highOpen)],
  ])}

  <h2>Datto RMM — endpoints &amp; monitoring</h2>
  ${dt.available ? `
    ${dt.note ? `<div class="note">${esc(dt.note)}</div>` : ''}
    <div class="cards">
      ${card('Managed devices', String(dt.devices.managed), `${dt.devices.online} online`)}
      ${card('Servers', String(dt.devices.servers))}
      ${card('Workstations', String(dt.devices.workstations))}
      ${card('Fully patched', String(dt.devices.patchFullyPatched))}
      ${card('AV installed', String(dt.devices.antivirusInstalled))}
      ${card('Reboot required', String(dt.devices.rebootRequired))}
    </div>
    ${countTable('Devices by OS', dt.devices.byOS)}
    ${countTable('Devices by type', dt.devices.byType)}
    ${countTable('Alerts resolved by type', dt.alerts.byType)}
    ${countTable('Alerts by priority', dt.alerts.byPriority)}
    ${dt.alerts.topDevices.length ? `<h3>Top alerting devices</h3>` + table(['Device', 'Alerts'], dt.alerts.topDevices.map(x => [esc(x.hostname), String(x.count)])) : ''}
    <p class="muted">Matched Datto sites: ${dt.matchedSites.map(s => esc(s.name)).join(', ') || '—'}</p>
  ` : `<div class="note">${esc(dt.note || 'Datto RMM data not available.')}</div>`}

</div>
<footer>
  <strong>Definitions</strong>
  <dl>${Object.entries(d.definitions).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
  Pulled live from Autotask PSA${dt.available ? ' + Datto RMM' : ''}. Numbers are point-in-time as of generation.
</footer>
</div></body></html>`;
}
