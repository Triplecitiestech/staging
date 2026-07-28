# Kaseya Quote Manager API — retrieval provenance

## Machine-readable spec (preferred source — obtained)

- **URL:** `https://api.dattocommerce.com/docs/v1/swagger.json`
- **Retrieved:** 2026-07-28
- **Stored as:** `openapi.json`, byte-for-byte unmodified (`cmp`-verified)
- **sha256:** `316dc59bedda888cb6f62ec4dfecafac030c94a9e889a33228fb0b3ef0e19c9e`
- **Size:** 93,443 bytes · OpenAPI 3.0.4

### How it was found

`https://api.dattocommerce.com/docs/index.html` is a Redoc shell — a plain GET
returns 782 bytes containing only `<div id="redoc-container">` plus two scripts,
which is why scraping it yields just the page title. The spec URL is in the
bootstrap script, `https://api.dattocommerce.com/docs/index.js`:

```js
Redoc.init('v1/swagger.json', JSON.parse('{"untrustedSpec":true, …}'), …)
```

Resolved against the docs path, that is `/docs/v1/swagger.json`.

**No headless browser was needed** — the real spec file exists and was
retrieved directly, so nothing was rendered or transcribed, and no browser
dependency entered the project. There is therefore no derived markdown
reference: `openapi.json` IS the reference, and it is authoritative.

## Supplementary facts from the vendor help page

Source: `https://help.quotemanager.kaseya.com/help/Content/2-integrate/api.htm`
(supplied as already-confirmed; recorded here as vendor claims, each marked with
whether the spec agrees).

| Fact | Spec agrees? |
|---|---|
| Base URL `https://api.kaseyaquotemanager.com/v1/` | **Yes** — `servers[0].url` is `https://api.kaseyaquotemanager.com/`, and paths carry `/v1`. Note this differs from the docs host `api.dattocommerce.com`. |
| Auth: API key as a **query parameter** | **NO — CONTRADICTS.** Spec declares `securitySchemes.apiKey = {type: apiKey, name: "apiKey", in: "header"}`. |
| Casing inconsistent (`apikey` vs `apiKey`) | Spec uses `apiKey`. Unresolved which the live API accepts, and in which position. |
| Paging starts at page 1, hard cap 100 per page | Partially — spec defines `page`/`pageSize` but states no start value and no maximum. |
| `modifiedAfter` for delta queries, URL-encoded | Partially — present on 15 of 20 list endpoints, absent on 5 (see COVERAGE.md). |
| Rate limits 60/min, 20,000/24h, HTTP 429 | Not in the spec at all. Help page is the only source. |
| API is READ-ONLY | **Yes, independently confirmed** — all 39 operations are GET; the spec contains no write operation. |
| Key obtained via My Account (profile icon) > Developer API | Not a spec matter. |

## Unresolved, needs a live key

The auth contradiction is the one that blocks implementation: header vs query
parameter is a different code path, not a cosmetic detail. It must be settled by
calling the live API, and is deliberately **not guessed** here.

Requested env var name: **`KASEYA_QUOTE_MANAGER_API_KEY`**.

## Re-retrieval

```bash
curl -sS https://api.dattocommerce.com/docs/v1/swagger.json -o openapi.json
sha256sum openapi.json   # compare with the hash above to detect a vendor change
```
