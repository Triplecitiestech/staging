/**
 * SOC Triage Engine — Main Pipeline Orchestrator
 *
 * Pipeline: Detect → Enrich → Correlate → Analyze → Triage → Document → Log
 */

import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';
import { trackAnthropicCall } from '@/lib/api-usage-tracker';
import { getAutotaskTicketUrl } from '@/lib/autotask';
import { correlateTickets } from './correlation';
import { extractPrimaryIp } from './ip-extractor';
import { buildScreeningPrompt, buildNarrativePrompt } from './prompts';
import { matchRules, isSecurityTicket, detectAlertSource } from './rules';
import { verifyTechnicianByIp, verifyTechnicianLive } from './technician-verifier';
import { enrichTicket, extractRocketCyberIds } from './enrichment';
import { isResolvedStatus } from '@/lib/tickets/utils';
import {
  alertSourceName,
  attributeEvents,
  buildAssessmentNote,
  buildCustomerMessage,
  classificationLabel,
  classifyFromEvidence,
  formatEventLine,
  formatVisibilityLines,
  guardNarrative,
  isVerifiedVisibility,
  lintCustomerMessage,
  resolveCompanyProfile,
  technicianActions,
  type AttributedEvent,
  type PrimaryDetection,
} from './evidence';
import {
  executeCustomerNotify,
  liveWriter,
  pgStore,
  planCustomerNotify,
  twinKeyFromText,
  writeAssessmentNote,
  type AssessmentRecord,
  type NotifyPlan,
  type SocAssessmentStore,
  type SocWriter,
  type WriterCall,
} from './delivery';
import type {
  SecurityTicket,
  SocConfig,
  SocRule,
  TriageResult,
  SocJobMeta,
  ScreeningResult,
  DeviceVerification,
  IncidentGroup,
  SocAssessment,
  SocClassification,
  EnrichmentBundle,
  Verdict,
  AlertSource,
  AlertCategory,
  AssessmentSignals,
  RecurrenceSignal,
  EvidenceItem,
} from './types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

// ── Config Loading ──

export async function loadSocConfig(): Promise<SocConfig> {
  const rows = await prisma.$queryRaw<{ key: string; value: string }[]>`
    SELECT key, value FROM soc_config
  `;
  const map = new Map(rows.map(r => [r.key, r.value]));
  const get = (k: string, def: string) => map.get(k) || def;

  return {
    agent_enabled: get('agent_enabled', 'true') === 'true',
    dry_run: get('dry_run', 'true') === 'true',
    correlation_window_minutes: parseInt(get('correlation_window_minutes', '15'), 10),
    confidence_auto_close: parseFloat(get('confidence_auto_close', '0.9')),
    confidence_flag_review: parseFloat(get('confidence_flag_review', '0.7')),
    confidence_floor: parseFloat(get('confidence_floor', '0.5')),
    max_ai_calls_per_run: parseInt(get('max_ai_calls_per_run', '100'), 10),
    screening_model: get('screening_model', 'claude-haiku-4-5-20251001'),
    deep_analysis_model: get('deep_analysis_model', 'claude-sonnet-4-6'),
    internal_site_ids: JSON.parse(get('internal_site_ids', '[]')),
    auto_post_internal_note: get('auto_post_internal_note', 'true') === 'true',
    confidence_uncorroborated_cap: parseFloat(get('confidence_uncorroborated_cap', '0.5')),
    recurring_pattern_threshold: parseInt(get('recurring_pattern_threshold', '3'), 10),
  };
}

export async function loadActiveRules(): Promise<SocRule[]> {
  const rows = await prisma.$queryRaw<Array<{
    id: string; name: string; description: string | null; ruleType: string;
    pattern: Record<string, unknown>; action: string; isActive: boolean; priority: number;
    createdBy: string | null; matchCount: number; lastMatchAt: Date | null;
    createdAt: Date; updatedAt: Date;
  }>>`
    SELECT * FROM soc_rules WHERE "isActive" = true ORDER BY priority ASC
  `;
  return rows as unknown as SocRule[];
}

// ── Main Pipeline ──

export interface TriageRunResult {
  meta: SocJobMeta;
  results: TriageResult[];
  errors: string[];
  ticketDetails: TicketDetail[];
}

export interface TicketDetail {
  autotaskTicketId: string;
  ticketNumber: string;
  title: string;
  status: 'processed' | 'skipped' | 'error';
  verdict?: string;
  confidence?: number;
  reason?: string;
}

/** What started this run. Only 'manual' may re-assess a ticket that already has an assessment. */
export type SocTrigger = 'cron' | 'ingest' | 'manual' | 'bootstrap' | 'dry_run';

export interface SocRuntime {
  trigger?: SocTrigger;
  /** Where Autotask writes and emails go. Default: live, as the SOC's API user. */
  writer?: SocWriter;
  /** Idempotency records. Default: Postgres. null = no idempotency (bootstrap). */
  store?: SocAssessmentStore | null;
  /** Write soc_incidents / soc_ticket_analysis / soc_activity_log. Default true. */
  persist?: boolean;
  /** 'off' skips both LLM calls (screening + narrative); the outcome does not depend on them. */
  llm?: 'on' | 'off';
  now?: () => Date;
}

interface ResolvedRuntime {
  trigger: SocTrigger;
  writer: SocWriter;
  store: SocAssessmentStore | null;
  persist: boolean;
  llm: 'on' | 'off';
  now: () => Date;
}

async function resolveRuntime(rt: SocRuntime | undefined): Promise<ResolvedRuntime> {
  const trigger = rt?.trigger ?? 'cron';
  return {
    trigger,
    writer: rt?.writer ?? await liveWriter(),
    store: rt?.store === undefined ? (trigger === 'bootstrap' ? null : pgStore()) : rt.store,
    persist: rt?.persist ?? true,
    llm: rt?.llm ?? 'on',
    now: rt?.now ?? (() => new Date()),
  };
}

/**
 * Run the full triage pipeline on a batch of tickets.
 * Returns results and metadata for logging.
 */
