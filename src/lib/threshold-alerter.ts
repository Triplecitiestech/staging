/**
 * Platform Threshold Alerter
 *
 * Checks platform metrics against configured thresholds.
 * Sends detailed email alerts via Resend when usage exceeds 80%.
 */

import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const ALERT_EMAIL = 'support@triplecitiestech.com'
const FROM_EMAIL = process.env.EMAIL_FROM || 'Triple Cities Tech <notifications@triplecitiestech.com>'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com'
const ALERT_THRESHOLD = 0.80 // 80%

interface ThresholdCheck {
  metricKey: string
  displayName: string
  currentValue: number
  limitValue: number
  unit: string
  provider: string
  percentUsed: number
}

interface ThresholdAlert extends ThresholdCheck {
  impact: string
  steps: string[]
}

/**
 * Default thresholds for common platform limits
 */
export const DEFAULT_THRESHOLDS = [
  {
    metricKey: 'anthropic_tokens_monthly',
    displayName: 'Anthropic API Tokens (Monthly)',
    limitValue: 10_000_000, // 10M tokens/month
    unit: 'tokens',
    provider: 'anthropic',
  },
  {
    metricKey: 'anthropic_cost_monthly',
    displayName: 'Anthropic API Cost (Monthly)',
    limitValue: 5000, // $50 in cents
    unit: 'cents',
    provider: 'anthropic',
  },
  {
    metricKey: 'db_storage_mb',
    displayName: 'Database Storage',
    limitValue: 512, // 512 MB (Vercel Postgres hobby)
    unit: 'MB',
    provider: 'vercel-postgres',
  },
  {
    metricKey: 'db_rows_total',
    displayName: 'Database Total Rows',
    limitValue: 10_000_000, // 10M rows
    unit: 'rows',
    provider: 'vercel-postgres',
  },
  {
    metricKey: 'resend_emails_monthly',
    displayName: 'Email Sends (Monthly)',
    limitValue: 3000, // Resend free tier = 3K/month
    unit: 'emails',
    provider: 'resend',
  },
  {
    metricKey: 'autotask_api_calls_daily',
    displayName: 'Autotask API Calls (Daily)',
    limitValue: 10_000, // Typical daily limit
    unit: 'requests',
    provider: 'autotask',
  },
]

const IMPACT_MAP: Record<string, string> = {
  'anthropic': 'AI-powered features will stop working: blog generation, AI chat assistant, campaign content generation, and AI support review will all fail. End users will see errors when trying to use any AI feature.',
  'vercel-postgres': 'Database operations will slow down or fail. The entire application depends on the database — project management, customer portals, blog system, authentication, and all admin features will be affected.',
  'resend': 'Email delivery will stop. Campaign emails, approval notifications, welcome emails, and system alerts (including these threshold alerts) will not be sent. Customers won\'t receive portal access or ticket notifications.',
  'autotask': 'Autotask data sync will stop. Company, project, phase, task, and contact data will become stale. Customer portal ticket timelines won\'t update. New data from Autotask won\'t flow into the platform.',
}

const STEPS_MAP: Record<string, string[]> = {
  'anthropic': [
    'Review AI usage by feature in the monitoring dashboard — identify which features consume the most tokens',
    'Reduce blog generation frequency or switch to a smaller model (Haiku vs Sonnet) for less critical features',
    'Consider upgrading the Anthropic API plan tier',
    'Temporarily disable non-critical AI features (AI chat, AI support review) to conserve tokens for blog generation',
  ],
  'vercel-postgres': [
    'Run the Autotask cleanup step to remove orphaned companies: /api/autotask/trigger?secret=XXX&step=cleanup',
    'Archive old error logs and audit logs older than 90 days',
    'Check for duplicate records in large tables (autotask_sync_logs, error_logs)',
    'Consider upgrading the Vercel Postgres plan for more storage',
    'Review and optimize queries that cause excessive row creation',
  ],
  'resend': [
    'Review campaign email volume — pause non-urgent campaigns',
    'Check for email delivery failures that cause retry loops',
    'Upgrade the Resend plan for higher monthly email limits',
    'Batch notifications instead of sending individual emails',
  ],
  'autotask': [
    'Reduce Autotask sync frequency from every 5 minutes to every 15-30 minutes',
    'Check if the sync is doing unnecessary full syncs vs incremental syncs',
    'Review the Autotask API rate limit documentation for your instance',
    'Contact Datto/Autotask support to increase your API call quota if needed',
  ],
}

/**
 * Check all thresholds and send alerts for any that exceed 80%.
 * Returns array of alerts that were triggered.
 */
