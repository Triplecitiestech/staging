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
import { buildScreeningPrompt, buildDeepAnalysisPrompt, formatTicketNote } from './prompts';
import { matchRules, isSecurityTicket, detectAlertSource } from './rules';
import { verifyTechnicianByIp, verifyTechnicianLive } from './technician-verifier';
import type {
  SecurityTicket,
  SocConfig,
  SocRule,
  TriageResult,
  SocJobMeta,
  ScreeningResult,
  DeepAnalysisResult,
  DeviceVerification,
  IncidentGroup,
  Verdict,
  AlertSource,
  AlertCategory,
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
  let aiCallsThisRun = 0;

  // Step 1: Filter to security-related tickets
  const securityTickets = tickets.filter(isSecurityTicket);
  const skippedCount = tickets.length - securityTickets.length;
  meta.skipped = skippedCount;

  if (securityTickets.length === 0) {
    return { meta, results, errors };
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

      if (result) {
        results.push(result);
        meta.ticketsProcessed += group.tickets.length;

        if (result.verdict === 'false_positive') meta.falsePositives++;
        if (result.verdict === 'escalate') meta.escalated++;
        if (result.recommendedAction === 'close' && !config.dry_run) meta.notesAdded++;

        // Record analysis for each ticket in the group
        for (const ticket of group.tickets) {
          await recordAnalysis(ticket, result, group, config);
        }

        // Log activity
        await logActivity({
          analysisId: null,
          incidentId: result.incidentId || null,
          autotaskTicketId: result.ticketId,
          action: 'analyzed',
          detail: `Verdict: ${result.verdict} (${Math.round(result.confidence * 100)}%). Action: ${result.recommendedAction}`,
          aiReasoning: result.reasoning,
          confidenceScore: result.confidence,
          metadata: {
            alertSource: result.alertSource,
            category: result.alertCategory,
            ticketCount: group.tickets.length,
            model: result.aiModel,
          },
        });
      }
    } catch (err) {
      meta.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Error processing ticket ${group.primaryTicket.ticketNumber}: ${msg}`);
      console.error(`[SOC] Error processing group:`, err);

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

  return { meta, results, errors };
}

// ── Process Single Incident Group ──

async function processIncidentGroup(
  group: IncidentGroup,
  config: SocConfig,
  rules: SocRule[],
  onAiCall: () => void,
): Promise<TriageResult | null> {
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

  // Step 1: Haiku screening
  onAiCall();
  const screening = await runScreening(primary, recentTickets, rules, deviceVerification, config.screening_model);

  if (!screening) {
    return null;
  }

  // Determine if deep analysis is needed
  const needsDeep = screening.needsDeepAnalysis ||
    screening.confidence < config.confidence_flag_review ||
    group.tickets.length > 2;

  let finalVerdict: Verdict = screening.isFalsePositive ? 'false_positive' : 'suspicious';
  let finalConfidence = screening.confidence;
  let finalReasoning = screening.reasoning;
  let finalNote = '';
  let finalModel = config.screening_model;
  let totalTokens = screening.tokensUsed || 0;

  // Step 2: Deep analysis if needed
  if (needsDeep && screening.confidence < 0.95) {
    onAiCall();
    const deepResult = await runDeepAnalysis(group, deviceVerification, config.deep_analysis_model);

    if (deepResult) {
      finalVerdict = deepResult.verdict;
      finalConfidence = deepResult.confidence;
      finalReasoning = deepResult.reasoning;
      finalNote = deepResult.ticketNote;
      finalModel = config.deep_analysis_model;
      totalTokens += deepResult.tokensUsed || 0;
    }
  }

  // Apply safeguards
  // Never auto-recommend close for high-priority tickets
  if (primary.priority <= 2 && finalVerdict === 'false_positive') {
    finalVerdict = 'escalate';
    finalReasoning += '\n[SAFEGUARD: High-priority ticket — escalated for human review regardless of AI assessment.]';
  }

  // Below confidence floor → informational only
  const recommendedAction = determineAction(finalVerdict, finalConfidence, config, matchedRules);

  // Build ticket note
  if (!finalNote) {
    finalNote = formatTicketNote(
      finalVerdict,
      finalConfidence,
      screening.category,
      recommendedAction,
      finalReasoning,
      group.tickets.filter(t => t.autotaskTicketId !== primary.autotaskTicketId).map(t => t.ticketNumber),
      deviceVerification?.verified ? {
        hostname: deviceVerification.device!.hostname,
        technician: deviceVerification.technician!,
        ip: deviceVerification.device!.extIpAddress,
        lastSeen: deviceVerification.device!.lastSeen,
      } : undefined,
    );
  }

  // Create incident record for correlated groups
  let incidentId: string | undefined;
  if (group.tickets.length > 1) {
    incidentId = await createIncident(group, finalVerdict, finalConfidence, finalReasoning);
  }

  // Add Autotask note (unless dry run)
  if (!config.dry_run && finalConfidence >= config.confidence_floor) {
    await addAutotaskNote(primary.autotaskTicketId, finalNote);
  }

  return {
    ticketId: primary.autotaskTicketId,
    verdict: finalVerdict,
    confidence: finalConfidence,
    reasoning: finalReasoning,
    recommendedAction: recommendedAction as TriageResult['recommendedAction'],
    alertSource: screening.alertSource as AlertSource,
    alertCategory: screening.category as AlertCategory,
    extractedIps: screening.extractedIps,
    deviceVerification,
    ticketNote: finalNote,
    aiModel: finalModel,
    tokensUsed: totalTokens,
    incidentId,
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
): Promise<ScreeningWithTokens | null> {
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
    const parsed = JSON.parse(text) as ScreeningResult;
    return {
      ...parsed,
      tokensUsed: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
    };
  } catch (err) {
    console.error('[SOC] Screening AI call failed:', err);
    return null;
  }
}

interface DeepAnalysisWithTokens extends DeepAnalysisResult {
  tokensUsed?: number;
}

async function runDeepAnalysis(
  group: IncidentGroup,
  deviceVerification: DeviceVerification | null,
  model: string,
): Promise<DeepAnalysisWithTokens | null> {
  const prompt = buildDeepAnalysisPrompt(
    group.tickets,
    group.reason,
    deviceVerification,
    null, // historical FP rate — TODO: compute from past analyses
    0,    // similar FP count — TODO: compute from past analyses
  );

  try {
    const response = await trackAnthropicCall('soc_triage_deep', model, () =>
      anthropic.messages.create({
        model,
        max_tokens: 1024,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      })
    );

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const parsed = JSON.parse(text) as DeepAnalysisResult;
    return {
      ...parsed,
      tokensUsed: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
    };
  } catch (err) {
    console.error('[SOC] Deep analysis AI call failed:', err);
    return null;
  }
}

// ── Helpers ──

function determineAction(
  verdict: Verdict,
  confidence: number,
  config: SocConfig,
  matchedRules: SocRule[],
): string {
  if (confidence < config.confidence_floor) return 'investigate';
  if (verdict === 'escalate') return 'escalate';

  if (verdict === 'false_positive') {
    if (confidence >= config.confidence_auto_close) return 'close';
    if (confidence >= config.confidence_flag_review) return 'close';
    return 'investigate';
  }

  if (matchedRules.some(r => r.action === 'escalate')) return 'escalate';
  return 'investigate';
}

async function createIncident(
  group: IncidentGroup,
  verdict: Verdict,
  confidence: number,
  reasoning: string,
): Promise<string> {
  const result = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO soc_incidents (id, title, "companyId", "alertSource", "ticketCount", verdict, "confidenceScore", "aiSummary", "correlationReason", "primaryTicketId", status)
    VALUES (
      gen_random_uuid()::text,
      ${`${group.tickets.length} correlated alerts: ${group.primaryTicket.title.slice(0, 100)}`},
      ${group.primaryTicket.companyId},
      ${detectAlertSource(group.primaryTicket)},
      ${group.tickets.length},
      ${verdict},
      ${confidence},
      ${reasoning.slice(0, 2000)},
      ${group.reason},
      ${group.primaryTicket.autotaskTicketId},
      ${'open'}
    )
    RETURNING id
  `;
  return result[0].id;
}

async function addAutotaskNote(ticketId: string, noteText: string): Promise<void> {
  try {
    const { AutotaskClient } = await import('@/lib/autotask');
    const client = new AutotaskClient();
    await client.createTicketNote(parseInt(ticketId, 10), {
      title: 'SOC AI Triage Analysis',
      description: noteText,
      noteType: 1,
      publish: 2, // Internal Only — NOT visible to customers
    });

    await logActivity({
      analysisId: null,
      incidentId: null,
      autotaskTicketId: ticketId,
      action: 'note_added',
      detail: 'Internal SOC analysis note added to Autotask ticket',
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
  group: IncidentGroup,
  config: SocConfig,
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
    !config.dry_run && result.confidence >= config.confidence_floor,
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
