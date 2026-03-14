# SOC Analyst Agent Redesign Plan

> **Status: PHASE 1 COMPLETE (2026-03-14)**
>
> The **Reasoning Layer** (Phase 1) has been implemented. See `docs/plans/SOC_REASONING_LAYER_DESIGN.md` for the detailed design and implementation status.
>
> **What remains (Phase 2 — future):**
> - OSINT API integrations (AbuseIPDB, VirusTotal, AlienVault OTX, ip-api.com)
> - Auto-action tiers (Tier 1 full auto, Tier 2 semi-auto, Tier 3/4 human required)
> - Single-pass AI analysis (replacing 3-call pipeline with 1-2 calls)
> - `soc_osint_cache` table and enrichment context
> - Dashboard stat card updates (auto-resolved, awaiting review metrics)

## Problem Statement

The current SOC system behaves like a traditional alerting system that generates investigation checklists for humans. The AI classifies alerts and proposes actions, but does not perform actual investigative work (OSINT, threat intelligence, reputation lookups). The UI is verbose, showing reasoning chains, step-by-step playbooks, and duplicated information instead of concise investigation results.

**What needs to change:**
1. The AI agent must perform real investigation work before presenting results
2. The UI must show investigation outcomes, not investigation plans
3. Internal notes and customer messages must use different communication styles
4. Low-confidence or genuinely threatening incidents should require human approval; benign ones should auto-resolve
5. The interface must be dramatically simplified

---

## Part 1: Revised SOC Investigation Workflow

### Current Pipeline (6 stages)

```
Ticket Ingestion → Security Filter → Correlate → Screen (Haiku) → Deep Analyze (Sonnet) → Action Plan (Haiku)
```

The AI is asked to "perform OSINT" in prompts but no external APIs are called. Claude uses training knowledge only. The action plan generates step-by-step human guidance. Everything requires human approval.

### Revised Pipeline (8 stages)

```
1. Ticket Ingestion
2. Security Filter          (unchanged)
3. Correlation              (unchanged)
4. Automated OSINT          ← NEW — real API lookups
5. Device & Identity        (enhanced with historical patterns)
6. AI Analysis              (single-pass with real enrichment data)
7. Verdict & Auto-Action    (auto-execute safe actions)
8. Document & Log
```

### Stage 4: Automated OSINT & Enrichment (NEW)

Before the AI ever sees the incident, the system performs real lookups.

**New module: `src/lib/soc/osint.ts`**

| Check | Source | When to Run |
|-------|--------|-------------|
| IP Reputation | AbuseIPDB API (free tier: 1000 checks/day) | Any extracted IP |
| IP Geolocation | ip-api.com (free, no key) or ipinfo.io | Any extracted IP |
| ASN Lookup | Included in geolocation response | Any extracted IP |
| VirusTotal IP/Domain | VirusTotal API v3 (free tier: 4 req/min) | Any extracted IP or domain |
| Domain Reputation | VirusTotal domain lookup | Any extracted domain |
| Threat Feed Check | AlienVault OTX API (free) | Any extracted IP or domain |

**Rate limiting:** Queue lookups with per-API rate limits. Cache results in a new `soc_osint_cache` table (TTL: 24 hours) to avoid redundant lookups across correlated tickets.

**Output:** A structured `OsintResults` object attached to the incident before AI analysis:

```typescript
interface OsintResults {
  ips: {
    [ip: string]: {
      abuseScore: number | null        // 0-100 from AbuseIPDB
      abuseReports: number | null
      country: string | null
      city: string | null
      isp: string | null
      asn: string | null
      asnOrg: string | null
      isVpn: boolean | null
      isTor: boolean | null
      isProxy: boolean | null
      vtMalicious: number | null       // # of VT engines flagging as malicious
      vtSuspicious: number | null
      otxPulseCount: number | null     // AlienVault OTX pulse matches
      cached: boolean
    }
  }
  domains: {
    [domain: string]: {
      vtMalicious: number | null
      vtSuspicious: number | null
      categories: string[] | null
      registrar: string | null
      creationDate: string | null
      cached: boolean
    }
  }
  lookupErrors: string[]               // Track any API failures
  enrichedAt: string                    // ISO timestamp
}
```

