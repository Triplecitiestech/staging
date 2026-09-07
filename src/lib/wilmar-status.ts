/**
 * Data for the public Wilmar onboarding status page (`/status/[token]`).
 *
 * Reads straight from Autotask on every request — the same "bypass the
 * reporting sync's cache" pattern as `GET /api/reports/tbr-export` (see
 * CLAUDE.md's 2026-06-16 decision entry). No DB, no caching layer; the page
 * itself is `dynamic = 'force-dynamic'`.
 *
 * This module renders ONLY aggregate counts and the fixed customer-safe copy
 * below. It must never surface individual Autotask task titles, ticket/task
 * notes, or staff/technician names pulled from Autotask — see CLAUDE.md's
 * SOC cross-tenant-leak lesson for why unscoped/raw vendor data must not
 * reach a public page.
 */

import { AutotaskClient, AutotaskProjectPhase } from '@/lib/autotask';
import { withTimeout } from '@/lib/resilience';

// ============================================================
// Identity — named constants, never inline magic numbers
// ============================================================

/** Autotask company id for Wilmar, LLC. */
export const WILMAR_AUTOTASK_COMPANY_ID = 450;

/** Autotask project id for "Wilmar Onboarding - Ally (Co-Managed)". */
export const WILMAR_AUTOTASK_PROJECT_ID = 55;

// ============================================================
// Fixed contract facts — not sourced from Autotask (no field for these)
// ============================================================

/**
 * Scope figures from the signed agreement. Autotask has no "site count"
 * field, so these are hardcoded — update by hand if the contracted scope
 * changes.
 */
export const WILMAR_CONTRACT_SCOPE = {
  sites: 3,
  pcs: 132,
  servers: 6,
  userSeats: 133,
  adminSeats: 2,
} as const;

export const WILMAR_ENGAGEMENT = {
  companyName: 'Wilmar, LLC',
  vendorName: 'Triple Cities Tech',
  tierLabel: 'TCT Ally, 2026-2029',
} as const;

/** Contract-signature date. No Autotask field carries this — hardcode it. */
export const WILMAR_AGREEMENT_ACCEPTED_DATE = '2026-08-24';

/**
 * Day 1 (contract/billing start, monitoring live, tools listen-only) and
 * Day 14 (patching/Windows Update review meeting) are fixed contractual
 * commitments, not derived from Autotask phase scheduling — Autotask's
 * Phase 4/6 startDate fields are task-planning dates that drift from the
 * date actually promised to the customer (owner-confirmed 2026-08-31: they
 * had drifted to Sep 8 / Sep 22). Treat these the same way as the agreement
 * date above rather than reading them live. Day 14 = Day 1 + 13 days
 * (Sep 1 is Day 1, so Sep 14 is Day 14) — update by hand if either date is
 * renegotiated, and keep Day 14 on a Mon-Fri workday when doing so.
 */
export const WILMAR_DAY1_DATE = '2026-09-01';
export const WILMAR_DAY14_DATE = '2026-09-14';

// ============================================================
// Fixed, customer-safe phase copy (never pulled from Autotask descriptions)
// ============================================================

export interface WilmarPhaseDefinition {
  /** "Phase 1" .. "Phase 10" — mirrors the Autotask phase number exactly, so
   *  the customer page and the internal project can never disagree about what
   *  "Phase 4" means. */
  number: number;
  /**
   * Autotask phase `externalID` — the PRIMARY match key. Autotask never
   * generates or mutates externalID, so only a deliberate write changes it:
   * it survived both the phase title rewrites and the 2026-09-07 renumber
   * that took this page down. A display string is not an identifier.
   */
  autotaskExternalId: string;
  /** Autotask phase `title` PREFIX — FALLBACK ONLY, for a phase that somehow
   *  lost its externalID. Note "Phase 1 -" cannot collide with
   *  "Phase 10 - ..." because of the trailing " -". */
  titlePrefix: string;
  eyebrow: string;
  title: string;
  description: string;
  /** Exact substring of `description` to render bold + cyan, matching the
   *  design source's <strong> emphasis on the listen-only / Day 14 cards. */
  emphasize?: string;
  /** Cyan-tinted card border/fill treatment (the listen-only / Day 14 cards). */
  highlight?: boolean;
}