export async function runTriagePipeline(
  tickets: SecurityTicket[],
  config: SocConfig,
  rules: SocRule[],
  runtime?: SocRuntime,
): Promise<TriageRunResult> {
  const rt = await resolveRuntime(runtime);
  const meta: SocJobMeta = {
    ticketsProcessed: 0,
    notesAdded: 0,
    falsePositives: 0,
    escalated: 0,
    skipped: 0,
    errors: 0,
    aiCallsMade: 0,
  };
  const results: TriageResult[] = [];
  const errors: string[] = [];
  const ticketDetails: TicketDetail[] = [];
  let aiCallsThisRun = 0;

  // Step 1: Filter to security-related tickets
  const securityTickets = tickets.filter(isSecurityTicket);
  const nonSecurityTickets = tickets.filter(t => !isSecurityTicket(t));
  meta.skipped = nonSecurityTickets.length;

  // Log skipped (non-security) tickets
  for (const t of nonSecurityTickets) {
    ticketDetails.push({
      autotaskTicketId: t.autotaskTicketId,
      ticketNumber: t.ticketNumber,
      title: t.title,
      status: 'skipped',
      reason: 'Non-security ticket',
    });
  }

  if (securityTickets.length === 0) {
    return { meta, results, errors, ticketDetails };
  }

  // Step 2: Correlate into incident groups
  const groups = correlateTickets(securityTickets, config.correlation_window_minutes);

  // Step 3: Process each group
  for (const group of groups) {
    if (aiCallsThisRun >= config.max_ai_calls_per_run) {
      errors.push(`AI call limit reached (${config.max_ai_calls_per_run}). Remaining tickets deferred.`);
      break;
    }

    try {
      const outcome = await processIncidentGroup(group, config, rules, () => {
        aiCallsThisRun++;
        meta.aiCallsMade++;
      }, rt);

      if (outcome.kind === 'skipped') {
        meta.skipped += group.tickets.length;
        for (const ticket of group.tickets) {
          ticketDetails.push({
            autotaskTicketId: ticket.autotaskTicketId,
            ticketNumber: ticket.ticketNumber,
            title: ticket.title,
            status: 'skipped',
            reason: outcome.reason,
          });
        }
        continue;
      }
      const result = outcome.result;

      results.push(result);
      meta.ticketsProcessed += group.tickets.length;

      if (result.verdict === 'false_positive') meta.falsePositives++;
      if (result.verdict === 'escalate' || result.verdict === 'confirmed_threat') meta.escalated++;
      if (result.noteAutoPosted) meta.notesAdded++;

      // Record per-ticket detail
      for (const ticket of group.tickets) {
        ticketDetails.push({
          autotaskTicketId: ticket.autotaskTicketId,
          ticketNumber: ticket.ticketNumber,
          title: ticket.title,
          status: 'processed',
          verdict: result.verdict,
          confidence: result.confidence,
          reason: result.reasoning.slice(0, 200),
        });
        if (rt.persist) await recordAnalysis(ticket, result);
      }

      // Log activity with rich metadata
      const usedSources = (result.enrichment?.dataSources || [])
        .filter(s => s.status === 'used')
        .map(s => s.source);
      if (rt.persist) await logActivity({
        analysisId: null,
        incidentId: result.incidentId || null,
        autotaskTicketId: result.ticketId,
        action: 'analyzed',
        detail: `${result.assessment?.classification || result.verdict} (${Math.round(result.confidence * 100)}%). Action: ${result.recommendedAction}. Sources: ${usedSources.join(', ') || 'none'}${result.noteAutoPosted ? '. Internal note posted.' : ''}`,
        aiReasoning: result.reasoning,
        confidenceScore: result.confidence,
        metadata: {
          alertSource: result.alertSource,
          category: result.alertCategory,
          ticketCount: group.tickets.length,
          model: result.aiModel,
          verdict: result.verdict,
          classification: result.assessment?.classification || null,
          companyName: group.primaryTicket.companyName || null,
          companyId: group.primaryTicket.companyId || null,
          deviceHostname: result.enrichment?.deviceHealth?.hostname || result.deviceVerification?.device?.hostname || null,
          dataSourcesUsed: usedSources,
          dataGaps: result.enrichment?.dataGaps || [],
          knownBenignMatched: (result.enrichment?.knownBenignMatches?.length || 0) > 0,
          noteAutoPosted: result.noteAutoPosted || false,
          riskLevel: result.assessment?.riskLevel || null,
          afterHours: result.enrichment?.signals?.timing?.afterHours ?? null,
          geoBaseline: result.enrichment?.signals?.geo?.baseline ?? null,
          identityChange: result.enrichment?.signals?.identityChange ?? null,
          recurringPattern: result.enrichment?.signals?.recurrence?.recurringPattern ?? null,
          confidenceCapped: result.enrichment?.signals?.corroboration?.confidenceCeiling != null,
          ticketNumbers: group.tickets.map(t => t.ticketNumber),
        },
      });
    } catch (err) {
      meta.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Error processing ticket ${group.primaryTicket.ticketNumber}: ${msg}`);
      console.error(`[SOC] Error processing group:`, err);

      // Record per-ticket error
      for (const ticket of group.tickets) {
        ticketDetails.push({
          autotaskTicketId: ticket.autotaskTicketId,
          ticketNumber: ticket.ticketNumber,
          title: ticket.title,
          status: 'error',
          reason: msg.slice(0, 200),
        });
      }

      if (rt.persist) await logActivity({
        analysisId: null,
        incidentId: null,
        autotaskTicketId: group.primaryTicket.autotaskTicketId,
        action: 'error',
        detail: msg,
        aiReasoning: null,
        confidenceScore: null,
        metadata: { ticketNumber: group.primaryTicket.ticketNumber },
      });
    }
  }

  return { meta, results, errors, ticketDetails };
}

// ── Context Enrichment ──

/**
 * Recurrence signal for this company + alert source.
 *
 * IMPORTANT: this counts the SOC agent's OWN prior analyses, so `priorBenignCount`
 * is NOT independent corroboration — it reflects how the agent disposed of similar
 * alerts before. A high count means LOW NOVELTY (and a recurring pattern worth a
 * root-cause), never "therefore benign". The old code returned an FP *rate* that
 * the prompt then used as reassurance; we deliberately no longer surface a rate.
 */
async function getRecurrenceSignal(
  companyId: string | null,
  alertSource: string,
  windowDays: number,
  threshold: number,
): Promise<RecurrenceSignal> {
  const base: RecurrenceSignal = { similarAlertCount: 0, windowDays, priorBenignCount: 0, recurringPattern: false };
  if (!companyId) return base;
  try {
    const since = new Date();
    since.setDate(since.getDate() - windowDays);

    const [stats] = await prisma.$queryRaw<[{ total: bigint; fps: bigint }]>`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE verdict IN ('false_positive', 'expected_activity')) as fps
      FROM soc_ticket_analysis
      WHERE "companyId" = ${companyId}
        AND "alertSource" = ${alertSource}
        AND "processedAt" >= ${since}
    `;
    const total = Number(stats.total);
    return {
      similarAlertCount: total,
      windowDays,
      priorBenignCount: Number(stats.fps),
      recurringPattern: total >= threshold,
    };
  } catch {
    return base;
  }
}

/** Robustly pull a JSON object out of a model response (handles fences/preamble). */
function extractJson<T>(text: string): T {
  let s = text.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/```\s*$/, '')
    .trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1);
  return JSON.parse(s) as T;
}