export async function checkThresholds(): Promise<ThresholdAlert[]> {
  try {
    const { prisma } = await import('@/lib/prisma')

    // Get current metric values
    const checks = await gatherMetrics(prisma)

    // Find alerts exceeding threshold
    const alerts: ThresholdAlert[] = checks
      .filter(c => c.percentUsed >= ALERT_THRESHOLD)
      .map(c => ({
        ...c,
        impact: IMPACT_MAP[c.provider] || 'Service degradation may occur.',
        steps: STEPS_MAP[c.provider] || ['Review usage and consider upgrading the plan.'],
      }))

    if (alerts.length === 0) return []

    // Check if we already alerted recently (within 24h) for any of these
    const recentAlerts = await safeQuery<{ metricKey: string }[]>(
      prisma,
      `SELECT "metricKey" FROM platform_thresholds WHERE "lastAlertedAt" > NOW() - INTERVAL '24 hours' AND "metricKey" = ANY($1::text[])`,
      [alerts.map(a => a.metricKey)]
    )
    const recentKeys = new Set(recentAlerts.map(a => a.metricKey))
    const newAlerts = alerts.filter(a => !recentKeys.has(a.metricKey))

    if (newAlerts.length > 0) {
      await sendThresholdAlertEmail(newAlerts)

      // Update lastAlertedAt
      for (const alert of newAlerts) {
        await safeQuery(
          prisma,
          `UPDATE platform_thresholds SET "lastAlertedAt" = NOW(), "currentValue" = $1 WHERE "metricKey" = $2`,
          [alert.currentValue, alert.metricKey]
        )
      }
    }

    // Update currentValue for all checks
    for (const check of checks) {
      await safeQuery(
        prisma,
        `UPDATE platform_thresholds SET "currentValue" = $1, "lastCheckedAt" = NOW() WHERE "metricKey" = $2`,
        [check.currentValue, check.metricKey]
      )
    }

    return alerts
  } catch (error) {
    console.error('[threshold-alerter] Error checking thresholds:', error)
    return []
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gatherMetrics(prisma: any): Promise<ThresholdCheck[]> {
  const p = prisma as { $queryRawUnsafe: (q: string, ...args: unknown[]) => Promise<unknown[]> }
  const checks: ThresholdCheck[] = []

  // Get configured thresholds
  const thresholds = await safeQuery<{
    metricKey: string
    displayName: string
    limitValue: number
    unit: string
    provider: string
  }[]>(p, 'SELECT "metricKey", "displayName", "limitValue", unit, provider FROM platform_thresholds WHERE "isActive" = true')

  if (thresholds.length === 0) return []

  for (const threshold of thresholds) {
    let currentValue = 0

    try {
      if (threshold.metricKey === 'anthropic_tokens_monthly') {
        const result = await safeQuery<{ total: number }[]>(p,
          `SELECT COALESCE(SUM("totalTokens"), 0)::bigint as total FROM api_usage_logs WHERE provider = 'anthropic' AND "createdAt" >= date_trunc('month', NOW())`
        )
        currentValue = Number(result[0]?.total ?? 0)
      } else if (threshold.metricKey === 'anthropic_cost_monthly') {
        const result = await safeQuery<{ total: number }[]>(p,
          `SELECT COALESCE(SUM("costCents"), 0)::numeric as total FROM api_usage_logs WHERE provider = 'anthropic' AND "createdAt" >= date_trunc('month', NOW())`
        )
        currentValue = Number(result[0]?.total ?? 0)
      } else if (threshold.metricKey === 'db_storage_mb') {
        const result = await safeQuery<{ total: number }[]>(p,
          `SELECT ROUND(SUM(pg_total_relation_size(quote_ident(relname)))::numeric / 1024 / 1024, 2) as total FROM pg_stat_user_tables`
        )
        currentValue = Number(result[0]?.total ?? 0)
      } else if (threshold.metricKey === 'db_rows_total') {
        const result = await safeQuery<{ total: number }[]>(p,
          `SELECT SUM(n_live_tup)::bigint as total FROM pg_stat_user_tables`
        )
        currentValue = Number(result[0]?.total ?? 0)
      } else if (threshold.metricKey === 'resend_emails_monthly') {
        const result = await safeQuery<{ total: number }[]>(p,
          `SELECT COUNT(*)::int as total FROM api_usage_logs WHERE provider = 'resend' AND "createdAt" >= date_trunc('month', NOW())`
        )
        currentValue = Number(result[0]?.total ?? 0)
      } else if (threshold.metricKey === 'autotask_api_calls_daily') {
        const result = await safeQuery<{ total: number }[]>(p,
          `SELECT COUNT(*)::int as total FROM api_usage_logs WHERE provider = 'autotask' AND "createdAt" >= date_trunc('day', NOW())`
        )
        currentValue = Number(result[0]?.total ?? 0)
      }
    } catch {
      continue
    }

    checks.push({
      ...threshold,
      currentValue,
      percentUsed: threshold.limitValue > 0 ? currentValue / threshold.limitValue : 0,
    })
  }

  return checks
}

async function sendThresholdAlertEmail(alerts: ThresholdAlert[]): Promise<void> {
  if (!resend) {
    console.warn('[threshold-alerter] Resend not configured, cannot send alert')
    return
  }

  const criticalAlerts = alerts.filter(a => a.percentUsed >= 0.95)

  const subject = criticalAlerts.length > 0
    ? `[CRITICAL] Platform threshold exceeded — ${criticalAlerts.map(a => a.displayName).join(', ')}`
    : `[WARNING] Platform usage at ${Math.round(Math.max(...alerts.map(a => a.percentUsed)) * 100)}% — action recommended`

  const html = generateAlertHtml(alerts)
  const text = generateAlertText(alerts)

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [ALERT_EMAIL],
      subject,
      html,
      text,
    })
    console.log(`[threshold-alerter] Alert email sent for: ${alerts.map(a => a.metricKey).join(', ')}`)
  } catch (error) {
    console.error('[threshold-alerter] Failed to send alert email:', error)
  }
}

