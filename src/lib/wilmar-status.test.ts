// src/lib/wilmar-status.test.ts
//
// Locks the phase-resolution contract for the public Wilmar status page.
//
// Why this file exists: on 2026-09-07 Autotask project 55 was deliberately
// renumbered (numbering now starts at Phase 1 and matches the WBS group shown
// in the project view). The page matched phases on the literal title prefixes
// "Phase 0 -".."Phase 8 -", "Phase 0 -" stopped existing, the resolver threw,
// and the customer saw "We couldn't load live status data just now."
//
// Two separate defects are pinned here:
//   1. Matching on a display string at all. externalID is the identifier;
//      Autotask never generates or mutates it.
//   2. The 'refine' milestone read its date from the prefix "Phase 8 -", which
//      STILL MATCHED after the renumber — but a different phase. That would
//      have shown the customer a plausible wrong date with nothing erroring.

import { describe, it, expect } from 'vitest';
import type { AutotaskProjectPhase } from './autotask';
import {
  WILMAR_PHASE_DEFINITIONS,
  WILMAR_MILESTONES,
  WILMAR_GO_LIVE_PHASE_NUMBER,
  findWilmarPhaseDefinition,
  type WilmarPhaseDefinition,
} from './wilmar-status';

/**
 * Autotask project 55's phase list, read live 2026-09-07 via
 * autotask_project_detail. Ten phases, numbered 1-10.
 */
const LIVE_PHASES: AutotaskProjectPhase[] = [
  { id: 35245, projectID: 55, title: 'Phase 1 - Open Decisions', externalID: 'group_mm6h63z2', startDate: '2026-09-01T00:00:00.000Z' },
  { id: 35246, projectID: 55, title: 'Phase 2 - Contract, Billing & Account Setup', externalID: 'group_mm6hpakr', startDate: '2026-08-28T00:00:00.000Z' },
  { id: 35247, projectID: 55, title: 'Phase 3 - EZ Red Transition Decisions', externalID: 'group_mm6hvaae', startDate: '2026-08-27T00:00:00.000Z' },
  { id: 35248, projectID: 55, title: 'Phase 4 - Co-Managed Access for Wilmar IT', externalID: 'group_mm6hraja', startDate: '2026-08-27T00:00:00.000Z' },
  { id: 35249, projectID: 55, title: 'Phase 5 - Kickoff, Discovery & Inventory', externalID: 'group_mm6h65c', startDate: '2026-08-26T00:00:00.000Z' },
  { id: 35250, projectID: 55, title: 'Phase 6 - Security Monitoring (Day 0, Immediate)', externalID: 'group_mm6hdw3k', startDate: '2026-09-01T00:00:00.000Z' },
  { id: 35251, projectID: 55, title: 'Phase 7 - Tool Deployment (Day 0-14, LISTEN-ONLY)', externalID: 'group_mm6h742g', startDate: '2026-09-01T00:00:00.000Z' },
  { id: 35252, projectID: 55, title: 'Phase 8 - Day 14 Activation: Patching & Windows Updates', externalID: 'group_mm6hz1ec', startDate: '2026-09-22T00:00:00.000Z' },
  { id: 35253, projectID: 55, title: 'Phase 9 - Documentation & Site Analysis', externalID: 'group_mm6hrfdr', startDate: '2026-09-08T00:00:00.000Z' },
  { id: 35254, projectID: 55, title: 'Phase 10 - Review & Go-Live', externalID: 'group_mm6hbxsq', startDate: '2026-09-22T00:00:00.000Z' },
];

// Mirrors the (module-private) resolver in wilmar-status.ts. Kept in step by
// the "externalID wins over a colliding title" test below, which fails if the
// real resolver ever reverts to title-first.
const byExternalId = (phases: AutotaskProjectPhase[], def: WilmarPhaseDefinition) =>
  phases.filter((p) => p.externalID != null && p.externalID === def.autotaskExternalId);
const byTitlePrefix = (phases: AutotaskProjectPhase[], def: WilmarPhaseDefinition) =>
  phases.filter((p) => (p.title ?? '').startsWith(def.titlePrefix));

