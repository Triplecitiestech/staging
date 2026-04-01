# Compliance Evidence Engine — Scoring Playbook

> **Living document**: Updated whenever evaluation logic changes.
> Last updated: 2026-04-01

This document defines how the TCT Compliance Evidence Engine scores each CIS v8 control, which data sources feed each evaluation, and the logic used to determine pass/fail/partial status.

---

## How Scoring Works

### Status Hierarchy

| Status | Meaning | Score Impact |
|--------|---------|-------------|
| **pass** | Control is satisfied by technical evidence or policy documentation | Counts toward score |
| **partial** | Evidence exists but coverage is incomplete | Counts as "needs improvement" |
| **needs_review** | Evidence available but requires human judgment | Manual review required |
| **not_assessed** | No evidence source configured for this control | Not counted |
| **not_applicable** | Control doesn't apply to this customer's environment | Not counted |
| **collection_failed** | Integration configured but data retrieval errored | Investigate |
| **fail** | Technical evidence shows the control is NOT met | Counts against score |

### Confidence Levels

| Level | Meaning |
|-------|---------|
| **high** | Multiple data sources agree, or authoritative source confirms |
| **medium** | Single reliable source or policy documentation |
| **low** | Attestation-based (admin toggled "deployed") or limited evidence |
| **none** | No evidence available |

---

## Evidence Sources (12 Integrations)

### Live API Integrations

| # | Tool | Env Vars | What It Provides | Controls Affected |
|---|------|----------|------------------|-------------------|
| 1 | **Microsoft 365 / Graph** | Company M365 creds | Secure Score, Conditional Access policies, MFA registration, device compliance, BitLocker, Defender, Intune policies, user accounts, dormant accounts | 1.1, 3.3, 4.1, 4.3, 4.6, 4.7, 5.1-5.4, 6.1-6.5, 8.x, 10.x, 12.6 |
| 2 | **Datto RMM** | `DATTO_RMM_API_KEY/SECRET` | Device inventory, patch rates, AV status, software audit | 1.1, 2.1-2.2, 7.1-7.4, 9.1, 10.1 |
| 3 | **Datto EDR** | `DATTO_EDR_API_TOKEN` | Endpoint threat alerts, detection events | 4.4, 4.5, 10.1, 13.1 |
| 4 | **Datto BCDR** | `DATTO_BCDR_PUBLIC/PRIVATE_KEY` | Backup appliances, protected devices, cloud replication | 11.1-11.4 |
| 5 | **Datto SaaS Protect** | (via BCDR keys) | M365 backup seats, protection status | 11.1, 11.2 |
| 6 | **DNSFilter** | `DNSFILTER_API_TOKEN` | DNS queries, blocked threats, filtering stats | 9.2 |
| 7 | **Domotz** | `DOMOTZ_API_KEY/URL` | Network device discovery, MAC/IP inventory, agent status | 1.2-1.5, 4.2, 12.1 |
| 8 | **IT Glue** | `IT_GLUE_API_KEY/URL` | Documentation, configurations, flexible assets, policies/procedures | 3.1-3.5, 4.2, 7.1, 8.1, 12.1, 15.1-15.2, 17.1 |
| 9 | **SaaS Alerts** | `SAAS_ALERTS_API_KEY/URL` | Cloud app security events, anomaly detection | 8.2, 13.1 |
| 10 | **Ubiquiti UniFi** | `UBIQUITI_API_KEY/URL` | Network devices (APs, switches, gateways), firmware versions | 12.1 |
| 11 | **MyITProcess** | `MYITP_API_KEY/URL` | Alignment scores, reviews, findings, recommendations | (informational — not yet scoring) |
| 12 | **Autotask PSA** | Company autotaskCompanyId | Ticket data (used in reporting, not compliance scoring directly) | (informational) |

### Attestation-Based (Toggle on Tool Capability Map)

| Tool | Controls | Logic |
|------|----------|-------|
| **RocketCyber** | 13.1 | If toggled "deployed" → 13.1 passes with low confidence |
| **Bullphish ID** | 14.1-14.8 | If toggled "deployed" → all training controls pass with low confidence |
| **Dark Web ID** | 5.2 | If toggled "deployed" → 5.2 gets attestation note |

### Policy Documentation (Uploaded/SharePoint)

Policies are analyzed by Claude AI against all 65 CIS v8 controls. When a policy satisfies a control:
- The AI provides: reasoning, exact quote from the policy, and section reference
- Only upgrades controls that have **no technical evidence** (process/documentation controls)
- Does NOT override technical evidence (e.g., BitLocker at 73% stays partial regardless of policy)

---

## Environment-Aware N/A Rules

Set via MSP Setup → Customer Environment:

| Setup Answer | Controls Affected | Result |
|-------------|-------------------|--------|
| Remote access = "Cloud-only — no VPN" | CIS 6.4 (MFA for VPN) | **not_applicable** |
| On-prem servers = "No on-prem servers" | CIS 4.4 (Server Firewall) | **not_applicable** |
| Custom apps = "No — standard software" | CIS 16.x (App Security) | **not_applicable** |

---

## Per-Control Scoring Logic

### Category 1: Enterprise Asset Management

**1.1 Asset Inventory**
- Sources: `microsoft_device_compliance`, `microsoft_users`
- Pass: Device count > 0 AND user count > 0
- Partial: Only devices OR only users found
- Missing evidence note: Datto RMM can supplement

