import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

const RULE_SCHEMA = `{
  "name": "string - short descriptive name for the rule",
  "description": "string - what this rule does and why",
  "ruleType": "suppression | correlation | escalation",
  "pattern": {
    "titlePatterns": ["array of lowercase strings to match in ticket title/description"],
    "sourceMatch": "saas_alerts | datto_edr | rocketcyber | unknown (optional)",
    "companyMatch": "company UUID (optional)",
    "sameCompany": "boolean - correlate tickets from same company (optional)",
    "sameDevice": "boolean - correlate tickets from same device (optional)",
    "minTicketsInWindow": "number - minimum tickets to trigger (optional)",
    "windowMinutes": "number - time window for burst detection (optional)",
    "requireDeviceVerification": "boolean (optional)",
    "priorityMax": "number - only match tickets at or below this priority (optional)"
  },
  "action": "auto_close_recommend | suppress | escalate | flag",
  "priority": "number 1-1000 (lower = higher priority, default 100)"
}`;

/**
 * POST /api/soc/rules/ai — Convert natural language to a SOC rule using AI.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { description } = await request.json();
    if (!description || typeof description !== 'string' || description.trim().length < 5) {
      return NextResponse.json({ error: 'Description must be at least 5 characters' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 });
    }

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are a SOC (Security Operations Center) rule configuration assistant. Convert the following natural language description into a structured SOC rule.

The rule schema is:
${RULE_SCHEMA}

Rule types:
- "suppression": Auto-close or suppress known false positives (e.g., technician logins, scheduled scans)
- "correlation": Group related alerts together (e.g., same device burst, same source)
- "escalation": Flag tickets for immediate attention (e.g., ransomware, data exfiltration)

Actions:
- "auto_close_recommend": Mark as false positive and recommend closing
- "suppress": Silently suppress (don't show in dashboard)
- "escalate": Flag for immediate human review
- "flag": Flag for review but don't escalate

Common alert sources: saas_alerts (SaaS Alerts for M365/cloud), datto_edr (Datto EDR endpoint detection), rocketcyber (RocketCyber SOC)

User's description: "${description.trim()}"

Respond with ONLY valid JSON matching the schema above. No markdown, no explanation.`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    // Extract JSON from response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'AI did not return valid JSON' }, { status: 500 });
    }

    const rule = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!rule.name || !rule.ruleType || !rule.pattern || !rule.action) {
      return NextResponse.json({ error: 'AI response missing required fields' }, { status: 500 });
    }

    return NextResponse.json({ rule });
  } catch (err) {
    console.error('[soc/rules/ai]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate rule' },
      { status: 500 },
    );
  }
}
