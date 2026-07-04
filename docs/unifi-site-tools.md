# UniFi Site Tools — MCP Connector Reference

*Added 2026-07-04. Modules: `src/lib/ubiquiti-proxy.ts` (typed proxy client), `src/lib/mcp-unifi-site-tools.ts` (tools), `src/lib/connector/unifi-staged-writes.ts` + `staged-writes-core.ts` (tier-2 gate). The five aggregate Site Manager tools (`unifi_list_sites/hosts/devices/summary/site_networks`) are unchanged.*

## Connection model

Every tool reaches each console's **local Network Integration API from the cloud** through Ubiquiti's **Cloud Connector Proxy**:

```
GET https://api.ui.com/v1/hosts                                       → console inventory
GET https://api.ui.com/v1/connector/consoles/{consoleId}
      /proxy/network/integration/v1/sites/{siteId}/...                → local API
```

Same `x-api-key` (`UBIQUITI_API_KEY`) as the existing aggregate tools. No LAN path, no per-console credentials, no tunnels — that architecture is rejected. Documented proxy limits: **100 requests/min per console** (429 + `Retry-After`, honored automatically for short waits), 25 s proxied-request timeout (408), 10 MB response cap. ~800 ms added latency per call.

**Firmware floor**: the full tool surface needs the console's **Network app ≥ 10.1.84** (firewall policies, DNS policies, adopt/forget landed there; networks/WLANs/zones/ACL at 10.0.162; devices/clients/vouchers since 9.1). Consoles below that fail with a typed `FIRMWARE_UNSUPPORTED` error naming the console — an expected, common case across TCT's fleet, and the reason `unifi_probe_consoles` / `scripts/probe-unifi-consoles.ts` exist.

