# SOC Reasoning Layer — Design Proposal

## Problem Statement

The current SOC dashboard shows raw alert data and immediately presents actionable buttons ("Add Note", "Send Customer Message") without clearly communicating **what the AI determined** about the alert. A technician opening a ticket sees the raw alert, a verdict badge, and proposed Autotask changes — but the system doesn't explain its reasoning in a structured, human-friendly way.

The system should behave like a human SOC analyst: investigate → summarize findings → assess risk → recommend actions. Only after the reasoning is clear should the UI present actionable items.

---

## Current Architecture Audit

### What Already Exists

The engine already performs a multi-stage analysis pipeline. Here's what each stage produces and where the data lives:

| Stage | AI Model | Output Fields | Where Stored |
|-------|----------|---------------|--------------|
| **Tier 1: Screening** (Haiku) | alertSource, category, extractedIps, isFalsePositive, confidence, reasoning, needsDeepAnalysis, recommendedAction | `soc_ticket_analysis` (verdict, confidenceScore, alertSource, alertCategory, aiReasoning) |
| **Tier 2: Deep Analysis** (Sonnet) | verdict, confidence, summary, reasoning, ticketNote, recommendedAction, mergeInto, riskLevel | Overwrites Tier 1 fields in `soc_ticket_analysis` |
| **Tier 3: Action Plan** (Sonnet) | incidentSummary, proposedActions, humanGuidance, customerCommunication, nextCycleChecks, supportingReasoning | `soc_incidents` (proposedActions, humanGuidance, customerCommunication, nextCycleChecks as JSONB) |

### What the UI Currently Shows (SocTicketDetail.tsx)

1. **Ticket header** — number, status, priority, company, assignee, queue
2. **Original Alert** — raw description in a scrollable monospace box
3. **SOC Assessment** — verdict badge + confidence + a plain-language summary pulled from:
   - `humanGuidance.summary` (preferred)
   - `incidentActionPlan.aiSummary` (fallback)
   - `analysis.aiReasoning` (last resort)
4. **Quick facts row** — source, category, IP, device verified, tech verified, risk level
5. **Remediation Plan** — numbered steps from `humanGuidance.steps[]`
6. **Customer Communication** — draft message from `customerCommunication.message`
7. **Pending Actions** — approve/reject buttons for queued actions
8. **Follow-up Monitoring** — next cycle checks
9. **Technical Details** — collapsible section with full AI reasoning, internal note, metadata

### Where the Current System Falls Short

1. **The "summary" is buried and inconsistent.** The plain-language explanation comes from 3 different fallback sources, each with different quality and structure. There's no guaranteed "here's what happened" section.

2. **Classification is too narrow.** The current verdict system has only 4 values: `false_positive`, `suspicious`, `escalate`, `informational`. The user wants 5 classifications: False Positive, Expected Activity, Informational, Suspicious, Confirmed Threat. Notably, "Expected Activity" (e.g., technician login from known device) is different from "False Positive" (e.g., alert triggered by a software bug).

3. **Investigation evidence is rigid.** The quick facts row always shows the same 7 fields (source, category, IP, device verified, tech verified, risk level) regardless of alert type. A phishing alert has completely different evidence than a VPN detection alert.

4. **Actions appear before reasoning.** Pending actions (Add Note, Send Customer Message) are shown alongside the assessment rather than clearly after the reasoning layer.

5. **The action plan prompt is a rigid JSON schema.** The Tier 3 prompt (`buildActionPlanPrompt`) demands a fixed JSON shape with `merge`, `internalNote`, `statusChange`, `priorityChange`, `queueChange`, `escalation` fields. This works but doesn't naturally accommodate the "reasoning model" the user wants.

6. **Customer messages are generated even for false positives.** The action plan prompt tells the AI to draft customer messages for routine findings. The user wants customer messages only when truly necessary.

---

## Proposed Design: Reasoning Layer

### Core Principle

Every alert analysis should produce a **structured reasoning document** that is alert-type-agnostic. The reasoning document has 4 mandatory sections and 1 optional section. The fields within each section are dynamic — the AI includes only what's relevant.

### Reasoning Document Structure

