# Current Tasks

> **Last updated**: 2026-05-17. Compliance workflow build, multi-session.
> **Branch**: `claude/review-workflow-architecture-DdCgz` → auto-merged to `main`.
> **Detailed context**: `docs/SESSION_HANDOFF.md`.

## SOC Cross-Stack Redesign (2026-05-28) — see `docs/SOC_CROSSSTACK_HANDOFF.md`

Shipped: RocketCyber client, cross-stack enrichment (RMM/EDR/DNSFilter/SaaS), shared `CrossStackAssessment` UI, real-time `/api/soc/ingest` webhook (Autotask Extension Callout wired by operator), `soc_known_benign` table. Open:
- [x] **[HIGH]** Datto EDR `/Alerts` fields are under `data` — `fetchEdr` now flattens each alert via `flattenEdrAlert()` (promotes `data.*` up, keeps top-level identity, preserves raw `data`). Surfaces threatName/path/md5/commandLine/parentProcessName/owner/ruleName/mitreId through the type, AI prompt, and UI. "[Unknown]" issue resolved.
- [x] **[HIGH]** SaaS Alerts `/reports/events/query` 422 — the gateway validates `{ body: <ES search> }`; `SaasAlertsClient.getEvents` now wraps the search under a top-level `body` key. Confirmed live on NYSWDA T20260527.0006: source flipped from `error (422)` to `no_data`.
- [ ] **[MED]** Operator: map tools per customer in Compliance → Connect Tools (esp. Datto EDR org, SaaS Alerts customer).
- [ ] **[MED]** Confirm Autotask Extension Callout sends a usable ticket id/number (check first callout's `receivedKeys`).
- [ ] **[LOW]** Known Benign admin UI; confirm Vercel env (`ROCKETCYBER_API_TOKEN`, `SOC_INGEST_SECRET`) + `dry_run=false`.

## Open — Resume here (compliance workflow stream)

The operator's last instruction was **"do them all"** for these three slices. The previous session ran out of context partway through Slice A and paused.

### [ ] Slice A — SharePoint import: fetch + extract actual document content
Today bulk-imported policies are stored with content `[SHAREPOINT:<url>]` (placeholder). The AI analyzer runs against ~50 bytes and returns shallow garbage.

- Add deps: `mammoth` (.docx) + `pdf-parse` (.pdf)
- New `src/lib/compliance/policy-generation/sharepoint-fetch.ts` — Graph download + per-extension text extraction
- Update `importSelectedFiles` in `PolicyManager.tsx` AND/OR `/api/compliance/policies` POST to extract before storing
- Watch `maxDuration` if extraction is slow per file

### [ ] Slice B — Intune compliance policy executor
Operator hit control CIS 2.3 ("Address Unauthorized Software") — needs an Intune compliance policy (technical). Today's allowlist correctly suppresses the wrong (documentation) Remediate option, but there's no right option to offer yet.

- New `src/lib/compliance/actions/executors/intune-compliance.ts`
- Pattern: mirror existing `intune-defender.ts` (same Graph auth, idempotency marker, `allDevicesAssignmentTarget`)
- Different Graph endpoint: `/v1.0/deviceManagement/deviceCompliancePolicies` (compliance, not configuration)
- Sane Windows 10 baseline: Defender running + real-time on + no active threats; consider BitLocker / secure boot / OS min
- Catalog action `intune.create_compliance_policy.windows_baseline` with satisfiesControls for cis-v8 1.2, 2.3, 2.5, 4.1
- Live previewer using `countEnrolledWindowsDevices` (already exists in intune-defender.ts)
- Permissions: `DeviceManagementConfiguration.ReadWrite.All`

### [ ] Slice C — doc-primary-controls.ts curation for non-CIS frameworks
Today only CIS v8 is curated. HIPAA / NIST 800-171 / CMMC / PCI fail-open → `policy.generate_for_control` Remediate always shows for them, same conflation bug just not caught yet.

- Read each framework's mappings in `framework-mappings.ts`
- Per (framework, controlId): is documentation the primary fix?
- HIPAA: most are doc-primary. NIST/CMMC/PCI: more technical-heavy.
- Add cleared frameworks to `CURATED_FRAMEWORKS` set in `doc-primary-controls.ts`

## Just-shipped (this multi-session push)

### Compliance workflow build (8 of 8 steps live)
- [x] Customer picker landing (deleted ComplianceDashboard + PolicyGenerationDashboard)
- [x] Step 1 Onboard
- [x] Step 2 Customer Profile (question-engine-driven)
- [x] Step 3 Connect Tools (Tool Inventory toggle + Live Data Feeds + Platform Mappings embedded)
- [x] Step 4 Policies (PolicyManager embedded — scan/single-add/library/publish/approval)
- [x] Step 5 Run Assessment
- [x] Step 6 Findings (Remediate button + drillable counter cards + disposition collapsed-by-default)
- [x] Step 7 Changes log
- [x] Step 8 Reassess
- [x] Microsoft Secure Score recommendation breakdown page

### Real Graph executors (8 of 8 catalog actions are real, not stubbed)
- [x] CA policies: MFA-all apply/remove
- [x] CA policies: Block Legacy Auth apply/remove
- [x] Password protection enable/disable
- [x] Intune Defender realtime configuration profile apply/remove
- [x] Policy generation for control (Claude API)
- [x] Policy publish to SharePoint (.docx upload via Graph)

### Customer-portal approval loop (closed)
- [x] `compliance_policy_approvals` table + HMAC-signed magic link token
- [x] Operator-side: Request approval button on every analyzed policy row
- [x] Customer-side: token-gated review page with approve/reject + notes
- [x] Server-side publish gate consults the approval table as authoritative
- [x] Per-policy status badge + pending-approvals panel on workflow landing + per-customer count on picker

### Iterated operator-feedback fixes
- [x] Connector toggle UI on /connect; intentional-off now reports as `not_applicable` not `collection_failed`
- [x] /admin/compliance dashboard → thin picker (operator: "this seems redundant")
- [x] Workflow nav highlights the page you're VIEWING, not the next-to-do step
- [x] SharePoint scan parser handles all four URL shapes (direct, viewer ?id=, share /r/, custom lib)
- [x] SharePoint scan recurses subfolders + empty-state card on 0 results
- [x] Findings counter cards drill-filter the list
- [x] Remediate previews are specific (CA executors query Graph for user/device counts)
- [x] Remediate picker labels distinguish "documentation only" vs "pushes to tenant"
- [x] `policy.generate_for_control` Remediate suppressed for non-doc-primary controls (CIS v8 curated)
- [x] Policies add-form: scan-multi-site vs add-single split, dropped always-on permission note
- [x] SharePoint import surfaces progress + result card (no more silent close)
- [x] Customer profile gains `sop_storage_locations` question; evaluators honor it for SOP messaging
- [x] .docx download button as universal manual-upload destination

## Deferred (not pulled into scope unless asked)

- [ ] IT Glue / My Glue direct publish API
- [ ] End-customer-facing compliance landing page (today only the magic-link review)
- [ ] Per-tenant credential encryption (W5)
- [ ] Drop legacy `policy_org_profiles` + `compliance_customer_context` tables (W16 — operator-gated)
