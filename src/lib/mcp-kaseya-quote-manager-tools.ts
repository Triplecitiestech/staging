// src/lib/mcp-kaseya-quote-manager-tools.ts
//
// Read-only Kaseya Quote Manager (Datto Commerce) tools for the MCP connector.
// Reuses the single KaseyaQuoteManagerClient (src/lib/kaseya-quote-manager.ts);
// no parallel client.
//
// READ-ONLY BY CONSTRUCTION, twice over: the client exposes only `get()`, and
// the vendor API has no write surface at all — all 39 operations in the captured
// spec are GET. There is deliberately no write/stage/execute verb here, so the
// staged-approval gate that Autotask and UniFi writes go through does not apply.
//
// COVERAGE IS TABLE-DRIVEN, NOT HAND-WRITTEN. KQM_RESOURCES below is the single
// source of truth for the tool surface, and it is asserted against the captured
// openapi.json by mcp-kaseya-quote-manager-tools.test.ts: every one of the 39
// spec operations must be reachable and every documented query parameter must be
// exposed. That makes the coverage contract in
// docs/vendor-api/kaseya-quote-manager/COVERAGE.md a test rather than a promise —
// 20 hand-copied tool blocks would have drifted from the spec on the first
// vendor change.
//
// PAGING IS 1-INDEXED (spec default 1). Datto RMM's 0-indexed paging silently
// skipped the first page of every sweep for months; do not port a page-0 loop
// into here. There is also NO total count in any response — list endpoints return
// bare arrays — so a capped sweep reports `truncated: true` rather than implying
// completeness.
//
// AUTH IS UNRESOLVED UPSTREAM: the spec says a header named `apiKey`, Kaseya's
// help page says a query parameter. The header is the default (machine-readable
// spec beats an HTML page) and `kqm_probe_connection` settles it live. See the
// client's header comment.

import { z } from 'zod'
import { kqmClient, MAX_PAGE_SIZE, type KqmQuery } from '@/lib/kaseya-quote-manager'
import { toolFailure, FAILURE_ENVELOPE_TOOL_NOTE } from '@/lib/connector/failure-envelope'

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data ?? null, null, 2) }] }
}
function fail(err: unknown) {
  return toolFailure(err, { surface: 'kaseya_quote_manager' })
}

/** A server-side filter the spec defines for a resource's list endpoint. */
interface KqmFilter {
  name: string
  /** Zod type to expose. The spec types every filter as string or int32. */
  type: 'string' | 'number'
  description: string
}

export interface KqmResource {
  /** MCP tool name. */
  tool: string
  /** Spec path segment, without the /v1 prefix. */
  path: string
  /** Human label used in the tool title/description. */
  label: string
  /** Plural noun for prose. */
  plural: string
  /** False only for productimage, which the spec gives no /{id} operation. */
  hasGetById: boolean
  /** Server-side filters beyond paging, exactly as the spec defines them. */
  filters: KqmFilter[]
  /** Whether the spec offers `page`/`pageSize` on the list endpoint. */
  paging: boolean
  /** Whether the spec offers `modifiedAfter`. NOT universal — 15 of 20. */
  modifiedAfter: boolean
}

const f = (name: string, type: 'string' | 'number', description: string): KqmFilter => ({ name, type, description })

/**
 * The complete resource table, derived from the captured spec.
 *
 * `filters` lists ONLY parameters the spec actually defines. Anything else has to
 * be filtered client-side by the caller, and advertising a filter the API ignores
 * would produce silently wrong results — the API would return everything and the
 * caller would believe it was filtered.
 */