```
┌─────────────────────────────────────────────┐
│ 1. INCIDENT SUMMARY                         │
│    Plain-language explanation of what        │
│    happened. 2-4 sentences. No jargon.       │
│    Always present.                           │
├─────────────────────────────────────────────┤
│ 2. SECURITY ASSESSMENT                      │
│    • Classification (5-value enum)           │
│    • Risk Level (none/low/medium/high/crit)  │
│    • Confidence (0-100%)                     │
│    • Assessment rationale (1-3 sentences)    │
│    Always present.                           │
├─────────────────────────────────────────────┤
│ 3. INVESTIGATION EVIDENCE                   │
│    Dynamic key-value pairs. Only fields      │
│    relevant to THIS alert. Examples:         │
│    • Login location: "Manila, Philippines"   │
│    • Device: "ACME-WKS-001 (verified)"       │
│    • User account: "jsmith@acme.com"         │
│    • IP reputation: "Clean, no threat intel" │
│    • Pattern: "3rd occurrence this month"    │
│    Always present (at least 1 evidence item) │
├─────────────────────────────────────────────┤
│ 4. RECOMMENDED ACTION                       │
│    What the SOC analyst recommends.          │
│    Single clear recommendation with          │
│    brief justification. Examples:            │
│    • "Close as false positive — verified     │
│      technician device."                     │
│    • "Contact customer to verify login."     │
│    • "Escalate — confirmed malicious."       │
│    Always present.                           │
├─────────────────────────────────────────────┤
│ 5. PROPOSED ACTIONS (only after reasoning)   │
│    Concrete Autotask operations:             │
│    • Add internal investigation note         │
│    • Send customer message (with draft)      │
│    • Change ticket status                    │
│    • Escalate to human analyst               │
│    • Close ticket                            │
│    Shown BELOW the reasoning, as actionable  │
│    items the technician can approve/reject.   │
└─────────────────────────────────────────────┘
```

### New Classification System (5 values)

| Classification | Description | Typical Action |
|---------------|-------------|----------------|
| **False Positive** | Alert triggered by a system error, misconfiguration, or benign anomaly. No real security event occurred. | Auto-close, suppress |
| **Expected Activity** | Real activity that is legitimate and expected — e.g., technician login, scheduled scan, onboarding. Alert is accurate but not a threat. | Close with note, no customer contact |
| **Informational** | Activity worth noting but does not require immediate action — e.g., new software detected on a managed device, password change. | Log, monitor |
| **Suspicious** | Activity that cannot be confirmed as benign. Requires investigation or customer verification. | Investigate, contact customer |
| **Confirmed Threat** | Activity confirmed malicious or compromised. Requires immediate human response. | Escalate immediately |

This replaces the current 4-value system (`false_positive`, `suspicious`, `escalate`, `informational`). The key addition is **Expected Activity** which is currently lumped into `false_positive` — a technician seeing "False Positive" for a legitimate technician login is confusing. "Expected Activity" is more accurate.

### Dynamic Investigation Evidence

Instead of a fixed set of fields, the AI produces an array of evidence items:

```typescript
interface EvidenceItem {
  label: string;     // e.g., "Login Location", "Device", "IP Reputation"
  value: string;     // e.g., "Manila, Philippines", "ACME-WKS-001"
  type: 'neutral' | 'positive' | 'negative' | 'info';  // for color-coding
}
```

The AI determines which evidence items are relevant based on the alert type:

- **Impossible travel alert** → Location, IP, User Account, Device, Login History
- **Malware detection** → File Path, Hash, Detection Engine, Device, Quarantine Status
- **Suspicious login** → Location, IP Reputation, User Account, Time Pattern, Device Ownership
- **Software install** → Software Name, Device, User, Business Justification
- **VPN detection** → VPN Service, Device, User, Company Policy

This is not a template — the AI decides what's relevant. The UI renders whatever evidence items the AI returns.

---

## Implementation Plan

### Phase 1: New Reasoning Schema (Backend)

**What changes:**

1. **New type: `SocReasoning`** in `src/lib/soc/types.ts`

```typescript
type Classification =
  | 'false_positive'
  | 'expected_activity'  // NEW
  | 'informational'
  | 'suspicious'
  | 'confirmed_threat';  // renamed from 'escalate'

interface EvidenceItem {
  label: string;
  value: string;
  type: 'neutral' | 'positive' | 'negative' | 'info';
}

interface SocReasoning {
  incidentSummary: string;           // Plain-language, 2-4 sentences
  classification: Classification;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  confidence: number;                // 0.0-1.0
  assessmentRationale: string;       // 1-3 sentences explaining the classification
  evidence: EvidenceItem[];          // Dynamic, alert-type-specific
  recommendedAction: string;         // Free-text recommendation
  customerMessageRequired: boolean;  // Explicit flag
  customerMessageDraft: string | null; // Only if required=true
  internalNote: string;              // Full investigation note for Autotask
}
```

