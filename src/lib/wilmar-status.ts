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

// ============================================================
// Fixed, customer-safe phase copy (never pulled from Autotask descriptions)
// ============================================================

export interface WilmarPhaseDefinition {
  /** "Phase 0" .. "Phase 8", or null for the unnumbered Open Items card. */
  number: number | null;
  /** Autotask phase `title` PREFIX to match against — ids drift on resync,
   *  title prefixes are stable (see CLAUDE.md gotchas re: phase resync). */
  titlePrefix: string;
  eyebrow: string;
  title: string;
  description: string;
  /** Exact substring of `description` to render bold + cyan, matching the
   *  design source's <strong> emphasis on Phases 5 and 6. */
  emphasize?: string;
  /** Cyan-tinted card border/fill treatment (Phases 5 and 6 in the source). */
  highlight?: boolean;
}

/** Phases 0–8, in display order. Order is NEVER derived from Autotask's
 *  `phaseNumber` field (an Autotask-generated ticket-style id, not "0".."8")
 *  — it comes from this fixed array. */
export const WILMAR_PHASE_DEFINITIONS: WilmarPhaseDefinition[] = [
  {
    number: 0,
    titlePrefix: 'Phase 0 -',
    eyebrow: 'Phase 0',
    title: 'Contract, Billing and Account Setup',
    description: 'Agreement filed, billing configured, portal and support channels opened.',
  },
  {
    number: 1,
    titlePrefix: 'Phase 1 -',
    eyebrow: 'Phase 1',
    title: 'EZ Red Transition',
    description: 'Consolidating EZ Red contracts and assets under the Wilmar account.',
  },
  {
    number: 2,
    titlePrefix: 'Phase 2 -',
    eyebrow: 'Phase 2',
    title: 'Co-Managed Access for Wilmar IT',
    description:
      'Granting your team direct access to the ticketing, RMM and documentation consoles, and agreeing the support split in writing.',
  },
  {
    number: 3,
    titlePrefix: 'Phase 3 -',
    eyebrow: 'Phase 3',
    title: 'Kickoff, Discovery and Inventory',
    description: 'Kickoff session, site confirmation, and full inventory of devices and systems.',
  },
  {
    number: 4,
    titlePrefix: 'Phase 4 -',
    eyebrow: 'Phase 4',
    title: 'Security Monitoring, Day 0',
    description:
      'Email protection, dark web monitoring, tenant audit logging and SaaS alerting switched on immediately.',
  },
  {
    number: 5,
    titlePrefix: 'Phase 5 -',
    eyebrow: 'Phase 5',
    title: 'Tool Deployment, Day 0 to 14, listen-only',
    description:
      'Monitoring agents deployed in observe-only mode. Nothing changes on your machines during this window.',
    emphasize: 'Nothing changes on your machines during this window.',
    highlight: true,
  },
  {
    number: 6,
    titlePrefix: 'Phase 6 -',
    eyebrow: 'Phase 6',
    title: 'Day 14 Activation',
    description: 'Patching and Windows Update management turned on after the observation period.',
    emphasize: 'Patching and Windows Update management turned on after the observation period.',
    highlight: true,
  },
  {
    number: 7,
    titlePrefix: 'Phase 7 -',
    eyebrow: 'Phase 7',
    title: 'Documentation and Site Analysis',
    description: 'Documenting every site, network and system into a maintained knowledge base.',
  },
  {
    number: 8,
    titlePrefix: 'Phase 8 -',
    eyebrow: 'Phase 8',
    title: 'Review and Go-Live',
    description: 'Joint review of the completed onboarding and transition to steady-state service.',
  },
];

/**
 * The 10th, unnumbered card. Autotask's real phase (title "Open Decisions -
 * Need Answers") has an internal-only description naming an owner — this
 * copy is written fresh for a customer audience, not pulled from Autotask.
 * Matched by full title since it carries no "Phase N -" prefix.
 */
export const WILMAR_OPEN_ITEMS_PHASE: WilmarPhaseDefinition = {
  number: null,
  titlePrefix: 'Open Decisions - Need Answers',
  eyebrow: 'Open items',
  title: 'Open Items',
  description: 'A few decisions we need from your team before some of the work above can start.',
};

// ============================================================
// Milestones — dates are live except the fixed agreement date
// ============================================================

type MilestoneDateSource = 'fixed' | 'project-start' | 'project-end' | 'phase-start';

