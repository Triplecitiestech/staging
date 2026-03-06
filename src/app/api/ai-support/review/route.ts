import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/ai-support/review
 *
 * AI Dev Support Agent - Reviews error logs and proposes fixes.
 * Can be triggered manually or by a cron job.
 */
export async function POST() {
  try {
    const { prisma } = await import('@/lib/prisma');

    // Fetch unresolved errors from the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const errors = await prisma.errorLog.findMany({
      where: {
        resolved: false,
        lastSeen: { gte: sevenDaysAgo },
      },
      orderBy: [{ count: 'desc' }, { lastSeen: 'desc' }],
      take: 20,
    });

    if (errors.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No unresolved errors found',
        analysis: null,
      });
    }

    // Format errors for AI analysis
    const errorSummary = errors.map((e) => ({
      id: e.id,
      source: e.source,
      level: e.level,
      message: e.message,
      path: e.path,
      count: e.count,
      firstSeen: e.firstSeen,
      lastSeen: e.lastSeen,
      stack: e.stack?.substring(0, 500),
    }));

    // Check if Anthropic API key is available
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        success: true,
        errors: errorSummary,
        analysis: 'AI analysis unavailable - ANTHROPIC_API_KEY not configured. Review errors manually.',
        recommendations: errorSummary.map((e) => ({
          errorId: e.id,
          priority: e.count > 5 ? 'high' : e.count > 2 ? 'medium' : 'low',
          suggestion: `Error "${e.message}" has occurred ${e.count} times at ${e.path || 'unknown path'}. Investigate ${e.source} source.`,
        })),
      });
    }

    // Use Claude to analyze errors
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic();

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `You are a DevOps AI agent reviewing application error logs for a Next.js application. Analyze these errors and provide:
1. A prioritized list of issues
2. Root cause analysis for recurring errors
3. Specific fix recommendations

Error logs:
${JSON.stringify(errorSummary, null, 2)}

Respond in JSON format:
{
  "summary": "Brief overall assessment",
  "issues": [
    {
      "errorId": "...",
      "priority": "high|medium|low",
      "rootCause": "...",
      "fix": "...",
      "affectedArea": "..."
    }
  ]
}`,
        },
      ],
    });

    const analysisText = response.content[0].type === 'text' ? response.content[0].text : '';

    // Try to parse AI response as JSON
    let analysis;
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: analysisText, issues: [] };
    } catch {
      analysis = { summary: analysisText, issues: [] };
    }

    return NextResponse.json({
      success: true,
      errorCount: errors.length,
      analysis,
    });
  } catch (error) {
    console.error('[AI Support Review] Error:', error);
    return NextResponse.json(
      { error: 'Failed to review errors', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ai-support/review
 *
 * Returns the latest error summary without AI analysis.
 */
export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma');

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [unresolvedErrors, recentErrors, topErrors] = await Promise.all([
      prisma.errorLog.count({ where: { resolved: false } }),
      prisma.errorLog.count({ where: { lastSeen: { gte: sevenDaysAgo } } }),
      prisma.errorLog.findMany({
        where: { resolved: false, lastSeen: { gte: sevenDaysAgo } },
        orderBy: { count: 'desc' },
        take: 10,
        select: {
          id: true,
          source: true,
          level: true,
          message: true,
          path: true,
          count: true,
          firstSeen: true,
          lastSeen: true,
        },
      }),
    ]);

    return NextResponse.json({
      stats: { unresolvedErrors, recentErrors },
      topErrors,
    });
  } catch (error) {
    console.error('[AI Support Review GET] Error:', error);
    return NextResponse.json({ stats: {}, topErrors: [] }, { status: 500 });
  }
}
