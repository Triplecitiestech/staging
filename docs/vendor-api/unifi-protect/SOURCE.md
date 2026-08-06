# UniFi Protect Integration API — retrieval provenance

## Machine-readable spec (obtained)

- **Version:** Protect **7.1.87** — the version `https://developer.ui.com/protect/`
  redirects to as of 2026-08-06, and the version running on the TCT office console.
- **Retrieved:** 2026-08-06
- **Stored as:** `openapi.json` — the embedded document re-serialised **compact and
  key-sorted** (`json.dumps(separators=(',',':'), sort_keys=True)`). Not byte-for-byte
  from the wire; see "Fidelity" below.
- **sha256:** `511f47e31e325daf9cdf20748a4e362d3f23b02c9a5f9a57471033d248cf19fb`
- **Size:** 1,642,099 bytes · OpenAPI **3.1.0** · `info.title` "UniFi Protect API",
  `info.version` "0.0.0" · `servers[0].url` `/integration`
- **Contents:** 54 paths, 288 component schemas.

### How it was found

`developer.ui.com` is a Next.js app; there is no standalone spec URL to fetch. This
is the same extraction already documented for the Network API in
`docs/gotchas.md` → UniFi ("every docs page embeds the complete OpenAPI document in
its RSC payload (`"fullSpec"`), version-pinned per release — extract that instead of
scraping rendered pages").

Command used:

```bash
curl -sSL -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" \
  https://developer.ui.com/protect/v7.1.87/get-v1cameras -o cams.html
# locate the escaped "fullSpec": key in the RSC payload, unescape (\" -> ", \\ -> \),
# then JSONDecoder().raw_decode() from the opening brace (the payload continues past
# the object, so a plain json.loads() fails with "Extra data").
```

Any `/protect/v7.1.87/*` reference page carries the identical `fullSpec`; the cameras
page was used only because it was already fetched.

### Fidelity

The stored file is **semantically identical** to the embedded document but **not
byte-identical**: it was parsed and re-serialised compact + key-sorted (the wire form
is a JS-escaped string inside an HTML script tag, not a standalone JSON file, so there
is no original byte stream to preserve — unlike the Kaseya spec, which was a real
`.json` URL). Re-running the extraction and re-serialising the same way reproduces the
recorded sha256. Treat the hash as a **drift detector for the vendor's spec**, not as
proof of wire bytes.

### What the spec does and does not settle

The spec is authoritative for the **official Integration API surface only**. It is
silent on — and must not be read as evidence about — the private Protect API
(`/proxy/protect/api/*`), the Alarm Manager webhook **payload** Protect sends outbound,
and the Cloud Connector Proxy's path grammar. Findings on those live in
`docs/plans/UNIFI_PROTECT_AUTOMATION_SPIKE.md`.

## Companion: Site Manager API v1.0.0

Extracted the same way from `https://developer.ui.com/site-manager/v1.0.0/listhosts`.
Not stored here (it is small and stable); the facts taken from it are recorded in the
spike document with the operation names that prove them:

- `components.securitySchemes` = `{"site-manager-api-key": {"in":"header","name":"X-API-Key","type":"apiKey"}}`
- 9 paths: `/v1/hosts`, `/v1/hosts/{id}`, `/v1/sites`, `/v1/devices`,
  `/v1/isp-metrics/{type}`, `/v1/isp-metrics/{type}/query`, `/v1/sd-wan-configs`,
  `/v1/sd-wan-configs/{id}`, `/v1/sd-wan-configs/{id}/status`
- **Zero occurrences of the string `proxy`; no `/v1/connector/...` path.** The Cloud
  Connector Proxy route this codebase already depends on
  (`/v1/connector/consoles/{id}/proxy/network/integration/v1/...`) is **not in the
  published spec.** Its only trace is `tags[0].name = "cloud-connector"`.