**Fallback behavior:** If an API is unavailable, log the failure in `lookupErrors` and continue. OSINT enrichment is additive — partial results are still valuable.

### Stage 5: Device & Identity Verification (Enhanced)

Current behavior is preserved (Datto RMM cache lookup, technician matching). Add:

- **Historical pattern lookup**: Query `soc_ticket_analysis` for previous verdicts on the same company + alert category in the past 30 days to calculate false positive rate
- **Account activity context**: For stale account alerts, confirm inactivity period from ticket metadata

```typescript
interface EnrichmentContext {
  osint: OsintResults
  deviceVerification: DeviceVerification | null
  historicalFpRate: number | null          // e.g., 0.85 = 85% of past alerts were FP
  previousVerdicts: { verdict: string; count: number }[]
  accountActivity: { lastLogin: string | null; daysSinceLogin: number | null } | null
}
```

### Stage 6: AI Analysis (Redesigned — Single Pass)

**Current:** Three separate AI calls (screening → deep analysis → action plan) using 3 prompts totaling ~6000+ tokens of output.

**Revised:** Two calls maximum.

**Call 1 — Investigation & Verdict (Sonnet):**

The AI receives the full enrichment context (real OSINT results, device verification, historical patterns) and produces:

```typescript
interface InvestigationResult {
  verdict: 'false_positive' | 'benign_policy' | 'suspicious' | 'likely_threat'
  confidence: number                    // 0.0 - 1.0
  investigationSummary: string          // 2-4 sentence summary of findings
  threatIntelSummary: string | null     // Summary of OSINT findings (only if relevant)
  internalNote: string                  // Technical SOC documentation
  customerMessage: string | null        // Plain language (only if customer contact needed)
  recommendedAction: string             // One-line action description
  actionType: 'auto_close' | 'notify_customer' | 'escalate_human' | 'escalate_urgent'
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical'
}
```

Key changes to the prompt:
- Provide real OSINT data instead of asking the AI to imagine it
- Add `benign_policy` verdict for policy-triggered alerts (stale accounts, compliance, etc.)
- Require a concise `investigationSummary` (not a reasoning chain)
- Require separate `internalNote` and `customerMessage` with explicit style rules
- Remove the step-by-step human guidance section entirely
- Remove the "next cycle checks" section

**Call 2 — Action Plan (Haiku, only when needed):**

Only called when:
- Ticket merge is needed (multi-ticket incident)
- Escalation requires routing details (target queue, resource)

This keeps the common case (single alert, clear verdict) to one AI call.

### Stage 7: Verdict & Auto-Action (Redesigned)

**Auto-execute (no human approval needed):**

| Condition | Action |
|-----------|--------|
| Verdict = `false_positive`, confidence >= 0.90, priority > 2 | Add internal note, close ticket |
| Verdict = `benign_policy`, confidence >= 0.80 | Add internal note, send customer message if applicable, set Waiting Customer |
| Verdict = `false_positive`, confidence 0.70-0.89 | Add internal note only (keep ticket open for review) |

**Require human approval:**

| Condition | Action |
|-----------|--------|
| Verdict = `suspicious` | Present investigation results, require approval |
| Verdict = `likely_threat` | Present investigation results, require immediate action |
| Confidence < 0.70 | Present investigation results, require approval |
| Priority <= 2 (high/critical) | Always require approval regardless of verdict |
| Destructive action (disable account, block IP) | Always require approval |

This dramatically reduces human workload. Most SOC alerts are false positives or benign policy alerts that the system handles automatically.

### Stage 8: Document & Log (Simplified)

- Internal Autotask note with investigation findings (technical)
- Customer-visible note with plain language message (only when needed)
- Activity log entry with verdict, confidence, action taken
- OSINT results cached for 24 hours

---

## Part 2: Revised Incident UI Layout

### Current Layout (11 sections, ~1050 lines of JSX)

