/**
 * Output shaping for autotask_search_tickets — count_only / group_by / fields.
 *
 * Pure functions (no I/O) so aggregation and projection are unit-testable.
 * The caller is responsible for fetching the FULL filtered result set first
 * (AutotaskClient.searchTickets paginates internally) and for resolving id ->
 * name maps; nothing here fetches or truncates.
 */

export const TICKET_GROUP_BY = ['company', 'status', 'priority', 'queue', 'assignedResource'] as const
export type TicketGroupBy = (typeof TICKET_GROUP_BY)[number]

/** Ticket field each group_by dimension aggregates on. */
export const GROUP_BY_FIELD: Record<TicketGroupBy, string> = {
  company: 'companyID',
  status: 'status',
  priority: 'priority',
  queue: 'queueID',
  assignedResource: 'assignedResourceID',
}

/** Fields always present in a `fields` projection so every row stays linkable. */
export const ALWAYS_INCLUDED_FIELDS = ['id', 'ticketNumber', 'ticketUrl'] as const

export interface TicketGroup {
  id: number | null
  name: string
  count: number
}

export interface GroupedTicketResult {
  groupBy: TicketGroupBy
  total: number
  truncated: boolean
  groupCount: number
  groups: TicketGroup[]
}

/** Label used when a ticket has no value for the grouped field. */
export function emptyGroupLabel(groupBy: TicketGroupBy): string {
  return groupBy === 'assignedResource' ? '(unassigned)' : '(none)'
}

/**
 * Count tickets per value of the grouped field, resolve names, sort by count
 * descending (ties broken by name, then id, for deterministic output).
 * Unresolvable ids keep a visible "(unknown id N)" name rather than being dropped.
 */
export function aggregateTickets(
  tickets: ReadonlyArray<Record<string, unknown>>,
  groupBy: TicketGroupBy,
  names: ReadonlyMap<number, string>,
  truncated: boolean,
): GroupedTicketResult {
  const field = GROUP_BY_FIELD[groupBy]
  const counts = new Map<number | null, number>()
  for (const t of tickets) {
    const raw = t[field]
    const key = typeof raw === 'number' && Number.isFinite(raw) ? raw : null
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const groups: TicketGroup[] = Array.from(counts.entries()).map(([id, count]) => ({
    id,
    name: id == null ? emptyGroupLabel(groupBy) : (names.get(id) ?? `(unknown id ${id})`),
    count,
  }))
  groups.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name) || (a.id ?? -1) - (b.id ?? -1))
  return { groupBy, total: tickets.length, truncated, groupCount: groups.length, groups }
}

/**
 * Keep only the requested fields (plus id, ticketNumber, ticketUrl). Unknown
 * field names are ignored rather than erroring, so a typo never fails a read.
 */
export function projectTicketFields<T extends Record<string, unknown>>(
  ticket: T,
  fields: ReadonlyArray<string>,
): Record<string, unknown> {
  const keep = new Set<string>([...ALWAYS_INCLUDED_FIELDS, ...fields])
  const out: Record<string, unknown> = {}
  for (const k of keep) {
    if (k in ticket) out[k] = ticket[k]
  }
  return out
}

/** Distinct numeric ids present in `field` across tickets (for name lookups). */
export function distinctIds(tickets: ReadonlyArray<Record<string, unknown>>, field: string): number[] {
  const s = new Set<number>()
  for (const t of tickets) {
    const v = t[field]
    if (typeof v === 'number' && Number.isFinite(v)) s.add(v)
  }
  return Array.from(s)
}