2. **New prompt: `buildReasoningPrompt()`** in `src/lib/soc/prompts.ts`

This replaces the current Tier 3 `buildActionPlanPrompt()`. The key difference is the prompt instructs the AI to produce a **reasoning document** rather than an **operational plan**. The prompt:

- Tells the AI to use the 5-value classification system
- Asks for dynamic evidence items (not fixed fields)
- Explicitly says: "Only set customerMessageRequired to true when the situation genuinely requires customer communication. Routine false positives and expected activity do NOT require customer messages."
- Keeps the internal note requirement (full OSINT investigation)
- Removes the rigid `proposedActions` JSON structure in favor of the reasoning document

3. **Database: Add `reasoning` JSONB column** to `soc_incidents`

Store the full `SocReasoning` object as JSONB on the incident. This replaces the current separate `proposedActions`, `humanGuidance`, `customerCommunication` columns — those become redundant once the reasoning document is the source of truth. (Keep old columns for backwards compatibility during migration.)

4. **Migration path for verdict values**:
   - `false_positive` → `false_positive` (unchanged)
   - `informational` → `informational` (unchanged)
   - `suspicious` → `suspicious` (unchanged)
   - `escalate` → `confirmed_threat` (renamed)
   - New: `expected_activity`

### Phase 2: Engine Integration

**What changes in `src/lib/soc/engine.ts`:**

The 3-tier pipeline stays, but the Tier 3 output changes:

- **Tier 1 (Screening)**: Unchanged — still Haiku, still produces alertSource, category, isFalsePositive, confidence, needsDeepAnalysis
- **Tier 2 (Deep Analysis)**: Unchanged — still Sonnet for ambiguous cases
- **Tier 3 (was Action Plan, now Reasoning)**: Produces `SocReasoning` instead of `IncidentActionPlan`

The engine stores the reasoning document on the incident and derives pending actions from it:

```
SocReasoning.internalNote        → pending action: add_note
SocReasoning.customerMessageDraft → pending action: send_customer_message (only if customerMessageRequired=true)
SocReasoning.classification       → determines status change logic
```

**Customer message safeguard**: The engine enforces that `send_customer_message` pending actions are ONLY created when `reasoning.customerMessageRequired === true`. This is a hard gate — even if the AI puts text in `customerMessageDraft`, the action is not created unless the flag is true.

### Phase 3: UI Redesign (SocTicketDetail.tsx)

**New layout order:**

```
┌────────────────────────────────────────────────────┐
│ TICKET HEADER (number, status, priority, company)  │
├────────────────────────────────────────────────────┤
│ INCIDENT SUMMARY                                    │
│ "A login was detected on John Smith's account from  │
│  Manila, Philippines at 2:15 AM EST. The device     │
│  was verified as a Triple Cities Tech workstation   │
│  assigned to technician Mike Johnson."              │
├────────────────────────────────────────────────────┤
│ SECURITY ASSESSMENT                                 │
│ ┌──────────────────┐ ┌──────────┐ ┌──────────────┐ │
│ │ Expected Activity│ │ Low Risk │ │ 94% Confident│ │
│ └──────────────────┘ └──────────┘ └──────────────┘ │
│ "This login matches a known technician device       │
│  performing routine maintenance."                   │
├────────────────────────────────────────────────────┤
│ INVESTIGATION EVIDENCE                              │
│ ┌─────────────────────┬───────────────────────────┐ │
│ │ Login Location      │ Manila, Philippines    [!]│ │
│ │ Device              │ TCT-WKS-042 (verified) [✓]│ │
│ │ User Account        │ jsmith@acme.com        [ ]│ │
│ │ IP Reputation       │ Clean, no threat intel [✓]│ │
│ │ Login History       │ 3rd login this week    [ ]│ │
│ │ Assigned Technician │ Mike Johnson           [✓]│ │
│ └─────────────────────┴───────────────────────────┘ │
├────────────────────────────────────────────────────┤
│ RECOMMENDED ACTION                                  │
│ "Close as expected activity — this is a verified    │
│  technician logging in from a known device."        │
├────────────────────────────────────────────────────┤
│ ─── Actions ──────────────────────────────── ─── ── │
│ [✓ Approve: Add Internal Note]                      │
│ [✓ Approve: Close Ticket]                           │
│                                                      │
│ ▸ Technical Details (collapsed)                     │
│   Full AI reasoning, raw alert, metadata            │
└────────────────────────────────────────────────────┘
```

