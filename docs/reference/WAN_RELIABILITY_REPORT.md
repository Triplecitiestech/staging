# Site Connectivity & Stability Report (formerly "WAN Reliability")

*Added 2026-06-29. Reframed 2026-06-30. Owner: Engineering. Source of truth for the Site Connectivity & Stability report.*

A historical **site connectivity & stability** report for any monitored customer site, generated from the existing Domotz integration. Route/path is still `/admin/reporting/wan-reliability` and `GET /api/reports/wan-reliability` (stable URLs), but the report now honestly represents **what Domotz can actually measure**.

## Why it was reframed (read this first)

The original report claimed "WAN/ISP reliability" with a 99.99% SLA verdict, derived from Domotz **reachability**. That is wrong at any site with **WAN failover** (e.g. a Meraki MX with a Starlink/LTE secondary): when the primary circuit drops, the firewall fails over and the monitored device — and the collector — stay reachable, so Domotz records **no outage**. A confirmed case (XNG – Montrose) logged **10 primary-circuit drops including a 17-minute outage** while this report showed **100% uptime, SLA-compliant**. That is a confident lie.

We do **not** have Meraki Dashboard API access, and Domotz is our only source. Domotz cannot see *which uplink* is carrying traffic, so this report **cannot** truthfully measure per-ISP-circuit reliability at a failover site. The fix was to reframe what it claims and extract every signal Domotz genuinely provides.

## What it measures now

| Section | Signal | Source | Honest meaning |
|---|---|---|---|
| **Headline: full-site outages** | Collector connectivity loss | `GET /agent/{id}/uptime` + `…/history/network/event` (`CONNECTION_LOST/RECOVERED`) | The whole site was unreachable (every uplink down at once / power / collector). NOT per-circuit. |
| **Failover Activity** | `agent_wan_change` (public-IP / ISP change) | Ingested Domotz **webhooks** (`/api/webhooks/domotz`) | The closest thing to "the primary circuit dropped" — surfaced as first-class "N failover events". |
| **Device reachability** (secondary) | Monitored device LAN reachability | `…/device/{id}/uptime` | LAN-side reachability of the gateway — explicitly secondary. |
| **Performance** | Latency / packet loss / speed | `…/device/{id}/history/rtd`, `…/history/network/speed` | Path quality (collector→device, or →external host if monitored). |
| **Data coverage** | Monitored seconds in-window | `uptime.total_seconds` | How much of the requested window we actually have data for. |

**No false negatives:** unless a site is *confirmed single-WAN* (admin override), the report shows a prominent caveat that primary-circuit outages may be masked by failover, and it **never** prints an ISP-SLA pass or "no escalation required" from reachability alone. An SLA verdict is shown **only** for confirmed single-WAN sites (where reachability is a reasonable circuit proxy).

## Architecture

Clean separation (API access → business logic → presentation):

| Layer | File |
|---|---|
| API client (extended, not duplicated) | `src/lib/domotz.ts` |
| Failover-capability detection (pure) | `src/lib/reporting/wan-reliability/failover.ts` |
| Pure analyzer (outages, stats, SLA, coverage, cadence, perf) | `…/analyzer.ts` |
| Pure narrative | `…/executive-summary.ts` |
| Orchestration (live fetch + assembly) | `…/service.ts` |
| Formatters (JSON / Markdown / text / HTML) | `…/format.ts` |
| Webhook ingestion + queries + per-site override | `src/lib/domotz-events.ts` |
| Report API + sites/override API | `src/app/api/reports/wan-reliability/{route,sites/route}.ts` |
| Webhook receiver | `src/app/api/webhooks/domotz/route.ts` |
| UI | `src/app/admin/reporting/wan-reliability/` + `src/components/reporting/WanReliabilityGenerator.tsx` |

Unit tests: `…/analyzer.test.ts` (`npm test`).

## Failover-capability detection (per-site, config-driven)

