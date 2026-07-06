# Open Items — answers / inputs needed from Kurtis

Running log of everything outstanding for the calculator. Updated as we go.
Status key: 🔴 blocking · 🟡 confirm · 🟢 resolved (kept for history)

## 2026-06-23 — Step 3 / 4 / 6 rework (Windows PCs, backup, competitive comparison)

- 🟢 **Devices step simplified** — single **Windows PCs** count (workstations + laptops) + optional **PCs to back up** (wires the $100 Endpoint Backup, which previously had no UI input). Macs / shared devices / kiosks removed (not priced).
- 🟢 **Step 4 reworked** — aligned layout; per-server **Type** carries physical / virtual / cloud; **Azure retention** is a single pooled selector shown only when an Azure VM exists (removed the duplicate per-server retention dropdown); per-server **DR + Image-Level default ON**; warning fires if a server needs backup but no method is configured.
- 🟡 **Backup add-on reconciliation — CONFIRM.** Datto SIRIS BCDR is image-based backup *with* cloud DR, so DR + Image-Level are now **scoping toggles included in the SIRIS / Azure line**, and the legacy standalone per-server **DR ($40/$100)**, **Image-Level ($60/$150)** and **retention-upcharge** add-ons are **no longer auto-billed** (kept in `serverAddOns` config for reference). This removes a SIRIS + add-on **double-count**. Tell me if you'd rather re-enable them as separate SKUs.
- 🟢 **Datto pricing model confirmed** — SIRIS 6 ALTO 5 sheet: appliance (S6-2→120) and Virtual (SV-1→120) are **capacity-tier** priced (model = TB ceiling) by term + cloud retention + one-time Device MSRP. **Per-agent** applies only to the smallest units (ALTO 5 / S6-X / S6-X4 min-2) and to Endpoint Backup. We keep capacity-tier sizing (correct for normal sizes).
- 🟢 **Step 6** — default current license = **Business Premium**; One-Time Onboarding fields realigned.
- 🟢 **Competitive cost comparison BUILT** — optional Step 6 "current IT spend" capture (RMM, AV/EDR, backup, network monitoring, email/M365, other tools, internal IT labor). New **Current vs TCT** results tab + executive-summary / PDF block: current monthly spend vs the quote (managed + M365) with monthly/annual delta.

## Blocking (need from you to proceed)

- 🟢 **Datto BCDR PDFs** — SIRIS 6 ALTO 5, SIRIS 6 Private, NAS 6, SIRIS 6 Spec Sheet are in the folder; pricing extracted.
- 🟢 **Datto backup scoping** — answered: 3-yr term; retention 1-yr on-prem / Infinite per-user, expandable; hardware = one-time pass-through; calculator asks qualifying questions to pick the product.
- 🟢 **On-prem SIRIS module BUILT** — Servers step asks protected TB + deployment (Virtual/Appliance) + retention; picks the SIRIS model by TB; cost = monthly service + one-time hardware MSRP; sell = 2×. Flat $129 per-server backup retired.
- 🟢 **Azure / Entra / Endpoint-DR reconciled & built** — Azure banded + retention (adds 4–6 TB), Entra $0.75/user,
  Endpoint Backup w/ DR ($79/$89/$99 per 500 GB) added as a cloud server-backup deployment.
- 🟡 **Workstation backup SKU** — you cited $10 ("Endpoint Backup for PCs"); Datto's "Datto Endpoint Backup" sheet is
  $3 (3-yr)/$6 (1-yr) per endpoint + $0.02/GB over a 250 GB pool. Which do you sell? (Currently $10 cost / $100 sell.)

## Pricing confirmations

- 🟢 **Backup markup 2×** (your floor). Research: industry is 2–3× (50–70% margin); 2× is conservative — can raise later.
- 🟢 **M365 resale = MSRP** — monthly-commitment list (annual ×1.2, eff 7/1/2026): Basic $8.40, Standard $16.80, Premium $26.40, F3 $12.00, F1 $3.60. ⚠️ Confirm monthly vs annual commitment (annual = ÷1.2 on both cost & sell).
- 🟢 **Per-user / per-device sell ladders** — kept as-is (margins shifted, OK per you).
- 🟢 **Per-site cost = $35** (Domotz only). MyITProcess folded into K365 Ops overhead; BSN (Breach Secure Now) retired.
- 🟢 **Co-Managed admin** — cost $50 / sell $150 (was $300). Per-user/device sells unchanged.
- 🟢 **Shared mailbox** — $1.50 cost / $5 sell.
- 🟢 **Workstation backup** — confirmed on Kaseya invoice: "Endpoint Backup for PCs TBR — per license — $10.00". Per Windows PC; servers excluded. $10 cost / $100 sell.
- 🟢 **Frontline bundle** — simplified: frontline = deskless/no-email (anyone needing email is a Standard User). Reduced stack = base Datto EDR + optional Printix; M365 F1 separate. Marked PRELIMINARY (no frontline clients yet).