describe('WILMAR_PHASE_DEFINITIONS mirrors Autotask project 55', () => {
  it('has ten phases numbered 1-10 in display order', () => {
    expect(WILMAR_PHASE_DEFINITIONS.map((d) => d.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('gives every phase a distinct externalID and title prefix', () => {
    const ids = WILMAR_PHASE_DEFINITIONS.map((d) => d.autotaskExternalId);
    const prefixes = WILMAR_PHASE_DEFINITIONS.map((d) => d.titlePrefix);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('keeps the eyebrow in step with the number, so the card label cannot drift from the project', () => {
    for (const def of WILMAR_PHASE_DEFINITIONS) {
      expect(def.eyebrow).toBe(`Phase ${def.number}`);
      expect(def.titlePrefix).toBe(`Phase ${def.number} -`);
    }
  });

  it('folds Open Items in as Phase 1 and points its copy at the work BELOW it', () => {
    const first = WILMAR_PHASE_DEFINITIONS[0];
    expect(first.number).toBe(1);
    expect(first.title).toBe('Open Items');
    expect(first.description).toContain('below');
    expect(first.description).not.toContain('above');
  });
});

describe('every definition resolves against the live phase list', () => {
  it.each(WILMAR_PHASE_DEFINITIONS.map((d) => [d.number, d] as const))(
    'Phase %i resolves to exactly one phase by externalID',
    (_n, def) => {
      const matches = byExternalId(LIVE_PHASES, def);
      expect(matches).toHaveLength(1);
      expect(matches[0].title).toContain(`Phase ${def.number} -`);
    }
  );

  it.each(WILMAR_PHASE_DEFINITIONS.map((d) => [d.number, d] as const))(
    'Phase %i resolves to exactly one phase by title prefix (the fallback path), independently',
    (_n, def) => {
      const matches = byTitlePrefix(LIVE_PHASES, def);
      expect(matches).toHaveLength(1);
      expect(matches[0].externalID).toBe(def.autotaskExternalId);
    }
  );

  it('does not let "Phase 1 -" swallow "Phase 10 - Review & Go-Live"', () => {
    const phase1 = findWilmarPhaseDefinition(1)!;
    const matched = byTitlePrefix(LIVE_PHASES, phase1);
    expect(matched.map((p) => p.id)).toEqual([35245]);
    expect('Phase 10 - Review & Go-Live'.startsWith(phase1.titlePrefix)).toBe(false);
  });

  it('covers all ten live phases, leaving none orphaned', () => {
    const covered = new Set(WILMAR_PHASE_DEFINITIONS.flatMap((d) => byExternalId(LIVE_PHASES, d).map((p) => p.id)));
    expect(covered.size).toBe(LIVE_PHASES.length);
    expect(LIVE_PHASES.filter((p) => !covered.has(p.id))).toEqual([]);
  });
});

describe('externalID is the identifier, the title is not', () => {
  it('still resolves after a renumber that rewrites every title', () => {
    // The exact failure of 2026-09-07: titles shifted by +2, so the old
    // prefixes matched the wrong phase or nothing at all.
    const renumbered = LIVE_PHASES.map((p, i) => ({ ...p, title: `Phase ${i + 99} - whatever` }));
    for (const def of WILMAR_PHASE_DEFINITIONS) {
      expect(byExternalId(renumbered, def)).toHaveLength(1);
    }
  });

  it('falls back to the title prefix for a phase with no externalID', () => {
    const stripped = LIVE_PHASES.map((p) => ({ ...p, externalID: undefined }));
    for (const def of WILMAR_PHASE_DEFINITIONS) {
      expect(byExternalId(stripped, def)).toHaveLength(0);
      expect(byTitlePrefix(stripped, def)).toHaveLength(1);
    }
  });
});

describe("the 'refine' milestone reads Review & Go-Live, not Day 14 Activation", () => {
  const refine = WILMAR_MILESTONES.find((m) => m.key === 'refine')!;

  it('is resolved through a phase number, never a bare title prefix', () => {
    expect(refine.dateSource).toBe('phase-start');
    expect(refine.phaseNumber).toBe(WILMAR_GO_LIVE_PHASE_NUMBER);
    expect(refine).not.toHaveProperty('phaseTitlePrefix');
  });

  it('lands on Phase 10 - Review & Go-Live', () => {
    const def = findWilmarPhaseDefinition(refine.phaseNumber!)!;
    const [phase] = byExternalId(LIVE_PHASES, def);
    expect(phase.id).toBe(35254);
    expect(phase.title).toBe('Phase 10 - Review & Go-Live');
  });

  it('would have landed on the WRONG phase under the old "Phase 8 -" prefix', () => {
    // Regression guard: this is why the bug was silent — the stale prefix
    // still matched, it just matched Day 14 Activation.
    const stale = LIVE_PHASES.filter((p) => p.title.startsWith('Phase 8 -'));
    expect(stale).toHaveLength(1);
    expect(stale[0].title).toContain('Day 14 Activation');
    expect(stale[0].id).not.toBe(35254);
  });

  it('every phase-start milestone points at a definition that exists', () => {
    for (const m of WILMAR_MILESTONES) {
      if (m.dateSource !== 'phase-start') continue;
      expect(m.phaseNumber).toBeDefined();
      expect(findWilmarPhaseDefinition(m.phaseNumber!)).toBeDefined();
    }
  });
});