// ── Process Single Incident Group ──

type GroupOutcome =
  | { kind: 'processed'; result: TriageResult }
  | { kind: 'skipped'; reason: string };

const NOTIFY_CLASSES: SocClassification[] = ['suspicious_review', 'confirmed_malicious'];

/** Default screening when the LLM is off — the outcome never depended on it. */
function offlineScreening(ticket: SecurityTicket): ScreeningResult {
  return {
    alertSource: detectAlertSource(ticket) as AlertSource,
    category: 'unknown',
    extractedIps: [],
    isFalsePositive: false,
    confidence: 0.5,
    reasoning: 'Screening skipped (LLM off); classification is computed in code from the evidence.',
    needsDeepAnalysis: false,
    recommendedAction: 'investigate',
    relatedTicketNumbers: [],
  };
}

function rcIdOf(t: SecurityTicket): string {
  return extractRocketCyberIds(`${t.title}\n${t.description || ''}`).incidentId ?? 'none';
}

/** Tenant-actionable root-cause checklist when a recurring pattern is detected. */
function defaultTenantRootCause(signals: AssessmentSignals): string {
  const { similarAlertCount, windowDays } = signals.recurrence;
  if (signals.identityChange) {
    return [
      `This tenant generated ${similarAlertCount} similar identity/MFA alerts in ${windowDays} days. Repetition usually points to a fixable misconfiguration, not noise. Check:`,
      '- Are users legitimately re-enrolling MFA (new phones, device swaps)?',
      '- Is an Entra ID Conditional Access policy or a security-info registration campaign forcing repeated re-registration?',
      '- Are legacy per-user MFA and Security Defaults (or Conditional Access) conflicting?',
      '- Does one user or a small group account for most of these events? (Review the SaaS Alerts per-user breakdown.)',
    ].join('\n');
  }
  return `This tenant generated ${similarAlertCount} similar alerts in ${windowDays} days. Investigate why this alert type keeps recurring for this tenant (misconfiguration, noisy rule, or a single repeat offender) rather than closing each instance individually.`;
}

function eventEvidenceItems(events: AttributedEvent[], primary: PrimaryDetection): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  if (primary.threatName) items.push({ label: 'Threat', value: `${primary.threatName} (${primary.recordSource})`, type: 'negative' });
  if (primary.deviceHostname) items.push({ label: 'Device', value: primary.deviceHostname, type: 'neutral' });
  if (primary.actionReported) items.push({ label: 'Reported action', value: primary.actionReported, type: 'info' });
  const count = (d: AttributedEvent['disposition']) => events.filter(e => e.disposition === d).length;
  items.push({ label: 'Corroborating events', value: String(count('corroboration')), type: count('corroboration') ? 'negative' : 'neutral' });
  items.push({ label: 'Context events', value: String(count('context')), type: 'neutral' });
  items.push({ label: 'Inside TCT change windows', value: String(count('tct_change')), type: 'info' });
  items.push({ label: 'Unattributed (data gaps)', value: String(count('data_gap')), type: 'info' });
  return items;
}

async function processIncidentGroup(
  group: IncidentGroup,
  config: SocConfig,
  rules: SocRule[],
  onAiCall: () => void,
  rt: ResolvedRuntime,
): Promise<GroupOutcome> {
  const primary = group.primaryTicket;
  const now = rt.now();
  const text = `${primary.title}\n${primary.description || ''}`;
  const rcIncidentId = rcIdOf(primary);

  // ── 1. Claim BEFORE any analysis (item 1). An ingest callout retried after a
  //       "Round-Trip … timed out", a cron pass, and a twin ticket all stop
  //       here without calling the LLM or writing anything.
  let record: AssessmentRecord | null = null;
  if (rt.store) {
    // Tickets analysed BEFORE idempotency records existed (T20260927.0006 and
    // .0005 among them) have an analysis row but no record. An automatic
    // trigger must treat them as already assessed — otherwise the next
    // Autotask callout (any edit to the ticket fires one) would re-assess and
    // write to a ticket a technician already handled. Manual re-runs still can.
    if ((rt.trigger === 'ingest' || rt.trigger === 'cron') && rt.persist) {
      const existing = await rt.store.get(primary.autotaskTicketId, rcIncidentId);
      if (!existing && await hasPriorAnalysis(primary.autotaskTicketId)) {
        return { kind: 'skipped', reason: 'Already assessed before idempotency records existed — automatic triggers never re-run it; use a manual re-run.' };
      }
    }
    const claim = await rt.store.claim({
      ticketId: primary.autotaskTicketId,
      rcIncidentId,
      companyId: primary.companyId,
      twinKey: twinKeyFromText(primary.autotaskCompanyId ?? primary.companyId, text),
      force: rt.trigger === 'manual',
      now,
    });
    if (!claim.claimed) {
      const reason = claim.reason === 'twin'
        ? `Twin of ticket ${claim.record.twinOfTicketId} (same device, file and detection time) — covered by that ticket's assessment.`
        : claim.reason === 'in_progress'
          ? 'An assessment for this incident is already in progress — not re-run.'
          : `Already assessed (${claim.record.completedAt ?? 'earlier'}) — automatic triggers never re-run an assessment; use a manual re-run.`;
      if (rt.persist && claim.reason === 'twin') await recordSkip(primary, reason);
      return { kind: 'skipped', reason };
    }
    record = claim.record;
    // A manual re-run of a twin (e.g. after Autotask absorbed the primary into
    // it) takes over the primary's note and notify history — never a second
    // note, never a second email.
    if (record.twinOfTicketId) {
      const prim = (await rt.store.findByTicket(record.twinOfTicketId)).find(r => !r.twinOfTicketId);
      if (prim) {
        record = {
          ...record,
          assessmentNoteId: record.assessmentNoteId ?? prim.assessmentNoteId,
          customerNotifyState: record.customerNotifyState ?? prim.customerNotifyState,
          customerNotifiedAt: record.customerNotifiedAt ?? prim.customerNotifiedAt,
          customerNotifyReason: record.customerNotifyReason ?? prim.customerNotifyReason,
          notifiedClassification: record.notifiedClassification ?? prim.notifiedClassification,
          flaggedClassification: record.flaggedClassification ?? prim.flaggedClassification,
        };
      }
    }
    for (const t of group.tickets) {
      if (t.autotaskTicketId === primary.autotaskTicketId) continue;
      await rt.store.markTwin({ ticketId: t.autotaskTicketId, rcIncidentId: rcIdOf(t), companyId: t.companyId, twinOfTicketId: primary.autotaskTicketId, now });
    }
  }

  try {
    return { kind: 'processed', result: await assessGroup(group, config, rules, onAiCall, rt, record, now) };
  } catch (err) {
    if (rt.store && record) await rt.store.update(primary.autotaskTicketId, rcIncidentId, { status: 'failed' }).catch(() => {});
    throw err;
  }
}