## Overhead & structure

- 🟢 **Overhead recovery** — left blended (existing base absorbs it; each new client lowers per-customer overhead). No separate quote line; the $250 Business Line floor + margins cover it.
- 🟢 **SaaS Defense** — removed (SaaS Defense → Graphus → INKY).
- 🟢 **Business Line packages** — Comprehensive + Complete + Co-Managed (EasyDMARC + Thread feed it).
- 🟢 **Recommendation rules** — retuned: premium-first lean (baseline toward Comprehensive/Complete); Co-Managed only when 50+ users AND internal IT; compliance floors (any → Comprehensive min, heavy HIPAA/CMMC/DFS → Complete); Basic still recommended for small/simple (≤10, no compliance/security). Engine now supports baseline + hard floors.
- 🟢 **Two Co-Managed offerings — RESOLVED 2026-06-23.** Final design (no 6th package):
  - **(a) TCT Ally** = co-managed, **bill-for-labor**. Renamed the `comanaged` package to "TCT Ally (Co-Managed)". TCT supplies the full tool stack + escalation/after-hours bench; the client's internal IT runs day-to-day support; helpdesk, moves/adds/changes and projects are **billed at $150/hr** (shown as an informational note line, excluded from the monthly total). Recurring: **$40/user, $40/device, $100/server, $150/site, $150 per internal-IT admin seat**. (Per-user/device re-confirmed at $40/$40; server/site/admin carried over — confirm if you want them changed.)
  - **(b) Included support** = **a fully-managed package (e.g. Complete Care) + a new "Co-Managed Tool Access" line** that grants the client's internal IT access to TCT's PSA/docs/tools. Top-level `pricing.comanagedToolAccess` ($50 cost / $150 sell per admin); appears automatically on the managed packages when Discovery has *internal IT staff* + *Co-Managed access*. NOT a separate package.
  - Engine generalized: the access line is config-driven; the Ally hourly note is `pricing.packages.comanaged.hourlyLabor`. Math verified (Ally sample = $1,530/mo; access line attaches to Complete; stays off Basic).
- 🟡 **Co-managed web page** (`/services/co-managed-it`) — the page describes the **shared-help-desk / we-run-day-to-day** model, which now maps to the **managed-package + Co-Managed Tool Access** path (still accurate; no fix needed). It does **not** describe **TCT Ally** (your team runs day-to-day, we supply tools + escalation and bill labor). Recommend **adding a short "two ways to engage" section**: (1) TCT Ally — bill-for-labor bench/tools; (2) Fully managed + co-managed tool access. Want me to draft that copy?

## Branding

- 🟢 **Logo** — using the clean "TCT" cyan wordmark chip (no shield, per your call). Theme = design-system slate `#0f172a` + cyan `#06b6d4`.

## Resolved (history)

- 🟢 Thread = $34/managed customer (AI Pro) in the Business Line.
- 🟢 Per-user cost $4.46 (K365 User $2.79 + Printix $1.67); per-device $5.33 (K365 Endpoint $4.00 + DNS $1.33).
- 🟢 ThreatLocker removed (not used). Dark Web = included in K365 User ($0). RocketCyber/INKY/BullPhish/MyGlue/SaaS Alerts bundled.
- 🟢 DNS Filtering renamed Content Filtering; Graphus→INKY; Keeper→MyGlue; Unlimited Support→Remote Support; Huntress→Datto EDR.
- 🟢 Workstation/endpoint backup $10 cost / $100 sell. EasyDMARC $10/domain.
- 🟢 Catalog reacts to active package + grouped by billing unit. Line-Item Costs tab added.
- 🟢 Linear step-by-step discovery wizard. Internal banner recolored. Azure VM banded backup.
