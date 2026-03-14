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
import { buildScreeningPrompt, buildDeepAnalysisPrompt, buildActionPlanPrompt, buildReasoningPrompt, formatTicketNote } from './prompts';
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
  IncidentActionPlan,
  SocReasoning,
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
      if (result.verdict === 'escalate') meta.escalated++;
      if (result.recommendedAction === 'close' && !config.dry_run) meta.notesAdded++;

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
        await recordAnalysis(ticket, result, group, config);
      }

      // Log activity with rich metadata
      const mergeInfo = result.actionPlan?.proposedActions?.merge;
      const escalationInfo = result.actionPlan?.proposedActions?.escalation;
      await logActivity({
        analysisId: null,
        incidentId: result.incidentId || null,
        autotaskTicketId: result.ticketId,
        action: 'analyzed',
        detail: `Verdict: ${result.verdict} (${Math.round(result.confidence * 100)}%). Action: ${result.recommendedAction}${mergeInfo?.shouldMerge ? `. Merge recommended → ${mergeInfo.survivingTicketNumber}` : ''}${escalationInfo?.recommended ? `. Escalation: ${escalationInfo.urgency}` : ''}`,
        aiReasoning: result.reasoning,
        confidenceScore: result.confidence,
        metadata: {
          alertSource: result.alertSource,
          category: result.alertCategory,
          ticketCount: group.tickets.length,
          model: result.aiModel,
          verdict: result.verdict,
          companyName: group.primaryTicket.companyName || null,
          companyId: group.primaryTicket.companyId || null,
          deviceHostname: result.deviceVerification?.device?.hostname || null,
          mergeRecommended: mergeInfo?.shouldMerge || false,
          mergeSurvivingTicket: mergeInfo?.survivingTicketNumber || null,
          escalationRecommended: escalationInfo?.recommended || false,
          escalationUrgency: escalationInfo?.urgency || null,
          riskLevel: result.actionPlan?.humanGuidance?.riskLevel || null,
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

async function getHistoricalFpRate(companyId: string | null, alertSource: string): Promise<{ fpRate: number | null; similarFpCount: number }> {
  if (!companyId) return { fpRate: null, similarFpCount: 0 };
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [stats] = await prisma.$queryRaw<[{ total: bigint; fps: bigint }]>`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE verdict IN ('false_positive', 'expected_activity')) as fps
      FROM soc_ticket_analysis
      WHERE "companyId" = ${companyId}
        AND "alertSource" = ${alertSource}
        AND "processedAt" >= ${thirtyDaysAgo}
    `;
    const total = Number(stats.total);
    const fps = Number(stats.fps);
    return {
      fpRate: total > 0 ? Math.round((fps / total) * 100) : null,
      similarFpCount: fps,
    };
  } catch {
    return { fpRate: null, similarFpCount: 0 };
  }
}

async function getTechnicianRoster(): Promise<string[]> {
  try {
    const resources = await prisma.resource.findMany({
      where: { isActive: true },
      select: { firstName: true, lastName: true },
    });
    return resources
      .map(r => `${r.firstName} ${r.lastName}`.trim())
      .filter(name => name.length > 0);
  } catch {
    return [];
  }
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

  // Step 1: Haiku screening — errors thrown to caller for proper error tracking
  onAiCall();
  const screening = await runScreening(primary, recentTickets, rules, deviceVerification, config.screening_model);

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
    // Fetch historical FP data for deep analysis context
    const alertSrc = detectAlertSource(primary);
    const historicalData = await getHistoricalFpRate(primary.companyId, alertSrc);
    const deepResult = await runDeepAnalysis(group, deviceVerification, config.deep_analysis_model, historicalData.fpRate, historicalData.similarFpCount);

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

  // Generate reasoning document (replaces action plan for new analyses)
  // Skip for high-confidence single false positives to stay within timeout
  let actionPlan: IncidentActionPlan | undefined;
  let reasoning: SocReasoning | undefined;
  if (finalVerdict !== 'false_positive' || group.tickets.length > 1 || finalConfidence < config.confidence_auto_close) {
    try {
      onAiCall();

      // Fetch enrichment context in parallel
      const alertSource = detectAlertSource(primary);
      const [historicalData, technicianRoster] = await Promise.all([
        getHistoricalFpRate(primary.companyId, alertSource),
        getTechnicianRoster(),
      ]);

      reasoning = await generateReasoning(
        group, finalVerdict, finalConfidence, finalReasoning, deviceVerification,
        config.deep_analysis_model, technicianRoster,
        historicalData.fpRate, historicalData.similarFpCount,
      );

      // Use reasoning's internal note if available
      if (reasoning.internalNote) {
        finalNote = reasoning.internalNote;
      }

      // Map reasoning classification to verdict for backwards compat
      if (reasoning.classification === 'expected_activity') {
        finalVerdict = 'expected_activity' as Verdict;
      } else if (reasoning.classification === 'confirmed_threat') {
        finalVerdict = 'confirmed_threat' as Verdict;
      } else if (reasoning.classification === 'false_positive') {
        finalVerdict = 'false_positive';
      } else if (reasoning.classification === 'suspicious') {
        finalVerdict = 'suspicious';
      } else if (reasoning.classification === 'informational') {
        finalVerdict = 'informational' as Verdict;
      }

      finalConfidence = reasoning.confidence;
    } catch (err) {
      console.error('[SOC] Reasoning generation failed, falling back to action plan:', err);
      // Fallback to legacy action plan if reasoning fails
      try {
        onAiCall();
        actionPlan = await generateActionPlan(
          group, finalVerdict, finalConfidence, finalReasoning, deviceVerification, config.screening_model,
        );
        if (actionPlan.proposedActions.internalNote) {
          finalNote = actionPlan.proposedActions.internalNote;
        }
        if (actionPlan.proposedActions.queueChange) {
          actionPlan.proposedActions.queueChange = null;
        }
      } catch (apErr) {
        console.error('[SOC] Action plan fallback also failed:', apErr);
        await logActivity({
          analysisId: null,
          incidentId: null,
          autotaskTicketId: primary.autotaskTicketId,
          action: 'error',
          detail: `Reasoning generation failed: ${err instanceof Error ? err.message : String(err)}`,
          aiReasoning: null,
          confidenceScore: null,
          metadata: { ticketNumber: primary.ticketNumber, phase: 'reasoning' },
        });
      }
    }
  }

  // Create incident record for every analyzed group (single or correlated)
  const incidentId = await createIncident(group, finalVerdict, finalConfidence, finalReasoning, actionPlan, reasoning);

  // Create pending actions for human approval
  // Always create these — even in dry run mode — so the admin can preview and approve
  if (finalConfidence >= config.confidence_floor) {
    // 1. Internal note action
    await createPendingAction({
      incidentId: incidentId,
      autotaskTicketId: primary.autotaskTicketId,
      ticketNumber: primary.ticketNumber,
      companyName: primary.companyName || null,
      actionType: 'add_note',
      actionPayload: {
        noteTitle: 'SOC AI Triage Analysis',
        noteBody: finalNote,
        notePublish: 2, // Internal Only
      },
      previewSummary: `Add internal note to ticket #${primary.ticketNumber} (${primary.companyName || 'Unknown Company'}): "${finalNote.slice(0, 150)}${finalNote.length > 150 ? '...' : ''}"`,
    });

    // 2. Customer communication — use reasoning gate if available, fall back to action plan
    const customerRequired = reasoning
      ? reasoning.customerMessageRequired && reasoning.customerMessageDraft
      : actionPlan?.customerCommunication?.required && actionPlan.customerCommunication.message;

    const customerMessage = reasoning?.customerMessageDraft || actionPlan?.customerCommunication?.message;
    const customerRecipient = actionPlan?.customerCommunication?.recipient || 'primary contact';

    if (customerRequired && customerMessage) {
      await createPendingAction({
        incidentId: incidentId,
        autotaskTicketId: primary.autotaskTicketId,
        ticketNumber: primary.ticketNumber,
        companyName: primary.companyName || null,
        actionType: 'send_customer_message',
        actionPayload: {
          noteTitle: 'SOC Security Alert - Action Required',
          noteBody: customerMessage,
          notePublish: 1, // Customer-visible (All Autotask Users)
          recipient: customerRecipient,
          setStatusWaitingCustomer: reasoning ? reasoning.customerMessageRequired : actionPlan?.customerCommunication?.setStatusWaitingCustomer,
          followUpDays: actionPlan?.customerCommunication?.followUpDays,
          followUpMessage: actionPlan?.customerCommunication?.followUpMessage,
        },
        previewSummary: `Send customer message on ticket #${primary.ticketNumber} to ${customerRecipient} at ${primary.companyName || 'Unknown Company'}`,
      });
    }
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
    actionPlan,
    socReasoning: reasoning,
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

interface DeepAnalysisWithTokens extends DeepAnalysisResult {
  tokensUsed?: number;
}

async function runDeepAnalysis(
  group: IncidentGroup,
  deviceVerification: DeviceVerification | null,
  model: string,
  historicalFpRate: number | null = null,
  similarFpCount: number = 0,
): Promise<DeepAnalysisWithTokens | null> {
  const prompt = buildDeepAnalysisPrompt(
    group.tickets,
    group.reason,
    deviceVerification,
    historicalFpRate,
    similarFpCount,
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

    const rawText = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const cleanText = rawText.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    const parsed = JSON.parse(cleanText) as DeepAnalysisResult;
    return {
      ...parsed,
      tokensUsed: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
    };
  } catch (err) {
    console.error('[SOC] Deep analysis AI call failed:', err);
    return null;
  }
}

// ── Action Plan Generation ──

async function generateActionPlan(
  group: IncidentGroup,
  verdict: string,
  confidence: number,
  reasoning: string,
  deviceVerification: DeviceVerification | null,
  model: string,
): Promise<IncidentActionPlan> {
  const prompt = buildActionPlanPrompt(
    group.tickets, group.reason, verdict, confidence, reasoning, deviceVerification,
  );

  const response = await trackAnthropicCall('soc_action_plan', model, () =>
    anthropic.messages.create({
      model,
      max_tokens: 4096,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    })
  );

  const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
  if (!text) throw new Error('AI returned empty action plan');
  const jsonText = text.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  return JSON.parse(jsonText) as IncidentActionPlan;
}

// ── Reasoning Generation ──

async function generateReasoning(
  group: IncidentGroup,
  verdict: string,
  confidence: number,
  reasoning: string,
  deviceVerification: DeviceVerification | null,
  model: string,
  technicianRoster: string[],
  historicalFpRate: number | null,
  similarFpCount: number,
): Promise<SocReasoning> {
  const prompt = buildReasoningPrompt(
    group.tickets, group.reason, verdict, confidence, reasoning,
    deviceVerification, technicianRoster, historicalFpRate, similarFpCount,
  );

  const response = await trackAnthropicCall('soc_reasoning', model, () =>
    anthropic.messages.create({
      model,
      max_tokens: 4096,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    })
  );

  const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
  if (!text) throw new Error('AI returned empty reasoning document');
  const jsonText = text.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  return JSON.parse(jsonText) as SocReasoning;
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
  reasoningText: string,
  actionPlan?: IncidentActionPlan,
  reasoning?: SocReasoning,
): Promise<string> {
  const title = actionPlan?.proposedActions?.merge?.proposedTitle
    || (group.tickets.length > 1
      ? `${group.tickets.length} correlated alerts: ${group.primaryTicket.title.slice(0, 100)}`
      : group.primaryTicket.title.slice(0, 200));
  const summary = reasoning?.incidentSummary || actionPlan?.incidentSummary || reasoningText.slice(0, 2000);
  const companyName = group.primaryTicket.companyName || null;

  const result = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO soc_incidents (
      id, title, "companyId", "companyName", "alertSource", "ticketCount",
      verdict, "confidenceScore", "aiSummary", "correlationReason",
      "primaryTicketId", status, "proposedActions", "humanGuidance",
      "customerCommunication", "nextCycleChecks", reasoning
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
      ${actionPlan?.proposedActions ? JSON.stringify(actionPlan.proposedActions) : null}::jsonb,
      ${actionPlan?.humanGuidance ? JSON.stringify(actionPlan.humanGuidance) : null}::jsonb,
      ${actionPlan?.customerCommunication ? JSON.stringify(actionPlan.customerCommunication) : null}::jsonb,
      ${actionPlan?.nextCycleChecks ? JSON.stringify(actionPlan.nextCycleChecks) : null}::jsonb,
      ${reasoning ? JSON.stringify(reasoning) : null}::jsonb
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

export async function addAutotaskNote(ticketId: string, noteText: string): Promise<void> {
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
