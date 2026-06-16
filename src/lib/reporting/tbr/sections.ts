/**
 * Report section registry.
 *
 * A section pairs a typed data loader with a renderer. {@link defineSection}
 * captures the data type `T` inside each section so the registry can be a flat
 * `AnySection[]` with no `any`, and wraps the load in try/catch so a thrown
 * source becomes an `error` state (never a broken report).
 *
 * Add a slide = one `defineSection({...})` entry below. Wire a pending slide =
 * swap its `load` from `pendingSource(...)` to a real loader in data-sources.ts.
 */

import {
  backupSource,
  devicesAlertsSource,
  manualSource,
  pendingSource,
  ticketVolumeSource,
} from './data-sources';
import {
  dataTable,
  esc,
  fmtNum,
  ghostMetrics,
  shareTable,
  slide,
  stateBanner,
  tileGrid,
} from './template';
import { type TbrTheme } from './theme';
import type {
  BackupData,
  DevicesAlertsData,
  RenderedSection,
  SectionState,
  StatTile,
  TbrContext,
  TicketVolumeData,
} from './types';

interface SectionConfig<T> {
  id: string;
  /** Slide kicker, e.g. "Service Desk". */
  eyebrow: string;
  /** Slide title. */
  title: string;
  load: (ctx: TbrContext) => Promise<SectionState<T>>;
  /** Render the section body (the wrapper + banner are added for you). */
  render: (state: SectionState<T>, theme: TbrTheme) => string;
  /** Metrics this section will show once wired — used in pending/manual states. */
  ghost?: string[];
}

/** Type-erased section for the flat registry. */
export interface AnySection {
  id: string;
  eyebrow: string;
  title: string;
  run: (ctx: TbrContext, theme: TbrTheme) => Promise<RenderedSection>;
}

