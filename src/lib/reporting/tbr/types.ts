/**
 * Presentation-style Technology Business Review (TBR) + Monthly Customer Summary.
 *
 * Normalized data model and section-state contracts. Every report section
 * resolves to a {@link SectionState} so a single failed or unavailable data
 * source degrades only its own card — never the whole report. This is the
 * "normalized report data model" + "reusable report sections" foundation; the
 * design (theme.ts/template.ts) and data wiring (data-sources.ts/sections.ts)
 * are layered on top.
 *
 * See docs/plans/TBR_MONTHLY_REPORTING_FEASIBILITY.md for the source-by-source
 * availability analysis that drives which sections are wired vs. pending/manual.
 */

export type TbrReportType = 'tbr' | 'monthly_summary';

/**
 * Outcome of a single section's data load. Drives how the section renders:
 * - `success`  data fetched and present → render content
 * - `empty`    source reachable but nothing for this customer/period → muted note
 * - `error`    source failed (network/auth/timeout) → error banner, report continues
 * - `manual`   no integration exists — value entered by hand (INKY, BullPhish ID)
 * - `pending`  integration exists but not yet wired into this generator
 */
export type SectionStatus = 'success' | 'empty' | 'error' | 'manual' | 'pending';

export interface SectionState<T> {
  status: SectionStatus;
  /** Human-readable data source label, e.g. "Autotask PSA + Datto RMM". */
  source: string;
  data?: T;
  /** Operator-facing explanation for any non-`success` status. */
  note?: string;
}

/** Visual tone for a stat tile / banner (all within the allowed palette). */
export type Tone = 'default' | 'good' | 'warn' | 'danger' | 'accent';

/** A single big-number tile — the deck's signature stat. */
export interface StatTile {
  value: string;
  label: string;
  sub?: string;
  tone?: Tone;
}

/** A labelled count + share row (priority / category breakdowns). */
export interface CountShare {
  label: string;
  count: number;
  /** 0–100. */
  share: number;
}

// ---------------------------------------------------------------------------
// Per-slide section data shapes
// (TicketVolume + DevicesAlerts are wired now; the rest document the target
//  shape for later wiring — see feasibility report §3.)
// ---------------------------------------------------------------------------

/** Slide 08 — Service Desk: Ticket Volume & Breakdown (Autotask + Datto RMM). */
export interface TicketVolumeData {
  totalCreated: number;
  totalClosed: number;
  currentlyOpen: number;
  agingOver30: number;
  /** Datto RMM alerts resolved in period; `null` when RMM is unavailable. */
  alertsResolved: number | null;
  byYear: Array<{ year: number; created: number; closed: number }>;
}

/** Slide 09 — Service Desk: Devices & Alerts (Datto RMM). */
export interface DevicesAlertsData {
  managed: number;
  online: number;
  servers: number;
  workstations: number;
  fullyPatched: number;
  avInstalled: number;
  rebootRequired: number;
  alertsByPriority: CountShare[];
}

/** Slide 05 — Users at a Glance: Microsoft 365 (Graph Reports API). */
export interface M365Data {
  activeUsers: number;
  emailActivities: number;
  teamsActivities: number;
  oneDriveFiles: number;
  sharePointFiles: number;
  activeAppUsers: number;
}

/** Slide 06 — Email Security (INKY). */
export interface EmailSecurityData {
  emailsProcessed: number;
  linksClicked: number;
  dangerMessages: number;
  byThreatLevel: CountShare[];
}

/** Slide 07 — Content Filtering (DNSFilter). */
export interface ContentFilteringData {
  totalRequests: number;
  allowed: number;
  blocked: number;
  threats: number;
  topCategories: CountShare[];
  topDomains: Array<{ domain: string; count: number }>;
}

/** Slide 10 — Security Alerts / Threat Activity (Datto EDR + SOC). */
export interface SecurityAlertsData {
  eventsCaptured: number;
  /** "Escalated by the SOC engine" — from SOC pipeline, `null` if unavailable. */
  eventsAnalyzed: number | null;
  totalAlerts: number;
  criticalAlerts: number;
}

/** Slide 11 — Security Awareness Training (BullPhish ID). */
export interface SecurityAwarenessData {
  opened: number;
  started: number;
  completed: number;
  noAction: number;
}

/** Slide 12 — Backup & Business Continuity (Datto SaaS Protection + BCDR). */
export interface BackupData {
  totalSeats: number;
  activeSeats: number;
  inactiveSeats: number;
  customers: number;
  /** Total protected data — not exposed by the current SaaS API calls (`null`). */
  totalProtectedTB: number | null;
  /** Protected seats grouped by workload type. */
  workloads: Array<{ name: string; seats: number }>;
}

// ---------------------------------------------------------------------------
// Report assembly
// ---------------------------------------------------------------------------

export interface TbrCompany {
  autotaskId: number;
  name: string;
  classification: string | null;
}

/**
 * Runtime context handed to every data source. `cache` memoizes fetches that
 * feed more than one section (e.g. the single Autotask+Datto pull behind both
 * the Ticket Volume and Devices & Alerts slides).
 */
export interface TbrContext {
  company: TbrCompany;
  reportType: TbrReportType;
  periodStart: Date;
  periodEnd: Date;
  years: number;
  includeDatto: boolean;
  cache: Map<string, Promise<unknown>>;
}

export interface RenderedSection {
  id: string;
  title: string;
  eyebrow: string;
  status: SectionStatus;
  /** Human-readable data source label resolved at load time. */
  source: string;
  /** Fully rendered HTML for this slide/section. */
  html: string;
}

export interface CoverageEntry {
  id: string;
  title: string;
  status: SectionStatus;
  source: string;
  note?: string;
}

export interface TbrReport {
  meta: {
    company: TbrCompany;
    reportType: TbrReportType;
    /** YYYY-MM-DD. */
    periodStart: string;
    periodEnd: string;
    years: number;
    /** ISO timestamp. */
    generatedAt: string;
  };
  sections: RenderedSection[];
  /** Per-section availability roll-up — quick feasibility scan in JSON mode. */
  coverage: CoverageEntry[];
}
