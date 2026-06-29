# WAN Reliability Report (ISP / SLA)

*Added 2026-06-29. Owner: Engineering. Source of truth for the WAN/circuit reliability reporting feature.*

Historical WAN reliability & SLA report for any monitored customer site, generated **live from the existing Domotz integration**. Produces outage history, uptime, MTBF/MTTR, daily instability, SLA compliance (default 99.99% availability / 4‑hour repair), and latency/packet‑loss/speed trends, in JSON, Markdown, plain text, and printable HTML.

It is fully reusable — driven by a Domotz `agentId` (the on‑site collector = the "site") plus an optional `deviceId` (the WAN gateway). Nothing is hardcoded to a specific customer.

## Architecture

Clean separation between API access, business logic, and presentation:

| Layer | File | Responsibility |
|---|---|---|
| API client | `src/lib/domotz.ts` (**extended**, not duplicated) | All Domotz REST calls, auth (`x-api-key`), retry, pagination, time‑chunking |
| Types | `src/lib/reporting/wan-reliability/types.ts` | Report shapes + SLA defaults |
| Business logic (pure) | `src/lib/reporting/wan-reliability/analyzer.ts` | Outage detection, stats, SLA, trend, performance — no I/O |
| Narrative (pure) | `src/lib/reporting/wan-reliability/executive-summary.ts` | Management summary |
| Orchestration (I/O) | `src/lib/reporting/wan-reliability/service.ts` | Live fetch + assembly |
| Presentation | `src/lib/reporting/wan-reliability/format.ts` | JSON / Markdown / text / HTML renderers |
| API routes | `src/app/api/reports/wan-reliability/route.ts` + `…/sites/route.ts` | HTTP surface |
| UI | `src/app/admin/reporting/wan-reliability/` + `src/components/reporting/WanReliabilityGenerator.tsx` | Admin generator |

Unit tests: `src/lib/reporting/wan-reliability/analyzer.test.ts` (`npm test`).

## Domotz endpoints used (added to `src/lib/domotz.ts`)

The existing client only had `getAgents()`, `getDevices()`, `buildSummary()`. These methods were **added** (same `DomotzClient`, same auth, no new client):

| Method | Endpoint | Used for |
|---|---|---|
| `getAllAgents({displayName?})` | `GET /agent?page_size&page_number&display_name` | Site list/typeahead (paginated — the bare `/agent` defaults to **10** results) |
| `getAgent(id)` | `GET /agent/{id}` | Timezone, `wan_info` (public IP + reverse‑DNS hostname) |
| `getDevice(a,d)` | `GET /agent/{a}/device/{d}` | Gateway vendor/model/IP |
| `getDeviceUptime(a,d,from,to)` | `GET /agent/{a}/device/{d}/uptime` | Device uptime % + `downtime_intervals` (primary outage source) |
| `getAgentUptime(a,from,to)` | `GET /agent/{a}/uptime` | Collector (WAN) uptime % + intervals |
| `getDeviceEventHistory(a,d,from,to)` | `GET /agent/{a}/device/{d}/history/network/event` | Device `UP/DOWN/IP_CHANGE/CREATED` events (fallback + IP changes) |
| `getAgentEventHistory(a,from,to)` | `GET /agent/{a}/history/network/event` | Collector `CONNECTION_LOST/CONNECTION_RECOVERED` events |
| `getDeviceRtdHistory(a,d,from,to)` | `GET /agent/{a}/device/{d}/history/rtd` | Latency (`min/median/max` ms) + packet loss (`lost/sent_packet_count`) |
| `getNetworkSpeedHistory(a,from,to)` | `GET /agent/{a}/history/network/speed` | Download/upload speed (`values:[downBps, upBps]`) |

All requests go through `withRetry` (`src/lib/resilience.ts`) so 429s/transient errors back off. History calls are **time‑chunked** (30‑day windows merged) because the Domotz default window is one week and large ranges can be capped server‑side. `from`/`to` are ISO‑8601; default window is 90 days.

