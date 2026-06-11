import { describe, it, expect } from 'vitest';
import {
  filterSocTickets,
  sortSocTickets,
  type FilterableSocTicket,
} from './ticket-filter';

function mk(over: Partial<FilterableSocTicket> = {}): FilterableSocTicket {
  return {
    ticketNumber: 'T20260601.0001',
    title: 'Datto EDR SYSTEM/Endpoint Device - Monitoring event',
    companyName: 'Tri County Refrigeration',
    assignedTo: 'Unassigned',
    isResolved: false,
    socVerdict: null,
    createDate: '2026-06-01T12:00:00.000Z',
    ...over,
  };
}

describe('filterSocTickets', () => {
  const tickets = [
    mk({ ticketNumber: 'T1', title: 'Stale Account Clean Up', companyName: 'Tri-Bros Transportation', socVerdict: 'false_positive', isResolved: false }),
    mk({ ticketNumber: 'T2', title: 'Datto EDR Monitoring event', companyName: 'EZ Red', socVerdict: 'suspicious', isResolved: false }),
    mk({ ticketNumber: 'T3', title: 'Ransomware detected on host', companyName: 'Darling Tax Services', socVerdict: 'confirmed_threat', isResolved: true }),
    mk({ ticketNumber: 'T4', title: 'Update CFS - May', companyName: 'Darling Tax Services', socVerdict: null, isResolved: true }),
    mk({ ticketNumber: 'T5', title: 'Noise Reduction Project', companyName: 'Triple Cities Tech', socVerdict: 'expected_activity', isResolved: false, assignedTo: 'Benjamin Miguel' }),
  ];

  const all = { query: '', verdict: 'all', status: 'all' } as const;

  it('returns everything with no filters', () => {
    expect(filterSocTickets(tickets, { ...all })).toHaveLength(5);
  });

  it('filters by open status', () => {
    const out = filterSocTickets(tickets, { ...all, status: 'open' });
    expect(out.map(t => t.ticketNumber)).toEqual(['T1', 'T2', 'T5']);
  });

  it('filters by resolved status', () => {
    const out = filterSocTickets(tickets, { ...all, status: 'resolved' });
    expect(out.map(t => t.ticketNumber)).toEqual(['T3', 'T4']);
  });

  it('filters by exact verdict', () => {
    const out = filterSocTickets(tickets, { ...all, verdict: 'confirmed_threat' });
    expect(out.map(t => t.ticketNumber)).toEqual(['T3']);
  });

  it('filters to not-analyzed tickets', () => {
    const out = filterSocTickets(tickets, { ...all, verdict: 'not_analyzed' });
    expect(out.map(t => t.ticketNumber)).toEqual(['T4']);
  });

  it('matches title case-insensitively', () => {
    const out = filterSocTickets(tickets, { ...all, query: 'STALE account' });
    expect(out.map(t => t.ticketNumber)).toEqual(['T1']);
  });

  it('matches ticket number', () => {
    const out = filterSocTickets(tickets, { ...all, query: 't3' });
    expect(out.map(t => t.ticketNumber)).toEqual(['T3']);
  });

  it('matches company name', () => {
    const out = filterSocTickets(tickets, { ...all, query: 'darling' });
    expect(out.map(t => t.ticketNumber)).toEqual(['T3', 'T4']);
  });

  it('matches assignee', () => {
    const out = filterSocTickets(tickets, { ...all, query: 'benjamin' });
    expect(out.map(t => t.ticketNumber)).toEqual(['T5']);
  });

  it('matches verdict text with underscores normalized', () => {
    const out = filterSocTickets(tickets, { ...all, query: 'false positive' });
    expect(out.map(t => t.ticketNumber)).toEqual(['T1']);
  });

  it('requires all terms to match (AND semantics)', () => {
    const out = filterSocTickets(tickets, { ...all, query: 'darling ransomware' });
    expect(out.map(t => t.ticketNumber)).toEqual(['T3']);
  });

  it('combines query, verdict, and status filters', () => {
    const out = filterSocTickets(tickets, { query: 'darling', verdict: 'confirmed_threat', status: 'resolved' });
    expect(out.map(t => t.ticketNumber)).toEqual(['T3']);
  });

  it('returns empty when nothing matches', () => {
    expect(filterSocTickets(tickets, { ...all, query: 'zzz-no-match' })).toEqual([]);
  });
});

describe('sortSocTickets', () => {
  it('puts open alerts first, newest first within each group', () => {
    const tickets = [
      mk({ ticketNumber: 'R-old', isResolved: true, createDate: '2026-01-01T00:00:00Z' }),
      mk({ ticketNumber: 'O-old', isResolved: false, createDate: '2026-02-01T00:00:00Z' }),
      mk({ ticketNumber: 'R-new', isResolved: true, createDate: '2026-06-01T00:00:00Z' }),
      mk({ ticketNumber: 'O-new', isResolved: false, createDate: '2026-06-05T00:00:00Z' }),
    ];
    expect(sortSocTickets(tickets).map(t => t.ticketNumber)).toEqual(['O-new', 'O-old', 'R-new', 'R-old']);
  });

  it('does not mutate the input array', () => {
    const tickets = [
      mk({ ticketNumber: 'A', isResolved: true }),
      mk({ ticketNumber: 'B', isResolved: false }),
    ];
    const copy = [...tickets];
    sortSocTickets(tickets);
    expect(tickets).toEqual(copy);
  });
});
