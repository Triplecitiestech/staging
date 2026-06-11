/**
 * SOC dashboard alert filtering — pure helpers shared by SocDashboardClient
 * and unit tests. Filtering is client-side over the fetched history range;
 * the range itself (`days`) is a server query param on /api/soc/tickets.
 */

export const SOC_VERDICTS = [
  'false_positive',
  'expected_activity',
  'informational',
  'suspicious',
  'escalate',
  'confirmed_threat',
] as const;

export type SocVerdictValue = (typeof SOC_VERDICTS)[number];
export type VerdictFilter = 'all' | 'not_analyzed' | SocVerdictValue;
export type StatusFilter = 'all' | 'open' | 'resolved';

export const VERDICT_LABELS: Record<SocVerdictValue, string> = {
  false_positive: 'False positive',
  expected_activity: 'Expected activity',
  informational: 'Informational',
  suspicious: 'Suspicious',
  escalate: 'Escalate',
  confirmed_threat: 'Confirmed threat',
};

export interface FilterableSocTicket {
  ticketNumber: string;
  title: string;
  companyName: string | null;
  assignedTo: string;
  isResolved: boolean;
  socVerdict: string | null;
  createDate: string;
}

export interface SocTicketFilterOptions {
  query: string;
  verdict: VerdictFilter;
  status: StatusFilter;
}

/**
 * Search + verdict + status filter for SOC alert rows.
 * The text query is split on whitespace and every term must match
 * (case-insensitive) across ticket number, title, company, assignee,
 * or verdict label — so "stale tri-bros" and "false positive" both work.
 */
export function filterSocTickets<T extends FilterableSocTicket>(
  tickets: T[],
  opts: SocTicketFilterOptions,
): T[] {
  const terms = opts.query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return tickets.filter(t => {
    if (opts.status === 'open' && t.isResolved) return false;
    if (opts.status === 'resolved' && !t.isResolved) return false;

    if (opts.verdict === 'not_analyzed') {
      if (t.socVerdict) return false;
    } else if (opts.verdict !== 'all' && t.socVerdict !== opts.verdict) {
      return false;
    }

    if (terms.length === 0) return true;
    const verdictText = t.socVerdict ? t.socVerdict.replace(/_/g, ' ') : 'not analyzed';
    const haystack = `${t.ticketNumber} ${t.title} ${t.companyName || ''} ${t.assignedTo} ${verdictText}`.toLowerCase();
    return terms.every(term => haystack.includes(term));
  });
}

/** Open alerts first (newest first), then resolved history (newest first). */
export function sortSocTickets<T extends FilterableSocTicket>(tickets: T[]): T[] {
  return [...tickets].sort((a, b) => {
    if (a.isResolved !== b.isResolved) return a.isResolved ? 1 : -1;
    return new Date(b.createDate).getTime() - new Date(a.createDate).getTime();
  });
}
