/**
 * Data sources for the presentation TBR.
 *
 * Each source REUSES the platform's single integration client (never a parallel
 * client) and returns a normalized {@link SectionState} so a failure degrades
 * only its own section. For the current vertical slice, the Service Desk source
 * (Autotask + Datto RMM) is fully wired; the remaining sources return `pending`
 * (integration exists, not yet wired) or `manual` (no integration), per the
 * feasibility report. Wiring a new source = add a loader here that returns a
 * SectionState and register it against a section in sections.ts.
 */

import { AutotaskClient } from '@/lib/autotask';
import { DattoEdrClient } from '@/lib/datto-edr';
import { DattoRmmClient, type DattoAlert } from '@/lib/datto-rmm';
import { DattoSaasClient } from '@/lib/datto-saas';
import { DnsFilterClient } from '@/lib/dnsfilter';
import { matchesCompanyName } from '@/utils';
import type {
  BackupData,
  ContentFilteringData,
  CountShare,
  DevicesAlertsData,
  M365Data,
  SecurityAlertsData,
  SectionState,
  TbrContext,
  TicketVolumeData,
} from './types';

const SAAS_SOURCE = 'Cloud backup & SaaS protection (Datto SaaS)';
const DNSFILTER_SOURCE = 'DNS content filtering (DNSFilter)';
const EDR_SOURCE = 'Managed endpoint detection (Datto EDR)';
const M365_SOURCE = 'Microsoft 365 (Graph)';

/** Friendly workload labels for Datto SaaS seat types. */
const SAAS_WORKLOAD_LABELS: Record<string, string> = {
  User: 'Microsoft 365 users',
  SharedMailbox: 'Shared mailboxes',
  Site: 'SharePoint sites',
  TeamSite: 'SharePoint team sites',
  Team: 'Teams',
  SharedDrive: 'Shared drives',
};

const SERVICE_DESK_SOURCE = 'Autotask PSA + Datto RMM';

/** Autotask default "Complete" status id (always treated as closed). */
const STATUS_COMPLETE = 5;
/** Datto alert priority order for display (highest first). */
const ALERT_PRIORITY_ORDER = ['critical', 'high', 'moderate', 'low', 'information'];

/** Memoize a fetch that feeds more than one section within a single report run. */
function memo<T>(ctx: TbrContext, key: string, fn: () => Promise<T>): Promise<T> {
  const existing = ctx.cache.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn();
  ctx.cache.set(key, p);
  return p;
}

interface ServiceDeskBundle {
  ticketVolume: SectionState<TicketVolumeData>;
  devicesAlerts: SectionState<DevicesAlertsData>;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function toShare(counts: Map<string, number>, total: number): CountShare[] {
  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      share: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => {
      const ai = ALERT_PRIORITY_ORDER.indexOf(a.label.toLowerCase());
      const bi = ALERT_PRIORITY_ORDER.indexOf(b.label.toLowerCase());
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return b.count - a.count;
    });
}

/**
 * Fetch tickets (Autotask) + devices/alerts (Datto RMM) once and shape both
 * service-desk slides. Each half degrades independently.
 */
async function loadServiceDesk(ctx: TbrContext): Promise<ServiceDeskBundle> {
  return memo<ServiceDeskBundle>(ctx, 'service-desk', async () => {
    const ticketVolume = await buildTicketVolume(ctx);
    const devicesAlerts = await buildDevicesAlerts(ctx);
    return { ticketVolume, devicesAlerts };
  });
}