async function assessGroup(
  group: IncidentGroup,
  config: SocConfig,
  rules: SocRule[],
  onAiCall: () => void,
  rt: ResolvedRuntime,
  record: AssessmentRecord | null,
  now: Date,
): Promise<TriageResult> {
  const primary = group.primaryTicket;
  const ticketId = parseInt(primary.autotaskTicketId, 10);

  // Enrich: extract IP and verify device
  const ip = extractPrimaryIp(primary.title, primary.description);
  let deviceVerification: DeviceVerification | null = null;
  if (ip) {
    deviceVerification = await verifyTechnicianByIp(ip, config.internal_site_ids);
    if (!deviceVerification.verified) deviceVerification = await verifyTechnicianLive(ip, config.internal_site_ids);
  }

  const matchedRules = matchRules(primary, rules, {
    recentTicketCount: group.tickets.length,
    deviceVerified: deviceVerification?.verified || false,
  });
  const recentTickets = group.tickets.filter(t => t.autotaskTicketId !== primary.autotaskTicketId);

  // Screening (category only — it no longer decides anything).
  let screening = offlineScreening(primary);
  let totalTokens = 0;
  if (rt.llm === 'on') {
    onAiCall();
    const s = await runScreening(primary, recentTickets, rules, deviceVerification, config.screening_model);
    screening = s;
    totalTokens += s.tokensUsed || 0;
  }

  // Cross-stack enrichment — the evidence.
  const enrichment = await enrichTicket(primary, deviceVerification, { now });
  const signals = enrichment.signals ?? null;
  const alertSource = detectAlertSource(primary);
  const recurrence = await getRecurrenceSignal(primary.companyId, alertSource, 30, config.recurring_pattern_threshold);
  if (signals) signals.recurrence = recurrence;

  const profile = enrichment.profile ?? resolveCompanyProfile({ autotaskCompanyId: primary.autotaskCompanyId ?? null, companyName: primary.companyName ?? null, isEnabledForComanaged: null, activeContractNames: [] });
  const primaryDet = enrichment.primary!;
  const windows = enrichment.changeWindows ?? [];

  // ── 2 + 3. Attribute every event, then classify IN CODE.
  const events = attributeEvents(enrichment.eventInputs ?? [], {
    source: alertSourceName(enrichment.sourceSystem),
    deviceHostname: primaryDet.deviceHostname,
    user: primaryDet.user,
    iocs: [enrichment.rocketCyber?.hash].filter((x): x is string => !!x),
  }, windows, profile.timezone);
  enrichment.events = events;
  const benign = enrichment.knownBenignMatches[0] ?? null;
  const m365Benign = !!(enrichment.m365Identity?.removeThenReregister && enrichment.m365Identity?.hasStrongMethodRemaining);
  const cls = classifyFromEvidence({
    primary: primaryDet,
    events,
    knownBenign: { matched: !!benign, matchedOn: benign?.matchedOn ?? null },
    technicianVerified: deviceVerification?.verified === true,
    identityChange: signals?.identityChange ?? false,
    m365BenignReenrollment: m365Benign,
    uncorroboratedCap: config.confidence_uncorroborated_cap,
  });
  if (signals) {
    signals.corroboration = {
      sourcesUsed: cls.corroboratingSources,
      contextSources: Array.from(new Set(events.filter(e => e.disposition === 'context').map(e => e.source))).sort(),
      corroboratingTelemetry: cls.corroborationCount > 0,
      confidenceCeiling: cls.corroborationCount > 0 ? null : config.confidence_uncorroborated_cap,
    };
  }

  const visibility = enrichment.visibility ?? [];
  const notConnected = visibility.filter(v => !isVerifiedVisibility(v.state) && v.state !== 'not_queried').map(v => v.source);
  const dataGaps = [...enrichment.dataGaps];

  // ── Narrative (the LLM describes; it does not decide).
  let narrative: { executiveSummary?: string; customerImpact?: string } | null = null;
  let narrativeRemoved: string[] = [];
  const byDisp = (d: AttributedEvent['disposition']) => events.filter(e => e.disposition === d).map(formatEventLine);
  if (rt.llm === 'on') {
    try {
      onAiCall();
      const n = await generateNarrative(primary, config.deep_analysis_model, {
        classificationLabel: classificationLabel(cls.classification),
        rationale: cls.rationale,
        alertLines: byDisp('alert'),
        corroborationLines: byDisp('corroboration'),
        contextLines: [...byDisp('context'), ...(enrichment.contextSummaries ?? []).map(c => `- ${c}`)],
        changeLines: [...windows.map(w => `- ${w.label}`), ...byDisp('tct_change')],
        visibilityLines: formatVisibilityLines(visibility),
        ipLines: (enrichment.ipClassifications ?? []).map(i => `- ${i.ip}: ${i.label}`),
        dataGaps,
        coManaged: profile.coManaged,
      });
      totalTokens += n.tokensUsed;
      const guarded = guardNarrative(n.executiveSummary || '', { multiScopeCompromise: cls.multiScopeCompromise });
      const impact = guardNarrative(n.customerImpact || '', { multiScopeCompromise: cls.multiScopeCompromise });
      narrative = { executiveSummary: guarded.text, customerImpact: impact.text };
      narrativeRemoved = [...guarded.removed, ...impact.removed];
    } catch (err) {
      dataGaps.push(`AI narrative unavailable (${err instanceof Error ? err.message : String(err)}); the summary below is the computed rationale.`);
    }
  }

  // ── 7 + 8. Customer update: plan (reads only), then the deterministic message.
  const ticketResolved = isResolvedStatus(primary.status, primary.statusLabel);
  const planRecord: AssessmentRecord = record ?? {
    autotaskTicketId: primary.autotaskTicketId, rcIncidentId: rcIdOf(primary), companyId: primary.companyId, twinKey: null,
    twinOfTicketId: null, status: 'claimed', claimedAt: now.toISOString(), completedAt: null, incidentId: null,
    assessmentNoteId: null, classification: null, confidence: null, customerNotifyState: null, customerNotifiedAt: null,
    customerNotifyReason: null, notifiedClassification: null, flaggedClassification: null,
  };
  let plan: NotifyPlan = rt.store || rt.writer.mode === 'recording'
    ? await planCustomerNotify({ classification: cls.classification, record: planRecord, ticketId, profile, socDryRun: config.dry_run, ticketResolved }, rt.writer)
    : { action: 'none', reason: 'no assessment record', statusLine: 'Not sent — this run keeps no assessment record (bootstrap), so it never emails anyone.' };

  const wantsMessage = NOTIFY_CLASSES.includes(cls.classification);
  // Only what TCT itself did. Defender's own quarantine is stated in the
  // "what happened" paragraph, never credited to TCT as containment.
  const containmentDone: string[] = [];
  const customerMessage = wantsMessage ? buildCustomerMessage({
    classification: cls.classification,
    multiScopeCompromise: cls.multiScopeCompromise,
    coManaged: profile.coManaged,
    recipientFirstName: plan.action === 'send' ? plan.recipient.firstName : null,
    companyName: primary.companyName ?? null,
    ticketNumber: primary.ticketNumber,
    ticketUrl: getAutotaskTicketUrl(primary.autotaskTicketId),
    primary: primaryDet,
    timezone: profile.timezone,
    containmentDone,
    corroboratedDevices: cls.corroboratedDevices,
    corroboratedUsers: cls.corroboratedUsers,
  }) : null;
  if (customerMessage) {
    const violations = lintCustomerMessage(customerMessage, { lockdownPermitted: cls.multiScopeCompromise });
    if (violations.length && plan.action === 'send') {
      plan = { action: 'explain', reason: `The generated message failed its own safety check (${violations.join('; ')}).`, statusLine: 'NOT SENT — the generated message failed its safety check.' };
    }
  }

  // Send BEFORE writing the assessment note, so the note records what actually
  // happened (sent / not sent and why) rather than what was intended.
  const notify = await executeCustomerNotify({
    plan, writer: rt.writer, ticketId, message: customerMessage ?? '', classification: cls.classification, record: planRecord, now,
  });
  const customerStatus = plan.action !== 'send'
    ? plan.statusLine
    : notify.state === 'sent'
      ? `Sent automatically at ${notify.sentAt} to ${plan.recipient.name ?? `contact ${plan.recipient.contactId}`} (${plan.recipient.basis}${plan.recipient.setContactFirst ? '; set as the ticket contact first' : ''}) — the "Customer emailed" note records the recipient, time and exact text.`
      : notify.state === 'send_failed'
        ? `FAILED — ${notify.reason} See the "SOC — Customer update FAILED" note.`
        : `NOT SENT — ${notify.reason} See the "SOC — Customer update NOT sent" note.`;

  const actions = technicianActions(cls, primaryDet, { coManaged: profile.coManaged, hasTctChange: windows.length > 0, notConnected });
  const tenantRootCause = signals?.recurrence?.recurringPattern ? defaultTenantRootCause(signals) : null;
  const internalNote = buildAssessmentNote({
    ticketNumber: primary.ticketNumber,
    autotaskTicketId: primary.autotaskTicketId,
    twinTickets: group.tickets.filter(t => t.autotaskTicketId !== primary.autotaskTicketId).map(t => ({
      ticketNumber: t.ticketNumber, autotaskTicketId: t.autotaskTicketId, incidentId: rcIdOf(t) === 'none' ? null : rcIdOf(t),
      threatName: (t.description || '').match(/detected by signature\s+([^\s\r\n]+)/i)?.[1] ?? null,
    })),
    result: cls,
    primary: primaryDet,
    visibility,
    events,
    changeWindows: windows,
    changeContext: enrichment.changeContext ?? [],
    ips: enrichment.ipClassifications ?? [],
    dataGaps: [...dataGaps, ...(enrichment.contextSummaries ?? [])],
    profile,
    narrative: narrative?.executiveSummary ?? null,
    narrativeRemoved,
    technicianActions: actions,
    customerUpdate: { status: customerStatus, message: customerMessage },
    generatedAtUtc: now.toISOString(),
  });

  const finalVerdict = classificationToVerdict(cls.classification);
  const finalReasoning = narrative?.executiveSummary || cls.rationale.join(' ');
  const recommendedAction = classificationToAction(cls.classification, cls.confidence, config, matchedRules);
  const assessment: SocAssessment = {
    executiveSummary: finalReasoning,
    finalRecommendation: actions[0] ?? 'Review the assessment.',
    classification: cls.classification,
    confidence: cls.confidence,
    riskLevel: cls.riskLevel,
    evidence: eventEvidenceItems(events, primaryDet),
    correlatedSources: enrichment.dataSources,
    knownBenignMatch: benign ? { matched: true, reason: `Matches known benign tooling: ${benign.vendor} ${benign.product} (matched on ${benign.matchedOn})` } : null,
    customerImpact: narrative?.customerImpact || (wantsMessage ? 'Not determined beyond the alert itself — see the evidence.' : 'None identified.'),
    recommendedTechnicianActions: actions,
    dataGaps,
    tenantRootCause,
    internalNote,
    closureNote: cls.classification === 'likely_false_positive' || cls.classification === 'confirmed_false_positive'
      ? `SOC review: ${classificationLabel(cls.classification).toLowerCase()} — ${cls.rationale.join(' ')}`
      : 'Do not close yet — the remediation handoff in the customer update must be confirmed first.',
    customerMessageRequired: wantsMessage,
    customerMessageDraft: customerMessage,
  };

  // Persist the incident with the assessment + full enrichment bundle.
  const incidentId = rt.persist
    ? await createIncident(group, finalVerdict, cls.confidence, finalReasoning, assessment, enrichment)
    : 'dry-run';

  // ── Deliver the assessment note: created once, edited in place on every re-run.
  let noteAutoPosted = false;
  let noteAction: string = 'not_posted';
  let noteId: number | null = planRecord.assessmentNoteId;
  if (cls.confidence >= config.confidence_floor && !ticketResolved) {
    if (config.dry_run || !config.auto_post_internal_note) {
      if (rt.persist) {
        await createPendingAction({
          incidentId,
          autotaskTicketId: primary.autotaskTicketId,
          ticketNumber: primary.ticketNumber,
          companyName: primary.companyName || null,
          actionType: 'add_note',
          actionPayload: { noteTitle: 'SOC Analyst Assessment', noteBody: internalNote, notePublish: 2 },
          previewSummary: `Add internal SOC assessment note to ticket #${primary.ticketNumber} (${primary.companyName || 'Unknown Company'})`,
        });
      }
      noteAction = 'queued_for_approval';
    } else {
      const w = await writeAssessmentNote(rt.writer, { ticketId, record: planRecord, body: internalNote });
      noteAction = w.action;
      noteId = w.noteId;
      noteAutoPosted = w.action !== 'failed';
      if (w.action === 'failed') dataGaps.push(`Assessment note could not be written: ${w.error}`);
      else if (rt.persist) {
        await logActivity({
          analysisId: null, incidentId, autotaskTicketId: primary.autotaskTicketId, action: 'note_added',
          detail: `SOC assessment note ${w.action} (note ${w.noteId}) — Internal Only`, aiReasoning: null, confidenceScore: null, metadata: { noteId: w.noteId, noteAction: w.action },
        });
      }
    }
  }

  if (rt.persist && (notify.state === 'sent' || notify.state === 'refused' || notify.state === 'send_failed') && plan.action !== 'none') {
    await logActivity({
      analysisId: null, incidentId, autotaskTicketId: primary.autotaskTicketId,
      action: notify.state === 'sent' ? 'customer_notified' : 'customer_notify_blocked',
      detail: customerStatus.slice(0, 1000),
      aiReasoning: null, confidenceScore: null, metadata: { notifyState: notify.state, notes: notify.notes },
    });
  }

  if (rt.store && record) {
    await rt.store.update(primary.autotaskTicketId, record.rcIncidentId, {
      status: 'complete',
      completedAt: now.toISOString(),
      incidentId,
      assessmentNoteId: noteId,
      classification: cls.classification,
      confidence: cls.confidence,
      customerNotifyState: notify.state,
      customerNotifiedAt: notify.sentAt,
      customerNotifyReason: notify.reason,
      notifiedClassification: notify.state === 'sent' ? (planRecord.notifiedClassification ?? cls.classification) : planRecord.notifiedClassification,
      flaggedClassification: plan.action === 'flag_reclassification' ? cls.classification : planRecord.flaggedClassification,
    });
  }

  const writerCalls: WriterCall[] | undefined = (rt.writer as { calls?: WriterCall[] }).calls;
  return {
    ticketId: primary.autotaskTicketId,
    verdict: finalVerdict,
    confidence: cls.confidence,
    reasoning: finalReasoning,
    recommendedAction: recommendedAction as TriageResult['recommendedAction'],
    alertSource: enrichment.sourceSystem as AlertSource,
    alertCategory: screening.category as AlertCategory,
    extractedIps: screening.extractedIps,
    deviceVerification,
    ticketNote: internalNote,
    aiModel: rt.llm === 'on' ? config.deep_analysis_model : 'none (llm off)',
    tokensUsed: totalTokens,
    incidentId,
    assessment,
    enrichment,
    noteAutoPosted,
    delivery: {
      noteAction,
      noteId,
      notifyPlan: plan.action,
      notifyStatus: customerStatus,
      notifyState: notify.state,
      notifyReason: notify.reason,
      writerCalls: writerCalls ? writerCalls.map(c => ({ op: c.op, ticketId: 'ticketId' in c ? c.ticketId : null })) : undefined,
    },
  };
}