function defineSection<T>(cfg: SectionConfig<T>): AnySection {
  return {
    id: cfg.id,
    eyebrow: cfg.eyebrow,
    title: cfg.title,
    run: async (ctx, theme) => {
      let state: SectionState<T>;
      try {
        state = await cfg.load(ctx);
      } catch (err) {
        state = {
          status: 'error',
          source: cfg.title,
          note: err instanceof Error ? err.message : String(err),
        };
      }
      const banner = stateBanner(state);
      // For non-success sections, show the banner plus a ghost of upcoming metrics.
      const body =
        state.status === 'success'
          ? cfg.render(state, theme)
          : `${banner}${cfg.ghost ? ghostMetrics(cfg.ghost) : ''}`;
      return {
        id: cfg.id,
        title: cfg.title,
        eyebrow: cfg.eyebrow,
        status: state.status,
        source: state.source,
        html: slide({ eyebrow: cfg.eyebrow, title: cfg.title, source: state.source, body }),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Section definitions (deck order: slides 05–12)
// ---------------------------------------------------------------------------

const m365 = defineSection({
  id: 'm365',
  eyebrow: 'Your Users at a Glance',
  title: 'Microsoft 365',
  load: pendingSource(
    'Microsoft 365 usage analytics',
    'Tenant-scoped (Company.m365TenantId) and Reports.Read.All is already consented, so no leak risk — but the Graph usage-report calls (CSV) still need adding to graph.ts and the parsed figures verified against the M365 admin center before showing customer-facing numbers.',
  ),
  ghost: ['Active users', 'Email activities', 'Teams activities', 'OneDrive files', 'SharePoint files', 'Active app users'],
  render: () => '',
});

const emailSecurity = defineSection({
  id: 'email_security',
  eyebrow: 'Your Users at a Glance',
  title: 'Email Security',
  load: manualSource(
    'Email security platform (INKY)',
    'No INKY integration exists yet — enter these figures from the INKY portal, or add an INKY connector (INKY_API_KEY + company→tenant mapping).',
  ),
  ghost: ['Emails processed', 'Links clicked', 'Danger messages', 'Threat-level breakdown'],
  render: () => '',
});

const contentFiltering = defineSection({
  id: 'content_filtering',
  eyebrow: 'Your Users at a Glance',
  title: 'Content Filtering',
  load: pendingSource(
    'DNS content filtering (DNSFilter)',
    "DNSFilter's buildSummary is MSP-wide (it uses the account's first org). Wiring it customer-facing would mix customers' traffic — add a companyId→DNSFilter-org mapping (compliance_platform_mappings, platform 'dnsfilter') + an org-scoped query first.",
  ),
  ghost: ['Total requests', 'Allowed', 'Blocked', 'Threats', 'Top categories', 'Top domains'],
  render: () => '',
});

const ticketVolume = defineSection<TicketVolumeData>({
  id: 'ticket_volume',
  eyebrow: 'Service Desk',
  title: 'Ticket Volume & Breakdown',
  load: ticketVolumeSource,
  render: (state, theme) => renderTicketVolume(state, theme),
});

const devicesAlerts = defineSection<DevicesAlertsData>({
  id: 'devices_alerts',
  eyebrow: 'Service Desk',
  title: 'Devices & Alerts',
  load: devicesAlertsSource,
  ghost: ['Managed devices', 'Servers', 'Workstations', 'Fully patched', 'AV installed', 'Alerts by priority'],
  render: (state, theme) => renderDevicesAlerts(state, theme),
});

const securityAlerts = defineSection({
  id: 'security_alerts',
  eyebrow: 'Security Posture',
  title: 'Security Alerts',
  load: pendingSource(
    'Managed endpoint detection & SOC (Datto EDR)',
    "Datto EDR's buildSummary is MSP-wide (no per-customer org filter), so it can't be shown customer-facing without leaking cross-customer events. Needs a client change to filter events by org via compliance_platform_mappings; the \"events analyzed\" funnel step also needs SOC-engine data.",
  ),
  ghost: ['Events captured', 'Events analyzed', 'Total alerts', 'Critical alerts'],
  render: () => '',
});

const securityAwareness = defineSection({
  id: 'security_awareness',
  eyebrow: 'Security Posture',
  title: 'Security Awareness Training',
  load: manualSource(
    'Security Awareness Training & Phishing Simulation (BullPhish ID)',
    'No BullPhish ID integration exists — enter training figures from the BullPhish portal, or add a connector.',
  ),
  ghost: ['Courses opened', 'Started', 'Completed', 'No action'],
  render: () => '',
});

const backup = defineSection<BackupData>({
  id: 'backup',
  eyebrow: 'Backup & Continuity',
  title: 'Backup & Business Continuity',
  load: backupSource,
  ghost: ['Protected seats', 'Active', 'Workloads', 'Total protected data'],
  render: (state, theme) => renderBackup(state, theme),
});

/** The ordered registry (deck order). */
export const TBR_SECTIONS: AnySection[] = [
  m365,
  emailSecurity,
  contentFiltering,
  ticketVolume,
  devicesAlerts,
  securityAlerts,
  securityAwareness,
  backup,
];

/**
 * Monthly Customer Summary = the at-a-glance subset. For the vertical slice
 * both report types render the same sections; this hook is where a lighter
 * Monthly layout (fewer sections / single-month window) plugs in later.
 */
export function sectionsForReportType(): AnySection[] {
  return TBR_SECTIONS;
}

// ---------------------------------------------------------------------------
// Wired renderers
// ---------------------------------------------------------------------------

function renderTicketVolume(state: SectionState<TicketVolumeData>, theme: TbrTheme): string {
  const d = state.data;
  if (!d) return stateBanner(state);

  const yearSpan = d.byYear.length;
  const tiles: StatTile[] = [
    { value: fmtNum(d.totalCreated), label: 'Tickets created', sub: yearSpan > 1 ? `${yearSpan}-year total` : 'this period', tone: 'accent' },
    { value: fmtNum(d.totalClosed), label: 'Tickets closed' },
    { value: fmtNum(d.currentlyOpen), label: 'Currently open', sub: `${d.agingOver30} aging > 30 days`, tone: d.agingOver30 > 0 ? 'warn' : 'good' },
    {
      value: d.alertsResolved === null ? '—' : fmtNum(d.alertsResolved),
      label: 'Alerts resolved',
      sub: d.alertsResolved === null ? 'Datto RMM unavailable' : 'Automated remote monitoring',
    },
  ];

  const yearRows = d.byYear.map((y) => [
    String(y.year),
    `<span style="color:${theme.accentSoft}">${fmtNum(y.created)}</span>`,
    fmtNum(y.closed),
  ]);

  return (
    tileGrid(theme, tiles, 4) +
    (yearRows.length
      ? dataTable(
          [{ header: 'Year' }, { header: 'Created', num: true }, { header: 'Closed', num: true }],
          yearRows,
        )
      : '')
  );
}

function renderDevicesAlerts(state: SectionState<DevicesAlertsData>, theme: TbrTheme): string {
  const d = state.data;
  if (!d) return stateBanner(state);

  const patchedPct = d.managed > 0 ? Math.round((d.fullyPatched / d.managed) * 100) : 0;
  const avPct = d.managed > 0 ? Math.round((d.avInstalled / d.managed) * 100) : 0;
  const tiles: StatTile[] = [
    { value: fmtNum(d.managed), label: 'Managed devices', sub: `${d.online} online now`, tone: 'accent' },
    { value: fmtNum(d.servers), label: 'Servers' },
    { value: fmtNum(d.workstations), label: 'Workstations' },
    { value: fmtNum(d.fullyPatched), label: 'Fully patched', sub: `${patchedPct}% of fleet`, tone: patchedPct >= 80 ? 'good' : 'warn' },
    { value: fmtNum(d.avInstalled), label: 'AV installed', sub: `${avPct}% coverage`, tone: avPct >= 95 ? 'good' : 'warn' },
    { value: fmtNum(d.rebootRequired), label: 'Reboot required', tone: d.rebootRequired > 0 ? 'warn' : 'good' },
  ];

  return tileGrid(theme, tiles, 3) + shareTable('Alerts by priority', d.alertsByPriority);
}

function renderBackup(state: SectionState<BackupData>, theme: TbrTheme): string {
  const d = state.data;
  if (!d) return stateBanner(state);

  const tiles: StatTile[] = [
    { value: fmtNum(d.totalSeats), label: 'Protected seats', sub: `across ${d.customers} SaaS customer${d.customers === 1 ? '' : 's'}`, tone: 'accent' },
    { value: fmtNum(d.activeSeats), label: 'Active', tone: 'good' },
    { value: fmtNum(d.inactiveSeats), label: 'Paused / archived', tone: d.inactiveSeats > 0 ? 'warn' : 'default' },
    { value: d.totalProtectedTB === null ? '—' : `${d.totalProtectedTB} TB`, label: 'Protected data', sub: d.totalProtectedTB === null ? 'not exposed by API' : undefined },
  ];
  const rows = d.workloads.map((w) => [esc(w.name), fmtNum(w.seats)]);
  return (
    tileGrid(theme, tiles, 4) +
    (rows.length
      ? dataTable([{ header: 'Workload' }, { header: 'Seats', num: true }], rows)
      : '')
  );
}
