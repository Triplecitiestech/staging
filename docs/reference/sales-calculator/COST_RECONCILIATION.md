# Cost Reconciliation — Calculator vs. Vendor Invoices

Working document to keep the calculator's costs matched to what TCT actually pays.
Sources reconciled so far: **Kaseya consolidated invoice CI_1864641 (Jun 2026)** + Kurtis's
clarifications. Outstanding: **Pax8 invoice** (DNS Filter, Printix, Domotz).

Line-item costs live in `src/config/costs.json` (visible in the app under **Line-Item Costs**).
Quote math uses the bundle totals in `pricing.json`; the goal is for each bundle cost to
reconcile to the ledger.

## How the stack actually bills (corrected)

**Kaseya 365 Endpoint — ~$4.00 / device.** Covers RMM, AV, EDR, Ransomware Detection, and
RocketCyber SOC. The invoice shows two lines (Endpoint Pro $3.99 and Endpoint Pro "Upgrade"
$4.02, 130 each); that is a Kaseya billing quirk — a second 130-endpoint batch booked as an
"upgrade," not an add-on. Treat endpoint as ~$4.00 each, not $8.

**Kaseya 365 User — $2.79 / user.** Bundle that includes SaaS Protection (M365 backup),
SaaS Alerts, INKY, BullPhish (Security Awareness + Phishing Simulation), MyGlue, and Dark Web ID.
The **only** per-user item billed outside this bundle is **Printix** (Pax8).

**Pax8** bills DNS Filter (Content Filtering), Printix, and Domotz. Need the Pax8 invoice to
confirm those unit costs (worksheet values: DNS $1.33, Printix $1.59, Domotz $23).

**On-prem servers** back up via **S5X Infinite Cloud at $129 / agent** — confirmed correct.

**Workstation backup** is **Endpoint Backup for PCs at $10 / device** — only for PCs we back up.

## Corrected per-unit costs

| Unit | Build-up | Cost |
|---|---|---|
| Per device (managed) | Kaseya 365 Endpoint $4.00 + DNS Filter $1.33 (Pax8) | ~$5.33 |
| Per user (managed) | Kaseya 365 User $2.79 + Printix $1.59 (Pax8) | ~$4.38 |
| Per device backup (optional) | Endpoint Backup for PCs | $10.00 |
| Per server (on-prem backup) | S5X Infinite Cloud / agent | $129.00 |
| Per site | Domotz $23 (Pax8) + MyITProcess (verify) + BSN (verify) | TBD |

Net effect vs. the original seed: **per-device cost was about right (~$5.33)**; **per-user
cost should drop to ~$4.38** (the old $5.04 double-counted SaaS Protection $1.95 and still
carried Huntress $1.50, both now removed/bundled).

## Resolved this round

- ThreatLocker — **removed from the calculator** (not used).
- Dark Web — moved to **per user (included in Kaseya 365 User)**; the separate per-domain
  charge has been turned off.
- RocketCyber, INKY, BullPhish, SaaS Protection, SaaS Alerts, MyGlue, Dark Web — all marked
  **included in their Kaseya bundle ($0 incremental)** in the ledger.
- Endpoint Pro "Upgrade" line — treated as the same ~$4 endpoint cost (billing quirk).

## Still open

- **Pax8 invoice** to confirm DNS Filter, Printix, Domotz unit costs.
- **Endpoint (workstation) backup** — needs a sell price and a calculator option to flag which
  workstations are backed up at $10/device cost.
- **Per-site cost** — confirm Domotz + whether MyITProcess is inside Kaseya 365 Ops + BSN tiers.
- **Item 5 (overhead, ~$1,518/mo):** Kaseya 365 Ops $714 (6 × $119) + MSP Success Pro $804.30.
  Cost-to-serve, not per customer — decide recovery (per-seat uplift or client minimum). [for discussion]
- **Item 6 (overage SKUs):** SaaS Protection Archive $1.50 and SaaS Alert overage $0.60 are
  per-some-users overages, not base costs. [for discussion]
- **Apply corrected costs to `pricing.json`?** Per-user bundle cost should move ~5.04 -> ~4.38.
  Awaiting your go-ahead (margins will shift).

## Process