async function buildTicketVolume(ctx: TbrContext): Promise<SectionState<TicketVolumeData>> {
  let client: AutotaskClient;
  try {
    client = new AutotaskClient();
  } catch (err) {
    return { status: 'error', source: SERVICE_DESK_SOURCE, note: `Autotask not configured: ${errMsg(err)}` };
  }

  try {
    const fetched = await client.getCompanyTicketsCreatedSince(ctx.company.autotaskId, ctx.periodStart);
    // De-duplicate (date-window pagination can return a ticket more than once).
    const seen = new Set<number>();
    const tickets = fetched.filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 86_400_000;
    const yearMap = new Map<number, { created: number; closed: number }>();
    let totalClosed = 0;
    let currentlyOpen = 0;
    let agingOver30 = 0;

    const yearEntry = (y: number) => {
      let v = yearMap.get(y);
      if (!v) {
        v = { created: 0, closed: 0 };
        yearMap.set(y, v);
      }
      return v;
    };

    for (const t of tickets) {
      const created = new Date(t.createDate);
      const completed = t.completedDate ? new Date(t.completedDate) : null;
      const isClosed = !!completed || t.status === STATUS_COMPLETE;

      yearEntry(created.getFullYear()).created++;
      if (completed) {
        totalClosed++;
        yearEntry(completed.getFullYear()).closed++;
      }
      if (!isClosed) {
        currentlyOpen++;
        if (created.getTime() <= thirtyDaysAgo) agingOver30++;
      }
    }

    const byYear = Array.from(yearMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, v]) => ({ year, created: v.created, closed: v.closed }));

    // Datto RMM "alerts resolved" (best-effort; null when RMM unavailable).
    let alertsResolved: number | null = null;
    if (ctx.includeDatto) {
      const datto = await loadDattoRmm(ctx);
      if (datto.status === 'success' && datto.data) {
        alertsResolved = datto.data.alertsResolved;
      }
    }

    return {
      status: tickets.length === 0 ? 'empty' : 'success',
      source: 'Autotask PSA',
      data: {
        totalCreated: tickets.length,
        totalClosed,
        currentlyOpen,
        agingOver30,
        alertsResolved,
        byYear,
      },
    };
  } catch (err) {
    return { status: 'error', source: 'Autotask PSA', note: errMsg(err) };
  }
}

interface DattoRmmBundle {
  managed: number;
  online: number;
  servers: number;
  workstations: number;
  fullyPatched: number;
  avInstalled: number;
  rebootRequired: number;
  alertsByPriority: CountShare[];
  alertsResolved: number;
}

/** Shared Datto RMM pull (devices + period alerts) for one customer. */
function loadDattoRmm(ctx: TbrContext): Promise<SectionState<DattoRmmBundle>> {
  return memo<SectionState<DattoRmmBundle>>(ctx, 'datto-rmm', async () => {
    if (!ctx.includeDatto) {
      return { status: 'empty', source: 'Datto RMM', note: 'Datto collection skipped for this run.' };
    }
    const client = new DattoRmmClient();
    if (!client.isConfigured()) {
      return { status: 'empty', source: 'Datto RMM', note: 'Datto RMM not configured (DATTO_RMM_API_KEY / DATTO_RMM_API_SECRET unset).' };
    }

    try {
      const ALERT_PAGES = 40;
      const [sitesRes, openRes, resolvedRes] = await Promise.allSettled([
        client.getSites(),
        client.getOpenAlerts(ALERT_PAGES),
        client.getResolvedAlerts(ALERT_PAGES),
      ]);
      const sites = sitesRes.status === 'fulfilled' ? sitesRes.value : [];
      const openAlerts = openRes.status === 'fulfilled' ? openRes.value : [];
      const resolvedAlerts = resolvedRes.status === 'fulfilled' ? resolvedRes.value : [];

      const matchedSites = sites.filter((s) => matchesCompanyName(ctx.company.name, s.name));
      if (matchedSites.length === 0) {
        return {
          status: 'empty',
          source: 'Datto RMM',
          note: `No Datto RMM site matched "${ctx.company.name}". Map the site explicitly to scope this customer.`,
        };
      }
      const matchedUids = new Set(matchedSites.map((s) => s.uid));

      const deviceResults = await Promise.allSettled(matchedSites.map((s) => client.getSiteDevices(s.uid)));
      const devices = deviceResults.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));

      let online = 0;
      let servers = 0;
      let fullyPatched = 0;
      let avInstalled = 0;
      let rebootRequired = 0;
      for (const d of devices) {
        if (d.online) online++;
        if ((d.deviceType || '').toLowerCase().includes('server')) servers++;
        if (d.patchStatus === 'FullyPatched') fullyPatched++;
        if (d.antivirusProduct) avInstalled++;
        if (d.rebootRequired) rebootRequired++;
      }

      const inScope: DattoAlert[] = [...resolvedAlerts, ...openAlerts].filter(
        (a) => matchedUids.has(a.siteUid) || matchesCompanyName(ctx.company.name, a.siteName),
      );
      const byPriority = new Map<string, number>();
      let alertsResolved = 0;
      for (const a of inScope) {
        const label = capitalize(a.priority || 'information');
        byPriority.set(label, (byPriority.get(label) || 0) + 1);
        if (a.resolved) {
          const ts = new Date(a.timestamp);
          if (!Number.isNaN(ts.getTime()) && ts >= ctx.periodStart && ts <= ctx.periodEnd) {
            alertsResolved++;
          }
        }
      }

      return {
        status: 'success',
        source: 'Datto RMM',
        data: {
          managed: devices.length,
          online,
          servers,
          workstations: devices.length - servers,
          fullyPatched,
          avInstalled,
          rebootRequired,
          alertsByPriority: toShare(byPriority, inScope.length),
          alertsResolved,
        },
      };
    } catch (err) {
      return { status: 'error', source: 'Datto RMM', note: errMsg(err) };
    }
  });
}