**1.2 Address Unauthorized Assets**
- Sources: `domotz_network_discovery`, `datto_rmm_devices`, `microsoft_device_compliance`
- Pass: Domotz active + network devices ≤ managed devices (all accounted for)
- Partial: Domotz active but unmanaged devices detected
- Key: Domotz discovers ALL devices; RMM only sees managed ones. The gap = unauthorized.

**1.3 Active Discovery Tool**
- Sources: `domotz_network_discovery`
- Pass: Domotz discoveryActive = true AND totalDevices > 0
- Partial: Domotz configured but not actively scanning
- RMM is NOT active discovery — only Domotz satisfies this control

**1.4 DHCP Logging** — Domotz tracks DHCP-assigned devices
**1.5 Passive Discovery** — Domotz passive scanning

### Category 3: Data Protection

**3.3 Data Access Control** — Conditional Access policies (count ≥ 1 enabled = pass)
**3.4 Data Retention** — IT Glue documented policies + SaaS Protect backup retention
**3.5 Data Disposal** — IT Glue documented procedures OR uploaded policy
**3.6 Encrypt End-User Devices** — BitLocker encryption rate (≥95% = pass, ≥70% = partial)

### Category 4: Secure Configuration

**4.1 Secure Configuration Process** — Secure Score (≥70% = pass, ≥40% = partial)
**4.3 Session Locking** — Intune config profiles + compliance rate
**4.6 Encryption** — BitLocker rate (same as 3.6)

### Category 5: Account Management

**5.2 Unique Passwords** — MFA registration rate (≥95% = pass, ≥70% = partial)
**5.3 Disable Dormant Accounts** — Users with no sign-in for 45+ days
**5.4 Restrict Admin Privileges** — Admin account count (≤5 = pass, >5 = review)

### Category 6: Access Control

**6.3 MFA for External Apps** — MFA rate + CA policies with "MFA" in name
**6.4 MFA for Remote Access** — N/A if cloud-only; otherwise MFA rate + CA policies
**6.5 MFA for Admin Access** — All admin accounts have MFA registered

### Category 7: Vulnerability Management

**7.1-7.4** — Datto RMM patch rate (≥80% = pass) + Secure Score

### Category 8: Audit Log Management

**8.1 Audit Log Management Process** — Multi-layer: M365 UAL + RMM + EDR/RocketCyber + SaaS Alerts. 2+ layers = pass.
**8.2 Collect Audit Logs** — All 6 logging layers counted. 3+ = high confidence pass.
**8.3 Adequate Log Storage** — M365 retention + RMM cloud + RocketCyber history
**8.5 Detailed Audit Logs** — Process-level telemetry from EDR + SaaS Alerts

### Category 9: Network Protections

**9.2 DNS Filtering** — DNSFilter query data (total > 0 AND blocked > 0 = pass)

### Category 10: Malware Defenses

**10.1 Anti-Malware** — Defender device count + EDR presence. EDR = high confidence pass.

### Category 11: Data Recovery

**11.1 Data Recovery Practice** — BCDR + SaaS Protect. Both = pass, one = partial.
**11.2 Automated Backups** — BCDR device names + SaaS seat counts. Both = high confidence.
**11.3 Protect Recovery Data** — BCDR AES-256 encryption + cloud replication
**11.4 Isolated Recovery Data** — BCDR offsite cloud replication (air-gapped)

### Category 12: Network Infrastructure

**12.1 Network Infrastructure Up-to-Date** — Ubiquiti firmware versions > Domotz monitoring > IT Glue docs
**12.6 Encryption in Transit** — M365 enforces TLS 1.2+ by default

### Category 13: Security Monitoring

**13.1 Centralized Alerting** — EDR + Defender + SaaS Alerts + DNSFilter. 3+ sources = high confidence.

### Category 14: Security Awareness Training

**14.1-14.8** — Bullphish ID attestation OR uploaded training policy documentation

### Category 15: Service Provider Management

**15.1-15.2** — IT Glue flexible asset types + documented policies

### Category 17: Incident Response

**17.1 Incident Handling Personnel** — IT Glue documented procedures OR uploaded incident response policy
**17.2-17.3** — Requires uploaded policy documentation

---

## Score Calculation

```
Score % = (passed controls / total assessed controls) × 100
```

Controls marked `not_applicable` or `not_assessed` are excluded from the total.

---

## Data Flow

```
1. detectConnectors() — reads company M365 creds + env vars → upserts connector rows
2. runAssessment() Phase 1 — reads assessment + connectors (1 DB connection, released)
3. runAssessment() Phase 2 — ALL collectors run IN PARALLEL (zero DB connections)
4. runAssessment() Phase 3 — stores evidence → evaluates 65 controls → stores findings
   - Each evaluator checks: evidence → env N/A → tool attestation → policy coverage
   - applyPolicyCoverage runs AFTER each evaluator (only upgrades no-evidence controls)
```

## Customer Name Matching

MSP-level tools (Domotz, IT Glue, Datto, SaaS Alerts) use the company's `displayName` to match against their customer lists. Matching strategies:
1. Exact substring
2. Normalized (strips LLC, Inc, punctuation)
3. Short-name field (IT Glue only)
4. All significant words present
5. Squished comparison (no spaces: "ezred" matches "EZRed")