// ── AI Calls ──

interface ScreeningWithTokens extends ScreeningResult {
  tokensUsed?: number;
}

async function runScreening(
  ticket: SecurityTicket,
  recentTickets: SecurityTicket[],
  rules: SocRule[],
  deviceVerification: DeviceVerification | null,
  model: string,
): Promise<ScreeningWithTokens> {
  const prompt = buildScreeningPrompt(ticket, recentTickets, rules, deviceVerification);

  try {
    const response = await trackAnthropicCall('soc_triage', model, () =>
      anthropic.messages.create({
        model,
        max_tokens: 512,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      })
    );

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    if (!text) {
      throw new Error(`AI returned empty response for model ${model}`);
    }
    const parsed = extractJson<ScreeningResult>(text);
    return {
      ...parsed,
      tokensUsed: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SOC] Screening failed for ticket ${ticket.ticketNumber}:`, msg);
    // Screening only sets the category now; its failure must not sink the assessment.
    return { ...offlineScreening(ticket), reasoning: `Screening failed (${msg}); classification is computed in code.` };
  }
}

/** Narrative only — temperature 0, and its output is guarded before use. */
async function generateNarrative(
  ticket: SecurityTicket,
  model: string,
  n: Omit<Parameters<typeof buildNarrativePrompt>[0], 'ticket'>,
): Promise<{ executiveSummary: string; customerImpact: string; tokensUsed: number }> {
  const response = await trackAnthropicCall('soc_assessment', model, () =>
    anthropic.messages.create({
      model,
      max_tokens: 1200,
      temperature: 0,
      messages: [{ role: 'user', content: buildNarrativePrompt({ ticket, ...n }) }],
    })
  );
  const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
  if (!text) throw new Error('AI returned an empty narrative');
  const parsed = extractJson<{ executiveSummary?: string; customerImpact?: string }>(text);
  return {
    executiveSummary: String(parsed.executiveSummary ?? ''),
    customerImpact: String(parsed.customerImpact ?? ''),
    tokensUsed: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
  };
}

// ── Helpers ──

/** Map the technician-facing classification onto the stored verdict enum. */
function classificationToVerdict(classification: SocClassification): Verdict {
  switch (classification) {
    case 'confirmed_malicious': return 'confirmed_threat';
    case 'suspicious_review': return 'suspicious';
    case 'likely_false_positive': return 'false_positive';
    case 'confirmed_false_positive': return 'false_positive';
    case 'insufficient_data': return 'suspicious';
  }
}

/** Recommended ticket action. Nothing auto-closes — these are recommendations only. */
function classificationToAction(
  classification: SocClassification,
  confidence: number,
  config: SocConfig,
  matchedRules: SocRule[],
): string {
  if (classification === 'confirmed_malicious') return 'escalate';
  if (matchedRules.some(r => r.action === 'escalate')) return 'escalate';
  if (confidence < config.confidence_floor) return 'investigate';
  if (classification === 'likely_false_positive' || classification === 'confirmed_false_positive') return 'close';
  return 'investigate';
}

/** Does this ticket already carry a (non-skip) SOC analysis row? */
async function hasPriorAnalysis(autotaskTicketId: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ one: number }>>`
      SELECT 1 AS one FROM soc_ticket_analysis
      WHERE "autotaskTicketId" = ${autotaskTicketId} AND status <> 'skipped'
      LIMIT 1
    `;
    return rows.length > 0;
  } catch {
    // Unknown is not "no": refusing to re-run is the safe side for an automatic trigger.
    return true;
  }
}

/** Minimal analysis row for a skipped twin, so the cron does not pick it up again. */
async function recordSkip(ticket: SecurityTicket, reason: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO soc_ticket_analysis (id, "autotaskTicketId", "ticketNumber", "companyId", status, "aiReasoning", "processedAt")
      VALUES (gen_random_uuid()::text, $1, $2, $3, 'skipped', $4, now())
      ON CONFLICT ("autotaskTicketId") DO NOTHING
    `, ticket.autotaskTicketId, ticket.ticketNumber, ticket.companyId, reason.slice(0, 1000));
  } catch (err) {
    console.error('[SOC] Failed to record skipped twin:', err);
  }
}

