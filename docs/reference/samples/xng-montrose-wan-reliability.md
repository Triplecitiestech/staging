# Site Connectivity & Stability — Xpress Natural Gas

_XNG - Montrose · Mar 31, 2026 – Jun 29, 2026 (90 days)_

> ⚠️ **Read first**
> - SAMPLE DATA — synthetic telemetry through the real pipeline to demonstrate the report; NOT live XNG measurements. Generate the live report at /admin/reporting/wan-reliability.
> - This site has WAN failover (Cisco Meraki MX (WAN2 / integrated cellular failover)). When the primary ISP circuit drops and the firewall fails over to a secondary uplink, the site stays reachable — so primary-circuit outages are NOT visible to this monitoring and will NOT appear in the connectivity history below. A clean connectivity record here does NOT mean the ISP circuit was healthy. See "Failover Activity" below for failovers detected from public-IP/ISP changes.

## Site Information

| Field | Value |
| --- | --- |
| Customer | Xpress Natural Gas |
| Site | XNG - Montrose |
| Address | 3814 North Rd, Montrose, PA |
| Gateway | Cisco Meraki MX68CW |
| WAN configuration | Failover-capable — Cisco Meraki MX (WAN2 / integrated cellular failover) |
| ISP (current) | Frontier Communications |
| Public IP (current) | 50.107.49.134 |
| Device monitored | XNG-Montrose-MX68CW |
| Measured signal | On-site collector connectivity (whole-site reachability) |
| Data coverage | 90 of 90 days |
| Report generated | Jun 30, 2026, 10:37 AM EDT |

## Failover Activity (primary-circuit drop evidence)

_Failover detection active across the full window. 10 failover event(s) detected._

| # | Date | Time (ET) | From ISP/IP | To ISP/IP |
| ---: | --- | --- | --- | --- |
| 1 | 2026-04-04 | 11:00:00 PM EDT | Frontier Communications (50.107.49.134) | SpaceX Starlink (100.64.12.7) |
| 2 | 2026-04-22 | 3:30:00 PM EDT | SpaceX Starlink (100.64.12.7) | Frontier Communications (50.107.49.134) |
| 3 | 2026-05-11 | 9:05:00 AM EDT | Frontier Communications (50.107.49.134) | SpaceX Starlink (100.64.12.7) |
| 4 | 2026-05-11 | 2:20:00 PM EDT | SpaceX Starlink (100.64.12.7) | Frontier Communications (50.107.49.134) |
| 5 | 2026-05-20 | 10:00:00 AM EDT | Frontier Communications (50.107.49.134) | SpaceX Starlink (100.64.12.7) |
| 6 | 2026-05-20 | 10:17:00 AM EDT | SpaceX Starlink (100.64.12.7) | Frontier Communications (50.107.49.134) |
| 7 | 2026-06-02 | 6:15:00 PM EDT | Frontier Communications (50.107.49.134) | SpaceX Starlink (100.64.12.7) |
| 8 | 2026-06-15 | 7:00:00 AM EDT | SpaceX Starlink (100.64.12.7) | Frontier Communications (50.107.49.134) |
| 9 | 2026-06-29 | 2:00:00 AM EDT | Frontier Communications (50.107.49.134) | SpaceX Starlink (100.64.12.7) |
| 10 | 2026-06-29 | 4:25:00 AM EDT | SpaceX Starlink (100.64.12.7) | Frontier Communications (50.107.49.134) |

## Full-Site Outages (collector lost all connectivity)

_No full-site connectivity loss recorded in the covered window._

## Connectivity Summary

| Metric | Value |
| --- | --- |
| Full-site outages | 0 |
| Total time unreachable | 0s |
| Site connectivity uptime | 100% |
| Longest outage | — |
| Average / median outage | — / — |
| MTBF / MTTR | — / — |
| Outages last 30 / prev 60 days | 0 / 0 |
| Trend | Stable |

## Monitored Device Reachability (secondary, LAN-side)

Device: **XNG-Montrose-MX68CW** · reachability uptime **100%** · 0 reachability drop(s).

## Days With Repeated Drops

_No day had 3 or more full-site outages._

## SLA Comparison

_No ISP-circuit SLA verdict: this site has WAN failover, so reachability does not measure the primary circuit. Use Failover Activity below and the ISP’s own reporting for circuit compliance._

## Performance Trends

| Metric | Value |
| --- | --- |
| Average / median / max latency | 27 ms / 20 ms / 320 ms |
| Average / max packet loss | 0.32% / 7.5% |
| Average download / upload | 500 / 500 Mbps |

**Sustained degradation:**

- Packet loss: May 20, 2026, 9:00 PM EDT → May 21, 2026, 9:00 AM EDT — avg 7.5% loss over 3 samples
- Latency: May 20, 2026, 9:00 PM EDT → May 21, 2026, 9:00 AM EDT — avg 185ms over 3 samples (baseline ≈20ms)

## Executive Summary

Over the 90-day period, XNG - Montrose stayed continuously reachable to our on-site monitoring (100% connectivity), with no full-site outages recorded. This site has WAN failover (Cisco Meraki MX (WAN2 / integrated cellular failover)), so this connectivity figure does NOT measure the primary Frontier Communications circuit — a primary outage that failed over keeps the site reachable and is invisible here. Domotz did detect 10 failover event(s) (public-IP/ISP changes) in the covered period — direct evidence the primary circuit dropped at least that many times. Notable: packet loss peaked at 7.5%. Recommendation: if Frontier Communications is the primary uplink, open a circuit-quality case citing the 10 failover event timestamps below; reachability alone understates the impact.

---

**Notes**

- Headline reflects the on-site collector’s connectivity (the whole site being unreachable). Device reachability, where shown, is a LAN-side signal — neither measures a single ISP circuit at a failover site.
- Cross-check — collector connectivity 100%, monitored device reachability 100% (Domotz-reported).

_Generated 2026-06-30T14:37:12.201Z · times in America/New_York · data source: Domotz (reachability + ingested failover webhooks)._