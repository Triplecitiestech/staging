import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';
import { trackApiUsage } from '@/lib/api-usage-tracker';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const AI_TIMEOUT_MS = 50_000; // 50s timeout (maxDuration is 60s)

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * POST /api/soc/analyst — AI SOC Analyst conversational endpoint.
 * Analyzes security ticket patterns and suggests rules.
 *
 * Body: { messages: ChatMessage[], createRule?: RulePayload }
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || !['SUPER_ADMIN', 'ADMIN'].includes(session.user?.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();

  // Handle rule creation requests
  if (body.createRule) {
    return handleCreateRule(body.createRule, session.user.email);
  }

  if (!anthropic) {
    return NextResponse.json({
      error: 'AI service not configured. Check ANTHROPIC_API_KEY.',
    }, { status: 500 });
  }

  const messages: ChatMessage[] = body.messages || [];
  if (messages.length === 0) {
    return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
  }

  try {
    // Fetch security ticket data for AI context (parallel queries)
    const [ticketSummary, existingRules, recentActivity] = await Promise.all([
      getTicketSummary(),
      getExistingRules(),
      getRecentActivity(),
    ]);

    const systemPrompt = buildSystemPrompt(ticketSummary, existingRules, recentActivity);

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), AI_TIMEOUT_MS);
    const startMs = Date.now();

    let response: Anthropic.Message;
    try {
      response = await anthropic.messages.create(
        {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: systemPrompt,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
        },
        { signal: abortController.signal }
      );
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        return NextResponse.json({
          error: 'AI analysis timed out. Try a more specific question.',
        }, { status: 504 });
      }
      throw err;
    }
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startMs;

    const content = response.content[0]?.type === 'text' ? response.content[0].text : '';

    trackApiUsage({
      provider: 'anthropic',
      feature: 'soc-analyst',
      model: 'claude-sonnet-4-20250514',
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      durationMs,
      statusCode: 200,
    });

    return NextResponse.json({
      success: true,
      message: content,
      usage: response.usage,
    });
  } catch (err) {
    console.error('[soc/analyst]', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'AI analysis failed',
    }, { status: 500 });
  }
}

// ── Helpers ──

