# TCT Sales Calculator — Session Handoff

Paste this into a new Cowork session to continue. It captures the full state of the
Triple Cities Tech Managed Services Sales Calculator as of June 2026.

---

## 1. What this is & where it lives

An internal, config-driven web app (Next.js 14 + TypeScript + Tailwind) for building
managed-services quotes. Sales/AM/leadership use it to run discovery, price 5 packages,
see margins, get a recommended tier, and export proposals.

- **Project folder:** `…\Sales - Documents\General\Calculator\tct-sales-calculator\`
- **Run it:** double-click **`Start-Calculator.cmd`** (installs deps first run, waits for the
  server, opens http://localhost:3000). If it acts up after edits, use **`Restart-Clean.cmd`**
  (clears the `.next` cache). Requires Node.js 18.18+.
- **Vendor invoices** (cost source of truth): `…\Calculator\Vendor Invoices\`
- **Datto backup pricing PDFs + extracts:** `…\Calculator\Datto Backup Pricing\`

## 2. How to edit it (all config-driven — no code changes for pricing)

Everything money/packaging lives in `src/config/`:

- `pricing.json` — **single source of truth for money**: per-package per-unit cost/price,
  M365 licenses, server add-ons, Azure backup bands, `dattoBackup` (SIRIS), `businessLine`,
  `frontline`, `sharedMailbox`, `endpointBackup`, `entraBackup`.
- `services.json` — service catalog (internal product/vendor + external capability + per-package inclusion).
- `costs.json` — vendor cost ledger (the **Line-Item Costs** tab) for verification + overhead section.
- `packages.json` — package names (renameable, no code change), codenames, license requirements.
- `recommendation.json` — recommendation scoring (baseline lean, rules, floors, tie-breaks).
- `theme.json` + `app.config.json` — branding (slate/cyan, "TCT" wordmark) + dropdown options/labels.

Reference docs in the project root: `CLAUDE_DEPLOYMENT_INSTRUCTIONS.md`, `PRICING_REVIEW_NOTES.md`,
`COST_RECONCILIATION.md`, `OPEN_ITEMS.md` (the running answer log), and this `HANDOFF.md`.

## 3. What's built (current features)

- **Linear discovery wizard:** Company → Users → Devices → Servers → Internal IT → Licensing & Onboarding,
  with progress, Back/Next, "View Recommendation" finish. Results update live. Devices step = a single
  **Windows PCs** count (+ optional PCs-to-back-up); Macs/shared/kiosks removed. Step 6 captures optional
  **current IT spend** and defaults the current license to **Business Premium**.
- **5 packages:** TCT Basic Care / Standard Care / Comprehensive Care / Complete Care / **TCT Ally (Co-Managed)**. The co-managed package (stable id `comanaged`) was renamed **TCT Ally** = bill-for-labor co-managed. A reusable **Co-Managed Tool Access** line attaches to the managed packages for a client's internal IT (the "included-support" path — no separate package).
- **Recommendation engine** (premium-first; see §5), **financial dashboard**, **5-package comparison**,
  **Current vs TCT** competitive cost-comparison (their current IT spend + internal IT labor vs the quote),
  **package-aware service catalog** (grouped by billing unit), **Line-Item Costs** ledger tab,
  **internal/customer/executive summaries**, and **PDF/CSV/JSON/Excel/print exports**.
- **Internal vs customer view** toggle (hides vendor names, costs, margins). Internal-only banner.
- **Backups:** on-prem Datto SIRIS (Virtual/Appliance/Cloud-DR, TB×retention×3-yr term + hardware),
  Azure VM (banded + retention), Entra ID ($0.75/user), workstation Endpoint Backup ($10/$100).
- **Business Line** (per-company "cost to play") for Comprehensive/Complete/Co-Managed.

## 4. Locked-in pricing (monthly unless noted; managed = M365 excluded)

Per-unit COST is uniform; PRICE varies by package (Basic / Standard / Comprehensive / Complete / Co-Managed):

- **Per user:** cost **$4.46** (Kaseya 365 User $2.79 + Printix $1.67). Price 35 / 35 / 75 / 100 / **40** (last = TCT Ally).
- **Per device:** cost **$5.33** (Kaseya 365 Endpoint $4.00 + DNS/Content Filter $1.33). Price 35 / 35 / 40 / 50 / **40** (last = TCT Ally).
- **Per server (base):** cost $5.33. Price 100 / 100 / 115 / 115 / 100 (Ally = 100).
- **Per site:** cost **$35** (Domotz only; MyITProcess is in K365 Ops overhead; BSN retired). Price 100 / 150 / 150 / 250 / 150 (Ally = 150).
- **Co-Managed seat / tool access:** cost **$50** / sell **$150** per internal-IT admin. On **TCT Ally** it's the core co-managed seat (`pricing.packages.comanaged.perComanagedAdmin`); on the **managed** packages it appears as a **Co-Managed Tool Access** line (top-level `pricing.comanagedToolAccess`) when the client has internal IT wanting access — this is the "included-support" co-managed model = managed package + this line.
- **TCT Ally billable labor:** **$150/hr** note (helpdesk, moves/adds/changes, projects), `pricing.packages.comanaged.hourlyLabor` — shown as an informational line, **excluded** from the monthly recurring total. Ally = co-managed where the client's IT runs day-to-day and TCT bills for labor.
- **Shared mailbox:** $1.50 / $5 each. **Workstation backup (Endpoint Backup for PCs):** $10 / $100 per Windows PC (servers excluded).
- **Entra ID backup:** $0.75 / $1.50 per user (optional). **Backups sell at 2× cost** (industry norm 2–3×).
- **Azure VM backup** (per combined provisioned TB + retention, sell 2×): ≤1 TB $174 / 1–2 $340 / 2–4 $480 / 4–6 $610 (1-yr);
  7-yr $195/$380/$538/$685; Infinite $208/$408/$576/$733. Max 7 VMs / 6 TB per subscription.
- **On-prem SIRIS** (3-yr term, sell 2×, hardware one-time pass-through): full SV-1→120 / S6-2→120 tables in `dattoBackup`. SIRIS is image-based backup **with** cloud DR, so per-server **DR + Image-Level** are scoping toggles (default ON) **included** in the SIRIS/Azure line — the legacy per-server DR ($40/$100) / image ($60/$150) / retention-upcharge add-ons are **no longer auto-billed** (kept in `serverAddOns` for reference) to avoid double-counting. A warning fires if a server needs backup but no method is enabled.
- **Business Line:** max($250 floor, 2× cost), cost = Thread $34/customer + EasyDMARC $10/domain. Comprehensive/Complete/Co-Managed.
- **Microsoft 365 (separate line, excluded from margin; sell = MSRP monthly list):** Basic cost 6.34 / sell 8.40,
  Standard 11.55 / 16.80, Premium 23.23 / 26.40, F3 / 12.00, F1 2.70 / 3.60. ⚠️ These are *monthly-commitment* MSRP
  (annual = ÷1.2 on both cost & sell); reflects the July 1 2026 MS increase.
- **Overhead (cost-to-serve, NOT quoted, blended):** Kaseya 365 Ops $714 + MSP Success Pro $804.30 + Thread base $500.

## 5. Recommendation logic (premium-first)

Baseline lean toward Comprehensive/Complete; rules add points; hard floors enforced.
- TCT Ally (co-managed) recommended when **50+ users AND internal IT staff** (id `comanaged`).
- **Any compliance → Comprehensive minimum; HIPAA/CMMC/DFS → Complete** (hard floors).
- Security priority weights heavily to Complete. Basic only for ≤10 users, no compliance, security not flagged.

## 6. Stack naming (current vendors)

Kaseya 365 Endpoint (RMM/AV/EDR/Ransomware/RocketCyber SOC), Kaseya 365 User (SaaS Protection,
SaaS Alerts, INKY email phishing, BullPhish SAT, MyGlue password, Dark Web ID — all bundled),
Printix + DNS/Content Filter via Pax8, Domotz (site), Datto SIRIS/Azure/Endpoint backup, Thread (chat), EasyDMARC.
**Removed/retired:** ThreatLocker (not used), SaaS Defense, BSN/Breach Secure Now, Keeper, Graphus, Huntress, vCIOToolbox.

## 7. Open items / next steps (also in OPEN_ITEMS.md)

1. ✅ **Two Co-Managed offerings — DONE (2026-06-23).** Resolved as: (a) **TCT Ally** = co-managed, bill-for-labor — renamed the `comanaged` package ($40/user, $40/device, $100/server, $150/site, $150 admin seat; $150/hr labor note excluded from monthly); (b) **included support = a fully-managed package + a Co-Managed Tool Access line** ($50 cost / $150 sell per internal-IT admin), NOT a separate package. No 6th package added. Details in OPEN_ITEMS.md. ⏳ Open sub-item: confirm Ally per-server ($100) and per-site ($150) sells (only per-user/device were re-confirmed at $40/$40).
2. **Frontline bundle** — currently PRELIMINARY (deskless/no-email = base Datto EDR + optional Printix;
   anyone needing email is a Standard User). Flesh out with real pricing when a frontline client appears.
3. **M365 commitment term** — confirm monthly vs annual commitment (annual = ÷1.2 on cost & sell).
4. **Workstation backup** — confirmed $10/PC ("Endpoint Backup for PCs" per Kaseya invoice). Note there's a
   separate "Datto Endpoint Backup" SKU at $3/$6/endpoint if you ever switch.
5. Optional: raise backup multiplier toward 2.5–3× (industry norm) if desired.

## 8. To resume in a new session, tell it:

"Continue the TCT Sales Calculator in `…\Calculator\tct-sales-calculator`. Read `HANDOFF.md` and
`OPEN_ITEMS.md` first. All pricing is in `src/config/*.json`; build/run via `Start-Calculator.cmd`.
Vendor invoices are in `…\Calculator\Vendor Invoices`. Next up: confirm TCT Ally server/site sells; flesh out the Frontline bundle; confirm M365 monthly-vs-annual term; consider a co-managed web-page update (see OPEN_ITEMS.md)."
