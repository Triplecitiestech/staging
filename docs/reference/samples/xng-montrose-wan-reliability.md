# WAN Reliability Report — Xpress Natural Gas

_XNG - Montrose · Mar 31, 2026 – Jun 29, 2026 (90 days)_

## Site Information

| Field | Value |
| --- | --- |
| Customer | Xpress Natural Gas |
| Site | XNG - Montrose |
| Address | 3814 North Rd, Montrose, PA |
| Gateway | Cisco Meraki MX68CW |
| ISP | Frontier Communications |
| Public IP | 50.107.49.134 |
| Device monitored | XNG-Montrose-MX68CW (Meraki WAN1 / Frontier DIA) |
| Reporting period | Mar 31, 2026 – Jun 29, 2026 (90 days) |
| Outage signal | Monitored device reachability |
| Report generated | Jun 29, 2026, 1:29 PM EDT |

## WAN Outage History

| # | Date | Start (ET) | End (ET) | Duration |
| ---: | --- | --- | --- | --- |
| 1 | 2026-04-04 | 11:00:00 PM EDT | 11:09:00 PM EDT | 9m |
| 2 | 2026-04-22 | 3:30:00 PM EDT | 3:34:00 PM EDT | 4m |
| 3 | 2026-05-11 | 9:05:00 AM EDT | 9:12:00 AM EDT | 7m |
| 4 | 2026-05-11 | 11:40:00 AM EDT | 11:46:00 AM EDT | 6m |
| 5 | 2026-05-11 | 2:20:00 PM EDT | 2:23:00 PM EDT | 3m |
| 6 | 2026-05-11 | 5:10:00 PM EDT | 5:25:00 PM EDT | 15m |
| 7 | 2026-05-20 | 10:00:00 AM EDT | 2:32:00 PM EDT | 4h 32m |
| 8 | 2026-06-02 | 6:15:00 PM EDT | 6:21:00 PM EDT | 6m |
| 9 | 2026-06-15 | 7:00:00 AM EDT | 7:02:00 AM EDT | 2m |
| 10 | 2026-06-29 | 2:00:00 AM EDT | 2:04:00 AM EDT | 4m |
| 11 | 2026-06-29 | 2:30:00 AM EDT | 2:33:00 AM EDT | 3m |
| 12 | 2026-06-29 | 3:10:00 AM EDT | 3:14:00 AM EDT | 4m |
| 13 | 2026-06-29 | 3:50:00 AM EDT | 3:52:00 AM EDT | 2m |
| 14 | 2026-06-29 | 4:25:00 AM EDT | 4:31:00 AM EDT | 6m |
| 15 | 2026-06-29 | 5:05:00 AM EDT | 5:09:00 AM EDT | 4m |
| 16 | 2026-06-29 | 6:15:00 AM EDT | 6:18:00 AM EDT | 3m |
| 17 | 2026-06-29 | 7:30:00 AM EDT | 7:36:00 AM EDT | 6m |
| 18 | 2026-06-29 | 8:20:00 AM EDT | 8:24:00 AM EDT | 4m |

## Summary Statistics

| Metric | Value |
| --- | --- |
| Total outages | 18 |
| Total downtime | 6h |
| Overall uptime | 99.7222% |
| Longest outage | 4h 32m (2026-05-20) |
| Average outage duration | 20m |
| Median outage duration | 4m |
| Mean Time Between Failures (MTBF) | 4d 23h 40m |
| Mean Time To Repair (MTTR) | 20m |
| Outages in last 30 days | 11 |
| Outages in previous 60 days | 7 |
| Trend | Increasing |

_11 outage(s) in the last 30 days vs 7 in the prior 60 days (≈3.5/30d)._

## Daily Instability

| Date (ET) | Outages | Downtime |
| --- | ---: | --- |
| 2026-06-29 | 9 | 36m |
| 2026-05-11 | 4 | 31m |

## SLA Comparison

| Metric | Value |
| --- | --- |
| Availability SLA | 99.99% |
| Actual uptime | 99.7222% |
| Difference from SLA | -0.2678 pts |
| Availability SLA | ❌ FAIL |
| Repair SLA (MTTR) | 4h target → 20m ✅ PASS |
| Allowed downtime (budget) | 12m 58s |
| Actual downtime | 6h |
| Outages exceeding 4h | 1 |
| Total SLA impact (over budget) | 5h 47m |

## Performance Trends

| Metric | Value |
| --- | --- |
| Average latency | 29.1 ms |
| Median latency | 20 ms |
| Maximum latency | 320 ms |
| Average packet loss | 0.4% |
| Maximum packet loss | 7.5% |
| Average download | 480.8 Mbps |
| Average upload | 500 Mbps |

**Sustained degradation periods:**

- Packet loss: May 20, 2026, 9:00 PM EDT → May 21, 2026, 9:00 AM EDT — avg 7.5% loss over 3 samples
- Latency: May 20, 2026, 9:00 PM EDT → May 21, 2026, 9:00 AM EDT — avg 185ms over 3 samples (baseline ≈20ms)
- Packet loss: Jun 28, 2026, 10:00 AM EDT → Jun 28, 2026, 12:00 PM EDT — avg 3% loss over 3 samples

## Executive Summary

Over the 90-day reporting period, XNG - Montrose experienced 18 WAN outages totaling 6h of downtime, for 99.7222% uptime. Availability fell 0.2678 points short of the 99.99% target, so Frontier Communications did not meet its service-level agreement for this window. Reliability is getting worse: outages in the last 30 days are up versus the prior 60 days. Notable findings: the longest single outage was 4h 32m on 2026-05-20; 1 outage ran longer than the 4-hour repair target; 2 days saw repeated flapping (worst: 9 outages on 2026-06-29); packet loss peaked at 7.5%. Recommendation: open a circuit-quality case with Frontier Communications, citing the outage history and SLA shortfall above, and request a root-cause review for the circuit on 50.107.49.134.

---

**Notes**

- SAMPLE DATA — generated from representative synthetic telemetry to demonstrate the report format; these are NOT live XNG measurements. Generate the live report at /admin/reporting/wan-reliability once Domotz credentials are configured.
- Outage timeline reflects reachability of the monitored device from the on-site Domotz collector.
- Cross-check — collector (WAN) uptime 99.7222%, monitored device uptime 99.7222% (Domotz-reported).

_Generated 2026-06-29T17:29:08.791Z · times shown in America/New_York · data source: Domotz._