`assessFailoverCapability()` decides whether to show the masking caveat:
1. **Admin override** (persisted in `domotz_site_settings`, set via the UI / `POST /api/reports/wan-reliability/sites`) wins: `single_wan` (caveat off, SLA on) or `failover_capable`.
2. Otherwise **infer from the gateway model/vendor** — Meraki MX, SonicWall, FortiGate, Palo Alto, WatchGuard, Peplink, Cradlepoint, Ubiquiti UDM/USG/EdgeRouter, pfSense/OPNsense, DrayTek, SD-WAN → `failover_capable`.
3. Otherwise `unknown` — still caveated. Caveat is OFF only for admin-confirmed `single_wan`.

## Failover detection requires webhook ingestion (Phase 2)

`agent_wan_change` (and `agent_status`, etc.) are **webhook-only** in the Domotz API — verified against the OpenAPI spec, they are `callbacks`, not retrievable from any GET history endpoint. So failover detection needs ingestion:

- **Receiver:** `POST /api/webhooks/domotz` (token via `DOMOTZ_WEBHOOK_TOKEN`; always-200 so Domotz doesn't disable the channel; 401 only on token mismatch). Mirrors the SaaS-Alerts receiver.
- **Storage:** reuses the existing `compliance_webhook_events` sink (`source='domotz'`) — no new event table, no migration.
- **Per-site override:** raw-pg `domotz_site_settings` table, created lazily by `ensureDomotzSiteSettings()` (raw-pg subsystem pattern — NOT the Prisma migration route).

**Operator setup (one-time per Domotz account):**
1. Domotz Portal → Account → Webhooks: add a webhook channel to `https://www.triplecitiestech.com/api/webhooks/domotz?token=<DOMOTZ_WEBHOOK_TOKEN>`.
2. Bind an Alert Profile to the collectors covering "WAN/Public IP changed" and "Collector up/down".
3. Set `DOMOTZ_WEBHOOK_TOKEN` in Vercel to the same value.

Until enabled, the report states failover detection is unavailable for the site (it does not silently imply health).

## Edge cases handled
- **Window > retained data:** coverage is measured from `uptime.total_seconds`; the report states "covers X of Y days" and never implies a clean record over a span with no data.
- **Cadence artifacts:** if outage durations cluster at one value, it's flagged as the poll interval, not real duration.
- **Collector down vs site down:** device reachability during collector-down spans is marked a blind spot, not "up".
- **Multi-tenant:** all logic keys off the per-agent detected config + override; nothing is hardcoded per customer.

## The ceiling — what this report CANNOT answer (without Meraki/per-uplink data)
- Per-uplink / per-circuit uptime, or true ISP-circuit SLA at a failover site.
- The **duration** a primary circuit was down (we see the failover *change events*, not a per-circuit down timer — pairing out→back is a future enhancement).
- Bandwidth/utilization per uplink, or brownout-vs-hard-drop on a specific WAN.

Closing the gap requires the Meraki Dashboard API (ruled out) or richer per-uplink telemetry.

## Running it
`/admin/reporting/wan-reliability` → pick the **Site** (collector) → optional **Device** (gateway; drives failover detection + performance) → set **WAN configuration** (auto / single-WAN / has-failover) → window (default 90 days) → **Generate** / Export (MD/JSON/TXT) / Copy.

PowerShell (text format, via the migration secret):
```powershell
$h = @{ Authorization = "Bearer $env:MIGRATION_SECRET" }
Invoke-RestMethod -Headers $h -Uri "https://www.triplecitiestech.com/api/reports/wan-reliability?agentId=<AGENT_ID>&deviceId=<DEVICE_ID>&days=90&format=text"
```

## Sample output
`docs/reference/samples/xng-montrose-wan-reliability.{json,md,txt}` are **representative synthetic** examples (no Domotz creds in the build sandbox), modelling the honest Montrose case — failover-capable, collector reachable, 10 detected failovers, SLA suppressed. Clearly labelled as sample data.
