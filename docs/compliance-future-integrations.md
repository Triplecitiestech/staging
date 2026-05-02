# Compliance Engine — Future Tool Integrations Backlog

> Generated 2026-05-02. These integrations are referenced by CIS / CMMC
> evaluators but require new API connectors before they can produce live
> evidence. The evaluators currently fall back to manual review or partial
> evidence until these are built.

---

## EasyDMARC (CIS 9.5 — Implement DMARC)

**Status**: Not yet integrated. CIS 9.5 currently returns `needs_review`.

**What's needed**:
- New connector module `src/lib/easydmarc.ts` with API client
- Env vars: `EASYDMARC_API_KEY`, `EASYDMARC_API_URL`
- Per-customer platform mapping for the EasyDMARC organization ID
- New evidence source type `easydmarc_dmarc` in `types.ts`
- Collector in `src/lib/compliance/collectors/msp.ts` that:
  1. Identifies the customer's email domains
  2. Queries EasyDMARC for each domain's DMARC, SPF, DKIM record status
  3. Returns evidence with `dmarcPolicy` (none / quarantine / reject), `spfValid`, `dkimSelector`
- Update CIS 9.5 evaluator to read `easydmarc_dmarc` evidence:
  - DMARC policy = `quarantine` or `reject` AND SPF valid AND DKIM signing → **pass**
  - DMARC policy = `none` (monitor only) → **partial**
  - No DMARC record → **fail**

**Why CSV / DNS lookup isn't sufficient**: We could do a raw DNS lookup for
DMARC records, but EasyDMARC also tracks DMARC report aggregation (which
shows whether the policy is actually being enforced and what % of mail
streams are aligned). That richer data justifies the API integration.

---

## Ubiquiti UniFi API — Threat Management / IPS verification (CIS 13.8)

**Status**: UniFi connector exists for basic network discovery. Needs
extension to read Threat Management config.

**What's needed**:
- Extend `src/lib/ubiquiti.ts` (if it exists) or add a method to query
  the UniFi controller's gateway settings:
  - Endpoint: `GET /api/s/{site}/rest/setting/network` and
    `GET /api/s/{site}/stat/health`
  - Look for `ips_mode` field on the network/firewall config
  - `ips_mode === 'ips'` → IPS active; `'ids'` → detection only; `'disabled'` → off
- Update collector to set `threatManagementEnabled` and `ipsMode` on the
  `ubiquiti_network` evidence rawData
- The CIS 13.8 evaluator already reads these fields — once the collector
  populates them, the control will auto-pass when IPS is enabled

**Workaround until built**: CIS 13.8 returns `needs_review` with a prompt
for the engineer to manually verify in the UniFi controller.

---

## Ubiquiti UniFi API — VLAN / network config (CMMC SC.1.2 + CIS 12.2)

**Status**: Same UniFi connector as above. Needs network configuration query.

**What's needed**:
- Endpoint: `GET /api/s/{site}/rest/networkconf` lists all configured
  networks (VLANs, guest networks, etc.)
- Collector should populate evidence rawData with:
  - `vlanCount`: number of VLANs configured
  - `guestNetworkConfigured`: boolean
  - `guestIsolation`: boolean (client isolation enabled on guest network)
  - `purposeBreakdown`: array of `{ name, purpose, vlanId }` entries
- Update CMMC SC.L1-b.1.xii (currently `delegateTo('cis-v8-9.2'...)`) and
  CIS 12.2 evaluators to check `vlanCount > 1` and `guestNetworkConfigured`
  for evidence of public-access system separation

**Note**: This is the same API call that CIS 13.4 (inter-segment traffic
filtering) needs, so make it a shared evidence source.

---

## Ubiquiti UniFi API — Port-Level Access Control / 802.1X (CIS 13.9)

**Status**: UniFi connector needs port profile query.

**What's needed**:
- Endpoint: `GET /api/s/{site}/rest/portconf` returns port profiles
- Look for `dot1x_ctrl !== 'disabled'` or `mac_filter_enabled === true`
- Set `dot1xEnabled` / `macFilteringEnabled` flags on `ubiquiti_network` evidence
- CIS 13.9 evaluator already reads these fields

---

## BullPhish ID API (CIS 14.x stronger evidence)

**Status**: Currently uses admin attestation (Tool Configuration toggle).
This is acceptable evidence per Fix 12.

**Future enhancement**: Build a BullPhish ID API integration to pull
campaign completion data per user, providing stronger evidence than
attestation:
- Per-user training completion status
- Campaign cadence and topics covered
- Phishing simulation results (click rate, report rate)

When built, upgrade CIS 14.2-14.8 evaluators to validate actual training
completion rates rather than just tool deployment.

---

## Summary: New evidence source types to add when integrations land

```ts
// In src/lib/compliance/types.ts EvidenceSourceType union:
| 'easydmarc_dmarc'              // EasyDMARC API
| 'ubiquiti_threat_management'   // UniFi IPS config
| 'ubiquiti_network_config'      // UniFi VLAN config
| 'ubiquiti_port_config'         // UniFi 802.1X
| 'bullphish_campaigns'          // BullPhish API training data
```

And the corresponding ConnectorType + EVIDENCE_TO_CONNECTOR mappings.