async function getTicketSummary(): Promise<string> {
  try {
    // Get security tickets from last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const tickets = await prisma.ticket.findMany({
      where: {
        createDate: { gte: sixMonthsAgo },
        queueLabel: { contains: 'Security Monitoring', mode: 'insensitive' },
      },
      select: {
        autotaskTicketId: true,
        ticketNumber: true,
        title: true,
        status: true,
        statusLabel: true,
        priority: true,
        priorityLabel: true,
        createDate: true,
        completedDate: true,
        queueLabel: true,
        sourceLabel: true,
        company: { select: { displayName: true } },
      },
      orderBy: { createDate: 'desc' },
      take: 500, // Cap to avoid token explosion
    });

    if (tickets.length === 0) {
      return 'No security monitoring tickets found in the last 6 months.';
    }

    // Build a concise summary with patterns
    const companyGroups = new Map<string, number>();
    const titlePatterns = new Map<string, number>();
    const sourceGroups = new Map<string, number>();
    const monthlyVolume = new Map<string, number>();
    let openCount = 0;
    let resolvedCount = 0;

    for (const t of tickets) {
      const company = t.company?.displayName || 'Unknown';
      companyGroups.set(company, (companyGroups.get(company) || 0) + 1);

      const source = t.sourceLabel || 'Unknown';
      sourceGroups.set(source, (sourceGroups.get(source) || 0) + 1);

      // Extract key phrases from titles for pattern detection
      const titleLower = t.title.toLowerCase();
      const patterns = [
        'impossible travel', 'suspicious login', 'foreign country',
        'saas alert', 'datto edr', 'rocketcyber', 'malware', 'phishing',
        'vpn detected', 'gaming process', 'bittorrent', 'tor',
        'brute force', 'credential', 'quarantine', 'blocked',
        'network inspection', 'outbound connection', 'unapproved app',
      ];
      for (const p of patterns) {
        if (titleLower.includes(p)) {
          titlePatterns.set(p, (titlePatterns.get(p) || 0) + 1);
        }
      }

      const month = t.createDate.toISOString().slice(0, 7);
      monthlyVolume.set(month, (monthlyVolume.get(month) || 0) + 1);

      if (t.completedDate) resolvedCount++;
      else openCount++;
    }

    // Get SOC verdicts if available
    let verdictSummary = '';
    try {
      const verdicts = await prisma.$queryRaw<Array<{ verdict: string; count: bigint }>>`
        SELECT verdict, COUNT(*) as count FROM soc_ticket_analysis
        WHERE verdict IS NOT NULL
        GROUP BY verdict
      `;
      if (verdicts.length > 0) {
        verdictSummary = '\n\nSOC Verdict Distribution:\n' +
          verdicts.map((v: { verdict: string; count: bigint }) => `- ${v.verdict}: ${v.count}`).join('\n');
      }
    } catch { /* table may not exist */ }

    const sortedCompanies = Array.from(companyGroups.entries()).sort((a, b) => b[1] - a[1]);
    const sortedPatterns = Array.from(titlePatterns.entries()).sort((a, b) => b[1] - a[1]);
    const sortedSources = Array.from(sourceGroups.entries()).sort((a, b) => b[1] - a[1]);
    const sortedMonths = Array.from(monthlyVolume.entries()).sort();

    let summary = `Security Ticket Summary (last 6 months, ${tickets.length} tickets):\n`;
    summary += `- Open: ${openCount}, Resolved: ${resolvedCount}\n`;
    summary += `\nMonthly Volume:\n${sortedMonths.map(([m, c]) => `- ${m}: ${c}`).join('\n')}`;
    summary += `\n\nTop Companies (by ticket volume):\n${sortedCompanies.slice(0, 15).map(([c, n]) => `- ${c}: ${n}`).join('\n')}`;
    summary += `\n\nAlert Patterns Detected:\n${sortedPatterns.slice(0, 20).map(([p, n]) => `- "${p}": ${n} occurrences`).join('\n')}`;
    summary += `\n\nAlert Sources:\n${sortedSources.map(([s, n]) => `- ${s}: ${n}`).join('\n')}`;
    summary += verdictSummary;

    // Include sample of recent tickets for detailed analysis
    summary += '\n\nRecent Security Tickets (last 20):\n';
    for (const t of tickets.slice(0, 20)) {
      summary += `- [${t.ticketNumber}] ${t.title} | ${t.company?.displayName || '?'} | ${t.priorityLabel || `P${t.priority}`} | ${t.statusLabel || `Status ${t.status}`} | ${t.createDate.toISOString().slice(0, 10)}\n`;
    }

    return summary;
  } catch (err) {
    console.error('[soc/analyst] Failed to get ticket summary:', err);
    return 'Unable to fetch ticket data.';
  }
}

async function getExistingRules(): Promise<string> {
  try {
    const rules = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT name, description, "ruleType", pattern, action, "isActive", priority, "matchCount"
      FROM soc_rules ORDER BY priority ASC
    `;
    if (rules.length === 0) return 'No SOC rules currently configured.';

    return 'Current SOC Rules:\n' + rules.map((r: Record<string, unknown>) =>
      `- [${r.isActive ? 'ACTIVE' : 'DISABLED'}] "${r.name}" (${r.ruleType}, action: ${r.action}, matches: ${r.matchCount})\n  Pattern: ${JSON.stringify(r.pattern)}\n  ${r.description || ''}`
    ).join('\n');
  } catch {
    return 'SOC rules table not yet initialized.';
  }
}

async function getRecentActivity(): Promise<string> {
  try {
    const entries = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT action, detail, "confidenceScore", metadata, "createdAt"
      FROM soc_activity_log
      ORDER BY "createdAt" DESC
      LIMIT 30
    `;
    if (entries.length === 0) return 'No recent SOC activity.';

    return 'Recent SOC Activity (last 30 actions):\n' + entries.map((e: Record<string, unknown>) =>
      `- ${String(e.createdAt).slice(0, 19)} | ${e.action} | conf: ${e.confidenceScore ?? 'N/A'} | ${String(e.detail || '').slice(0, 120)}`
    ).join('\n');
  } catch {
    return 'SOC activity log not available.';
  }
}