**Key UI changes:**

1. **Incident Summary** is the FIRST thing after the ticket header. Not the raw alert.
2. **Security Assessment** shows the 5-value classification as a colored badge, plus risk and confidence.
3. **Investigation Evidence** renders dynamic `EvidenceItem[]` as a clean table with color-coded indicators.
4. **Recommended Action** is a clear, single recommendation — not a list of proposed Autotask changes.
5. **Actions section** appears BELOW the reasoning, clearly separated. Only shows actions that the reasoning justified.
6. **Raw alert text** moves into the collapsible Technical Details section.
7. **Customer message** only appears in the Actions section when `customerMessageRequired === true`.

### Phase 4: Classification Color System

| Classification | Badge Color | Border | Icon Suggestion |
|---------------|-------------|--------|-----------------|
| False Positive | Green | green-500/30 | Check circle |
| Expected Activity | Cyan | cyan-500/30 | Shield check |
| Informational | Blue | blue-500/30 | Info circle |
| Suspicious | Rose | rose-500/30 | Alert triangle |
| Confirmed Threat | Red | red-500/30 | X circle |

Evidence item type colors:
- `positive` → green text (confirms benign)
- `negative` → rose text (raises concern)
- `neutral` → default text
- `info` → cyan text (contextual)

---

## Backwards Compatibility

- The `verdict` field on `soc_ticket_analysis` continues to work. We add `expected_activity` and `confirmed_threat` as new values, keep old values working.
- The `soc_incidents` table gets a new `reasoning` JSONB column. Old incidents without it still render using the legacy `proposedActions`/`humanGuidance`/`customerCommunication` columns.
- The `SocTicketDetail` component checks for `reasoning` first, falls back to legacy fields.
- No data migration needed for historical records — they continue to display using the old layout.

---

## What Does NOT Change

- **Tier 1 and Tier 2 AI calls** — screening and deep analysis prompts stay the same
- **Correlation engine** — grouping logic unchanged
- **Rules system** — suppression/escalation rules unchanged
- **Pending actions workflow** — approve/reject mechanism unchanged
- **Activity feed** — logging structure unchanged
- **AI Analyst chat** — conversational interface unchanged
- **Config panel** — all configuration options stay

---

## Files Modified

| File | Change |
|------|--------|
| `src/lib/soc/types.ts` | Add `Classification`, `EvidenceItem`, `SocReasoning` types |
| `src/lib/soc/prompts.ts` | Add `buildReasoningPrompt()`, keep old prompts for backwards compat |
| `src/lib/soc/engine.ts` | Use new reasoning prompt in Tier 3, store reasoning JSONB |
| `src/app/api/soc/migrate/route.ts` | Add `reasoning` column to `soc_incidents` |
| `src/app/api/soc/tickets/[id]/analysis/route.ts` | Include `reasoning` field in response |
| `src/components/soc/SocTicketDetail.tsx` | Redesign to show reasoning-first layout |

---

## Customer Message Policy

The current system is too eager with customer messages. The new policy encoded in the reasoning prompt:

**Send a customer message ONLY when:**
- The alert requires the customer to confirm or deny activity
- The alert involves a confirmed or likely compromise that the customer must know about
- The alert requires the customer to take a specific action (change password, etc.)

**Do NOT send a customer message when:**
- The alert is a false positive
- The alert is expected activity (technician login, scheduled scan)
- The alert is informational with no customer action needed
- The alert can be fully resolved by the SOC team without customer involvement

---

## Open Questions for Discussion

1. **Should "Expected Activity" auto-close without pending action?** If a technician login is classified as Expected Activity with 95% confidence, should it skip the approval queue entirely?

2. **Should the evidence items have a fixed maximum?** The AI could return 20 evidence items for a complex alert. Should we cap at, say, 8 and put the rest in Technical Details?

3. **Should the old `escalate` verdict records be migrated to `confirmed_threat`?** Or keep `escalate` as-is for historical records and only use `confirmed_threat` for new analyses?

4. **Should the reasoning document replace or supplement the current `proposedActions` JSONB?** Current approach: replace for new analyses, keep old data for backwards compat. Alternative: store both and let the UI prefer reasoning.
