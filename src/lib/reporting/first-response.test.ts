/**
 * Locks the first-response / first-touch definitions shared by every report
 * surface. Grounded in the Tri-Bros June 2026 review, whose regenerated PDF
 * still showed a fabricated "0m avg response" and "0% first-touch" — both
 * caused by treating intake records as responses and by the "≤1 note" FTR rule.
 */

import { describe, it, expect } from 'vitest';
import { resolveFirstResponse, countDistinctHumanParticipants } from './lifecycle';

const HUMANS = new Set([101, 102, 103]);
const API_USER = 999; // not in the human set (SaaS Alerts / integration account)
const T0 = new Date('2026-06-10T14:00:00Z');
const mins = (n: number) => new Date(T0.getTime() + n * 60_000);

describe('resolveFirstResponse', () => {
  it('marks a staff-opened ticket as answered at intake — never a 0-minute response', () => {
    const r = resolveFirstResponse(
      { createDate: T0, creatorResourceId: 101 },
      [{ createDateTime: T0, creatorResourceId: 101 }], // the intake note the tech logged
      [],
      HUMANS,
    );
    expect(r.answeredAtIntake).toBe(true);
    expect(r.firstResponseAt).toBeNull();
  });

  it('ignores an integration-authored intake note (portal/Thread ticket)', () => {
    // Ticket created by an API account with a summary note stamped at creation,
    // then a real tech responds 45 minutes later.
    const r = resolveFirstResponse(
      { createDate: T0, creatorResourceId: API_USER },
      [
        { createDateTime: T0, creatorResourceId: API_USER },
        { createDateTime: mins(45), creatorResourceId: 102 },
      ],
      [],
      HUMANS,
    );
    expect(r.answeredAtIntake).toBe(false);
    expect(r.firstResponseAt).toEqual(mins(45));
  });

  it('uses the earliest human note or time entry, whichever came first', () => {
    const r = resolveFirstResponse(
      { createDate: T0, creatorResourceId: API_USER },
      [{ createDateTime: mins(30), creatorResourceId: 103 }],
      [{ createDateTime: mins(20), resourceId: 102 }],
      HUMANS,
    );
    expect(r.firstResponseAt).toEqual(mins(20));
  });

  it('returns null (no response yet) when only API/system activity exists', () => {
    const r = resolveFirstResponse(
      { createDate: T0, creatorResourceId: API_USER },
      [{ createDateTime: mins(5), creatorResourceId: API_USER }],
      [{ createDateTime: mins(10), resourceId: API_USER }],
      HUMANS,
    );
    expect(r.answeredAtIntake).toBe(false);
    expect(r.firstResponseAt).toBeNull();
  });

  it('never counts activity stamped before ticket creation', () => {
    const r = resolveFirstResponse(
      { createDate: T0, creatorResourceId: API_USER },
      [{ createDateTime: mins(-15), creatorResourceId: 101 }],
      [],
      HUMANS,
    );
    expect(r.firstResponseAt).toBeNull();
  });
});

describe('countDistinctHumanParticipants (first-touch resolution basis)', () => {
  it('counts intake + resolution note by the SAME tech as one touch', () => {
    // The exact case the old "≤1 note" rule scored as a failure → fabricated 0% FTR.
    const n = countDistinctHumanParticipants(
      [
        { creatorResourceId: 101 },
        { creatorResourceId: 101 },
      ],
      [{ resourceId: 101 }],
      HUMANS,
    );
    expect(n).toBe(1);
  });

  it('counts two different techs as two touches', () => {
    const n = countDistinctHumanParticipants(
      [{ creatorResourceId: 101 }, { creatorResourceId: 102 }],
      [],
      HUMANS,
    );
    expect(n).toBe(2);
  });

  it('ignores API/system participants', () => {
    const n = countDistinctHumanParticipants(
      [{ creatorResourceId: API_USER }, { creatorResourceId: 101 }],
      [{ resourceId: API_USER }],
      HUMANS,
    );
    expect(n).toBe(1);
  });
});