/**
 * Phases 1–10, in display order.
 *
 * Numbering MIRRORS Autotask project 55 exactly (renumbered 2026-09-07 so the
 * phase number matches the WBS group shown in the project view; "Open
 * Decisions" became Phase 1 and every other phase moved +2). Order is NEVER
 * derived from Autotask's `phaseNumber` field (an Autotask-generated
 * ticket-style id, not "1".."10") — it comes from this fixed array.
 *
 * The customer-facing copy below is written for a customer audience and is
 * NOT pulled from Autotask titles or descriptions.
 */
export const WILMAR_PHASE_DEFINITIONS: WilmarPhaseDefinition[] = [
  {
    number: 1,
    autotaskExternalId: 'group_mm6h63z2',
    titlePrefix: 'Phase 1 -',
    eyebrow: 'Phase 1',
    title: 'Open Items',
    description: 'A few decisions we need from your team before some of the work below can start.',
  },
  {
    number: 2,
    autotaskExternalId: 'group_mm6hpakr',
    titlePrefix: 'Phase 2 -',
    eyebrow: 'Phase 2',
    title: 'Contract, Billing and Account Setup',
    description: 'Agreement filed, billing configured, portal and support channels opened.',
  },
  {
    number: 3,
    autotaskExternalId: 'group_mm6hvaae',
    titlePrefix: 'Phase 3 -',
    eyebrow: 'Phase 3',
    title: 'EZ Red Transition',
    description: 'Consolidating EZ Red contracts and assets under the Wilmar account.',
  },
  {
    number: 4,
    autotaskExternalId: 'group_mm6hraja',
    titlePrefix: 'Phase 4 -',
    eyebrow: 'Phase 4',
    title: 'Co-Managed Access for Wilmar IT',
    description:
      'Granting your team direct access to the ticketing, RMM and documentation consoles, and agreeing the support split in writing.',
  },
  {
    number: 5,
    autotaskExternalId: 'group_mm6h65c',
    titlePrefix: 'Phase 5 -',
    eyebrow: 'Phase 5',
    title: 'Kickoff, Discovery and Inventory',
    description: 'Kickoff session, site confirmation, and full inventory of devices and systems.',
  },
  {
    number: 6,
    autotaskExternalId: 'group_mm6hdw3k',
    titlePrefix: 'Phase 6 -',
    eyebrow: 'Phase 6',
    title: 'Security Monitoring, Day 1',
    description:
      'Email protection, dark web monitoring, tenant audit logging and SaaS alerting switched on immediately.',
  },
  {
    number: 7,
    autotaskExternalId: 'group_mm6h742g',
    titlePrefix: 'Phase 7 -',
    eyebrow: 'Phase 7',
    title: 'Tool Deployment, Day 1 to 14, listen-only',
    description:
      'Monitoring agents deployed in observe-only mode. Nothing changes on your machines during this window.',
    emphasize: 'Nothing changes on your machines during this window.',
    highlight: true,
  },
  {
    number: 8,
    autotaskExternalId: 'group_mm6hz1ec',
    titlePrefix: 'Phase 8 -',
    eyebrow: 'Phase 8',
    title: 'Day 14 Activation',
    description: 'Patching and Windows Update management turned on after the observation period.',
    emphasize: 'Patching and Windows Update management turned on after the observation period.',
    highlight: true,
  },
  {
    number: 9,
    autotaskExternalId: 'group_mm6hrfdr',
    titlePrefix: 'Phase 9 -',
    eyebrow: 'Phase 9',
    title: 'Documentation and Site Analysis',
    description: 'Documenting every site, network and system into a maintained knowledge base.',
  },
  {
    number: 10,
    autotaskExternalId: 'group_mm6hbxsq',
    titlePrefix: 'Phase 10 -',
    eyebrow: 'Phase 10',
    title: 'Review and Go-Live',
    description: 'Joint review of the completed onboarding and transition to steady-state service.',
  },
];