OpenAPI reference: `GET {DOMOTZ_API_URL}/meta/open-api-definition`.

## Which signal = "the WAN was down"?

A subtlety that matters for ISP reporting:

- The **collector’s** internet connectivity (`/agent/{id}/uptime` + `CONNECTION_LOST/RECOVERED`) is the most direct "the site lost internet" signal — the collector sits behind the same circuit.
- The **gateway device’s** reachability (`/device/{id}/uptime` + `DOWN/UP`) is LAN‑side reachability of that device.

The report uses the **device** signal when a device is selected (the operator explicitly chose the WAN gateway) and the **collector** signal otherwise. It always cross‑reports both uptime numbers, and `meta.outageSource`/`outageSourceLabel` state which signal drove the headline. Override with `?source=agent|device|auto`.

Outages come primarily from the authoritative `downtime_intervals`; if uptime is unavailable, the report falls back to pairing `DOWN→UP` events (handling open boundaries: a leading recovery ⇒ down since window start; a trailing failure ⇒ ongoing).

## API

`GET /api/reports/wan-reliability` — read‑only. Auth: **staff session OR `MIGRATION_SECRET`** (`Authorization: Bearer <secret>` or `?secret=`), same as `tbr-export`.

Params: `agentId` (required), `deviceId`, `days` (default 90, 1–365) or `from`/`to` (ISO), `source` (`auto|agent|device`), `format` (`json|markdown|text|html`), `download=1`, `availability` (default 99.99), `repairHours` (default 4), `instabilityThreshold` (default 3), and site overrides `customer|site|address|gateway|isp|publicIp|device`.

`GET /api/reports/wan-reliability/sites` — staff session. No params ⇒ list collectors (sites); `?q=` filters by name; `?agentId=` ⇒ that site’s devices (likely WAN gateway flagged first).

## UI

`/admin/reporting/wan-reliability` (linked from the Reporting dashboard). Pick a **Site** (typeahead), optional **Device** (auto‑selects the likely gateway), and a **window** (default last 90 days); site details (customer/address/ISP/public IP) are prefilled from Domotz and editable. Buttons: **Generate Report** (printable HTML), **Export Markdown / JSON / TXT**, **Copy to Clipboard**. PDF export is stubbed for later (print the HTML to PDF meanwhile).

## Generating the first live report (XNG – Montrose)

1. Confirm `DOMOTZ_API_KEY` and `DOMOTZ_API_URL` are set in Vercel.
2. Open `https://www.triplecitiestech.com/admin/reporting/wan-reliability`.
3. **Site** → search `Montrose` (or `XNG`) and pick the XNG collector.
4. **Device** → pick the Meraki MX68CW (it should be flagged ★). Leave it on "Circuit (collector connectivity)" to report the raw WAN signal instead.
5. Period → **Last 90 days**. Fill Site details (Customer `Xpress Natural Gas`, Address `3814 North Rd, Montrose, PA`) if not auto‑filled.
6. **Generate Report**, or **Export**/**Copy** for JSON/Markdown/TXT.

PowerShell (using the migration secret), e.g. the plain‑text format:

```powershell
$h = @{ Authorization = "Bearer $env:MIGRATION_SECRET" }
Invoke-RestMethod -Headers $h -Uri "https://www.triplecitiestech.com/api/reports/wan-reliability?agentId=<AGENT_ID>&deviceId=<DEVICE_ID>&days=90&format=text&customer=Xpress%20Natural%20Gas"
```

(Find `<AGENT_ID>`/`<DEVICE_ID>` from `/api/reports/wan-reliability/sites` and `…/sites?agentId=<AGENT_ID>`.)

## Sample output

`docs/reference/samples/xng-montrose-wan-reliability.{json,md,txt}` are **representative synthetic** examples (the build environment has no Domotz credentials) showing the exact report shape — clearly marked as sample data in their Notes. Replace them by running the live report above.