export const KQM_RESOURCES: KqmResource[] = [
  { tool: 'kqm_brands', path: '/brand', label: 'brand', plural: 'brands', hasGetById: true, filters: [], paging: true, modifiedAfter: true },
  // The ONLY resource with no paging and no filters in the spec.
  { tool: 'kqm_categories', path: '/category', label: 'category', plural: 'categories', hasGetById: true, filters: [], paging: false, modifiedAfter: false },
  { tool: 'kqm_contacts', path: '/contact', label: 'contact', plural: 'contacts', hasGetById: true, filters: [f('customerID', 'number', 'Only contacts for this customer id.')], paging: true, modifiedAfter: true },
  { tool: 'kqm_customers', path: '/customer', label: 'customer', plural: 'customers', hasGetById: true, filters: [], paging: true, modifiedAfter: true },
  { tool: 'kqm_customer_addresses', path: '/customeraddress', label: 'customer address', plural: 'customer addresses', hasGetById: true, filters: [f('customerID', 'number', 'Only addresses for this customer id.')], paging: true, modifiedAfter: true },
  { tool: 'kqm_employees', path: '/employee', label: 'employee', plural: 'employees', hasGetById: true, filters: [], paging: true, modifiedAfter: false },
  { tool: 'kqm_products', path: '/product', label: 'product', plural: 'products', hasGetById: true, filters: [f('manufacturerPartNumber', 'string', 'Exact manufacturer part number (MPN).')], paging: true, modifiedAfter: true },
  { tool: 'kqm_product_images', path: '/productimage', label: 'product image', plural: 'product images', hasGetById: false, filters: [f('productID', 'number', 'Only images for this product id.')], paging: true, modifiedAfter: false },
  { tool: 'kqm_product_suppliers', path: '/productsupplier', label: 'product supplier', plural: 'product suppliers', hasGetById: true, filters: [f('productID', 'number', 'Only supplier records for this product id.')], paging: true, modifiedAfter: true },
  { tool: 'kqm_purchase_orders', path: '/purchaseorder', label: 'purchase order', plural: 'purchase orders', hasGetById: true, filters: [f('orderNumber', 'string', 'Exact purchase order number.')], paging: true, modifiedAfter: true },
  { tool: 'kqm_purchase_order_costs', path: '/purchaseordercost', label: 'purchase order cost', plural: 'purchase order costs', hasGetById: true, filters: [f('purchaseOrderID', 'number', 'Only costs for this purchase order id.')], paging: true, modifiedAfter: true },
  { tool: 'kqm_purchase_order_lines', path: '/purchaseorderline', label: 'purchase order line', plural: 'purchase order lines', hasGetById: true, filters: [f('purchaseOrderID', 'number', 'Only lines for this purchase order id.')], paging: true, modifiedAfter: true },
  { tool: 'kqm_quotes', path: '/quote', label: 'quote', plural: 'quotes', hasGetById: true, filters: [f('quoteNumber', 'string', 'Exact quote number, e.g. QO12345678.')], paging: true, modifiedAfter: true },
  { tool: 'kqm_quote_lines', path: '/quoteline', label: 'quote line', plural: 'quote lines', hasGetById: true, filters: [f('quoteSectionID', 'number', 'Only lines in this quote SECTION id (not the quote id — resolve sections via kqm_quote_sections first).')], paging: true, modifiedAfter: false },
  { tool: 'kqm_quote_sections', path: '/quotesection', label: 'quote section', plural: 'quote sections', hasGetById: true, filters: [f('quoteID', 'number', 'Only sections of this quote id.')], paging: true, modifiedAfter: false },
  { tool: 'kqm_sales_orders', path: '/salesorder', label: 'sales order', plural: 'sales orders', hasGetById: true, filters: [f('orderNumber', 'string', 'Exact sales order number.')], paging: true, modifiedAfter: true },
  { tool: 'kqm_sales_order_lines', path: '/salesorderline', label: 'sales order line', plural: 'sales order lines', hasGetById: true, filters: [f('salesOrderID', 'number', 'Only lines for this sales order id.')], paging: true, modifiedAfter: true },
  { tool: 'kqm_sales_order_payments', path: '/salesorderpayment', label: 'sales order payment', plural: 'sales order payments', hasGetById: true, filters: [f('salesOrderID', 'number', 'Only payments for this sales order id.')], paging: true, modifiedAfter: true },
  { tool: 'kqm_suppliers', path: '/supplier', label: 'supplier', plural: 'suppliers', hasGetById: true, filters: [], paging: true, modifiedAfter: true },
  { tool: 'kqm_warehouses', path: '/warehouse', label: 'warehouse', plural: 'warehouses', hasGetById: true, filters: [], paging: true, modifiedAfter: true },
]

/** Every tool name this module registers, for TOOL_FACTS completeness. */
export const KQM_TOOL_NAMES: string[] = [...KQM_RESOURCES.map((r) => r.tool), 'kqm_probe_connection']

function buildInputSchema(r: KqmResource): Record<string, z.ZodTypeAny> {
  const schema: Record<string, z.ZodTypeAny> = {}

  if (r.hasGetById) {
    schema.id = z
      .number()
      .int()
      .optional()
      .describe(`Fetch a single ${r.label} by id. When set, every other parameter is ignored.`)
  }
  for (const filter of r.filters) {
    const base = filter.type === 'number' ? z.number().int() : z.string()
    schema[filter.name] = base.optional().describe(`${filter.description} Server-side filter defined by the API.`)
  }
  if (r.paging) {
    schema.page = z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number, 1-INDEXED (the API default is 1). Omit to sweep all pages.')
    schema.pageSize = z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(`Rows per page, capped at ${MAX_PAGE_SIZE} by the vendor. Defaults to ${MAX_PAGE_SIZE}.`)
    schema.allPages = z
      .boolean()
      .optional()
      .describe('Default true when `page` is omitted: page through everything. Set false with no `page` to fetch only the first page.')
  }
  if (r.modifiedAfter) {
    schema.modifiedAfter = z
      .string()
      .optional()
      .describe('ISO date/datetime — only records modified after this. Supported by the API for this resource.')
  }
  return schema
}

