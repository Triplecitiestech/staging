# Pricing Review Notes — "Monitoring Services.xlsx"

Prepared for Kurtis / Triple Cities Tech. This documents how the spreadsheet was
interpreted to seed the calculator, and every value or structural decision that
needs your confirmation. Nothing here is final — all of it lives in editable
config files (`src/config/`) and can be corrected without code changes.

The single source of truth for money in the app is `src/config/pricing.json`.
Service inclusion (the checkmark matrix) is `src/config/services.json`.

---

## 1. The workbook contains two different pricing models

The file mixes two models that do not fully agree:

- A 3-tier model with internal codenames **Watchtower / Bastion / Fortress** on
  the "Services Summary" tab (built around K365 Endpoint Pro / K365 User bundles).
- A 4-sheet model — **TCT Basic / Standard / Comprehensive / Complete Care** —
  with concrete per-user / per-device / per-server / per-site numbers.

Your spec names five packages (Basic, Standard, Comprehensive, Complete,
Co-Managed Care), so the calculator is built on the **four detailed "Care"
sheets** plus a constructed Co-Managed package. The Watchtower/Bastion/Fortress
names are carried as internal codenames on each package.

**Decision needed:** Confirm the four "Care" sheets are the canonical pricing,
or tell me to switch to the Watchtower/Bastion/Fortress model.

---

## 2. Microsoft 365 is bundled into cost in the sheet — your spec says separate

In the sheets, the Microsoft license cost is added into the **Cost Per User**
column (e.g. Basic includes "365 Business Basic 5.28"; Standard includes "365
Business Standard 13.20"; Comprehensive "365 Email 23.23").

Your spec requires M365 to be a separate line item, excluded from managed-services
margin. The calculator therefore:

- Removed the M365 license cost from the managed per-user **cost**.
- Moved M365 into its own catalog (`pricing.json > m365Licenses`), excluded from margin.
- **Kept your per-user selling price as set in the sheet** (35 / 35 / 75 / 100).

Side effect to confirm: because the per-user **price** (e.g. $35 Basic) was
originally meant to absorb the ~$8 M365 allotment, leaving the price at $35 while
removing the M365 cost makes per-user margin look high.

**Decision needed:** Either (a) keep managed prices as-is and bill M365 entirely
on top (current default), or (b) reduce each managed per-user price by its M365
amount and bill M365 separately. This is a two-number edit per package.

---

## 3. Managed per-user cost (M365 removed) — values used

| Package | Managed per-user cost used | Components counted |
|---|---|---|
| Basic | 5.04 | Printix 1.59 + Datto SaaS Protection 1.95 + Huntress 1.50 |
| Standard | 5.04 | same as Basic |
| Comprehensive | 6.19 | Printix 1.59 + Huntress 1.50 + SaaS Protection ICR 1.75 + SaaS Defense 1.35 |
| Complete | 4.38 | Printix 1.59 + K365 User 2.79 |

**Flag — Complete per-user cost is incomplete in the sheet.** On the "TCT Complete
Care" tab the Microsoft license row and one service row are blank (cost cells
empty, price 25/5 present). The 4.38 only captures Printix + K365 User. Confirm
the full Complete per-user component list and costs.

---

## 4. Basic vs Standard are nearly identical

Both have the same managed components and the same device/server pricing. They
differ only by Microsoft license tier (Basic = Business Basic, Standard =
Business Standard) and per-site price (100 vs 150). After separating M365, the
managed per-user **price** is $35 for both.

**Decision needed:** Should Standard carry a higher managed price or additional
managed services than Basic, or is the only real difference the Microsoft license?

---

## 5. Per-server cost is not in the sheet (placeholder)

The sheets give a server **price** (85 to 100 to 115) but no server **cost**. The
calculator uses a placeholder server cost equal to the device-level monitoring
cost (5.43, or 5.32 for Complete).

**Decision needed:** Provide the true monthly cost to monitor/manage a server.

---

## 6. Per-site cost and the "BSN" lines

Per-site **price** is taken from the sheets (Basic 100, Standard 150,
Comprehensive 150, Complete 250). Per-site **cost** is a placeholder of $55
(Domotz 23 + vCIOToolbox 32).

The sheets also list "BSN – Up to 10 / 20 / 50 Users" at 25 / 30 / 35 and "BSN –
Dark Web – Per Domain 11". These user-count-scaled site costs are **not** modeled
yet.

**Decisions needed:** (a) Confirm what BSN is and whether the site cost should
scale by user count. (b) Confirm per-site cost components.

---

## 7. Dark Web monitoring (per domain)

Cost $11/domain comes from the sheet; the **selling price is not in the sheet** —
placeholder $15. Domain billing only applies to packages that include Dark Web
(Comprehensive, Complete, Co-Managed).

**Decision needed:** Confirm the per-domain Dark Web selling price.

---

## 8. Co-Managed Care is undefined in the workbook

The only co-managed signal is "Price Per 1:1 Ratio = 150" under the Fortress /
Complete tabs. The entire Co-Managed package in the calculator is **placeholder**:
reduced per-user/device prices plus a `perComanagedAdmin` line at cost 150 /
price 300.

