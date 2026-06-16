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
import { DattoRmmClient, type DattoAlert } from '@/lib/datto-rmm';
import { matchesCompanyName } from '@/utils';
import type {
  CountShare,
  DevicesAlertsData,
  SectionState,
  TbrContext,
  TicketVolumeData,
} from './types';

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
