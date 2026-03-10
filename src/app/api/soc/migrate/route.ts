import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/soc/migrate
 * Creates all SOC Analyst Agent tables (idempotent).
 * Auth: Bearer MIGRATION_SECRET
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const expectedToken = process.env.MIGRATION_SECRET;
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const created: string[] = [];

  try {
    // 1. SOC ticket analysis state
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS soc_ticket_analysis (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "autotaskTicketId" TEXT NOT NULL,
        "ticketNumber" TEXT,
        "companyId" TEXT,
        "incidentId" TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        verdict TEXT,
        "confidenceScore" FLOAT,
        "aiModel" TEXT,
        "aiReasoning" TEXT,
        "aiTokensUsed" INTEGER,
        "alertSource" TEXT,
        "alertCategory" TEXT,
        "ipExtracted" TEXT,
        "deviceVerified" BOOLEAN DEFAULT false,
        "technicianVerified" TEXT,
        "autotaskNoteAdded" BOOLEAN DEFAULT false,
        "autotaskNoteId" TEXT,
        "recommendedAction" TEXT,
        "processedAt" TIMESTAMP,
        "createdAt" TIMESTAMP DEFAULT now(),
        "updatedAt" TIMESTAMP DEFAULT now()
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_soc_analysis_ticket ON soc_ticket_analysis ("autotaskTicketId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_soc_analysis_status ON soc_ticket_analysis (status, "createdAt")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_soc_analysis_incident ON soc_ticket_analysis ("incidentId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_soc_analysis_verdict ON soc_ticket_analysis (verdict, "processedAt")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_soc_analysis_company ON soc_ticket_analysis ("companyId")`);
    created.push('soc_ticket_analysis');

    // 2. Correlated incident groups
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS soc_incidents (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        title TEXT NOT NULL,
        "companyId" TEXT,
        "deviceHostname" TEXT,
        "alertSource" TEXT,
        "ticketCount" INTEGER DEFAULT 1,
        verdict TEXT,
        "confidenceScore" FLOAT,
        "aiSummary" TEXT,
        "correlationReason" TEXT,
        "primaryTicketId" TEXT,
        status TEXT DEFAULT 'open',
        "createdAt" TIMESTAMP DEFAULT now(),
        "resolvedAt" TIMESTAMP
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_soc_incidents_status ON soc_incidents (status, "createdAt")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_soc_incidents_company ON soc_incidents ("companyId")`);
    // Add columns for action plan (safe if they already exist)
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE soc_incidents ADD COLUMN IF NOT EXISTS "proposedActions" JSONB`);
      await prisma.$executeRawUnsafe(`ALTER TABLE soc_incidents ADD COLUMN IF NOT EXISTS "humanGuidance" JSONB`);
      await prisma.$executeRawUnsafe(`ALTER TABLE soc_incidents ADD COLUMN IF NOT EXISTS "companyName" TEXT`);
    } catch { /* columns may already exist */ }
    created.push('soc_incidents');

    // 3. Full audit trail
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS soc_activity_log (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "analysisId" TEXT,
        "incidentId" TEXT,
        "autotaskTicketId" TEXT,
        action TEXT NOT NULL,
        detail TEXT,
        "aiReasoning" TEXT,
        "confidenceScore" FLOAT,
        metadata JSONB,
        "createdAt" TIMESTAMP DEFAULT now()
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_soc_log_created ON soc_activity_log ("createdAt")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_soc_log_action ON soc_activity_log (action, "createdAt")`);
    created.push('soc_activity_log');

    // 4. Suppression/correlation rules
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS soc_rules (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        name TEXT NOT NULL,
        description TEXT,
        "ruleType" TEXT NOT NULL,
        pattern JSONB NOT NULL,
        action TEXT NOT NULL,
        "isActive" BOOLEAN DEFAULT true,
        priority INTEGER DEFAULT 100,
        "createdBy" TEXT,
        "matchCount" INTEGER DEFAULT 0,
        "lastMatchAt" TIMESTAMP,
        "createdAt" TIMESTAMP DEFAULT now(),
        "updatedAt" TIMESTAMP DEFAULT now()
      )
    `);
    created.push('soc_rules');

    // 5. Key-value config
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS soc_config (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        "updatedAt" TIMESTAMP DEFAULT now(),
        "updatedBy" TEXT
      )
    `);
    created.push('soc_config');

    // 6. Datto RMM device cache
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS datto_devices (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "dattoDeviceId" TEXT NOT NULL,
        hostname TEXT,
        "intIpAddress" TEXT,
        "extIpAddress" TEXT,
        "lastSeen" TIMESTAMP,
        "lastUser" TEXT,
        "siteId" TEXT,
        "siteName" TEXT,
        "operatingSystem" TEXT,
        "deviceType" TEXT,
        "isTechDevice" BOOLEAN DEFAULT false,
        "lastSyncAt" TIMESTAMP DEFAULT now()
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_datto_device_id ON datto_devices ("dattoDeviceId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_datto_ext_ip ON datto_devices ("extIpAddress")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_datto_int_ip ON datto_devices ("intIpAddress")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_datto_user ON datto_devices ("lastUser")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_datto_site ON datto_devices ("siteId")`);
    created.push('datto_devices');

    // 7. SOC job run tracking
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS soc_job_status (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "jobName" TEXT NOT NULL,
        "lastRunAt" TIMESTAMP,
        "lastRunStatus" TEXT,
        "lastRunDurationMs" INTEGER,
        "lastRunError" TEXT,
        "lastRunMeta" JSONB,
        "firstRunAt" TIMESTAMP,
        "createdAt" TIMESTAMP DEFAULT now()
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_soc_job_name ON soc_job_status ("jobName")`);
    created.push('soc_job_status');

    // 8. Pending actions (human approval queue)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS soc_pending_actions (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "incidentId" TEXT NOT NULL,
        "autotaskTicketId" TEXT NOT NULL,
        "ticketNumber" TEXT,
        "companyName" TEXT,
        "actionType" TEXT NOT NULL,
        "actionPayload" JSONB NOT NULL,
        "previewSummary" TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        "decidedBy" TEXT,
        "decidedAt" TIMESTAMP,
        "executionResult" JSONB,
        "createdAt" TIMESTAMP DEFAULT now()
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_soc_pending_status ON soc_pending_actions (status, "createdAt")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_soc_pending_incident ON soc_pending_actions ("incidentId")`);
    created.push('soc_pending_actions');

    // Seed default config values
    const defaults = [
      ['agent_enabled', 'true'],
      ['dry_run', 'true'],
      ['correlation_window_minutes', '15'],
      ['confidence_auto_close', '0.9'],
      ['confidence_flag_review', '0.7'],
      ['confidence_floor', '0.5'],
      ['max_ai_calls_per_run', '100'],
      ['screening_model', 'claude-haiku-4-5-20251001'],
      ['deep_analysis_model', 'claude-sonnet-4-6'],
      ['internal_site_ids', '[]'],
    ];
    for (const [key, value] of defaults) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO soc_config (id, key, value)
        VALUES (gen_random_uuid()::text, '${key}', '${value}')
        ON CONFLICT (key) DO NOTHING
      `);
    }

    // Seed default suppression rules
    const defaultRules = [
      {
        name: 'Agent Installation Burst',
        description: 'Multiple security alerts triggered simultaneously during security agent installation on a new device',
        ruleType: 'suppression',
        pattern: JSON.stringify({
          titlePatterns: ['outbound connection', 'suspicious connection', 'BitTorrent', 'VPN detected', 'gaming process', 'network inspection'],
          minTicketsInWindow: 3,
          windowMinutes: 10,
          sameCompany: true,
        }),
        action: 'auto_close_recommend',
      },
      {
        name: 'Technician PH Login',
        description: 'Alerts from technician logins originating from Philippines IP addresses matched to Datto RMM devices',
        ruleType: 'suppression',
        pattern: JSON.stringify({
          titlePatterns: ['suspicious login', 'impossible travel', 'unapproved country', 'unusual location', 'foreign country'],
          sourceMatch: 'saas_alerts',
          requireDeviceVerification: true,
        }),
        action: 'auto_close_recommend',
      },
      {
        name: 'Windows Update Noise',
        description: 'Alerts triggered by Windows Update processes and related system services',
        ruleType: 'suppression',
        pattern: JSON.stringify({
          titlePatterns: ['windows update', 'wuauclt', 'svchost', 'TiWorker', 'Windows Defender'],
          sourceMatch: 'datto_edr',
        }),
        action: 'auto_close_recommend',
      },
    ];
    for (const rule of defaultRules) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO soc_rules (id, name, description, "ruleType", pattern, action, "isActive", priority)
        SELECT gen_random_uuid()::text, '${rule.name}', '${rule.description}', '${rule.ruleType}',
               '${rule.pattern}'::jsonb, '${rule.action}', true, 100
        WHERE NOT EXISTS (SELECT 1 FROM soc_rules WHERE name = '${rule.name}')
      `);
    }

    return NextResponse.json({
      success: true,
      message: 'SOC tables created',
      tablesCreated: created,
    });
  } catch (err) {
    console.error('[soc/migrate] Error:', err);
    return NextResponse.json(
      { error: 'Migration failed', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
