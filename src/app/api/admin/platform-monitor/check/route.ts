import { NextRequest, NextResponse } from 'next/server'
import { checkThresholds } from '@/lib/threshold-alerter'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/platform-monitor/check
 *
 * Checks all platform thresholds and sends alerts if any exceed 80%.
 * Can be called by cron or manually.
 */
export async function POST(request: NextRequest) {
  // Allow cron (no auth) or Bearer token
  const authHeader = request.headers.get('authorization')
  const secret = process.env.MIGRATION_SECRET

  // Accept either cron secret or admin auth
  if (authHeader && secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const alerts = await checkThresholds()

    return NextResponse.json({
      success: true,
      alertsTriggered: alerts.length,
      alerts: alerts.map(a => ({
        metric: a.metricKey,
        displayName: a.displayName,
        currentValue: a.currentValue,
        limitValue: a.limitValue,
        percentUsed: Math.round(a.percentUsed * 100),
        provider: a.provider,
      })),
    })
  } catch (error) {
    console.error('[platform-monitor/check] Error:', error)
    return NextResponse.json({
      error: 'Threshold check failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