function generateAlertHtml(alerts: ThresholdAlert[]): string {
  const alertRows = alerts.map(a => {
    const pct = Math.round(a.percentUsed * 100)
    const barColor = pct >= 95 ? '#dc2626' : pct >= 80 ? '#ea580c' : '#059669'
    const levelBadge = pct >= 95
      ? '<span style="background:#dc2626;color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">CRITICAL</span>'
      : '<span style="background:#ea580c;color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">WARNING</span>'

    return `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h3 style="margin:0;font-size:16px;color:#0f172a;">${a.displayName}</h3>
          ${levelBadge}
        </div>
        <div style="background:#e2e8f0;border-radius:999px;height:12px;margin-bottom:8px;overflow:hidden;">
          <div style="background:${barColor};height:100%;width:${Math.min(pct, 100)}%;border-radius:999px;"></div>
        </div>
        <p style="font-size:14px;color:#475569;margin:0 0 4px;">
          <strong>${a.currentValue.toLocaleString()}</strong> / ${a.limitValue.toLocaleString()} ${a.unit} (${pct}% used)
        </p>
        <p style="font-size:12px;color:#94a3b8;margin:0;">System: ${a.provider}</p>

        <div style="margin-top:16px;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;">
          <p style="font-size:13px;font-weight:600;color:#991b1b;margin:0 0 4px;">End User Impact</p>
          <p style="font-size:13px;color:#7f1d1d;margin:0;">${a.impact}</p>
        </div>

        <div style="margin-top:12px;padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;">
          <p style="font-size:13px;font-weight:600;color:#166534;margin:0 0 8px;">Resolution Steps</p>
          <ol style="margin:0;padding-left:20px;font-size:13px;color:#15803d;">
            ${a.steps.map(s => `<li style="margin-bottom:4px;">${s}</li>`).join('')}
          </ol>
        </div>
      </div>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);color:white;padding:24px 32px;">
      <h1 style="margin:0;font-size:18px;">Platform Threshold Alert</h1>
      <p style="margin:4px 0 0;font-size:13px;opacity:0.8;">Triple Cities Tech — System Monitoring</p>
    </div>
    <div style="padding:24px 32px;">
      <p style="font-size:14px;color:#475569;margin:0 0 20px;">
        The following platform metrics have exceeded the 80% warning threshold. Review and take action to prevent service disruption.
      </p>
      ${alertRows}
      <div style="text-align:center;margin-top:24px;">
        <a href="${BASE_URL}/admin/monitoring" style="display:inline-block;background:#0891b2;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
          View Monitoring Dashboard
        </a>
      </div>
    </div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8;">
      Triple Cities Tech Platform Monitoring &bull; Automated Alert
    </div>
  </div>
</body>
</html>`
}

function generateAlertText(alerts: ThresholdAlert[]): string {
  return `PLATFORM THRESHOLD ALERT — Triple Cities Tech

The following metrics have exceeded the 80% warning threshold:

${alerts.map(a => {
  const pct = Math.round(a.percentUsed * 100)
  return `${a.displayName} (${a.provider})
  Usage: ${a.currentValue.toLocaleString()} / ${a.limitValue.toLocaleString()} ${a.unit} (${pct}%)
  Impact: ${a.impact}
  Steps:
${a.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}
`
}).join('\n')}

View dashboard: ${BASE_URL}/admin/monitoring`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeQuery<T>(prisma: any, sql: string, params?: unknown[]): Promise<T> {
  try {
    if (params) {
      return await prisma.$queryRawUnsafe(sql, ...params) as T
    }
    return await prisma.$queryRawUnsafe(sql) as T
  } catch {
    return [] as unknown as T
  }
}