1. Back link
2. Incident summary card (verdict, company, tickets, device, timestamp)
3. Tickets section (per-ticket expandable details with reasoning, description, notes)
4. Proposed Autotask actions / dry run preview (merge, note, status/priority/queue changes, escalation)
5. Action approval queue (per-action approve/reject with "what will happen" previews)
6. Recommended human actions (step list with [AI]/[HUMAN] prefixes, risk level, draft message)
7. Customer communication plan (recipient, method, message, follow-up, response handling)
8. Next cycle automation (numbered checklist)
9. Supporting reasoning (duplicate of AI summary)
10. Activity log (chronological action list)
11. Override / admin decision (verdict + status dropdowns)

### Revised Layout (5 sections, target ~400 lines)

```
┌─────────────────────────────────────────────────────┐
│  ← Back to Incidents                                │
│                                                     │
│  SECTION 1: INCIDENT OVERVIEW                       │
│  ┌───────────────────────────────────────────────┐  │
│  │  Company: Soaring Works Inc                   │  │
│  │  Ticket: T20240315.0042      Source: SaaS     │  │
│  │  Alert: Stale Account     Severity: Low       │  │
│  │  Confidence: 85%                              │  │
│  │                                               │  │
│  │  ┌─────────────────────────┐                  │  │
│  │  │  BENIGN POLICY ALERT    │  ← verdict badge │  │
│  │  └─────────────────────────┘                  │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  SECTION 2: INVESTIGATION SUMMARY                   │
│  ┌───────────────────────────────────────────────┐  │
│  │  The alert was triggered because the account  │  │
│  │  alexb@soaringworksinc.com has been inactive  │  │
│  │  for more than 90 days. No suspicious login   │  │
│  │  activity was detected and no threat intel    │  │
│  │  indicators were found. This is a routine     │  │
│  │  stale account alert.                         │  │
│  │                                               │  │
│  │  ▸ Threat Intelligence  (expandable)          │  │
│  │    IP: 203.0.113.45 — Clean (AbuseIPDB: 0)   │  │
│  │    Geo: Binghamton, NY, US                    │  │
│  │    ASN: AS7018 AT&T Services                  │  │
│  │    VirusTotal: 0/90 malicious                 │  │
│  │                                               │  │
│  │  ▸ Technical Details  (expandable)            │  │
│  │    AI reasoning, ticket description, notes,   │  │
│  │    device verification, raw OSINT data        │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  SECTION 3: RECOMMENDED ACTION                      │
│  ┌───────────────────────────────────────────────┐  │
│  │  Contact customer to confirm whether the      │  │
│  │  inactive account should be disabled.         │  │
│  │                                               │  │
│  │  Actions to execute:                          │  │
│  │  ☑ Add internal investigation note            │  │
│  │  ☑ Send customer message                      │  │
│  │  ☑ Set ticket to Waiting Customer             │  │
│  │                                               │  │
│  │  ▸ Preview customer message  (expandable)     │  │
│  │  ▸ Preview internal note  (expandable)        │  │
│  │                                               │  │
│  │  [Approve]    [Override]    [Escalate]         │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  SECTION 4: ACTIVITY LOG  (collapsed by default)    │
│  ┌───────────────────────────────────────────────┐  │
│  │  ▸ 3 events                                   │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  SECTION 5: ADMIN OVERRIDE  (collapsed by default)  │
│  ┌───────────────────────────────────────────────┐  │
│  │  ▸ Override verdict or status                 │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Section Details

**Section 1: Incident Overview** (always visible)
- Company name, ticket number (linked to Autotask), alert type + source
- Severity + confidence score as percentage
- Large verdict badge: `FALSE POSITIVE` (green) | `BENIGN POLICY ALERT` (blue) | `SUSPICIOUS` (rose) | `LIKELY THREAT` (red)
- Timestamp, device hostname (if applicable)
- For multi-ticket incidents: ticket count with primary ticket number

**Section 2: Investigation Summary** (always visible)
- **Summary paragraph**: 2-4 sentences from the AI summarizing what it discovered. This is the most important section — replaces the entire reasoning chain, step lists, and supporting reasoning.
- **Threat Intelligence** (expandable `<details>`): Only shown if OSINT lookups were performed. Per-IP: reputation score, geolocation, ASN, VPN/Tor/Proxy flags, VirusTotal results. Per-domain: VirusTotal, categories, registration date.
- **Technical Details** (expandable `<details>`): Full AI reasoning, raw ticket description, ticket notes, device verification details. For admins who want to drill deeper.

**Section 3: Recommended Action** (always visible)
- One-line description of the recommended action
- Checklist of specific actions to execute (internal note, customer message, status change)
- Expandable previews of the customer message and internal note
- Three buttons: **Approve** (green) | **Override** (slate) | **Escalate** (rose)
- For auto-executed actions: shows "Actions executed automatically" with timestamp and an "Undo" button

**Section 4: Activity Log** (collapsed by default)
- Simplified timeline of events for this incident

**Section 5: Admin Override** (collapsed by default)
- Verdict and status override dropdowns

### What's Removed from the Current UI

| Removed Section | Why |
|-----------------|-----|
| Step-by-step human guidance list | AI performs the work, humans just approve/override |
| Customer Communication Plan section | Merged into Recommended Action as expandable preview |
| Next Cycle Automation section | Handled internally by engine, not shown to user |
| Supporting Reasoning section | Merged into Technical Details expandable |
| Dry Run Preview section | Merged into Recommended Action checklist |
| Per-ticket expandable sections (reasoning, description, notes) | Investigation summary covers all tickets; details in Technical Details |
| Separate merge reasoning section | One line item in action checklist |
| Multiple "what will happen" cards per action | Single action panel with checklist |

### Verdict Taxonomy Change

| Current | Revised | Color | Use Case |
|---------|---------|-------|----------|
| `false_positive` | `false_positive` | Green | Alert triggered by noise, no real event |
| _(new)_ | `benign_policy` | Blue | Real event, no threat (stale accounts, compliance, config alerts) |
| `suspicious` | `suspicious` | Rose | Needs human investigation |
| `escalate` | `likely_threat` | Red | Probable real threat, urgent response needed |
| `informational` | _(removed)_ | — | Absorbed into `false_positive` or `benign_policy` |

The new `benign_policy` verdict covers policy-triggered alerts (stale accounts, compliance notifications, configuration alerts) that are not false positives but are also not threats. These are legitimate alerts that require a procedural response, not a security investigation.

---

## Part 3: Revised Automation Model

### Confidence Tiers & Automation

```
┌─────────────────────────────────────────────────────────┐
│  TIER 1: FULL AUTO                                      │
│  Confidence >= 90% + false_positive/benign + priority>2 │
│  → Execute: close/notify, add internal note, log        │
│  → Human sees: "Auto-resolved" badge + Undo button      │
├─────────────────────────────────────────────────────────┤
│  TIER 2: SEMI-AUTO                                      │
│  Confidence 70-89% + false_positive/benign              │
│  → Execute: add internal note only                      │
│  → Human sees: one-click Approve or Override             │
├─────────────────────────────────────────────────────────┤
│  TIER 3: HUMAN REQUIRED                                 │
│  Confidence < 70% OR suspicious verdict                 │
│  → Execute: nothing                                     │
│  → Human sees: full investigation findings + actions     │
├─────────────────────────────────────────────────────────┤
│  TIER 4: URGENT ESCALATION                              │
│  likely_threat OR priority <= 2                         │
│  → Execute: nothing                                     │
│  → Human sees: urgent alert with findings + actions      │
│  → Future: push notification / email alert               │
└─────────────────────────────────────────────────────────┘
```

### Communication Style Rules

**Internal Note** (added to Autotask as internal-only, publish type 2):

```
AI SOC Analysis — Incident #{id}

