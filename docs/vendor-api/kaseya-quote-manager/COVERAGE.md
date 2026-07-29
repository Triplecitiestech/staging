# Kaseya Quote Manager API — coverage contract

**Source spec:** `openapi.json` in this directory — retrieved verbatim from
`https://api.dattocommerce.com/docs/v1/swagger.json` on **2026-07-28**.
sha256 `316dc59bedda888cb6f62ec4dfecafac030c94a9e889a33228fb0b3ef0e19c9e` (93,443 bytes).
OpenAPI **3.0.4**, `info.title` "API Reference", `info.version` v1.

**This file is the coverage contract.** Every operation in the spec has a row.
A row may only be marked `not-implemented` with a written reason — never dropped.
Status values: `planned` / `implemented` / `not-implemented-because-<reason>`.

**Status of this document: STEP 2 COMPLETE — all 39 operations implemented.**
Tool surface: `src/lib/mcp-kaseya-quote-manager-tools.ts` (20 tools + a probe),
over the single client `src/lib/kaseya-quote-manager.ts`.

**This contract is enforced by test, not by hand.** The tool table
(`KQM_RESOURCES`) is asserted against `openapi.json` in
`src/lib/mcp-kaseya-quote-manager-tools.test.ts`: every spec GET must be
reachable, every documented query parameter must be exposed, no *undocumented*
parameter may be advertised (the API ignores unknown params rather than erroring,
so a made-up filter would silently return everything), `modifiedAfter` must appear
on exactly the 15 resources that support it, and the spec must still contain zero
write operations. Re-capture the spec and the tests tell you what moved.

## Totals

| | count |
|---|---|
| Paths in spec | 39 |
| Operations (path + method) | **39** |
| …of which GET | **39** |
| …of which write (POST/PUT/PATCH/DELETE) | **0** |
| Distinct resources | 20 |
| Planned MCP tools (grouped list + get-by-id) | **20** |
| Component schemas | 22 |

The API is **read-only by construction** — the spec contains zero write
operations, independently confirming Kaseya's "read-only" statement rather than
taking it on trust.

## Facts established from the spec itself

- **Server:** `https://api.kaseyaquotemanager.com/` (from `servers[0].url`).
  Paths already carry the `/v1` prefix, so the effective base is
  `https://api.kaseyaquotemanager.com/v1/…` — matching the help page, and
  different from the docs host.
- **Auth — DISCREPANCY, see below:** the spec declares
  `securitySchemes.apiKey = { type: apiKey, name: "apiKey", in: "header" }`.
  That is a **header** named `apiKey`, not a query parameter.
- **Paging:** `page` + `pageSize` query parameters on every list endpoint.
- **`modifiedAfter`:** present on 15 of the 20 list endpoints. NOT offered on
  `category`, `employee`, `productimage`, `quoteline`, `quotesection` — so a
  delta-sync tool must not advertise it for those.
- **Server-side filters** beyond paging (these are the only ones the spec
  defines, so any other filtering must happen client-side):
  `contact.customerID`, `customeraddress.customerID`, `product.manufacturerPartNumber`,
  `productimage.productID`, `productsupplier.productID`, `purchaseorder.orderNumber`,
  `purchaseordercost.purchaseOrderID`, `purchaseorderline.purchaseOrderID`,
  `quote.quoteNumber`, `quoteline.quoteSectionID`, `quotesection.quoteID`,
  `salesorder.orderNumber`, `salesorderline.salesOrderID`,
  `salesorderpayment.salesOrderID`.

## Open items — status

1. **Auth mechanism — SETTLED LIVE 2026-07-29: the API accepts the key BOTH ways.**
   The spec says header `apiKey`; `help.quotemanager.kaseya.com/.../api.htm` says a
   query parameter, with inconsistent casing (`apikey` vs `apiKey`). The probe ran
   against the live API and **both mechanisms returned 200** — so neither doc is
   wrong; each is incomplete.
   **We keep the header default, and not merely because the spec says so:** a key
   sent as a query parameter ends up in the URL, and therefore in access logs, proxy
   logs, and any error report that echoes the request line. The header keeps it out
   of all of them. Do not set `KASEYA_QUOTE_MANAGER_AUTH_MODE=query` without a
   specific reason.
   The probe tries each mechanism *in isolation* — never both at once, since a key
   sent two ways would make a success uninterpretable — and reports **`accepted`**
   (every mechanism that worked), not just the first. An earlier version returned
   only the first success and declared the help page disregardable, which the
   evidence never supported; that was a real defect in the diagnostic and is
   regression-locked by four tests, one per outcome.
2. **Env var:** `KASEYA_QUOTE_MANAGER_API_KEY` — created in Vercel 2026-07-29.
   Already in the failure-envelope secret-scrub list so it can never appear in an
   error envelope. Optional: `KASEYA_QUOTE_MANAGER_AUTH_MODE` (`header` default).
   **A variable added after a deployment is not visible to it** — the value only
   reaches the running app on the next deploy, which this change provides.