**Decision needed:** Define Co-Managed Care — what tools/access are included, the
per-internal-admin price, and whether per-user/device pricing is reduced and by
how much. Also confirm what "1:1 ratio = 150" represents (dedicated engineer per
N endpoints?).

---

## 9. Frontline (shop-floor) users

The "TCT Front Line User" sheet lists Microsoft 365 F3 + Huntress M365 MDR +
Printix, with **no pricing**. The calculator models frontline users as a reduced
stack with per-component toggles; the component costs/prices for Security
Awareness, INKY/email protection, SaaS backup, and Password Manager are
**placeholders**.

**Decision needed:** Confirm frontline component costs and selling prices, and the
base frontline management price.

---

## 10. Server backup / DR / image-level / retention

None of these were priced in the workbook. All are **placeholders**
(`pricing.json > serverAddOns`): Backup 20/50, DR 40/100, Image-level (BDR)
60/150, plus optional retention upcharges by tier.

**Decision needed:** Confirm backup/DR/image/retention costs and prices.

---

## 11. Microsoft 365 license catalog

| License | Cost used | Resale price used | Source |
|---|---|---|---|
| Business Basic | 5.28 | 8 | sheet |
| Business Standard | 13.20 | 15 | sheet |
| Business Premium | 23.23 | 25 | sheet ("365 Email") |
| Frontline (F3) | 7.00 | 10 | placeholder |
| E3 | 33.75 | 38 | placeholder |
| E5 | 54.75 | 60 | placeholder |

**Decisions needed:** (a) Confirm the resale prices are your intended sell, not
just round targets. (b) Provide real CSP costs and your resale for F3 / E3 / E5.
(c) Confirm "365 Email" on the Comprehensive tab is Business Premium.

---

## 12. Product naming to confirm

- **INKY vs Graphus.** Your spec lists INKY for email phishing protection; the
  workbook uses **Graphus** plus **Datto SaaS Defense**. The catalog currently
  shows Graphus + SaaS Defense, and the frontline toggle reads "INKY / Email
  Protection." Confirm which product is current so naming is consistent.
- **vCIO platform.** Sheets use "vCIOToolbox"; your spec and a sheet note
  reference **MyITProcess**. The catalog lists "MyITProcess / vCIOToolbox."
  Confirm the live platform.

---

## 13. One-time charges

Onboarding charges (per user / device / server) are **placeholders** and off by
default. Turn on with the discovery toggle. Confirm values if you want them used.

---

## How to apply your answers

Almost every item above is a number in `src/config/pricing.json`. Service naming
and inclusion are in `src/config/services.json`. Package names/codenames/license
requirements are in `src/config/packages.json`. Edit, save, rebuild — no code
changes. See `CLAUDE_DEPLOYMENT_INSTRUCTIONS.md` for exact locations.

---

## 14. Azure VM cloud backup (added)

Built from internal notes. Modeled in `pricing.json > azureBackup`:

- Priced on **provisioned** disk space (not used), in bands, 3-year commit:
  0-1 TB = $174/mo, 1-2 TB = $340/mo, 2-4 TB = $480/mo.
- Billed **per bucket of combined provisioned TB across all protected Azure VMs**, not per VM. In discovery, set each Azure VM's provisioned TB and OS; the calculator sums them and applies one band.
- Capacity per cloud device is **6 TB and 7 VMs**. If the combined total exceeds either limit, the calculator keeps the single combined-band price and shows a **warning** that multiple cloud devices would be needed for load-balancing — it does not auto-multiply the price.

**Decisions needed:**
(a) The band figures are entered as BOTH cost and price (no markup). Set your selling price per band, or tell me the markup to apply.
(b) Pricing above 4 TB, and whether multi-device (load-balanced) scenarios change the price, is not defined — confirm.
(c) OS is captured per VM for reference only; confirm if it should affect pricing.

---

## 15. Service catalog updates (applied) + per-user cost caveat

Applied per your direction:

- "DNS Filtering" renamed to **Content Filtering** (product still DNS Filter Pro).
- **Graphus replaced by INKY** as the email phishing protection.
- **Keeper replaced by MyGlue** for password management, now marked **included in the per-user stack across all packages** (no separate charge).
- **SaaS Alerts Fortify** remains included in the per-user stack (no separate charge).
- "Unlimited Support" renamed to **Remote Support**.
- **Huntress removed** — endpoint threat detection is **Datto EDR** (already in the device stack). The frontline base-management label now reads "Datto EDR."

**Caveat to confirm:** the per-user **cost** figures in `pricing.json` were originally derived to include Huntress (~$1.50/user) and to exclude Keeper/Fortify. Now that Huntress is dropped and MyGlue/Fortify are bundled, those per-user cost numbers should be re-derived. The selling prices are unchanged. Tell me the corrected per-user cost per package (or confirm to leave as-is) and I'll update `pricing.json`.

## 16. One-time onboarding is now manual

Onboarding is no longer auto-calculated or tied to Microsoft. In the "Licensing & Onboarding" step the salesperson enters the **onboarding charge to the customer** (and optionally our internal cost); the calculator adds it to the quote as a one-time item, separate from recurring and from M365.
