# Kaseya Quote Manager API — coverage contract

**Source spec:** `openapi.json` in this directory — retrieved verbatim from
`https://api.dattocommerce.com/docs/v1/swagger.json` on **2026-07-28**.
sha256 `316dc59bedda888cb6f62ec4dfecafac030c94a9e889a33228fb0b3ef0e19c9e` (93,443 bytes).
OpenAPI **3.0.4**, `info.title` "API Reference", `info.version` v1.

**This file is the coverage contract.** Every operation in the spec has a row.
A row may only be marked `not-implemented` with a written reason — never dropped.
Status values: `planned` / `implemented` / `not-implemented-because-<reason>`.

**Status of this document: STEP 1 — inventory only. No tool code written yet.**
Per the brief, work stopped here for review before implementation.

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

## Open items to resolve before/while building

1. **Auth mechanism contradicts the help page.** The spec says header `apiKey`;
   `help.quotemanager.kaseya.com/.../api.htm` says a query parameter, with
   inconsistent casing (`apikey` vs `apiKey`). These disagree on the
   *mechanism*, not just the casing. **Must be settled empirically against the
   live API once a key exists** — untested, and deliberately not guessed here.
2. **Env var name requested:** `KASEYA_QUOTE_MANAGER_API_KEY`.
   (Already added to the failure-envelope secret-scrub list so it can never
   appear in an error envelope.)
3. **Rate limits are not in the spec.** 60 calls/minute, 20,000/24h and HTTP 429
   come from the help page only; the shared client must implement them
   regardless.
4. **`pageSize` maximum is not stated in the spec.** The help page's hard cap of
   100 is the value to build to, and worth confirming empirically.

## Endpoint inventory

`*` marks a required parameter. Grouping: one tool per resource handling both
`list` and `get-by-id`, which keeps 39 operations reachable through 20 tools
without losing coverage — every documented query parameter is exposed as a tool
parameter.