/** Phase number of the Review & Go-Live phase, whose Autotask `startDate`
 *  supplies the "refinement" milestone date. Named so the milestone below
 *  can't be repointed by a title edit. */
export const WILMAR_GO_LIVE_PHASE_NUMBER = 10;

// ============================================================
// Milestones — dates are live except the fixed agreement date
// ============================================================

type MilestoneDateSource = 'fixed' | 'project-start' | 'project-end' | 'phase-start';

export interface WilmarMilestoneDefinition {
  key: string;
  label: string;
  dateSource: MilestoneDateSource;
  fixedDate?: string;
  /** For `phase-start`: the WILMAR_PHASE_DEFINITIONS `number` whose Autotask
   *  phase `startDate` supplies the date. Deliberately NOT a title prefix —
   *  a bare display string silently repoints at a different phase when the
   *  project is renumbered (a "Phase 8 -" prefix meant Review & Go-Live before
   *  2026-09-07 and Day 14 Activation after it, with nothing erroring).
   *  Resolving through the definitions inherits the externalID-first lookup. */
  phaseNumber?: number;
  /** Milestones 1–2 always render as reached, regardless of date math. */
  alwaysReached?: boolean;
}

export const WILMAR_MILESTONES: WilmarMilestoneDefinition[] = [
  {
    key: 'agreement',
    label: 'Agreement accepted',
    dateSource: 'fixed',
    fixedDate: WILMAR_AGREEMENT_ACCEPTED_DATE,
    alwaysReached: true,
  },
  {
    key: 'project-open',
    label: 'Onboarding project opens',
    dateSource: 'project-start',
    alwaysReached: true,
  },
  {
    key: 'day1',
    label: 'Day 1: contract and billing start, security monitoring live, tools deploy in listen-only mode',
    dateSource: 'fixed',
    fixedDate: WILMAR_DAY1_DATE,
  },
  {
    key: 'day14',
    label: 'Day 14: meeting to review and confirm deployment of patching and Windows Update management',
    dateSource: 'fixed',
    fixedDate: WILMAR_DAY14_DATE,
  },
  {
    key: 'refine',
    label: 'Continued deployment, refinement and environment tweaks',
    dateSource: 'phase-start',
    phaseNumber: WILMAR_GO_LIVE_PHASE_NUMBER,
  },
  {
    key: 'complete',
    label: 'Onboarding complete',
    dateSource: 'project-end',
  },
];

/** Rail position (%) of each of the 6 milestone dots — evenly spaced. */
const MILESTONE_DOT_POSITIONS = [0, 20, 40, 60, 80, 100];

// ============================================================
// Rendered shapes
// ============================================================

export interface WilmarMilestoneView {
  key: string;
  label: string;
  /** null when the underlying Autotask date could not be resolved. */
  date: Date | null;
  /** "AUG 24" style, or "TBD" when `date` is null. */
  dateLabel: string;
  reached: boolean;
  positionPercent: number;
}

export interface WilmarPhaseCard {
  eyebrow: string;
  title: string;
  description: string;
  emphasize?: string;
  highlight: boolean;
  percent: number;
  completed: number;
  total: number;
}

export interface WilmarStatusData {
  generatedAt: Date;
  statusAsOfLabel: string;
  milestones: WilmarMilestoneView[];
  todayPositionPercent: number;
  overall: {
    percent: number;
    totalTasks: number;
    complete: number;
    inProgress: number;
    waiting: number;
    notStarted: number;
  };
  phaseCards: WilmarPhaseCard[];
}

export type WilmarStatusResult =
  | { ok: true; data: WilmarStatusData }
  | { ok: false; error: string };

// ============================================================
// Fetch + compute
// ============================================================

const OVERALL_TIMEOUT_MS = 25_000;

/** Truncate to a UTC calendar date (midnight) so day-level comparisons don't
 *  drift on server/vendor timezone differences. */
function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function formatShortDate(d: Date): string {
  return d
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    .toUpperCase();
}

function formatLongDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Resolve one definition to its live Autotask phase.
 *
 * `externalID` FIRST: Autotask never generates or mutates it, so nothing but a
 * deliberate write changes it, and it has now survived both the phase title
 * rewrites and the 2026-09-07 renumber. Title prefix is the fallback only —
 * matching a phase on a display string is what took this page down.
 */