Drop each vendor's latest invoice into the **Vendor Invoices** folder (Kaseya done; Pax8 next).
For each, I confirm the per-unit cost, clear the `verify` flags in `costs.json`, and reconcile
`pricing.json`. Once the ledger is locked we can have the quote engine derive bundle costs
directly from the ledger — one source of truth, no silent drift.

---

## Round 2 — Pax8, Domotz & Thread invoices reconciled (applied to the calculator)

**Confirmed costs now in the calculator:**

- **Per device = $5.33** — Kaseya 365 Endpoint $4.00 + DNS Filter $1.33 (Pax8 $1.3289).
- **Per user = $4.46** — Kaseya 365 User $2.79 + Printix $1.67 (Pax8 confirms $1.67, not $1.59).
- **Microsoft 365 (Pax8 NCE):** Basic cost $6.34 / sell $7.20, Standard $11.55 / $12.50, Premium $23.23 / $26.40.
- **Domotz $35/agent (site)** (was $23).
- **On-prem server backup = S5X Infinite Cloud $129/agent.**
- **Workstation backup = Endpoint Backup $10/device**, sells for **$100/device** (new discovery field "Workstations to Back Up").
- **Shared mailboxes = $1.50 cost (SaaS Protection archive)**, sells for **$5 each** (new discovery field).
- **EasyDMARC = $10/domain** (Pax8), recovered through the Business Line.

**New: Business Line (per-company "cost to play").** Applied to Complete + Co-Managed. Price =
**max($250 floor, 2 × company cost)**, where company cost = Thread allocation + EasyDMARC × domains.
Example: 2 domains → cost $45 → price $250 (floor). 20 domains → cost $225 → price $450.

**Dark Web** is now per-domain but **$0 (included in Kaseya 365 User)** — the old separate
per-domain charge has been removed.

**Still open (your call):**
- **Thread per-company allocation.** Thread is really ~$500/mo for 10 TCT seats (AI Pro $32 +
  Chat $5 + Voice $13). I put a $25/company placeholder in the Business Line — tell me what to
  recover per client (or whether Thread should stay pure overhead).
- **Server-backup sell price** — set to $258 (~2× the $129 S5X cost). Confirm.
- **M365 resale prices** — defaulted to Pax8 retail. Confirm your sell.
- **Item 5 (overhead).** Kaseya 365 Ops $714 + MSP Success Pro $804.30 + Thread $500 ≈ **$2,018/mo**
  cost-to-serve. Decide recovery (per-seat uplift or client minimum). [for discussion]
- **Item 6 (overage SKUs).** SaaS Protection Archive ($1.50) is the shared-mailbox cost (now used);
  SaaS Alert overage ($0.60) is minor. [for discussion]

---

## Round 3 — Datto backup fully reconciled & built (2026 USD sheets)

All built into the calculator and verified:

- **On-prem SIRIS BCDR** — by protected TB × retention (1yr/7yr/Infinite) × 3-yr term, + one-time hardware MSRP
  (appliance). Deployments: SIRIS Virtual, SIRIS Appliance, and Endpoint Backup w/ DR (cloud, $79/$89/$99 per 500 GB used).
  Picks the smallest model that fits. Sell = 2× cost; hardware passed through one-time.
- **Azure VM backup** — banded by combined provisioned TB + retention: ≤1 $174 / 1–2 $340 / 2–4 $480 / 4–6 $610 (1-yr);
  7-yr $195/$380/$538/$685; Infinite $208/$408/$576/$733. Max 7 VMs / 6 TB per subscription. Sell = 2×.
- **Entra ID backup** — $0.75/user (400-license min pool at TCT level). Optional per standard user; sell 2× = $1.50.
- **Workstation backup** — kept at $10 cost / $100 sell.

Verified: 10 TB appliance → S6-12 $1,044→$2,088 + $8,804 hardware; Azure 1.5 TB Infinite → $408→$816;
Entra 10 users → $15; cloud-DR 2 TB → 4×$79=$316→$632.

**One open question:** workstation/endpoint backup — you cited **$10** ("Endpoint Backup for PCs", matches the Kaseya
invoice), but Datto's **"Datto Endpoint Backup"** sheet is **$3 (3-yr) / $6 (1-yr) per endpoint** + $0.02/GB over a
250 GB pool. These look like two different SKUs. Which do you sell? (Currently $10 cost / $100 sell.)
