/**
 * autotask_search_tickets execution, including the optional count_only /
 * group_by / fields shapes. With none of those set, the result is exactly the
 * pre-existing envelope: { count, truncated, activityGapAdvisory, tickets[] }.
 *
 * Kept separate from build-mcp-handler.ts so it can be unit-tested with a fake
 * client (no Autotask or network access needed).
 */
import type { TicketSearchFilters, TicketSearchResult } from '@/lib/autotask'
import {
  aggregateTickets,
  distinctIds,
  GROUP_BY_FIELD,
  projectTicketFields,
  type TicketGroupBy,
} from './ticket-search-shape'

/** The slice of AutotaskClient this tool needs (lets tests inject a fake). */
export interface TicketSearchClient {
  searchTickets(filters: TicketSearchFilters): Promise<TicketSearchResult>
  picklistLabelMap(entity: string, fieldName: string): Promise<Map<number, string>>
  lookupNames(kind: 'company' | 'resource', ids: number[]): Promise<Map<number, string>>
}

export interface SearchTicketsShapeOptions {
  count_only?: boolean
  group_by?: TicketGroupBy
  fields?: string[]
}

/** Columns a count/group read actually needs from Autotask (lean fetch). */
const AGGREGATE_FETCH_FIELDS = ['id', 'ticketNumber', 'companyID', 'status', 'priority', 'queueID', 'assignedResourceID']

/** Picklist field on Tickets for the picklist-backed group_by dimensions. */
const PICKLIST_FIELD: Partial<Record<TicketGroupBy, string>> = {
  status: 'status',
  priority: 'priority',
  queue: 'queueID',
}

export const TRUNCATED_AGGREGATE_MESSAGE =
  'The filtered result set exceeded max (or hit the date-split floor), so it was NOT aggregated — a partial count would be wrong. Narrow the filters/window, or raise max (hard cap 5000).'

async function resolveGroupNames(
  client: TicketSearchClient,
  groupBy: TicketGroupBy,
  ids: number[],
): Promise<Map<number, string>> {
  if (groupBy === 'company') return client.lookupNames('company', ids)
  if (groupBy === 'assignedResource') return client.lookupNames('resource', ids)
  const field = PICKLIST_FIELD[groupBy]
  return field ? client.picklistLabelMap('Tickets', field) : new Map()
}

/**
 * Run the search and shape the output.
 * - count_only → { count, truncated }  (takes precedence over group_by/fields)
 * - group_by   → { groupBy, total, truncated, groupCount, groups[{id,name,count}] }
 *                sorted by count desc. If the fetch truncated, groups is empty and
 *                a message says why — a truncated page is never aggregated.
 * - fields     → default envelope, but each row keeps only the requested fields
 *                plus id, ticketNumber, ticketUrl, and gains companyName.
 * `decorate` applies the handler's existing per-row decoration (activityGap) and
 * advisory so the default path is byte-for-byte the same as before.
 */
export async function runSearchTickets(
  client: TicketSearchClient,
  filters: TicketSearchFilters,
  shape: SearchTicketsShapeOptions,
  decorate: {
    row: <T extends { id?: number; lastActivityDate?: string | null }>(t: T) => T
    advisory: (count: number) => string
  },
): Promise<unknown> {
  const aggregate = shape.count_only === true || shape.group_by != null
  const res = await client.searchTickets(aggregate ? { ...filters, includeFields: AGGREGATE_FETCH_FIELDS } : filters)

  if (shape.count_only === true) {
    return { count: res.count, truncated: res.truncated }
  }

  if (shape.group_by != null) {
    const groupBy = shape.group_by
    if (res.truncated) {
      return { groupBy, total: res.count, truncated: true, groupCount: 0, groups: [], message: TRUNCATED_AGGREGATE_MESSAGE }
    }
    const rows = res.tickets as unknown as Array<Record<string, unknown>>
    let names = new Map<number, string>()
    let nameLookupError: string | undefined
    try {
      names = await resolveGroupNames(client, groupBy, distinctIds(rows, GROUP_BY_FIELD[groupBy]))
    } catch (e) {
      nameLookupError = e instanceof Error ? e.message : String(e)
    }
    const grouped = aggregateTickets(rows, groupBy, names, false)
    return nameLookupError ? { ...grouped, nameLookupError } : grouped
  }

  if (shape.fields && shape.fields.length > 0) {
    const decorated = res.tickets.map((t) => decorate.row(t)) as unknown as Array<Record<string, unknown>>
    let companyNames = new Map<number, string>()
    let nameLookupError: string | undefined
    try {
      companyNames = await client.lookupNames('company', distinctIds(decorated, 'companyID'))
    } catch (e) {
      nameLookupError = e instanceof Error ? e.message : String(e)
    }
    const tickets = decorated.map((t) => {
      const cid = typeof t.companyID === 'number' ? t.companyID : null
      return {
        ...projectTicketFields(t, shape.fields as string[]),
        companyName: cid != null ? (companyNames.get(cid) ?? null) : null,
      }
    })
    const out: Record<string, unknown> = {
      count: res.count,
      truncated: res.truncated,
      activityGapAdvisory: decorate.advisory(res.tickets.length),
      tickets,
    }
    if (nameLookupError) out.nameLookupError = nameLookupError
    return out
  }

  // Default path — unchanged envelope.
  return { ...res, activityGapAdvisory: decorate.advisory(res.tickets.length), tickets: res.tickets.map(decorate.row) }
}