3. **Rate limits are not in the spec.** 60/minute, 20,000/24h, HTTP 429 — help page
   only. Implemented as a per-instance sliding window **plus** reactive 429 retry
   via `withRetry`. The window is per-lambda, so across concurrent Vercel instances
   it is a floor rather than a guarantee; both layers are deliberate and neither is
   sufficient alone.
4. **`pageSize` maximum is not stated in the spec** (though 100 is its stated
   *default*). Clamped to 100 per the help page rather than passing a larger value
   through and gambling on undocumented behaviour. **Confirmed live 2026-07-29:**
   `pageSizeCapHonoured: true` — a `pageSize=100` request returned at most 100 rows.
5. **No total count anywhere.** Every list response is a bare JSON array — no
   envelope, no `totalCount`. A swept read therefore reports `truncated: true` when
   it hits the page cap instead of implying it fetched everything, and a single-page
   read reports `likelyMorePages` rather than asserting a total it cannot know.
6. **Paging is 1-INDEXED** (spec default `1`), the opposite of Datto RMM, whose
   0-indexed paging silently skipped the first page of every sweep for months.
   Regression-locked by a test asserting the first request carries `page=1`.

## Endpoint inventory

`*` marks a required parameter. Grouping: one tool per resource handling both
`list` and `get-by-id`, which keeps 39 operations reachable through 20 tools
without losing coverage — every documented query parameter is exposed as a tool
parameter.

| Path | Method | Purpose | Planned MCP tool | Spec parameters | Status |
|---|---|---|---|---|---|
| `/v1/brand` | GET | Get a list of brands | `kqm_brands` (`list`) | `page`, `pageSize`, `modifiedAfter` | implemented |
| `/v1/brand/{id}` | GET | Get a brand | `kqm_brands` (`get-by-id`) | `id`* | implemented |
| `/v1/category` | GET | Get a list of categories | `kqm_categories` (`list`) | — | implemented |
| `/v1/category/{id}` | GET | Get a category | `kqm_categories` (`get-by-id`) | `id`* | implemented |
| `/v1/contact` | GET | Get a list of contacts | `kqm_contacts` (`list`) | `customerID`, `page`, `pageSize`, `modifiedAfter` | implemented |
| `/v1/contact/{id}` | GET | Get a contact | `kqm_contacts` (`get-by-id`) | `id`* | implemented |
| `/v1/customer` | GET | Get a list of customers | `kqm_customers` (`list`) | `page`, `pageSize`, `modifiedAfter` | implemented |
| `/v1/customer/{id}` | GET | Get a customer | `kqm_customers` (`get-by-id`) | `id`* | implemented |
| `/v1/customeraddress` | GET | Get a list of customer addresses | `kqm_customer_addresses` (`list`) | `customerID`, `page`, `pageSize`, `modifiedAfter` | implemented |
| `/v1/customeraddress/{id}` | GET | Get a customer address | `kqm_customer_addresses` (`get-by-id`) | `id`* | implemented |
| `/v1/employee` | GET | Get a list of employees | `kqm_employees` (`list`) | `page`, `pageSize` | implemented |
| `/v1/employee/{id}` | GET | Get an employee | `kqm_employees` (`get-by-id`) | `id`* | implemented |
| `/v1/product` | GET | Get a list of products | `kqm_products` (`list`) | `manufacturerPartNumber`, `page`, `pageSize`, `modifiedAfter` | implemented |
| `/v1/product/{id}` | GET | Get a product | `kqm_products` (`get-by-id`) | `id`* | implemented |
| `/v1/productimage` | GET | Get a list of products images | `kqm_product_images` (`list`) | `productID`, `page`, `pageSize` | implemented |
| `/v1/productsupplier` | GET | Get a list of product suppliers | `kqm_product_suppliers` (`list`) | `productID`, `page`, `pageSize`, `modifiedAfter` | implemented |
| `/v1/productsupplier/{id}` | GET | Get a product supplier | `kqm_product_suppliers` (`get-by-id`) | `id`* | implemented |
| `/v1/purchaseorder` | GET | Get a list of purchase orders | `kqm_purchase_orders` (`list`) | `orderNumber`, `page`, `pageSize`, `modifiedAfter` | implemented |
| `/v1/purchaseorder/{id}` | GET | Get a purchase order | `kqm_purchase_orders` (`get-by-id`) | `id`* | implemented |
| `/v1/purchaseordercost` | GET | Get a list of purchase order costs | `kqm_purchase_order_costs` (`list`) | `purchaseOrderID`, `page`, `pageSize`, `modifiedAfter` | implemented |
| `/v1/purchaseordercost/{id}` | GET | Get a purchase order cost | `kqm_purchase_order_costs` (`get-by-id`) | `id`* | implemented |
| `/v1/purchaseorderline` | GET | Get a list of purchase order lines | `kqm_purchase_order_lines` (`list`) | `purchaseOrderID`, `page`, `pageSize`, `modifiedAfter` | implemented |
| `/v1/purchaseorderline/{id}` | GET | Get a purchase order line | `kqm_purchase_order_lines` (`get-by-id`) | `id`* | implemented |
| `/v1/quote` | GET | Get a list of quotes | `kqm_quotes` (`list`) | `quoteNumber`, `page`, `pageSize`, `modifiedAfter` | implemented |
| `/v1/quote/{id}` | GET | Get a quote | `kqm_quotes` (`get-by-id`) | `id`* | implemented |
| `/v1/quoteline` | GET | Get a list of quote lines | `kqm_quote_lines` (`list`) | `quoteSectionID`, `page`, `pageSize` | implemented |
| `/v1/quoteline/{id}` | GET | Get a quote line | `kqm_quote_lines` (`get-by-id`) | `id`* | implemented |
| `/v1/quotesection` | GET | Get a list of quote sections | `kqm_quote_sections` (`list`) | `quoteID`, `page`, `pageSize` | implemented |
| `/v1/quotesection/{id}` | GET | Get a quote section | `kqm_quote_sections` (`get-by-id`) | `id`* | implemented |
| `/v1/salesorder` | GET | Get a list of sales orders | `kqm_sales_orders` (`list`) | `orderNumber`, `page`, `pageSize`, `modifiedAfter` | implemented |
| `/v1/salesorder/{id}` | GET | Get a sales order | `kqm_sales_orders` (`get-by-id`) | `id`* | implemented |
| `/v1/salesorderline` | GET | Get a list of sales order lines | `kqm_sales_order_lines` (`list`) | `salesOrderID`, `page`, `pageSize`, `modifiedAfter` | implemented |
| `/v1/salesorderline/{id}` | GET | Get a sales order line | `kqm_sales_order_lines` (`get-by-id`) | `id`* | implemented |
| `/v1/salesorderpayment` | GET | Get a list of sales order payments | `kqm_sales_order_payments` (`list`) | `salesOrderID`, `page`, `pageSize`, `modifiedAfter` | implemented |
| `/v1/salesorderpayment/{id}` | GET | Get a sales order payment | `kqm_sales_order_payments` (`get-by-id`) | `id`* | implemented |
| `/v1/supplier` | GET | Get a list of suppliers | `kqm_suppliers` (`list`) | `page`, `pageSize`, `modifiedAfter` | implemented |
| `/v1/supplier/{id}` | GET | Get a supplier | `kqm_suppliers` (`get-by-id`) | `id`* | implemented |
| `/v1/warehouse` | GET | Get a list of warehouses | `kqm_warehouses` (`list`) | `page`, `pageSize`, `modifiedAfter` | implemented |
| `/v1/warehouse/{id}` | GET | Get a warehouse | `kqm_warehouses` (`get-by-id`) | `id`* | implemented |