Verdict: {verdict} (Confidence: {confidence}%)
Alert Source: {source}
Alert Category: {category}

Investigation Summary:
{investigationSummary}

Threat Intelligence:
{threatIntelSummary or "No indicators found."}

Device Verification:
{deviceVerification details or "N/A"}

Historical Pattern:
{X of last Y similar alerts for this company were false positives.}

Action Taken: {action description}
```

**Customer Message** (added to Autotask as customer-visible, publish type 1):

```
Hello,

{Plain language explanation of what was detected.}

{Plain language explanation of recommended next step.}

Please let us know {what response is needed}.

Thank you,
Triple Cities Technology Group — Security Operations
```

**Customer message rules:**
- No technical jargon: no "IP address", "OSINT", "false positive", "IOC", "threat intelligence", "hash", "indicator"
- No severity/confidence scores
- Clear, actionable request
- Professional but approachable tone
- Always include closing signature

### Incidents List View Updates

The incidents list (`SocIncidentsList.tsx`) should also reflect the redesign:
- Add `benign_policy` and `likely_threat` verdict badges
- Add "Auto-resolved" indicator for Tier 1 auto-executed incidents
- Show confidence as a simple percentage, not a progress bar
- Remove action indicator badges (merge/escalate/risk) — these are internal details

### Dashboard Updates

The dashboard (`SocDashboardClient.tsx`) should show:
- **Analyzed Today** (total)
- **Auto-Resolved** (Tier 1 auto-executed count — this is the key efficiency metric)
- **Awaiting Review** (Tier 2 + 3 pending count)
- **Escalated** (Tier 4 count)

Replace the current stats (False Positives, Suspicious, Escalated) with metrics that emphasize automation efficiency.

---

## Implementation Plan — File Changes

### New Files

| File | Purpose |
|------|---------|
| `src/lib/soc/osint.ts` | OSINT enrichment module (AbuseIPDB, VirusTotal, ip-api, AlienVault OTX) with rate limiting and caching |

### Modified Files

| File | Changes |
|------|---------|
| `src/lib/soc/types.ts` | Add `OsintResults`, `EnrichmentContext`, `InvestigationResult`. Add `benign_policy` and `likely_threat` verdicts. Remove `HumanGuidance`, `CustomerCommunication`, `nextCycleChecks` (merged into `InvestigationResult`). |
| `src/lib/soc/engine.ts` | Replace 3-call AI pipeline with: OSINT enrichment → single AI call (+ optional action plan call). Add historical pattern lookup. Implement auto-action for high-confidence benign verdicts. Remove separate action plan generation for simple cases. |
| `src/lib/soc/prompts.ts` | Rewrite prompts to provide real OSINT data as context. Remove step-by-step guidance instructions. Add `benign_policy` verdict. Enforce separate internal/customer message styles. Reduce from 3 prompt builders to 2 (investigation + optional action plan). |
| `src/lib/soc/technician-verifier.ts` | Add `getHistoricalPatterns()` method querying past verdicts for company + category. |
| `src/app/api/soc/migrate/route.ts` | Add `soc_osint_cache` table creation. Add new columns to `soc_incidents` (`osintResults`, `enrichmentContext`, `investigationSummary`, `internalNote`, `customerMessage`, `autoExecuted`, `autoExecutedAt`, `actionType`). |
| `src/app/api/soc/incidents/[id]/route.ts` | Return OSINT results and enrichment context in the incident detail response. |
| `src/components/soc/SocIncidentDetail.tsx` | **Full rewrite** — 5-section layout replacing 11-section layout. ~400 lines target from ~1050 lines. |
| `src/components/soc/SocIncidentsList.tsx` | Update verdict badges for `benign_policy` and `likely_threat`. Add auto-resolved indicator. |
| `src/components/soc/SocDashboardClient.tsx` | Replace stat cards with automation-focused metrics (Auto-Resolved, Awaiting Review). |

### Unchanged Files

| File | Why |
|------|-----|
| `src/lib/soc/correlation.ts` | Correlation logic is already solid and deterministic |
| `src/lib/soc/rules.ts` | Rule matching is already solid and deterministic |
| `src/components/soc/SocConfigPanel.tsx` | Config panel works fine |
| `src/components/soc/SocRulesManager.tsx` | Rules manager works fine |
| `src/components/soc/SocFlowchart.tsx` | Can be updated later to reflect new pipeline |

### New Environment Variables

```
ABUSEIPDB_API_KEY=          # Free tier: 1000 checks/day
VIRUSTOTAL_API_KEY=         # Free tier: 4 requests/minute
ALIENVAULT_OTX_API_KEY=     # Optional — higher rate limits with key
# ip-api.com does not require a key for basic usage
```

### Database Changes

**New table: `soc_osint_cache`**

```sql
CREATE TABLE IF NOT EXISTS soc_osint_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator TEXT NOT NULL,
  "indicatorType" TEXT NOT NULL,       -- 'ip' or 'domain'
  source TEXT NOT NULL,                -- 'abuseipdb', 'virustotal', 'ipapi', 'otx'
  result JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "expiresAt" TIMESTAMPTZ NOT NULL,
  UNIQUE(indicator, "indicatorType", source)
);
CREATE INDEX IF NOT EXISTS idx_osint_cache_lookup
  ON soc_osint_cache(indicator, "indicatorType", source);
