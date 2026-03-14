import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface TicketPattern {
  title: string;
  verdict: string | null;
  confidence: number | null;
  alertSource: string | null;
  alertCategory: string | null;
  companyId: string | null;
}

interface TrendGroup {
  pattern: string;
  count: number;
  verdicts: Record<string, number>;
  sources: Record<string, number>;
  avgConfidence: number;
  sampleTitles: string[];
}

/**
 * GET /api/soc/trends — Analyze ticket patterns and recommend rules.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const days = parseInt(request.nextUrl.searchParams.get('days') || '30', 10);
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    // Get analyzed tickets with their analysis data
    let analyses: TicketPattern[] = [];
    try {
      analyses = await prisma.$queryRaw<(TicketPattern & { ticketTitle: string })[]>`
        SELECT
          t.title,
          a.verdict,
          a."confidenceScore" as confidence,
          a."alertSource" as "alertSource",
          a."alertCategory" as "alertCategory",
          t."companyId"
        FROM soc_ticket_analysis a
        JOIN tickets t ON t."autotaskTicketId" = a."autotaskTicketId"
        WHERE a."processedAt" >= ${fromDate}
        AND a.status = 'completed'
        ORDER BY a."processedAt" DESC
        LIMIT 500
      `;
    } catch {
      return NextResponse.json({
        trends: [],
        recommendations: [],
        stats: { totalAnalyzed: 0, period: days },
        message: 'SOC tables not initialized yet',
      });
    }

    if (analyses.length === 0) {
      return NextResponse.json({
        trends: [],
        recommendations: [],
        stats: { totalAnalyzed: 0, period: days },
      });
    }

    // Group tickets by common title patterns (normalize titles)
    const groups = new Map<string, TrendGroup>();
    for (const a of analyses) {
      const key = normalizeTitle(a.title);
      if (!groups.has(key)) {
        groups.set(key, {
          pattern: key,
          count: 0,
          verdicts: {},
          sources: {},
          avgConfidence: 0,
          sampleTitles: [],
        });
      }
      const g = groups.get(key)!;
      g.count++;
      const v = a.verdict || 'unknown';
      g.verdicts[v] = (g.verdicts[v] || 0) + 1;
      const s = a.alertSource || 'unknown';
      g.sources[s] = (g.sources[s] || 0) + 1;
      if (a.confidence) g.avgConfidence += a.confidence;
      if (g.sampleTitles.length < 3 && !g.sampleTitles.includes(a.title)) {
        g.sampleTitles.push(a.title);
      }
    }

    // Compute averages and sort by frequency
    const trends = Array.from(groups.values())
      .map(g => ({ ...g, avgConfidence: g.count > 0 ? g.avgConfidence / g.count : 0 }))
      .filter(g => g.count >= 2) // Only show patterns with 2+ occurrences
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Verdict summary
    const verdictCounts: Record<string, number> = {};
    for (const a of analyses) {
      const v = a.verdict || 'unknown';
      verdictCounts[v] = (verdictCounts[v] || 0) + 1;
    }

    // Source summary
    const sourceCounts: Record<string, number> = {};
    for (const a of analyses) {
      const s = a.alertSource || 'unknown';
      sourceCounts[s] = (sourceCounts[s] || 0) + 1;
    }

    // Generate AI recommendations for frequent false positive patterns
    let recommendations: Array<{ description: string; rule: Record<string, unknown> }> = [];
    const fpTrends = trends.filter(t =>
      t.count >= 3 && (t.verdicts.false_positive || 0) / t.count >= 0.7
    );

    if (fpTrends.length > 0) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        try {
          const client = new Anthropic({ apiKey });
          const response = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 2048,
            messages: [{
              role: 'user',
              content: `You are a SOC analyst. These ticket patterns are frequently classified as false positives in our security monitoring system. Recommend suppression rules for each.

Patterns:
${fpTrends.map(t => `- "${t.pattern}" (${t.count} occurrences, ${Math.round(((t.verdicts.false_positive || 0) / t.count) * 100)}% false positive, sources: ${Object.entries(t.sources).map(([k, v]) => `${k}:${v}`).join(', ')})\n  Samples: ${t.sampleTitles.join('; ')}`).join('\n')}

For each pattern, output a JSON object with:
- "description": why this should be suppressed
- "rule": { "name": "...", "ruleType": "suppression", "pattern": { "titlePatterns": [...] }, "action": "auto_close_recommend", "priority": 100 }

Respond with ONLY a JSON array of these objects. No markdown.`,
            }],
          });

          const text = response.content[0].type === 'text' ? response.content[0].text : '';
          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            recommendations = JSON.parse(jsonMatch[0]);
          }
        } catch (err) {
          console.error('[soc/trends] AI recommendation failed:', err);
        }
      }
    }

    return NextResponse.json({
      trends,
      recommendations,
      stats: {
        totalAnalyzed: analyses.length,
        period: days,
        verdicts: verdictCounts,
        sources: sourceCounts,
      },
    });
  } catch (err) {
    console.error('[soc/trends]', err);
    return NextResponse.json({ error: 'Failed to analyze trends' }, { status: 500 });
  }
}

/**
 * Normalize ticket title for pattern grouping.
 * Removes unique identifiers (IPs, hostnames, timestamps, UUIDs) to find common patterns.
 */
function normalizeTitle(title: string): string {
  return title
    .replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '<IP>') // IP addresses
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>') // UUIDs
    .replace(/\b[A-Z0-9_-]{10,}\b/g, (m) => m.length > 20 ? '<ID>' : m) // Long IDs
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/g, '<TIMESTAMP>') // Timestamps
    .replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, '<DATE>') // US dates
    .replace(/\b[A-Za-z]+-(?:PC|WS|SRV|LT|DT)\d*\b/gi, '<HOSTNAME>') // Common hostname patterns
    .trim();
}