function buildSystemPrompt(ticketSummary: string, existingRules: string, recentActivity: string): string {
  return `You are a senior SOC (Security Operations Center) analyst for Triple Cities Tech, a managed service provider. You have deep expertise in security alert triage, pattern recognition, and SOC automation.

Your job is to:
1. Analyze security alert ticket data from the last 3-6 months
2. Identify recurring patterns, false positive trends, and high-risk indicators
3. Suggest actionable SOC rules to automate triage
4. Explain your analysis in clear, practical terms

When suggesting rules, output them in this JSON format so the system can create them:

\`\`\`json:rule
{
  "name": "Short descriptive name",
  "description": "What this rule does and why",
  "ruleType": "suppression|correlation|escalation",
  "pattern": {
    "titlePatterns": ["keyword1", "keyword2"],
    "sourceMatch": "saas_alerts|datto_edr|rocketcyber",
    "sameCompany": true,
    "sameDevice": true,
    "minTicketsInWindow": 3,
    "windowMinutes": 15,
    "requireDeviceVerification": false,
    "companyMatch": null,
    "ipRange": null,
    "priorityMax": null
  },
  "action": "auto_close_recommend|suppress|escalate|flag",
  "priority": 50
}
\`\`\`

Rule types:
- **suppression**: Auto-recommend closing known false positives (e.g., technician logins from verified devices)
- **correlation**: Group related alerts together (e.g., same device burst within 15 minutes)
- **escalation**: Flag high-risk patterns for immediate human review

Pattern fields:
- titlePatterns: Array of keywords to match in ticket title/description (case-insensitive)
- sourceMatch: Match specific alert source (saas_alerts, datto_edr, rocketcyber)
- sameCompany/sameDevice: For correlation rules
- minTicketsInWindow + windowMinutes: Burst detection
- requireDeviceVerification: Only match if device is verified in Datto RMM
- priorityMax: Only match at/below this priority (lower number = higher priority)

Actions:
- auto_close_recommend: Recommend closing as false positive
- suppress: Suppress from dashboard (still logged)
- escalate: Immediately escalate for human review
- flag: Flag for review but don't auto-act

Guidelines:
- Be specific about WHY you're suggesting each rule
- Reference actual ticket data/patterns you see
- Err on the side of caution — prefer "flag" over "suppress" for uncertain patterns
- Consider the company context — high-volume false positives at one company may be legitimate at another
- When asked to refine, adjust the specific rule parameters
- Keep rule names short and descriptive

${ticketSummary}

${existingRules}

${recentActivity}`;
}

async function handleCreateRule(
  rule: Record<string, unknown>,
  userEmail: string
): Promise<NextResponse> {
  const { name, description, ruleType, pattern, action, priority } = rule;

  if (!name || !ruleType || !pattern || !action) {
    return NextResponse.json({
      error: 'Rule requires name, ruleType, pattern, and action',
    }, { status: 400 });
  }

  try {
    const [created] = await prisma.$queryRaw<[{ id: string }]>`
      INSERT INTO soc_rules (id, name, description, "ruleType", pattern, action, priority, "createdBy")
      VALUES (gen_random_uuid()::text, ${String(name)}, ${String(description || '')}, ${String(ruleType)},
              ${JSON.stringify(pattern)}::jsonb, ${String(action)}, ${Number(priority) || 50}, ${userEmail})
      RETURNING id
    `;

    return NextResponse.json({ success: true, ruleId: created.id });
  } catch (err) {
    console.error('[soc/analyst] Failed to create rule:', err);
    return NextResponse.json({
      error: 'Failed to create rule',
    }, { status: 500 });
  }
}
