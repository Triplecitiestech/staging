/**
 * SOC Triage Engine — Main Pipeline Orchestrator
 *
 * Pipeline: Detect → Enrich → Correlate → Analyze → Triage → Document → Log
 */

import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';
import { trackAnthropicCall } from '@/lib/api-usage-tracker';
import { correlateTickets } from './correlation';
import { extractPrimaryIp } from './ip-extractor';
import { buildScreeningPrompt, buildCrossStackAssessmentPrompt, formatTicketNote } from './prompts';
import { matchRules, isSecurityTicket, detectAlertSource } from './rules';
import { verifyTechnicianByIp, verifyTechnicianLive } from './technician-verifier';
import { enrichTicket } from './enrichment';
import { isResolvedStatus } from '@/lib/tickets/utils';
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
  RiskLevel,
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

/**
 * Run the full triage pipeline on a batch of tickets.
 * Returns results and metadata for logging.
 */
export async function runTriagePipeline(
  tickets: SecurityTicket[],
  config: SocConfig,
  rules: SocRule[],
): Promise<TriageRunResult> {
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
      const result = await processIncidentGroup(group, config, rules, () => {
        aiCallsThisRun++;
        meta.aiCallsMade++;
      });

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
        await recordAnalysis(ticket, result);
      }

      // Log activity with rich metadata
      const usedSources = (result.enrichment?.dataSources || [])
        .filter(s => s.status === 'used')
        .map(s => s.source);
      await logActivity({
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

      await logActivity({
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

/**
 * Build a degraded assessment from screening + enrichment when the AI
 * assessment step fails. This guarantees the incident still carries the
 * cross-stack structure (and is rendered with the new layout) instead of
 * silently reverting to the legacy screening-only view.
 */
function buildFallbackAssessment(
  ticket: SecurityTicket,
  screening: ScreeningResult,
  enrichment: EnrichmentBundle,
  detail: string,
): SocAssessment {
  const classification: SocClassification = enrichment.knownBenignMatches.length > 0
    ? 'likely_false_positive'
    : screening.isFalsePositive ? 'likely_false_positive' : 'suspicious_review';

  const evidence: SocAssessment['evidence'] = [];
  const rc = enrichment.rocketCyber;
  if (rc) {
    if (rc.process) evidence.push({ label: 'Process', value: rc.process, type: 'neutral' });
    if (rc.path) evidence.push({ label: 'Path', value: rc.path, type: 'neutral' });
    if (rc.threatName) evidence.push({ label: 'Threat', value: rc.threatName, type: 'negative' });
    if (rc.actionTaken) evidence.push({ label: 'Action Taken', value: rc.actionTaken, type: 'info' });
  }
  if (enrichment.deviceHealth) {
    evidence.push({ label: 'Device', value: `${enrichment.deviceHealth.hostname}${enrichment.deviceHealth.online === null ? '' : enrichment.deviceHealth.online ? ' (online)' : ' (offline)'}`, type: 'neutral' });
  }
  for (const m of enrichment.knownBenignMatches) {
    evidence.push({ label: 'Known Benign', value: `${m.vendor} ${m.product} (matched ${m.matchedOn})`, type: 'positive' });
  }

  const note = [
    '═══ SOC ANALYST ASSESSMENT (screening-only fallback) ═══',
    `Classification: ${classification} (Confidence ${Math.round(screening.confidence * 100)}%)`,
    '',
    'EXECUTIVE SUMMARY',
    screening.reasoning || '(no screening reasoning)',
    '',
    'NOTE: The automated cross-stack assessment did not complete for this ticket, so this is a',
    'screening-only result enriched with whatever security-stack data was reachable. Re-run the',
    'analysis (and confirm RocketCyber/Datto integrations) for a full assessment.',
    '',
    'CORRELATED SOURCES',
    ...enrichment.dataSources.map(s => `- ${s.source}: ${s.status} — ${s.detail}`),
    '═══ END SOC ASSESSMENT ═══',
  ].join('\n');

  return {
    executiveSummary: screening.reasoning || 'Screening-only assessment (full cross-stack assessment unavailable).',
    finalRecommendation: 'Technician review recommended — the automated cross-stack assessment did not complete. See Data Gaps.',
    classification,
    confidence: screening.confidence,
    riskLevel: classification === 'suspicious_review' ? 'medium' : 'low',
    evidence,
    correlatedSources: enrichment.dataSources,
    knownBenignMatch: enrichment.knownBenignMatches.length > 0
      ? { matched: true, reason: `Matches known benign tooling: ${enrichment.knownBenignMatches.map(m => `${m.vendor} ${m.product}`).join(', ')}` }
      : null,
    customerImpact: 'Not determined (assessment incomplete).',
    recommendedTechnicianActions: [
      'Review the original alert and the correlated evidence below.',
      'Confirm RocketCyber / Datto integrations are configured so the full detection detail can be pulled.',
      'Re-run the analysis once integrations are in place.',
    ],
    dataGaps: [...enrichment.dataGaps, `Automated assessment step failed: ${detail}`],
    internalNote: note,
    closureNote: `SOC screening-only result (${classification.replace(/_/g, ' ')}). Automated cross-stack assessment did not complete — technician review required before closing.`,
    customerMessageRequired: false,
    customerMessageDraft: null,
  };
}

// ── Process Single Incident Group ──

async function processIncidentGroup(
  group: IncidentGroup,
  config: SocConfig,
  rules: SocRule[],
  onAiCall: () => void,
): Promise<TriageResult> {
  const primary = group.primaryTicket;

  // Enrich: extract IP and verify device
  const ip = extractPrimaryIp(primary.title, primary.description);
  let deviceVerification: DeviceVerification | null = null;

  if (ip) {
    deviceVerification = await verifyTechnicianByIp(ip, config.internal_site_ids);
    // Fallback to live query if cache miss
    if (!deviceVerification.verified) {
      deviceVerification = await verifyTechnicianLive(ip, config.internal_site_ids);
    }
  }

  // Check rule matches
  const recentCount = group.tickets.length;
  const matchedRules = matchRules(primary, rules, {
    recentTicketCount: recentCount,
    deviceVerified: deviceVerification?.verified || false,
  });

  // Get recent tickets from same company for context
  const recentTickets = group.tickets.length > 1
    ? group.tickets.filter(t => t.autotaskTicketId !== primary.autotaskTicketId)
    : [];

  // Step 1: Fast Haiku screening for category/source/IP signal.
  onAiCall();
  const screening = await runScreening(primary, recentTickets, rules, deviceVerification, config.screening_model);
  let totalTokens = screening.tokensUsed || 0;

  // Step 2: Cross-stack enrichment — pull the REAL evidence from the security
  // stack (RocketCyber detail, Datto RMM health, Datto EDR, DNSFilter, SaaS Alerts).
  const enrichment = await enrichTicket(primary, deviceVerification);

  // Step 3: Authoritative cross-stack assessment over the correlated evidence.
  const alertSource = detectAlertSource(primary);
  // Recurrence (novelty) signal — fills the placeholder enrichment left for us.
  const signals = enrichment.signals ?? null;
  const recurrence = await getRecurrenceSignal(
    primary.companyId, alertSource, 30, config.recurring_pattern_threshold,
  );
  if (signals) signals.recurrence = recurrence;

  let assessment: SocAssessment | null = null;
  try {
    onAiCall();
    assessment = await generateCrossStackAssessment(
      primary, recentTickets, enrichment, deviceVerification,
      config.deep_analysis_model, signals,
    );
    totalTokens += (assessment as AssessmentWithTokens).tokensUsed || 0;
    // The enrichment bundle is authoritative for which sources contributed + gaps.
    assessment.correlatedSources = enrichment.dataSources;
    assessment.dataGaps = Array.from(new Set([...enrichment.dataGaps, ...(assessment.dataGaps || [])]));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[SOC] Cross-stack assessment failed:', err);
    await logActivity({
      analysisId: null, incidentId: null, autotaskTicketId: primary.autotaskTicketId,
      action: 'error', detail: `Assessment failed: ${detail}`,
      aiReasoning: null, confidenceScore: null,
      metadata: { ticketNumber: primary.ticketNumber, phase: 'assessment' },
    });
    // Never silently revert to the legacy screening-only view: build a degraded
    // assessment from the evidence we have so the cross-stack layout still renders.
    assessment = buildFallbackAssessment(primary, screening, enrichment, detail);
    assessment.correlatedSources = enrichment.dataSources;
    assessment.dataGaps = Array.from(new Set([...enrichment.dataGaps, ...assessment.dataGaps]));
  }

  // Deterministic guardrails — applied in CODE, independent of the AI narrative,
  // so overconfidence/under-action can't slip through regardless of what the model
  // wrote. Runs on both the real and fallback assessment, BEFORE we derive the
  // verdict/action/note so all of them reflect the adjusted result.
  if (assessment && signals) {
    assessment = applyGuardrails(assessment, signals, config);
  }

  // Derive verdict/action from the assessment (fall back to screening).
  const classification: SocClassification = assessment?.classification
    || (screening.isFalsePositive ? 'likely_false_positive' : 'suspicious_review');
  const finalConfidence = assessment?.confidence ?? screening.confidence;
  const finalVerdict = classificationToVerdict(classification);
  const finalReasoning = assessment?.executiveSummary || screening.reasoning;
  const recommendedAction = classificationToAction(classification, finalConfidence, config, matchedRules);

  // The internal note is the primary deliverable — self-contained for techs in Autotask.
  const finalNote = assessment?.internalNote || formatTicketNote(
    finalVerdict, finalConfidence, screening.category, recommendedAction, finalReasoning,
    recentTickets.map(t => t.ticketNumber),
    deviceVerification?.verified ? {
      hostname: deviceVerification.device!.hostname,
      technician: deviceVerification.technician!,
      ip: deviceVerification.device!.extIpAddress,
      lastSeen: deviceVerification.device!.lastSeen,
    } : undefined,
  );

  // Persist the incident with the assessment + full enrichment bundle.
  const incidentId = await createIncident(group, finalVerdict, finalConfidence, finalReasoning, assessment, enrichment);

  // Auto-post the self-contained internal note to Autotask (Internal Only) when
  // enabled and not a dry run. Closure and customer replies stay technician-approved.
  let noteAutoPosted = false;
  // Never create side-effecting actions on an already-resolved/closed ticket.
  // Re-running analysis on a closed ticket (or one a tech closed mid-batch) must
  // not auto-post notes or queue customer messages for a handled incident — the
  // assessment is still persisted and shown, only the outbound actions are held.
  const ticketResolved = isResolvedStatus(primary.status, primary.statusLabel);
  if (finalConfidence >= config.confidence_floor && !ticketResolved) {
    if (!config.dry_run && config.auto_post_internal_note) {
      await addAutotaskNote(primary.autotaskTicketId, finalNote, incidentId);
      noteAutoPosted = true;
    } else {
      await createPendingAction({
        incidentId,
        autotaskTicketId: primary.autotaskTicketId,
        ticketNumber: primary.ticketNumber,
        companyName: primary.companyName || null,
        actionType: 'add_note',
        actionPayload: { noteTitle: 'SOC Analyst Assessment', noteBody: finalNote, notePublish: 2 },
        previewSummary: `Add internal SOC assessment note to ticket #${primary.ticketNumber} (${primary.companyName || 'Unknown Company'})`,
      });
    }

    // Customer message stays technician-approved — only when it's a real concern.
    if (assessment?.customerMessageRequired && assessment.customerMessageDraft) {
      await createPendingAction({
        incidentId,
        autotaskTicketId: primary.autotaskTicketId,
        ticketNumber: primary.ticketNumber,
        companyName: primary.companyName || null,
        actionType: 'send_customer_message',
        actionPayload: {
          noteTitle: 'SOC Security Alert - Action Required',
          noteBody: assessment.customerMessageDraft,
          notePublish: 1, // Customer-visible
          recipient: 'primary contact',
        },
        previewSummary: `Send customer message on ticket #${primary.ticketNumber} to ${primary.companyName || 'Unknown Company'}`,
      });
    }
  }

  return {
    ticketId: primary.autotaskTicketId,
    verdict: finalVerdict,
    confidence: finalConfidence,
    reasoning: finalReasoning,
    recommendedAction: recommendedAction as TriageResult['recommendedAction'],
    alertSource: enrichment.sourceSystem as AlertSource,
    alertCategory: screening.category as AlertCategory,
    extractedIps: screening.extractedIps,
    deviceVerification,
    ticketNote: finalNote,
    aiModel: assessment ? config.deep_analysis_model : config.screening_model,
    tokensUsed: totalTokens,
    incidentId,
    assessment: assessment || undefined,
    enrichment,
    noteAutoPosted,
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
    // Handle potential markdown-wrapped JSON
    const jsonText = text.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    const parsed = JSON.parse(jsonText) as ScreeningResult;
    return {
      ...parsed,
      tokensUsed: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SOC] Screening failed for ticket ${ticket.ticketNumber}:`, msg);
    throw new Error(`AI screening failed: ${msg}`);
  }
}

interface AssessmentWithTokens extends SocAssessment {
  tokensUsed?: number;
}

/**
 * Generate the authoritative cross-stack assessment. Reasons over the full
 * correlated evidence bundle and produces a self-contained internal note.
 */
async function generateCrossStackAssessment(
  ticket: SecurityTicket,
  recentTickets: SecurityTicket[],
  enrichment: EnrichmentBundle,
  deviceVerification: DeviceVerification | null,
  model: string,
  signals: AssessmentSignals | null,
): Promise<AssessmentWithTokens> {
  const prompt = buildCrossStackAssessmentPrompt(
    ticket, recentTickets, enrichment, deviceVerification, signals,
  );

  const response = await trackAnthropicCall('soc_assessment', model, () =>
    anthropic.messages.create({
      model,
      // High budget: the assessment returns every section PLUS a long
      // self-contained internal note. At 4096 the JSON was truncated mid-string
      // and JSON.parse threw, silently dropping us back to the screening result.
      max_tokens: 8000,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    })
  );

  const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
  if (!text) throw new Error('AI returned empty assessment');
  if (response.stop_reason === 'max_tokens') {
    throw new Error('AI assessment hit max_tokens (response truncated) — JSON would be invalid');
  }
  const parsed = extractJson<SocAssessment>(text);
  return {
    ...parsed,
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

// ── Deterministic Guardrails ──
// These run in code, independent of the AI narrative, so the failure modes the
// assessment must never produce (overconfidence with no corroboration, frequency
// used as reassurance, closing identity changes without confirmation) can't slip
// through regardless of what the model wrote.

const CLASSIFICATION_LABELS: Record<SocClassification, string> = {
  confirmed_malicious: 'CONFIRMED MALICIOUS',
  suspicious_review: 'SUSPICIOUS — NEEDS REVIEW',
  likely_false_positive: 'LIKELY FALSE POSITIVE',
  confirmed_false_positive: 'CONFIRMED FALSE POSITIVE',
  insufficient_data: 'INDETERMINATE — INSUFFICIENT DATA',
};

const RISK_ORDER: RiskLevel[] = ['none', 'low', 'medium', 'high', 'critical'];
/** Raise a risk level to at least `floor` — never lowers it. */
function riskAtLeast(level: RiskLevel, floor: RiskLevel): RiskLevel {
  return RISK_ORDER.indexOf(level) >= RISK_ORDER.indexOf(floor) ? level : floor;
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

/**
 * Reconcile the AI-written internal note with the final (guardrail-adjusted)
 * values: rewrite the header line and append a transparent adjustments + tenant
 * root-cause block, so the note posted to Autotask never contradicts the verdict.
 */
function reconcileInternalNote(assessment: SocAssessment, adjustments: string[]): string {
  let note = assessment.internalNote || '';
  const pct = Math.round((assessment.confidence || 0) * 100);
  const header = `Classification: ${CLASSIFICATION_LABELS[assessment.classification]} (Confidence ${pct}%)  |  Risk: ${assessment.riskLevel}`;
  note = /^Classification:.*$/m.test(note)
    ? note.replace(/^Classification:.*$/m, header)
    : `${header}\n\n${note}`;

  const blocks: string[] = [];
  if (assessment.tenantRootCause && !note.includes(assessment.tenantRootCause)) {
    blocks.push(`TENANT ROOT CAUSE\n${assessment.tenantRootCause}`);
  }
  if (adjustments.length > 0) {
    blocks.push([
      '─── AUTOMATED GUARDRAIL ADJUSTMENTS ───',
      ...adjustments.map(a => `- ${a}`),
      'Applied deterministically in code (independent of the AI narrative) to prevent overconfidence when corroboration is missing.',
    ].join('\n'));
  }
  if (blocks.length === 0) return note;

  const block = blocks.join('\n\n');
  const endMarker = '═══ END SOC ASSESSMENT ═══';
  return note.includes(endMarker)
    ? note.replace(endMarker, `${block}\n${endMarker}`)
    : `${note}\n\n${block}`;
}

/**
 * Apply the deterministic guardrails the assessment must always obey. Mutates and
 * returns the assessment so verdict/action/confidence/note all reflect the result.
 */
function applyGuardrails(
  assessment: SocAssessment,
  signals: AssessmentSignals,
  config: SocConfig,
): SocAssessment {
  const adjustments: string[] = [];
  const corroborated = signals.corroboration.corroboratingTelemetry;
  const cap = config.confidence_uncorroborated_cap;
  const positiveBenign =
    !!assessment.knownBenignMatch?.matched || signals.geo.onKnownCompanyNetwork || corroborated;

  // 1. Confidence cap on missing corroboration — confidence is a function of how
  //    much was actually verified, not the model's optimism.
  if (!corroborated) {
    signals.corroboration.confidenceCeiling = cap;
    if (assessment.confidence > cap) {
      adjustments.push(
        `Confidence lowered to ${Math.round(cap * 100)}% — no independent telemetry corroborated this alert (RocketCyber / Datto RMM / Datto EDR / known-network all absent or unrelated).`,
      );
      assessment.confidence = cap;
    }
  }

  // 2. Identity/MFA change → "confirm with user" unless positive benign evidence.
  const benignClass =
    assessment.classification === 'likely_false_positive' ||
    assessment.classification === 'confirmed_false_positive';
  if (signals.identityChange && benignClass && !positiveBenign) {
    adjustments.push(
      `Reclassified from "${assessment.classification.replace(/_/g, ' ')}" to "suspicious — needs review": identity/MFA-change alert with no positive evidence of benign intent (not on a known device/network, no corroborating telemetry). Identity changes require user confirmation before closing.`,
    );
    assessment.classification = 'suspicious_review';
    assessment.riskLevel = riskAtLeast(assessment.riskLevel, 'low');
    if (assessment.confidence > cap) assessment.confidence = cap;
  }

  // 3. Recurring pattern → tenant root-cause section. Never lowers risk or raises
  //    benign confidence — it only reduces novelty and flags a pattern to fix.
  if (signals.recurrence.recurringPattern && !assessment.tenantRootCause) {
    assessment.tenantRootCause = defaultTenantRootCause(signals);
    adjustments.push(
      `Recurring pattern detected (${signals.recurrence.similarAlertCount} similar alerts in ${signals.recurrence.windowDays} days) — added a tenant root-cause checklist. Repetition reduces novelty only; it does not make this instance benign and does not lower risk.`,
    );
  }

  // 4. Always end with a concrete next action when corroboration is missing (or an
  //    identity change lacks positive benign evidence) — never "no action needed".
  if (!corroborated || (signals.identityChange && !positiveBenign)) {
    const verifyStep = signals.identityChange
      ? 'Confirm directly with the user that they made this change, and verify which MFA methods remain registered (Microsoft Entra admin center → Users → select the user → Authentication methods). Removing one method does not necessarily leave the account without MFA. Do not close until confirmed.'
      : 'Confirm the activity with the affected user/customer and review the source device before closing — no independent telemetry corroborated this alert.';
    const actions = assessment.recommendedTechnicianActions || [];
    if (!actions.some(a => /\b(confirm|verify)\b/i.test(a))) {
      assessment.recommendedTechnicianActions = [...actions, verifyStep];
    }
    if (!/\b(confirm|verify)\b/i.test(assessment.finalRecommendation || '')) {
      const tail = signals.identityChange
        ? 'Confirm the change with the user and verify remaining registered MFA methods before closing.'
        : 'Confirm the activity with the customer before closing.';
      assessment.finalRecommendation = `${(assessment.finalRecommendation || '').trim()} ${tail}`.trim();
    }
  }

  // 5. A downgraded item must not carry a "close as false positive" closure note.
  if (
    assessment.classification === 'suspicious_review' &&
    /false positive|no (further )?action|clos(e|ing)/i.test(assessment.closureNote || '')
  ) {
    assessment.closureNote =
      'Do not close yet — pending user confirmation. This change could not be corroborated from available telemetry; confirm with the user and verify remaining MFA methods, then document the outcome before closing.';
    adjustments.push('Closure note reset — not eligible for close-as-false-positive until confirmed with the user.');
  }

  // 6. Reconcile the posted note with the final values.
  assessment.internalNote = reconcileInternalNote(assessment, adjustments);
  return assessment;
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