async function buildDevicesAlerts(ctx: TbrContext): Promise<SectionState<DevicesAlertsData>> {
  const datto = await loadDattoRmm(ctx);
  if (datto.status !== 'success' || !datto.data) {
    return { status: datto.status, source: 'Datto RMM', note: datto.note };
  }
  const d = datto.data;
  return {
    status: 'success',
    source: 'Datto RMM',
    data: {
      managed: d.managed,
      online: d.online,
      servers: d.servers,
      workstations: d.workstations,
      fullyPatched: d.fullyPatched,
      avInstalled: d.avInstalled,
      rebootRequired: d.rebootRequired,
      alertsByPriority: d.alertsByPriority,
    },
  };
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

// ---------------------------------------------------------------------------
// Public loaders consumed by sections.ts
// ---------------------------------------------------------------------------

export async function ticketVolumeSource(ctx: TbrContext): Promise<SectionState<TicketVolumeData>> {
  return (await loadServiceDesk(ctx)).ticketVolume;
}

export async function devicesAlertsSource(ctx: TbrContext): Promise<SectionState<DevicesAlertsData>> {
  return (await loadServiceDesk(ctx)).devicesAlerts;
}

// ---------------------------------------------------------------------------
// Per-customer scoping helpers — mirror the compliance/SOC pattern: explicit
// compliance_platform_mappings first, then name-match a SPECIFIC org/customer.
// Never an MSP-wide / account-wide pull. (See src/lib/soc/enrichment.ts.)
// ---------------------------------------------------------------------------

/** Resolve the local Company.id for the report's Autotask company (id → name). */
async function resolveLocalCompanyId(ctx: TbrContext): Promise<string | null> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const byAt = await prisma.company.findFirst({
      where: { autotaskCompanyId: String(ctx.company.autotaskId) },
      select: { id: true },
    });
    if (byAt) return byAt.id;
    // The Autotask id may not be synced locally — fall back to the display name.
    const byName = await prisma.company.findFirst({
      where: { displayName: { equals: ctx.company.name, mode: 'insensitive' } },
      select: { id: true },
    });
    return byName?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Explicit platform mappings for a company (the same table the compliance
 * Platform Mappings UI writes). `markedNone` = the customer is flagged as not
 * using the platform (`__none__`); `msp_wide` sentinels are dropped.
 */
async function platformMappingIds(
  companyId: string | null,
  platform: string,
): Promise<{ ids: string[]; markedNone: boolean }> {
  if (!companyId) return { ids: [], markedNone: false };
  try {
    const { getPool } = await import('@/lib/db-pool');
    const conn = await getPool().connect();
    try {
      const res = await conn.query<{ externalId: string }>(
        `SELECT "externalId" FROM compliance_platform_mappings WHERE "companyId" = $1 AND platform = $2`,
        [companyId, platform],
      );
      const ids = res.rows.map((r) => r.externalId).filter(Boolean);
      if (ids.some((id) => id === '__none__')) return { ids: [], markedNone: true };
      return { ids: ids.filter((id) => id !== 'msp_wide'), markedNone: false };
    } finally {
      conn.release();
    }
  } catch {
    return { ids: [], markedNone: false };
  }
}

/**
 * Backup & Business Continuity (Datto SaaS Protection). Scoped per-customer:
 * explicit `datto_saas` mapping (SaaS customer ids) first, else fuzzy name
 * match — the same priority the compliance side uses. Total-TB / last-backup /
 * jobs-in-progress are not exposed by the current calls (null).
 */
export async function backupSource(ctx: TbrContext): Promise<SectionState<BackupData>> {
  const client = new DattoSaasClient();
  if (!client.isConfigured()) {
    return { status: 'empty', source: SAAS_SOURCE, note: 'Datto SaaS not configured (DATTO_BCDR_PUBLIC_KEY / DATTO_BCDR_PRIVATE_KEY unset).' };
  }
  try {
    const localId = await resolveLocalCompanyId(ctx);
    const { ids, markedNone } = await platformMappingIds(localId, 'datto_saas');
    if (markedNone) {
      return { status: 'empty', source: SAAS_SOURCE, note: 'This customer is marked as not using Datto SaaS Protection.' };
    }
    const customerIds = ids.map((id) => Number(id)).filter((n) => Number.isFinite(n));
    const s = customerIds.length > 0
      ? await client.buildSummary(undefined, { customerIds })
      : await client.buildSummary(ctx.company.name);
    if (!s.available) {
      return { status: 'error', source: SAAS_SOURCE, note: s.note ?? 'Datto SaaS unavailable.' };
    }
    if (s.totalCustomers === 0) {
      return {
        status: 'empty',
        source: SAAS_SOURCE,
        note: s.note ?? `No Datto SaaS customer matched "${ctx.company.name}". Map it in compliance Platform Mappings (Datto SaaS Protect → Customer).`,
      };
    }
    return {
      status: 'success',
      source: customerIds.length > 0 ? 'Datto SaaS Protection (mapped)' : 'Datto SaaS Protection',
      data: {
        totalSeats: s.totalSeats,
        activeSeats: s.activeSeats,
        inactiveSeats: s.pausedSeats + s.archivedSeats + s.unprotectedSeats,
        customers: s.totalCustomers,
        totalProtectedTB: null,
        workloads: s.seatsByType.map((t) => ({
          name: SAAS_WORKLOAD_LABELS[t.type] ?? t.type,
          seats: t.count,
        })),
      },
    };
  } catch (err) {
    return { status: 'error', source: SAAS_SOURCE, note: errMsg(err) };
  }
}

/**
 * Security Alerts (Datto EDR). Scoped to the customer's EDR organization:
 * explicit `datto_edr` mapping first, then name-match against the EDR org list
 * — identical to the SOC enrichment. `/Alerts` is filtered by organizationId,
 * so it is never MSP-wide. Unresolved org → `pending` (never an MSP-wide pull).
 */
export async function edrSecurityAlertsSource(ctx: TbrContext): Promise<SectionState<SecurityAlertsData>> {
  const client = new DattoEdrClient();
  if (!client.isConfigured()) {
    return { status: 'empty', source: EDR_SOURCE, note: 'Datto EDR not configured (DATTO_EDR_API_TOKEN unset).' };
  }
  try {
    const localId = await resolveLocalCompanyId(ctx);
    const { ids, markedNone } = await platformMappingIds(localId, 'datto_edr');
    if (markedNone) {
      return { status: 'empty', source: EDR_SOURCE, note: 'This customer is marked as not using Datto EDR.' };
    }
    let orgId: string | null = ids[0] ?? null;
    if (!orgId) {
      const orgs = await client.listOrganizations();
      orgId = orgs.find((o) => o.name && matchesCompanyName(ctx.company.name, o.name))?.id ?? null;
    }
    if (!orgId) {
      return {
        status: 'pending',
        source: EDR_SOURCE,
        note: `No Datto EDR organization mapped or name-matched for "${ctx.company.name}". Map it in compliance Platform Mappings (Datto EDR → Organization) — EDR is never queried MSP-wide.`,
      };
    }
    const s = await client.buildSummary(ctx.periodStart, ctx.periodEnd, orgId);
    if (!s.available) {
      return { status: 'error', source: EDR_SOURCE, note: s.note ?? 'Datto EDR unavailable.' };
    }
    const bySev = (name: string) => s.eventsBySeverity.find((e) => e.severity === name)?.count ?? 0;
    const critical = bySev('critical');
    const high = bySev('high');
    return {
      status: s.totalEvents === 0 ? 'empty' : 'success',
      source: 'Datto EDR',
      data: {
        eventsCaptured: s.totalEvents,
        eventsAnalyzed: null, // SOC-engine "escalated" count not wired into this slide yet
        totalAlerts: critical + high, // actionable detections (suspicious/bad)
        criticalAlerts: critical,
      },
    };
  } catch (err) {
    return { status: 'error', source: EDR_SOURCE, note: errMsg(err) };
  }
}

/**
 * Content Filtering (DNSFilter). Scoped to the customer's org(s): explicit
 * `dnsfilter` mapping first, else name-match against the live org list (the
 * same resolution the SOC enrichment uses). Each org is queried with the
 * account-wide fallback disabled, so customers never mix. Unresolved → pending.
 */
export async function contentFilteringSource(ctx: TbrContext): Promise<SectionState<ContentFilteringData>> {
  const client = new DnsFilterClient();
  if (!client.isConfigured()) {
    return { status: 'empty', source: DNSFILTER_SOURCE, note: 'DNSFilter not configured (DNSFILTER_API_TOKEN unset).' };
  }

  try {
    const localId = await resolveLocalCompanyId(ctx);
    const { ids, markedNone } = await platformMappingIds(localId, 'dnsfilter');
    if (markedNone) {
      return { status: 'empty', source: DNSFILTER_SOURCE, note: 'This customer is marked as not using DNSFilter.' };
    }
    let orgIds = ids;
    if (orgIds.length === 0) {
      const orgs = await client.listOrganizations();
      const matched = orgs.find((o) => o.name && matchesCompanyName(ctx.company.name, o.name));
      if (matched) orgIds = [matched.id];
    }
    if (orgIds.length === 0) {
      return {
        status: 'pending',
        source: DNSFILTER_SOURCE,
        note: `No DNSFilter organization mapped or name-matched for "${ctx.company.name}". Map it in compliance Platform Mappings (DNSFilter → Organization) — DNSFilter is never queried account-wide.`,
      };
    }

    let totalRequests = 0;
    let blocked = 0;
    const catCounts = new Map<string, number>();
    const domainCounts = new Map<string, number>();
    let anyAvailable = false;
    let firstNote: string | null = null;

    for (const orgId of orgIds) {
      const s = await client.buildSummary(ctx.periodStart, ctx.periodEnd, orgId);
      if (!s.available) {
        firstNote = firstNote ?? s.note;
        continue;
      }
      anyAvailable = true;
      totalRequests += s.totalQueries;
      blocked += s.blockedQueries;
      for (const c of s.threatsByCategory) catCounts.set(c.category, (catCounts.get(c.category) ?? 0) + c.count);
      for (const d of s.topBlockedDomains) domainCounts.set(d.domain, (domainCounts.get(d.domain) ?? 0) + d.count);
    }

    if (!anyAvailable) {
      return { status: 'error', source: DNSFILTER_SOURCE, note: firstNote ?? 'DNSFilter returned no data for the mapped organization(s).' };
    }

    const threats = Array.from(catCounts.values()).reduce((a, b) => a + b, 0);
    const topDomains = Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain, count]) => ({ domain, count }));

    return {
      status: totalRequests === 0 ? 'empty' : 'success',
      source: orgIds.length > 1 ? `DNSFilter (${orgIds.length} orgs)` : 'DNSFilter',
      data: {
        totalRequests,
        allowed: Math.max(0, totalRequests - blocked),
        blocked,
        threats,
        topCategories: toShare(catCounts, threats).slice(0, 8),
        topDomains,
      },
    };
  } catch (err) {
    return { status: 'error', source: DNSFILTER_SOURCE, note: errMsg(err) };
  }
}