The tool surface is **exactly what the official Integration API documents** (verified against Ubiquiti's OpenAPI spec, version 10.1.84, July 2026). Nothing falls back to the internal/undocumented controller API.

## Guardrails (structural, not advisory)

1. **One site at a time.** Every write tool's schema takes exactly one `consoleId`, one `siteId`, one target id — plain strings, no arrays, no wildcards. Mass/multi-site changes are done by a human in unifi.ui.com. Pinned by unit test (`mcp-unifi-site-tools.test.ts`: no `ZodArray` anywhere, no plural-target fields).
2. **Kill switch.** `CONNECTOR_UNIFI_WRITES_ENABLED` must be exactly `'true'` or **both** tiers refuse (staging included). Reads are unaffected. Independent of the Autotask `CONNECTOR_CONFIG_WRITES_ENABLED`.
3. **Tier 2 cannot self-approve.** Staged changes execute only after a human approves at `/admin/connector/staged-writes` (staff session + `system_settings`) — the MCP OAuth token cannot authenticate there. Single-use atomic claim, TTL expiry, drift check against the live object before writing, permanent audit row. Same `ConnectorStagedWrite` table and admin UI as the Autotask gate.
4. **Secrets never surface or persist.** All reads and all stored snapshots pass `redactSecrets()` (WLAN passphrases, PPSK keys, RADIUS secrets, VPN keys → `[REDACTED]`). This is also why WLAN **create** and passphrase changes are not offered (see Omitted).
5. **Failures are typed, never silent.** The proxy client throws `UnifiProxyError` with a code — `AUTH_FAILED` (401/403), `CONSOLE_OFFLINE` (502/503/504), `FIRMWARE_UNSUPPORTED` (404/501 on the capability probe), `NOT_FOUND`, `RATE_LIMITED` (+`Retry-After`), `TIMEOUT` (incl. the proxy's 408), `BAD_REQUEST`, `UPSTREAM_ERROR`. An offline console reads as offline, never as "this site has zero clients".

## Workflow

`unifi_resolve_site("customer name")` → consoleId + siteId → any read → (writes: confirm the exact target with the user) → tier 1 direct, or tier 2 stage → human approves → `unifi_execute_staged_write`.

## Tools

### Resolution & fleet health (read-only)

| Tool | What it does | Guardrail |
|---|---|---|
| `unifi_resolve_site` | Fuzzy site/customer name → `consoleId` + `siteId` (cached `/v1/hosts` + proxied `/sites`) | Returns candidates on ANY ambiguity (multiple consoles, word-only match, multi-site console) — never guesses |
| `unifi_console_capabilities` | One console: Network app version, Integration API reachability, local sites | Diagnostic for typed failures; read-only |
| `unifi_probe_consoles` | Fleet sweep bucketing every console by typed failure → firmware remediation list | Read-only; bounded concurrency (6) under the per-console rate limit |

### Per-site reads (all: one `consoleId` + one `siteId`; secrets redacted; paginated with explicit `truncated` flag)

| Tool | Surface (official API path) |
|---|---|
| `unifi_site_devices` | Adopted devices: name/model/MAC/IP/state/firmware (`/devices`) |
| `unifi_device_details` | One device: port table (PoE, speed), radios, uplink, firmware updatable (`/devices/{id}`) |
| `unifi_device_statistics` | One device: uptime, CPU/mem %, load, uplink tx/rx (`/devices/{id}/statistics/latest`) |
| `unifi_pending_devices` | Console-level adoption queue (`/pending-devices`) |
| `unifi_site_clients` | Connected clients: type WIRED/WIRELESS/VPN/TELEPORT, IP/MAC, connectedAt (`/clients`) |
| `unifi_client_details` | One client in detail (`/clients/{id}`) |
| `unifi_site_networks_config` | Local networks/VLANs: vlanId, management, DHCP guarding (`/networks`) |
| `unifi_network_references` | What references one network — run before staging a delete (`/networks/{id}/references`) |
| `unifi_site_wlans` | SSIDs: security type, network binding, isolation — passphrases `[REDACTED]` (`/wifi/broadcasts`) |
| `unifi_site_firewall_zones` | Zone-based firewall zones (`/firewall/zones`) |
| `unifi_site_firewall_policies` | Policies: action/zones/filters/logging (`/firewall/policies`, ≥ 10.1.84) |
| `unifi_firewall_policy_details` | One policy in full (`/firewall/policies/{id}`) |
| `unifi_firewall_policy_ordering` | READ evaluation order for one zone pair (`/firewall/policies/ordering`) |
| `unifi_site_acl_rules` | L2/switch ACL rules (`/acl-rules`) |
| `unifi_site_dns_policies` | Local DNS records/policies (`/dns/policies`, ≥ 10.1.84) |
| `unifi_site_traffic_matching_lists` | Port/IP lists used by policies (`/traffic-matching-lists`) |
| `unifi_site_vouchers` | Hotspot vouchers (`/hotspot/vouchers`) |
| `unifi_site_wan_vpn_radius` | WAN identities, VPN s2s tunnels + servers, RADIUS profiles — per-section typed errors (`/wans`, `/vpn/*`, `/radius/profiles`) |

### Tier 1 — direct writes, attributed (gated by `CONNECTOR_UNIFI_WRITES_ENABLED`)

Immediate execution; the signed-in tech's email is required and logged (structured `connector_unifi_tier1_write` log line with correlation id); descriptions instruct the model to confirm the exact target with the user first.

| Tool | Action (official) | Single target |
|---|---|---|
| `unifi_restart_device` | `POST /devices/{id}/actions {action: RESTART}` | one device |
| `unifi_power_cycle_port` | `POST /devices/{id}/interfaces/ports/{portIdx}/actions {action: POWER_CYCLE}` | one PoE port on one switch |
| `unifi_authorize_guest` | `POST /clients/{id}/actions {action: AUTHORIZE_GUEST_ACCESS, …limits}` | one client |
| `unifi_unauthorize_guest` | `POST /clients/{id}/actions {action: UNAUTHORIZE_GUEST_ACCESS}` | one client |
| `unifi_create_hotspot_voucher` | `POST /hotspot/vouchers` | one site, count hard-capped at 10 |
| `unifi_delete_hotspot_voucher` | `DELETE /hotspot/vouchers/{id}` | one voucher (bulk delete-by-filter deliberately not exposed) |

### Tier 2 — staged config writes (human-approved; same kill switch)

`unifi_stage_config_write` (never writes) → approve at `/admin/connector/staged-writes` → `unifi_execute_staged_write` (drift-checked, single-use). Plus `unifi_list_staged_writes` / `unifi_cancel_staged_write`. Updates execute as **GET→merge→PUT**: the live object is re-read and only the approved fields change — the Integration API replaces objects on PUT, so partial writes would otherwise wipe config.

| Area | Operations | Risk | Writable fields (verified against OpenAPI 10.1.84) |
|---|---|---|---|
| `unifi_firewall_policy` | create/update/delete | **high** | enabled, name, description, action, source, destination, ipProtocolScope, connectionStateFilter, ipsecFilter, loggingEnabled, schedule |
| `unifi_firewall_zone` | create/update/delete¹ | **high** | name, networkIds² |
| `unifi_network` | create/update/delete³ | **high** | management, name, enabled, vlanId, dhcpGuarding, isolationEnabled |
| `unifi_wlan` | update/delete only⁴ | **high** | name, enabled, hideName, clientIsolationEnabled, uapsdEnabled, multicastToUnicastConversionEnabled |
| `unifi_acl_rule` | create/update/delete | **high** | type, enabled, name, description, action, enforcingDeviceFilter, index, sourceFilter, destinationFilter |
| `unifi_dns_policy` | create/update/delete | medium | type, enabled, domain + record fields (ipv4Address, ipv6Address, targetDomain, mailServerDomain, priority, text, serverDomain, service, protocol, port, weight, ipAddress, ttlSeconds) |
| `unifi_traffic_matching_list` | create/update/delete | medium | type, name, items |
| `unifi_device_adoption` | create (adopt) / delete (forget) | **high** | macAddress, ignoreDeviceLimit |

¹ The API only allows deleting custom zones. ² A zone's member-network list is that one zone's content, not a multi-site target. ³ Network deletes are staged **without** the API's `force` flag, and staging auto-reads `/references` and stamps a warning into the approval card when other objects still reference the network. ⁴ See Omitted for why WLAN create is absent.

## Omitted — with reasons

| Requested capability | Why it is absent |
|---|---|
| Locate / LED blink | Not in the official Integration API — device action enum is `RESTART` only (verified 10.3.58) |
| Client block / unblock / force-reconnect | Not in the official API — client action enum is `AUTHORIZE_GUEST_ACCESS` / `UNAUTHORIZE_GUEST_ACCESS` only |
| Port forwards (read or write) | Not in the official API |
| Static routes / policy routing | Not in the official API |
| Site health / WAN / ISP metrics, traffic statistics | Not in the official *local* API (only per-device latest stats; `/wans` returns id+name only). ISP metrics live in the separate cloud Site Manager API — candidate for a future read tool |
| Events / alarms | Not in the official API |
| Port profiles | Not in the official API |
| Site / gateway settings | Not in the official API |
| Firmware update trigger | Not in the official API (only the `firmwareUpdatable` flag is readable) |
| WLAN **create** | The API requires `securityConfiguration` on create, which carries the passphrase — the gate must never persist a secret in the audit row. Create SSIDs in unifi.ui.com; manage them here afterwards |
| WLAN passphrase change | Same reason — the proposed value would sit in the `ConnectorStagedWrite` audit table |
| Firewall policy / ACL reordering (write) | The ordering endpoint takes a full ordered id **array** — multi-target by construction, which conflicts with the single-target rule. Order is readable via `unifi_firewall_policy_ordering`; reorder in unifi.ui.com |
| Bulk voucher delete-by-filter | Mass-change vector; only single-voucher delete is exposed |

## Operations notes

- **Firmware remediation list**: run `unifi_probe_consoles` from Claude, or in PowerShell:
  `$env:UBIQUITI_API_KEY = "<key>"; npx tsx scripts/probe-unifi-consoles.ts -- --out unifi-probe-report.md`
  Non-OK buckets (`FIRMWARE_UNSUPPORTED`, `CONSOLE_OFFLINE`, …) are the consoles to update/fix; the script exits 2 when remediation is needed.
- **Enable writes**: set `CONNECTOR_UNIFI_WRITES_ENABLED=true` in Vercel env vars (Production) and redeploy. Leave unset/false to keep the connector read-only for UniFi.
- **Approvals**: same admin queue as Autotask config writes — `https://www.triplecitiestech.com/admin/connector/staged-writes` (UniFi rows carry `high`/`medium` risk badges).
- No new database tables or columns — the gate reuses `connector_staged_writes` (UniFi targets ride in `entityPath` as `consoles/{consoleId}/sites/...`; `entityId` stays null because UniFi ids are strings).