async function createIncident(
  group: IncidentGroup,
  verdict: Verdict,
  confidence: number,
  reasoningText: string,
  assessment?: SocAssessment | null,
  enrichment?: EnrichmentBundle,
): Promise<string> {
  const title = group.tickets.length > 1
    ? `${group.tickets.length} correlated alerts: ${group.primaryTicket.title.slice(0, 100)}`
    : group.primaryTicket.title.slice(0, 200);
  const summary = assessment?.executiveSummary || reasoningText.slice(0, 2000);
  const companyName = group.primaryTicket.companyName || null;

  const result = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO soc_incidents (
      id, title, "companyId", "companyName", "alertSource", "ticketCount",
      verdict, "confidenceScore", "aiSummary", "correlationReason",
      "primaryTicketId", status, reasoning, enrichment
    )
    VALUES (
      gen_random_uuid()::text,
      ${title},
      ${group.primaryTicket.companyId},
      ${companyName},
      ${detectAlertSource(group.primaryTicket)},
      ${group.tickets.length},
      ${verdict},
      ${confidence},
      ${summary},
      ${group.reason},
      ${group.primaryTicket.autotaskTicketId},
      ${'open'},
      ${assessment ? JSON.stringify(assessment) : null}::jsonb,
      ${enrichment ? JSON.stringify(enrichment) : null}::jsonb
    )
    RETURNING id
  `;
  return result[0].id;
}

async function createPendingAction(action: {
  incidentId: string;
  autotaskTicketId: string;
  ticketNumber: string;
  companyName: string | null;
  actionType: string;
  actionPayload: Record<string, unknown>;
  previewSummary: string;
}): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO soc_pending_actions (id, "incidentId", "autotaskTicketId", "ticketNumber", "companyName", "actionType", "actionPayload", "previewSummary", status)
      VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6::jsonb, $7, 'pending')
    `,
      action.incidentId,
      action.autotaskTicketId,
      action.ticketNumber,
      action.companyName,
      action.actionType,
      JSON.stringify(action.actionPayload),
      action.previewSummary,
    );

    await logActivity({
      analysisId: null,
      incidentId: action.incidentId,
      autotaskTicketId: action.autotaskTicketId,
      action: 'action_queued',
      detail: `Pending approval: ${action.previewSummary.slice(0, 300)}`,
      aiReasoning: null,
      confidenceScore: null,
      metadata: { actionType: action.actionType, ticketNumber: action.ticketNumber, companyName: action.companyName },
    });
  } catch (err) {
    console.error('[SOC] Failed to create pending action:', err);
  }
}