CREATE INDEX IF NOT EXISTS idx_osint_cache_expiry
  ON soc_osint_cache("expiresAt");
```

**New columns on `soc_incidents`**

```sql
ALTER TABLE soc_incidents ADD COLUMN IF NOT EXISTS "osintResults" JSONB;
ALTER TABLE soc_incidents ADD COLUMN IF NOT EXISTS "enrichmentContext" JSONB;
ALTER TABLE soc_incidents ADD COLUMN IF NOT EXISTS "investigationSummary" TEXT;
ALTER TABLE soc_incidents ADD COLUMN IF NOT EXISTS "internalNote" TEXT;
ALTER TABLE soc_incidents ADD COLUMN IF NOT EXISTS "customerMessage" TEXT;
ALTER TABLE soc_incidents ADD COLUMN IF NOT EXISTS "autoExecuted" BOOLEAN DEFAULT false;
ALTER TABLE soc_incidents ADD COLUMN IF NOT EXISTS "autoExecutedAt" TIMESTAMPTZ;
ALTER TABLE soc_incidents ADD COLUMN IF NOT EXISTS "actionType" TEXT;
```

### Implementation Order

1. Types & interfaces — Update `types.ts` with new verdicts, OSINT types, investigation result
2. OSINT module — Create `osint.ts` with API integrations + caching
3. Database migration — Add `soc_osint_cache` table, update `soc_incidents` columns
4. Engine redesign — Integrate OSINT enrichment, rewrite pipeline, add auto-action logic
5. Prompt rewrite — New investigation prompt with real OSINT data, separate message styles
6. API updates — Return enrichment data from incident detail endpoint
7. UI rewrite — New 5-section `SocIncidentDetail` component
8. List/dashboard updates — New verdict badges, automation-focused stats
9. Build & lint — `npm run build && npm run lint`
10. Push & deploy

---

## Stale Account Example — Full Revised Flow

To illustrate the complete redesigned workflow:

**Alert arrives:** SaaS Alerts stale account — `alexb@soaringworksinc.com` inactive 90+ days.

**Stage 4 (OSINT):** No IPs extracted from this alert type → OSINT skipped. No domains to check.

**Stage 5 (Enrichment):** Historical lookup finds 12 of the last 14 stale account alerts for Soaring Works were benign policy alerts (86% FP/benign rate).

**Stage 6 (AI Analysis — single Sonnet call):**
- Receives: ticket data, enrichment context (no OSINT, 86% historical benign rate)
- Returns:
  - Verdict: `benign_policy`
  - Confidence: 0.85
  - Investigation summary: "The alert was triggered because the account alexb@soaringworksinc.com has been inactive for more than 90 days. No suspicious login activity was detected and no threat intelligence indicators were found. This is a routine stale account alert."
  - Internal note: Technical documentation of the investigation
  - Customer message: "Hello, We noticed that the account alexb@soaringworksinc.com hasn't been used in over 90 days. For security reasons, unused accounts are typically disabled to reduce risk. Please let us know if this account should remain active or if you would like us to disable it."
  - Recommended action: "Contact customer to confirm whether the inactive account should be disabled."
  - Action type: `notify_customer`

**Stage 7 (Auto-Action):** Confidence 85% + `benign_policy` → Tier 2 (semi-auto). Add internal note automatically. Present customer message for one-click approval.

**UI shows:**
- Verdict badge: `BENIGN POLICY ALERT` (blue)
- Confidence: 85%
- Investigation summary paragraph
- Recommended action: "Contact customer to confirm whether the inactive account should be disabled."
- Actions: ☑ Internal note (already added) | ☐ Send customer message | ☐ Set Waiting Customer
- Buttons: [Approve] [Override] [Escalate]

Admin clicks **Approve** → customer message sent, ticket set to Waiting Customer. Done.