function findPhase(
  phases: AutotaskProjectPhase[],
  def: Pick<WilmarPhaseDefinition, 'autotaskExternalId' | 'titlePrefix'>
): AutotaskProjectPhase | undefined {
  return (
    phases.find((p) => p.externalID != null && p.externalID === def.autotaskExternalId) ??
    phases.find((p) => (p.title ?? '').startsWith(def.titlePrefix))
  );
}

/** Look a definition up by its mirrored Autotask phase number. */
export function findWilmarPhaseDefinition(phaseNumber: number): WilmarPhaseDefinition | undefined {
  return WILMAR_PHASE_DEFINITIONS.find((d) => d.number === phaseNumber);
}

/**
 * Rail position (%) of the TODAY marker.
 *
 * Interpolates across whichever milestone segment `today` actually falls in.
 * The earlier version interpolated ONLY between "project opens" and "Day 1"
 * and then EXTRAPOLATED past Day 1, so the marker ran ~3.3%/day off the end of
 * that segment — on 2026-09-07 it landed at exactly 60%, the Day 14 dot, which
 * read to the customer as "today is Sep 14". Never extrapolate a position from
 * one segment onto a rail that has five.
 *
 * Pure and exported so the geometry is testable without an Autotask call.
 */
export function computeTodayPositionPercent(
  anchors: Array<{ positionPercent: number; date: Date | null }>,
  today: Date
): number {
  // A milestone whose date could not be resolved (rendered "TBD") anchors
  // nothing — skip it rather than treating a null as a position.
  const known = anchors.filter((a): a is { positionPercent: number; date: Date } => a.date != null);
  if (known.length === 0) return 0;

  const t = today.getTime();
  const first = known[0];
  const last = known[known.length - 1];
  if (t <= first.date.getTime()) return clampPercent(first.positionPercent);
  if (t >= last.date.getTime()) return clampPercent(last.positionPercent);

  for (let i = 0; i < known.length - 1; i++) {
    const from = known[i];
    const to = known[i + 1];
    const span = to.date.getTime() - from.date.getTime();
    if (span <= 0) continue; // out-of-order or same-day pair anchors nothing
    if (t >= from.date.getTime() && t <= to.date.getTime()) {
      const fraction = (t - from.date.getTime()) / span;
      return clampPercent(from.positionPercent + fraction * (to.positionPercent - from.positionPercent));
    }
  }

  // Dates out of chronological order (they come partly from Autotask, so this
  // is possible). Fall back to the last milestone today has passed rather than
  // inventing a position between two dates that don't bracket it.
  const passed = known.filter((a) => a.date.getTime() <= t);
  return clampPercent(passed.length > 0 ? passed[passed.length - 1].positionPercent : first.positionPercent);
}

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, n));
}