export async function addAutotaskNote(ticketId: string, noteText: string, incidentId: string | null = null): Promise<void> {
  try {
    const { AutotaskClient } = await import('@/lib/autotask');
    const client = new AutotaskClient();
    await client.createTicketNote(parseInt(ticketId, 10), {
      title: 'SOC Analyst Assessment',
      description: noteText,
      noteType: 1,
      publish: 2, // Internal Only — NOT visible to customers
    });

    await logActivity({
      analysisId: null,
      incidentId,
      autotaskTicketId: ticketId,
      action: 'note_added',
      detail: 'Internal SOC assessment note auto-posted to Autotask ticket (Internal Only)',
      aiReasoning: null,
      confidenceScore: null,
      metadata: null,
    });
  } catch (err) {
    console.error(`[SOC] Failed to add Autotask note for ticket ${ticketId}:`, err);
  }
}

async function recordAnalysis(
  ticket: SecurityTicket,
  result: TriageResult,
): Promise<void> {
  await prisma.$executeRawUnsafe(`
    INSERT INTO soc_ticket_analysis (
      id, "autotaskTicketId", "ticketNumber", "companyId", "incidentId",
      status, verdict, "confidenceScore", "aiModel", "aiReasoning", "aiTokensUsed",
      "alertSource", "alertCategory", "ipExtracted", "deviceVerified", "technicianVerified",
      "autotaskNoteAdded", "recommendedAction", "processedAt"
    ) VALUES (
      gen_random_uuid()::text, $1, $2, $3, $4,
      'completed', $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14,
      $15, $16, now()
    )
    ON CONFLICT ("autotaskTicketId") DO UPDATE SET
      status = 'completed',
      verdict = $5,
      "confidenceScore" = $6,
      "aiModel" = $7,
      "aiReasoning" = $8,
      "aiTokensUsed" = $9,
      "alertSource" = $10,
      "alertCategory" = $11,
      "ipExtracted" = $12,
      "deviceVerified" = $13,
      "technicianVerified" = $14,
      "autotaskNoteAdded" = $15,
      "recommendedAction" = $16,
      "processedAt" = now(),
      "updatedAt" = now()
  `,
    ticket.autotaskTicketId,
    ticket.ticketNumber,
    ticket.companyId,
    result.incidentId || null,
    result.verdict,
    result.confidence,
    result.aiModel,
    result.reasoning.slice(0, 5000),
    result.tokensUsed,
    result.alertSource,
    result.alertCategory,
    result.extractedIps[0] || null,
    result.deviceVerification?.verified || false,
    result.deviceVerification?.technician || null,
    result.noteAutoPosted || false,
    result.recommendedAction,
  );
}