## Verification performed

Automated, in `src/lib/mcp-kaseya-quote-manager-tools.test.ts` (18 tests):

- Spec is valid JSON and parses as OpenAPI 3.0.4; counts computed from the spec,
  never counted by eye.
- All 39 spec GETs reachable through the 20 registered tools; 20 resources.
- Zero write operations in the spec — asserted, so a future vendor POST fails the
  build and forces the read-only claim to be re-examined.
- `productimage` is the only resource with no get-by-id, and its tool does not
  advertise an `id` parameter (which would 404 indistinguishably from a missing
  record).
- Every documented query parameter is exposed, and no undocumented one is.
- `modifiedAfter` exposed on exactly the 15 supporting resources.
- Read-only proven structurally, not by reading the source: the client is driven
  with a stubbed fetch and any non-GET fails.
- Key never sent by both channels at once; never present in the URL in header mode.
- `pageSize` clamped to 100; every request carries an `AbortSignal` timeout; a
  non-rooted path is refused; no key means no unauthenticated call.
- Paging starts at `page=1`; short page ends a sweep; page cap sets
  `truncated: true`; a non-array list response throws instead of returning empty.
- Every registered tool has a reviewed `TOOL_FACTS` entry (`access: read`,
  `staged: false`) and resolves to the Kaseya Quote Manager vendor label.

**Live verification — first real calls made 2026-07-29** via `kqm_probe_connection`
against production (commit `d8f9992bc179`):

- `configured: true` — `KASEYA_QUOTE_MANAGER_API_KEY` reaches the running app and
  authenticates.
- **Both** auth mechanisms returned 200 (see open item 1). Header retained.
- `pageSizeCapHonoured: true`.
- `/v1/warehouse` returned a bare JSON array, matching the spec's declared shape.

**Still unverified:** real 429 / rate-limit behaviour (not provoked deliberately),
response-shape drift on the other 19 resources, and whether any list endpoint
behaves differently at scale. Those are observations to make in normal use, not
blockers.
