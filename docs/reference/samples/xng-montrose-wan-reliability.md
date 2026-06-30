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
| Report generated | Jun 30, 2026, 11:20 AM EDT |

## Failover Activity (estimated primary-circuit drops)

_Failover detection active across the full window. 20 WAN-change event(s) ingested._

**10 failover episode(s)** · estimated primary-circuit downtime **1h 4m** · longest **17m**

| # | Start (ET) | End (ET) | Duration | Failed over to |
| ---: | --- | --- | --- | --- |
| 1 | Apr 4, 2026, 11:00 PM EDT | Apr 4, 2026, 11:09 PM EDT | 9m | SpaceX Starlink |
| 2 | Apr 22, 2026, 3:30 PM EDT | Apr 22, 2026, 3:34 PM EDT | 4m | SpaceX Starlink |
| 3 | May 11, 2026, 9:05 AM EDT | May 11, 2026, 9:12 AM EDT | 7m | SpaceX Starlink |
| 4 | May 11, 2026, 2:20 PM EDT | May 11, 2026, 2:23 PM EDT | 3m | SpaceX Starlink |
| 5 | May 20, 2026, 10:00 AM EDT | May 20, 2026, 10:17 AM EDT | 17m | SpaceX Starlink |
| 6 | Jun 2, 2026, 6:15 PM EDT | Jun 2, 2026, 6:21 PM EDT | 6m | SpaceX Starlink |
| 7 | Jun 15, 2026, 7:00 AM EDT | Jun 15, 2026, 7:02 AM EDT | 2m | SpaceX Starlink |
| 8 | Jun 29, 2026, 2:00 AM EDT | Jun 29, 2026, 2:04 AM EDT | 4m | SpaceX Starlink |
| 9 | Jun 29, 2026, 4:25 AM EDT | Jun 29, 2026, 4:31 AM EDT | 6m | SpaceX Starlink |
| 10 | Jun 29, 2026, 7:30 AM EDT | Jun 29, 2026, 7:36 AM EDT | 6m | SpaceX Starlink |

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

Over the 90-day period, XNG - Montrose stayed continuously reachable to our on-site monitoring (100% connectivity), with no full-site outages recorded. This site has WAN failover (Cisco Meraki MX (WAN2 / integrated cellular failover)), so this connectivity figure does NOT measure the primary Frontier Communications circuit — a primary outage that failed over keeps the site reachable and is invisible here. Domotz detected 10 failover episode(s) — an estimated 1h 4m of primary-circuit downtime (longest 17m) — direct evidence the primary circuit dropped. Notable: packet loss peaked at 7.5%. Recommendation: if Frontier Communications is the primary uplink, open a circuit-quality case citing the 10 failover episode(s) and ~1h 4m of estimated primary downtime below; reachability alone understates the impact.

---

**Notes**

- Headline reflects the on-site collector’s connectivity (the whole site being unreachable). Device reachability, where shown, is a LAN-side signal — neither measures a single ISP circuit at a failover site.
- Cross-check — collector connectivity 100%, monitored device reachability 100% (Domotz-reported).

_Generated 2026-06-30T15:20:56.476Z · times in America/New_York · data source: Domotz (reachability + ingested failover webhooks)._