async function logActivity(entry: {
  analysisId: string | null;
  incidentId: string | null;
  autotaskTicketId: string | null;
  action: string;
  detail: string | null;
  aiReasoning: string | null;
  confidenceScore: number | null;
  metadata: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO soc_activity_log (id, "analysisId", "incidentId", "autotaskTicketId", action, detail, "aiReasoning", "confidenceScore", metadata)
      VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    `,
      entry.analysisId,
      entry.incidentId,
      entry.autotaskTicketId,
      entry.action,
      entry.detail,
      entry.aiReasoning,
      entry.confidenceScore,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    );
  } catch (err) {
    console.error('[SOC] Failed to log activity:', err);
  }
}

// ── Dry run for one ticket (read-only preview) ──

export interface SocDryRunReport {
  ticketId: string;
  ticketNumber: string | null;
  writesPerformed: 0;
  llm: 'off';
  status: 'assessed' | 'skipped' | 'not_found' | 'not_security';
  skipReason?: string;
  liveRunWouldDo?: string;
  classification?: string;
  confidence?: number;
  riskLevel?: string;
  incidentId?: string | null;
  threatName?: string | null;
  visibility?: EnrichmentBundle['visibility'];
  changeWindows?: Array<{ label: string; startUtc: string; endUtc: string; deviceCount: number }>;
  ipAddresses?: Array<{ ip: string; label: string }>;
  corroboratingSources?: string[];
  eventCounts?: Record<string, number>;
  coManaged?: { coManaged: boolean; basis: string; itLeadContactId: number | null };
  customerUpdate?: { plan: string; status: string; message: string | null };
  wouldWrite?: Array<{ op: string; ticketId: number | null }>;
  internalNotePreview?: string;
}

/**
 * Analyse ONE existing ticket exactly as a live run would, and write nothing:
 * Autotask writes and the customer email go to a recording writer, the
 * assessment store is read-only (it never even creates its table), nothing is
 * persisted, and both LLM calls are off — the outcome does not depend on them.
 * Used by the connector's soc_triage_dry_run tool and the manual run route.
 */
export async function runSocDryRunForTicket(ticketId: number): Promise<SocDryRunReport> {
  const { liveReads, recordingWriter, pgStore, readOnlyStore } = await import('./delivery');
  const base = { ticketId: String(ticketId), writesPerformed: 0 as const, llm: 'off' as const };
  const rows = await prisma.$queryRaw<SecurityTicket[]>`
    SELECT
      t."autotaskTicketId", t."ticketNumber", t."companyId",
      c."displayName" as "companyName", c."autotaskCompanyId" as "autotaskCompanyId",
      t.title, t.description, t.status, t."statusLabel",
      t.priority, t."priorityLabel", t."queueId", t."queueLabel",
      t.source, t."sourceLabel", t."createDate"::text as "createDate"
    FROM tickets t
    LEFT JOIN companies c ON c.id = t."companyId"
    WHERE t."autotaskTicketId" = ${String(ticketId)}
  `;
  if (rows.length === 0) return { ...base, ticketNumber: null, status: 'not_found', skipReason: 'Ticket is not in the local tickets table (the SOC analyses the synced copy).' };
  const ticket = rows[0];
  if (!isSecurityTicket(ticket)) return { ...base, ticketNumber: ticket.ticketNumber, status: 'not_security', skipReason: 'Not a security ticket — the SOC would skip it.' };

  const config = await loadSocConfig();
  const rules = await loadActiveRules();
  const writer = recordingWriter({ reads: await liveReads() });
  const store = readOnlyStore(pgStore({ readOnly: true }));
  const run = await runTriagePipeline([ticket], config, rules, { trigger: 'dry_run', writer, store, persist: false, llm: 'off' });
  const decision = Array.from(store.liveDecision.values())[0];
  // Mirror the automatic-trigger legacy guard in processIncidentGroup: a ticket
  // assessed before soc_assessment_records existed has no record but IS skipped.
  const legacy = decision === 'take' && await hasPriorAnalysis(String(ticketId));
  const liveRunWouldDo = legacy ? 'skip — already assessed before idempotency records existed (automatic triggers never re-run it; a manual re-run would edit the note in place)'
    : decision === 'take' ? 'assess (no prior record, or a stale/failed one)'
    : decision === 'already_assessed' ? 'skip — already assessed (an automatic trigger never re-runs; a manual re-run would edit the note in place)'
    : decision === 'in_progress' ? 'skip — an assessment is in progress'
    : decision === 'twin' ? 'skip — twin of another assessed ticket' : 'unknown';
  const r = run.results[0];
  if (!r) return { ...base, ticketNumber: ticket.ticketNumber, status: 'skipped', skipReason: run.ticketDetails[0]?.reason ?? run.errors[0] ?? 'not processed', liveRunWouldDo };
  const e = r.enrichment;
  const counts: Record<string, number> = {};
  for (const ev of e?.events ?? []) counts[ev.disposition] = (counts[ev.disposition] ?? 0) + 1;
  return {
    ...base,
    ticketNumber: ticket.ticketNumber,
    status: 'assessed',
    liveRunWouldDo,
    classification: r.assessment?.classification,
    confidence: r.confidence,
    riskLevel: r.assessment?.riskLevel,
    incidentId: e?.primary?.incidentId ?? null,
    threatName: e?.primary?.threatName ?? null,
    visibility: e?.visibility,
    changeWindows: (e?.changeWindows ?? []).map(w => ({ label: w.label, startUtc: w.startUtc, endUtc: w.endUtc, deviceCount: w.deviceCount })),
    ipAddresses: (e?.ipClassifications ?? []).map(i => ({ ip: i.ip, label: i.label })),
    corroboratingSources: e?.signals?.corroboration.sourcesUsed ?? [],
    eventCounts: counts,
    coManaged: e?.profile ? { coManaged: e.profile.coManaged, basis: e.profile.coManagedBasis, itLeadContactId: e.profile.itLeadContactId } : undefined,
    customerUpdate: { plan: r.delivery?.notifyPlan ?? 'none', status: r.delivery?.notifyStatus ?? '', message: r.assessment?.customerMessageDraft ?? null },
    wouldWrite: writer.calls.map(c => ({ op: c.op, ticketId: 'ticketId' in c ? c.ticketId : null })),
    internalNotePreview: r.ticketNote.slice(0, 6000),
  };
}