/**
 * Microsoft 365 (Graph). Tenant-scoped via the customer's connected M365
 * credentials (Company.m365* / `getTenantCredentials`) — the same path used by
 * the onboarding provisioning flow, so no cross-customer risk. Built from the
 * production Graph client's counts (users / devices / sites / groups / license
 * SKUs), not the Reports usage-CSV API. Not connected → `pending`.
 */
export async function m365Source(ctx: TbrContext): Promise<SectionState<M365Data>> {
  try {
    const localId = await resolveLocalCompanyId(ctx);
    if (!localId) {
      return {
        status: 'pending',
        source: M365_SOURCE,
        note: `No local company record for "${ctx.company.name}" — M365 is read from the connected tenant. Sync/connect the customer first.`,
      };
    }
    const { getTenantCredentials, createGraphClient } = await import('@/lib/graph');
    const creds = await getTenantCredentials(localId);
    if (!creds) {
      return {
        status: 'pending',
        source: M365_SOURCE,
        note: 'Microsoft 365 is not connected for this customer (no tenant credentials). Connect it via the onboarding M365 setup.',
      };
    }

    const client = createGraphClient(creds);
    const [usersR, devicesR, sitesR, groupsR, skusR] = await Promise.allSettled([
      client.getUsers(),
      client.getManagedDevices(),
      client.getSharePointSites(),
      client.getM365Groups(),
      client.getLicenseSkus(),
    ]);
    // If every probe failed, the credentials/consent are broken — surface it.
    if ([usersR, devicesR, sitesR, groupsR, skusR].every((r) => r.status === 'rejected')) {
      const reason = (usersR as PromiseRejectedResult).reason;
      return { status: 'error', source: M365_SOURCE, note: errMsg(reason) };
    }
    const arr = <T>(r: PromiseSettledResult<T[]>): T[] => (r.status === 'fulfilled' ? r.value : []);
    const users = arr(usersR);
    const skus = arr(skusR);

    const topLicenses: CountShare[] = skus
      .filter((s) => s.consumedUnits > 0)
      .sort((a, b) => b.consumedUnits - a.consumedUnits)
      .slice(0, 6)
      .map((s) => ({
        label: s.displayName ?? s.skuPartNumber,
        count: s.consumedUnits,
        share: s.prepaidUnits.enabled > 0 ? Math.round((s.consumedUnits / s.prepaidUnits.enabled) * 1000) / 10 : 0,
      }));

    return {
      status: 'success',
      source: M365_SOURCE,
      data: {
        licensedUsers: users.length,
        managedDevices: arr(devicesR).length,
        sharePointSites: arr(sitesR).length,
        teamsGroups: arr(groupsR).length,
        topLicenses,
      },
    };
  } catch (err) {
    return { status: 'error', source: M365_SOURCE, note: errMsg(err) };
  }
}

/**
 * Source for an integration that exists in the codebase but is not yet wired
 * into this generator. Returns `pending` with the source label so the section
 * renders a clear "wiring in progress" state. See feasibility report §3/§7.
 */
export function pendingSource<T>(source: string, note: string): () => Promise<SectionState<T>> {
  return async () => ({ status: 'pending', source, note });
}

/**
 * Source for a data point with NO integration (INKY, BullPhish ID). Returns
 * `manual` so the section prompts for hand-entered figures.
 */
export function manualSource<T>(source: string, note?: string): () => Promise<SectionState<T>> {
  return async () => ({ status: 'manual', source, note });
}