function describeTool(r: KqmResource): string {
  const parts: string[] = [
    `Read ${r.plural} from Kaseya Quote Manager (Datto Commerce). READ-ONLY — the Quote Manager API has no write surface at all (all 39 documented operations are GET), so nothing here can create or change anything.`,
  ]
  if (r.hasGetById) parts.push(`Pass \`id\` for a single ${r.label}, or omit it to list.`)
  else parts.push(`This resource has NO get-by-id operation in the API — list with the \`productID\` filter instead.`)

  if (r.filters.length) {
    parts.push(`Server-side filters: ${r.filters.map((x) => x.name).join(', ')}. Any OTHER filtering must be done client-side after fetching — the API ignores undocumented parameters rather than erroring, so a made-up filter would silently return everything.`)
  } else if (r.paging) {
    parts.push('The API defines no server-side filters for this resource beyond paging.')
  }

  if (!r.paging) parts.push('The API offers no paging for this resource — it returns the full set in one response.')
  if (!r.modifiedAfter && r.paging) parts.push('`modifiedAfter` is NOT supported for this resource (the API offers it on only 15 of 20 resources), so a delta sync is not available here.')

  parts.push('Responses are bare arrays with no total count, so a page-capped sweep is reported with `truncated: true` rather than implied to be complete.')
  return parts.join(' ')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerKaseyaQuoteManagerTools(server: any) {
  for (const r of KQM_RESOURCES) {
    server.registerTool(
      r.tool,
      {
        title: `Kaseya Quote Manager: ${r.plural}`,
        description: describeTool(r),
        inputSchema: buildInputSchema(r),
      },
      async (args: Record<string, unknown> = {}) => {
        try {
          const client = kqmClient()

          if (r.hasGetById && typeof args.id === 'number') {
            const row = await client.get(`${r.path}/${args.id}`)
            return ok({ resource: r.plural, mode: 'get-by-id', id: args.id, item: row })
          }

          const query: KqmQuery = {}
          for (const filter of r.filters) {
            const v = args[filter.name]
            if (typeof v === 'string' || typeof v === 'number') query[filter.name] = v
          }
          if (r.modifiedAfter && typeof args.modifiedAfter === 'string') query.modifiedAfter = args.modifiedAfter

          // No paging in the spec for this resource: one plain GET.
          if (!r.paging) {
            const rows = await client.get(r.path, query)
            return ok({
              resource: r.plural,
              mode: 'list',
              paging: 'not offered by the API for this resource',
              count: Array.isArray(rows) ? rows.length : null,
              items: rows,
            })
          }

          const explicitPage = typeof args.page === 'number'
          const sweep = args.allPages === undefined ? !explicitPage : args.allPages === true

          if (sweep) {
            const result = await client.getAllPages(r.path, query, {
              pageSize: typeof args.pageSize === 'number' ? args.pageSize : undefined,
            })
            return ok({
              resource: r.plural,
              mode: 'list',
              sweptAllPages: true,
              pagesFetched: result.pages,
              pageSize: result.pageSize,
              // Named `truncated` and always present: the API gives no total, so
              // silence here would read as "this is everything".
              truncated: result.truncated,
              ...(result.truncated
                ? { truncationNote: `Stopped at the page cap. There may be more ${r.plural}; narrow with a filter or request specific pages.` }
                : {}),
              count: result.items.length,
              items: result.items,
            })
          }

          const page = explicitPage ? (args.page as number) : 1
          const pageSize = typeof args.pageSize === 'number' ? Math.min(args.pageSize, MAX_PAGE_SIZE) : MAX_PAGE_SIZE
          const rows = await client.get<unknown[]>(r.path, { ...query, page, pageSize })
          return ok({
            resource: r.plural,
            mode: 'list',
            page,
            pageSize,
            count: Array.isArray(rows) ? rows.length : null,
            // A full page means there is probably another one; the API cannot
            // confirm it either way, so say exactly that.
            likelyMorePages: Array.isArray(rows) ? rows.length === pageSize : null,
            items: rows,
          })
        } catch (err) {
          return fail(err)
        }
      },
    )
  }

  server.registerTool(
    'kqm_probe_connection',
    {
      title: 'Kaseya Quote Manager: probe connection + settle the auth mechanism',
      description:
        'DIAGNOSTIC. Settles a documented contradiction in the vendor docs against the live API: the OpenAPI spec declares the API key as a HEADER named `apiKey`, while Kaseya\'s help page describes a QUERY PARAMETER (and is inconsistent on casing). This tries each mechanism IN ISOLATION — never both at once, since sending the key two ways would make a success uninterpretable — reports which authenticates, and confirms the pageSize cap the help page states but the spec omits. ' +
        'Read-only, makes at most three GETs against /v1/warehouse, and NEVER returns or logs the API key. Run this once after the key is set; if the answer differs from the default, set KASEYA_QUOTE_MANAGER_AUTH_MODE rather than guessing. ' +
        FAILURE_ENVELOPE_TOOL_NOTE,
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await kqmClient().probeAuth())
      } catch (err) {
        return fail(err)
      }
    },
  )
}