| Path | Method | Purpose | Planned MCP tool | Spec parameters | Status |
|---|---|---|---|---|---|
| `/v1/brand` | GET | Get a list of brands | `kqm_brands` (`list`) | `page`, `pageSize`, `modifiedAfter` | planned |
| `/v1/brand/{id}` | GET | Get a brand | `kqm_brands` (`get-by-id`) | `id`* | planned |
| `/v1/category` | GET | Get a list of categories | `kqm_categories` (`list`) | — | planned |
| `/v1/category/{id}` | GET | Get a category | `kqm_categories` (`get-by-id`) | `id`* | planned |
| `/v1/contact` | GET | Get a list of contacts | `kqm_contacts` (`list`) | `customerID`, `page`, `pageSize`, `modifiedAfter` | planned |
| `/v1/contact/{id}` | GET | Get a contact | `kqm_contacts` (`get-by-id`) | `id`* | planned |
| `/v1/customer` | GET | Get a list of customers | `kqm_customers` (`list`) | `page`, `pageSize`, `modifiedAfter` | planned |
| `/v1/customer/{id}` | GET | Get a customer | `kqm_customers` (`get-by-id`) | `id`* | planned |
| `/v1/customeraddress` | GET | Get a list of customer addresses | `kqm_customer_addresses` (`list`) | `customerID`, `page`, `pageSize`, `modifiedAfter` | planned |
| `/v1/customeraddress/{id}` | GET | Get a customer address | `kqm_customer_addresses` (`get-by-id`) | `id`* | planned |
| `/v1/employee` | GET | Get a list of employees | `kqm_employees` (`list`) | `page`, `pageSize` | planned |
| `/v1/employee/{id}` | GET | Get an employee | `kqm_employees` (`get-by-id`) | `id`* | planned |
| `/v1/product` | GET | Get a list of products | `kqm_products` (`list`) | `manufacturerPartNumber`, `page`, `pageSize`, `modifiedAfter` | planned |
| `/v1/product/{id}` | GET | Get a product | `kqm_products` (`get-by-id`) | `id`* | planned |
| `/v1/productimage` | GET | Get a list of products images | `kqm_product_images` (`list`) | `productID`, `page`, `pageSize` | planned |
| `/v1/productsupplier` | GET | Get a list of product suppliers | `kqm_product_suppliers` (`list`) | `productID`, `page`, `pageSize`, `modifiedAfter` | planned |
| `/v1/productsupplier/{id}` | GET | Get a product supplier | `kqm_product_suppliers` (`get-by-id`) | `id`* | planned |
| `/v1/purchaseorder` | GET | Get a list of purchase orders | `kqm_purchase_orders` (`list`) | `orderNumber`, `page`, `pageSize`, `modifiedAfter` | planned |
| `/v1/purchaseorder/{id}` | GET | Get a purchase order | `kqm_purchase_orders` (`get-by-id`) | `id`* | planned |
| `/v1/purchaseordercost` | GET | Get a list of purchase order costs | `kqm_purchase_order_costs` (`list`) | `purchaseOrderID`, `page`, `pageSize`, `modifiedAfter` | planned |
| `/v1/purchaseordercost/{id}` | GET | Get a purchase order cost | `kqm_purchase_order_costs` (`get-by-id`) | `id`* | planned |
| `/v1/purchaseorderline` | GET | Get a list of purchase order lines | `kqm_purchase_order_lines` (`list`) | `purchaseOrderID`, `page`, `pageSize`, `modifiedAfter` | planned |
| `/v1/purchaseorderline/{id}` | GET | Get a purchase order line | `kqm_purchase_order_lines` (`get-by-id`) | `id`* | planned |
| `/v1/quote` | GET | Get a list of quotes | `kqm_quotes` (`list`) | `quoteNumber`, `page`, `pageSize`, `modifiedAfter` | planned |
| `/v1/quote/{id}` | GET | Get a quote | `kqm_quotes` (`get-by-id`) | `id`* | planned |
| `/v1/quoteline` | GET | Get a list of quote lines | `kqm_quote_lines` (`list`) | `quoteSectionID`, `page`, `pageSize` | planned |
| `/v1/quoteline/{id}` | GET | Get a quote line | `kqm_quote_lines` (`get-by-id`) | `id`* | planned |
| `/v1/quotesection` | GET | Get a list of quote sections | `kqm_quote_sections` (`list`) | `quoteID`, `page`, `pageSize` | planned |
| `/v1/quotesection/{id}` | GET | Get a quote section | `kqm_quote_sections` (`get-by-id`) | `id`* | planned |
| `/v1/salesorder` | GET | Get a list of sales orders | `kqm_sales_orders` (`list`) | `orderNumber`, `page`, `pageSize`, `modifiedAfter` | planned |
| `/v1/salesorder/{id}` | GET | Get a sales order | `kqm_sales_orders` (`get-by-id`) | `id`* | planned |
| `/v1/salesorderline` | GET | Get a list of sales order lines | `kqm_sales_order_lines` (`list`) | `salesOrderID`, `page`, `pageSize`, `modifiedAfter` | planned |
| `/v1/salesorderline/{id}` | GET | Get a sales order line | `kqm_sales_order_lines` (`get-by-id`) | `id`* | planned |
| `/v1/salesorderpayment` | GET | Get a list of sales order payments | `kqm_sales_order_payments` (`list`) | `salesOrderID`, `page`, `pageSize`, `modifiedAfter` | planned |
| `/v1/salesorderpayment/{id}` | GET | Get a sales order payment | `kqm_sales_order_payments` (`get-by-id`) | `id`* | planned |
| `/v1/supplier` | GET | Get a list of suppliers | `kqm_suppliers` (`list`) | `page`, `pageSize`, `modifiedAfter` | planned |
| `/v1/supplier/{id}` | GET | Get a supplier | `kqm_suppliers` (`get-by-id`) | `id`* | planned |
| `/v1/warehouse` | GET | Get a list of warehouses | `kqm_warehouses` (`list`) | `page`, `pageSize`, `modifiedAfter` | planned |
| `/v1/warehouse/{id}` | GET | Get a warehouse | `kqm_warehouses` (`get-by-id`) | `id`* | planned |

## Verification performed so far

- Spec is valid JSON and parses as OpenAPI 3.0.4.
- Endpoint/operation counts above are computed from the spec, not counted by eye.
- Every one of the 39 operations appears as a row.
- Zero write operations found, so no write tools are planned.
- **Not yet done** (needs an API key): any live call, auth-casing resolution,
  `pageSize` cap confirmation, rate-limiter behaviour, live-vs-spec discrepancy
  hunting.