export interface WilmarMilestoneDefinition {
  key: string;
  label: string;
  dateSource: MilestoneDateSource;
  fixedDate?: string;
  /** For `phase-start`: the Autotask phase title prefix whose `startDate` supplies the date. */
  phaseTitlePrefix?: string;
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
    key: 'day0',
    label: 'Day 0: contract and billing start, security monitoring live, tools deploy in listen-only mode',
    dateSource: 'phase-start',
    phaseTitlePrefix: 'Phase 4 -',
  },
  {
    key: 'day14',
    label: 'Day 14: patching and Windows Update management activated',
    dateSource: 'phase-start',
    phaseTitlePrefix: 'Phase 6 -',
  },
  {
    key: 'refine',
    label: 'Continued deployment, refinement and environment tweaks',
    dateSource: 'phase-start',
    phaseTitlePrefix: 'Phase 8 -',
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

function findPhase(phases: AutotaskProjectPhase[], titlePrefix: string): AutotaskProjectPhase | undefined {
  return phases.find((p) => (p.title ?? '').startsWith(titlePrefix));
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

  // ---- Resolve the 9 numbered phases (0-8) by title prefix ----
  const numberedPhaseMatches = WILMAR_PHASE_DEFINITIONS.map((def) => ({
    def,
    phase: findPhase(phases, def.titlePrefix),
  }));

  const missingNumberedPhases = numberedPhaseMatches.filter((m) => !m.phase);
  if (missingNumberedPhases.length > 0) {
    // A numbered phase disappearing means the project structure changed in a
    // way this page doesn't understand — safer to show "couldn't load" than
    // to render a headline percentage with silently-missing phases baked in.
    throw new Error(
      `Autotask phase(s) not found by title prefix: ${missingNumberedPhases.map((m) => m.def.titlePrefix).join(', ')}`
    );
  }

  const numberedPhaseIds = new Set(numberedPhaseMatches.map((m) => m.phase!.id));
  const statusLabelById = new Map(statusPicklist.map((p) => [p.id, p.label.toLowerCase()]));

  // ---- Overall progress: Phase 0-8 tasks only ----
  const numberedTasks = tasks.filter((t) => t.phaseID != null && numberedPhaseIds.has(t.phaseID));

  let complete = 0;
  let inProgress = 0;
  let waiting = 0;
  let notStarted = 0;
  for (const task of numberedTasks) {
    if (task.completedDateTime) {
      complete++;
      continue;
    }
    const label = statusLabelById.get(task.status) ?? '';
    if (label.includes('progress')) inProgress++;
    else if (label.includes('waiting')) waiting++;
    else notStarted++;
  }
  const totalTasks = numberedTasks.length;
  const overallPercent = totalTasks > 0 ? Math.round((complete / totalTasks) * 100) : 0;

  // ---- Phase cards (0-8, phase-number order) ----
  const phaseCards: WilmarPhaseCard[] = numberedPhaseMatches.map(({ def, phase }) => {
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

  // Open Items — 10th, unnumbered card. Optional: omit if Autotask doesn't
  // have this phase rather than failing the whole page.
  const openItemsPhase = findPhase(phases, WILMAR_OPEN_ITEMS_PHASE.titlePrefix);
  if (openItemsPhase) {
    const openItemsTasks = tasks.filter((t) => t.phaseID === openItemsPhase.id);
    const openItemsComplete = openItemsTasks.filter((t) => t.completedDateTime).length;
    const openItemsTotal = openItemsTasks.length;
    phaseCards.push({
      eyebrow: WILMAR_OPEN_ITEMS_PHASE.eyebrow,
      title: WILMAR_OPEN_ITEMS_PHASE.title,
      description: WILMAR_OPEN_ITEMS_PHASE.description,
      highlight: false,
      percent: openItemsTotal > 0 ? Math.round((openItemsComplete / openItemsTotal) * 100) : 0,
      completed: openItemsComplete,
      total: openItemsTotal,
    });
  } else {
    console.warn('[wilmar-status] "Open Decisions - Need Answers" phase not found; omitting the 10th card.');
  }

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
        const phase = m.phaseTitlePrefix ? findPhase(phases, m.phaseTitlePrefix) : undefined;
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

  // ---- TODAY marker position: interpolate between the "project opens"
  // (index 1) and "Day 0" (index 2) milestones, clamped to the full rail. ----
  const d1 = milestoneDates[1];
  const d2 = milestoneDates[2];
  let todayPositionPercent = MILESTONE_DOT_POSITIONS[1];
  if (d1 && d2 && d2.getTime() !== d1.getTime()) {
    const fraction = (today.getTime() - d1.getTime()) / (d2.getTime() - d1.getTime());
    todayPositionPercent = MILESTONE_DOT_POSITIONS[1] + fraction * (MILESTONE_DOT_POSITIONS[2] - MILESTONE_DOT_POSITIONS[1]);
  }
  todayPositionPercent = Math.max(0, Math.min(100, todayPositionPercent));

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