export async function getWilmarStatusData(): Promise<WilmarStatusResult> {
  try {
    const data = await withTimeout(() => fetchWilmarStatusData(), OVERALL_TIMEOUT_MS, 'Wilmar status data');
    return { ok: true, data };
  } catch (err) {
    // Never render a fabricated 0/0/0% as if it were real — the caller shows
    // an explicit "couldn't load" state instead.
    console.error('[wilmar-status] failed to load live Autotask data:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

async function fetchWilmarStatusData(): Promise<WilmarStatusData> {
  const client = new AutotaskClient();
  const today = dateOnly(new Date());

  const [project, phases, tasks, statusPicklist] = await Promise.all([
    client.getProject(WILMAR_AUTOTASK_PROJECT_ID),
    client.getProjectPhases(WILMAR_AUTOTASK_PROJECT_ID),
    client.getProjectTasks(WILMAR_AUTOTASK_PROJECT_ID),
    client.getEntityPicklist('Tasks', 'status'),
  ]);

  // ---- Resolve all 10 phases: externalID first, title prefix as fallback ----
  const phaseMatches = WILMAR_PHASE_DEFINITIONS.map((def) => ({
    def,
    phase: findPhase(phases, def),
  }));

  const missingPhases = phaseMatches.filter((m) => !m.phase);
  if (missingPhases.length > 0) {
    // A phase disappearing means the project structure changed in a way this
    // page doesn't understand — safer to show "couldn't load" than to render a
    // headline percentage with silently-missing phases baked in.
    throw new Error(
      `Autotask phase(s) not found by externalID or title prefix: ${missingPhases
        .map((m) => `${m.def.autotaskExternalId} / "${m.def.titlePrefix}"`)
        .join(', ')}`
    );
  }

  const matchedPhaseIds = new Set(phaseMatches.map((m) => m.phase!.id));
  const statusLabelById = new Map(statusPicklist.map((p) => [p.id, p.label.toLowerCase()]));

  // ---- Overall progress: tasks in the 10 mirrored phases ----
  const scopedTasks = tasks.filter((t) => t.phaseID != null && matchedPhaseIds.has(t.phaseID));

  let complete = 0;
  let inProgress = 0;
  let waiting = 0;
  let notStarted = 0;
  for (const task of scopedTasks) {
    if (task.completedDateTime) {
      complete++;
      continue;
    }
    const label = statusLabelById.get(task.status) ?? '';
    if (label.includes('progress')) inProgress++;
    else if (label.includes('waiting')) waiting++;
    else notStarted++;
  }
  const totalTasks = scopedTasks.length;
  const overallPercent = totalTasks > 0 ? Math.round((complete / totalTasks) * 100) : 0;

  // ---- Phase cards (1-10, phase-number order) ----
  const phaseCards: WilmarPhaseCard[] = phaseMatches.map(({ def, phase }) => {
    const phaseTasks = tasks.filter((t) => t.phaseID === phase!.id);
    const phaseComplete = phaseTasks.filter((t) => t.completedDateTime).length;
    const phaseTotal = phaseTasks.length;
    return {
      eyebrow: def.eyebrow,
      title: def.title,
      description: def.description,
      emphasize: def.emphasize,
      highlight: def.highlight ?? false,
      percent: phaseTotal > 0 ? Math.round((phaseComplete / phaseTotal) * 100) : 0,
      completed: phaseComplete,
      total: phaseTotal,
    };
  });

  // ---- Milestones ----
  const milestoneDates: Array<Date | null> = WILMAR_MILESTONES.map((m) => {
    switch (m.dateSource) {
      case 'fixed':
        return m.fixedDate ? dateOnly(new Date(`${m.fixedDate}T00:00:00Z`)) : null;
      case 'project-start':
        return project.startDateTime ? dateOnly(new Date(project.startDateTime)) : null;
      case 'project-end':
        return project.endDateTime ? dateOnly(new Date(project.endDateTime)) : null;
      case 'phase-start': {
        const def = m.phaseNumber != null ? findWilmarPhaseDefinition(m.phaseNumber) : undefined;
        const phase = def ? findPhase(phases, def) : undefined;
        return phase?.startDate ? dateOnly(new Date(phase.startDate)) : null;
      }
      default:
        return null;
    }
  });

  const reachedFlags = WILMAR_MILESTONES.map(
    (m, i) => m.alwaysReached === true || (milestoneDates[i] != null && milestoneDates[i]!.getTime() <= today.getTime())
  );

  const milestones: WilmarMilestoneView[] = WILMAR_MILESTONES.map((m, i) => ({
    key: m.key,
    label: m.label,
    date: milestoneDates[i],
    dateLabel: milestoneDates[i] ? formatShortDate(milestoneDates[i]!) : 'TBD',
    reached: reachedFlags[i],
    positionPercent: MILESTONE_DOT_POSITIONS[i],
  }));

  // ---- TODAY marker: interpolate across the segment today actually sits in ----
  const todayPositionPercent = computeTodayPositionPercent(
    milestones.map((m) => ({ positionPercent: m.positionPercent, date: m.date })),
    today
  );

  return {
    generatedAt: new Date(),
    statusAsOfLabel: formatLongDate(today),
    milestones,
    todayPositionPercent,
    overall: {
      percent: overallPercent,
      totalTasks,
      complete,
      inProgress,
      waiting,
      notStarted,
    },
    phaseCards,
  };
}
