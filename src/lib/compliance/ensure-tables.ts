/**
 * Compliance Evidence Engine — Database Table Bootstrap
 *
 * Follows the same pattern as src/lib/reporting/ensure-tables.ts:
 * - Raw SQL tables (NOT Prisma-managed)
 * - Idempotent CREATE TABLE IF NOT EXISTS
 * - Called before any compliance operation
 * - Self-healing: auto-creates missing tables
 *
 * Tables:
 *   compliance_connectors    — per-company integration connection state
 *   compliance_assessments   — assessment instances
 *   compliance_evidence      — collected evidence records (raw data snapshots)
 *   compliance_findings      — per-control evaluation results
 *   compliance_audit_log     — all compliance-related actions
 *   policy_org_profiles      — org-wide questionnaire answers for policy generation
 *   policy_intake_answers    — per-policy questionnaire answers
 *   policy_generation_records — tracks policy generation workflow state per company+policy
 *   policy_versions          — version history of generated policies
 *   integration_credentials  — per-tenant encrypted API credentials
 *   integration_credential_access_log — audit log of credential reads
 */

import { getPool } from '@/lib/db-pool'

let tablesEnsured = false

export async function ensureComplianceTables(): Promise<void> {
  if (tablesEnsured) return

  const pool = getPool()
  const client = await pool.connect()

  try {
    // Check which tables already exist
    const existing = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename IN (
           'compliance_connectors',
           'compliance_assessments',
           'compliance_evidence',
           'compliance_findings',
           'compliance_audit_log',
           'compliance_policies',
           'compliance_policy_analyses',
           'compliance_attestations',
           'compliance_platform_mappings',
           'compliance_webhook_events',
           'policy_org_profiles',
           'policy_intake_answers',
           'policy_generation_records',
           'policy_versions',
           'integration_credentials',
           'integration_credential_access_log'
         )`
    )
    const existingSet = new Set(existing.rows.map((r) => r.tablename))

    // --- compliance_connectors ---
    if (!existingSet.has('compliance_connectors')) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS compliance_connectors (
          id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          "companyId"     TEXT NOT NULL,
          "connectorType" TEXT NOT NULL,
          status          TEXT NOT NULL DEFAULT 'not_configured',
          "lastCollectedAt" TIMESTAMPTZ,
          "errorMessage"  TEXT,
          "configRef"     TEXT,
          "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE ("companyId", "connectorType")
        )
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_compliance_connectors_company
        ON compliance_connectors ("companyId")
      `)

      // FK to companies
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compliance_connectors_companyId_fkey') THEN
            ALTER TABLE compliance_connectors
            ADD CONSTRAINT "compliance_connectors_companyId_fkey"
            FOREIGN KEY ("companyId") REFERENCES companies(id) ON DELETE CASCADE;
          END IF;
        END $$
      `)
    }

    // --- compliance_assessments ---
    if (!existingSet.has('compliance_assessments')) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS compliance_assessments (
          id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          "companyId"     TEXT NOT NULL,
          "frameworkId"   TEXT NOT NULL,
          status          TEXT NOT NULL DEFAULT 'draft',
          "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "completedAt"   TIMESTAMPTZ,
          "createdBy"     TEXT NOT NULL,
          "totalControls"       INT NOT NULL DEFAULT 0,
          "passedControls"      INT NOT NULL DEFAULT 0,
          "failedControls"      INT NOT NULL DEFAULT 0,
          "manualReviewControls" INT NOT NULL DEFAULT 0
        )
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_compliance_assessments_company
        ON compliance_assessments ("companyId")
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_compliance_assessments_company_framework
        ON compliance_assessments ("companyId", "frameworkId")
      `)

      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compliance_assessments_companyId_fkey') THEN
            ALTER TABLE compliance_assessments
            ADD CONSTRAINT "compliance_assessments_companyId_fkey"
            FOREIGN KEY ("companyId") REFERENCES companies(id) ON DELETE CASCADE;
          END IF;
        END $$
      `)
    }

    // --- compliance_evidence ---
    if (!existingSet.has('compliance_evidence')) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS compliance_evidence (
          id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          "assessmentId"  TEXT NOT NULL,
          "companyId"     TEXT NOT NULL,
          "sourceType"    TEXT NOT NULL,
          "rawData"       JSONB NOT NULL DEFAULT '{}',
          summary         TEXT NOT NULL DEFAULT '',
          "collectedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "validForHours" INT NOT NULL DEFAULT 24
        )
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_compliance_evidence_assessment
        ON compliance_evidence ("assessmentId")
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_compliance_evidence_company
        ON compliance_evidence ("companyId")
      `)

      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compliance_evidence_assessmentId_fkey') THEN
            ALTER TABLE compliance_evidence
            ADD CONSTRAINT "compliance_evidence_assessmentId_fkey"
            FOREIGN KEY ("assessmentId") REFERENCES compliance_assessments(id) ON DELETE CASCADE;
          END IF;
        END $$
      `)
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compliance_evidence_companyId_fkey') THEN
            ALTER TABLE compliance_evidence
            ADD CONSTRAINT "compliance_evidence_companyId_fkey"
            FOREIGN KEY ("companyId") REFERENCES companies(id) ON DELETE CASCADE;
          END IF;
        END $$
      `)
    }

    // --- compliance_findings ---
    if (!existingSet.has('compliance_findings')) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS compliance_findings (
          id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          "assessmentId"  TEXT NOT NULL,
          "controlId"     TEXT NOT NULL,
          status          TEXT NOT NULL DEFAULT 'not_assessed',
          confidence      TEXT NOT NULL DEFAULT 'none',
          reasoning       TEXT NOT NULL DEFAULT '',
          "evidenceIds"   JSONB NOT NULL DEFAULT '[]',
          "missingEvidence" JSONB NOT NULL DEFAULT '[]',
          remediation     TEXT,
          "evaluatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "overrideStatus" TEXT,
          "overrideReason" TEXT,
          "overrideBy"    TEXT,
          "overrideAt"    TIMESTAMPTZ,
          UNIQUE ("assessmentId", "controlId")
        )
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_compliance_findings_assessment
        ON compliance_findings ("assessmentId")
      `)

      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compliance_findings_assessmentId_fkey') THEN
            ALTER TABLE compliance_findings
            ADD CONSTRAINT "compliance_findings_assessmentId_fkey"
            FOREIGN KEY ("assessmentId") REFERENCES compliance_assessments(id) ON DELETE CASCADE;
          END IF;
        END $$
      `)
    }

    // --- compliance_audit_log ---
    if (!existingSet.has('compliance_audit_log')) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS compliance_audit_log (
          id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          "companyId"     TEXT NOT NULL,
          "assessmentId"  TEXT,
          action          TEXT NOT NULL,
          actor           TEXT NOT NULL,
          details         JSONB NOT NULL DEFAULT '{}',
          "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_compliance_audit_company
        ON compliance_audit_log ("companyId")
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_compliance_audit_assessment
        ON compliance_audit_log ("assessmentId")
      `)
    }

    // --- compliance_policies ---
    if (!existingSet.has('compliance_policies')) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS compliance_policies (
          id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          "companyId"     TEXT NOT NULL,
          title           TEXT NOT NULL,
          source          TEXT NOT NULL DEFAULT 'paste',
          content         TEXT NOT NULL DEFAULT '',
          category        TEXT NOT NULL DEFAULT '',
          tags            JSONB NOT NULL DEFAULT '[]',
          "frameworkIds"  JSONB NOT NULL DEFAULT '[]',
          "controlIds"    JSONB NOT NULL DEFAULT '[]',
          "createdBy"     TEXT NOT NULL,
          "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_compliance_policies_company
        ON compliance_policies ("companyId")
      `)
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compliance_policies_companyId_fkey') THEN
            ALTER TABLE compliance_policies
            ADD CONSTRAINT "compliance_policies_companyId_fkey"
            FOREIGN KEY ("companyId") REFERENCES companies(id) ON DELETE CASCADE;
          END IF;
        END $$
      `)
    }

    // --- compliance_policy_analyses ---
    if (!existingSet.has('compliance_policy_analyses')) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS compliance_policy_analyses (
          id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          "policyId"          TEXT NOT NULL,
          "companyId"         TEXT NOT NULL,
          status              TEXT NOT NULL DEFAULT 'pending',
          "satisfiedControls" JSONB NOT NULL DEFAULT '[]',
          "partialControls"   JSONB NOT NULL DEFAULT '[]',
          "missingControls"   JSONB NOT NULL DEFAULT '[]',
          gaps                JSONB NOT NULL DEFAULT '[]',
          recommendations     JSONB NOT NULL DEFAULT '[]',
          "analysisText"      TEXT NOT NULL DEFAULT '',
          "controlDetails"    JSONB NOT NULL DEFAULT '[]',
          "analyzedAt"        TIMESTAMPTZ,
          "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_compliance_policy_analyses_policy
        ON compliance_policy_analyses ("policyId")
      `)
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compliance_policy_analyses_policyId_fkey') THEN
            ALTER TABLE compliance_policy_analyses
            ADD CONSTRAINT "compliance_policy_analyses_policyId_fkey"
            FOREIGN KEY ("policyId") REFERENCES compliance_policies(id) ON DELETE CASCADE;
          END IF;
        END $$
      `)
    }

    // --- compliance_attestations ---
    if (!existingSet.has('compliance_attestations')) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS compliance_attestations (
          id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          "companyId"     TEXT NOT NULL,
          "controlId"     TEXT NOT NULL,
          "frameworkId"   TEXT NOT NULL,
          response        TEXT NOT NULL DEFAULT '',
          "respondedBy"   TEXT NOT NULL,
          "respondedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE ("companyId", "controlId", "frameworkId")
        )
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_compliance_attestations_company
        ON compliance_attestations ("companyId")
      `)
    }

    // --- compliance_platform_mappings ---
    // Explicit per-company mapping to platform-specific site/org/device IDs.
    // Replaces fuzzy name matching for MSP-level integrations.
    if (!existingSet.has('compliance_platform_mappings')) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS compliance_platform_mappings (
          id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          "companyId"     TEXT NOT NULL,
          platform        TEXT NOT NULL,
          "externalId"    TEXT NOT NULL,
          "externalName"  TEXT NOT NULL DEFAULT '',
          "externalType"  TEXT NOT NULL DEFAULT 'site',
          "mappedBy"      TEXT,
          "mappedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE ("companyId", platform, "externalId")
        )
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_compliance_platform_mappings_company
        ON compliance_platform_mappings ("companyId")
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_compliance_platform_mappings_platform
        ON compliance_platform_mappings ("companyId", platform)
      `)
    }

    // --- compliance_webhook_events ---
    // Stores inbound webhook events from SaaS Alerts (and other future webhook sources).
    // The collector reads from this table instead of calling the external API.
    if (!existingSet.has('compliance_webhook_events')) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS compliance_webhook_events (
          id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          source          TEXT NOT NULL,
          "eventType"     TEXT NOT NULL DEFAULT '',
          severity        TEXT NOT NULL DEFAULT 'low',
          "rawData"       JSONB NOT NULL DEFAULT '{}',
          "receivedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "expiresAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '90 days',
          "externalId"    TEXT,
          "partnerId"     TEXT,
          "customerId"    TEXT,
          "sourceIp"      TEXT,
          headers         JSONB NOT NULL DEFAULT '{}',
          normalized      JSONB NOT NULL DEFAULT '{}',
          "signalType"    TEXT
        )
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_compliance_webhook_events_source
        ON compliance_webhook_events (source, "receivedAt" DESC)
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_compliance_webhook_events_expires
        ON compliance_webhook_events ("expiresAt")
      `)
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_webhook_events_src_extid
        ON compliance_webhook_events (source, "externalId")
        WHERE "externalId" IS NOT NULL
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_compliance_webhook_events_signal
        ON compliance_webhook_events (source, "signalType", "receivedAt" DESC)
      `)
    } else {
      // Self-heal: add columns on older installs
      await client.query(`ALTER TABLE compliance_webhook_events ADD COLUMN IF NOT EXISTS "externalId" TEXT`)
      await client.query(`ALTER TABLE compliance_webhook_events ADD COLUMN IF NOT EXISTS "partnerId" TEXT`)
      await client.query(`ALTER TABLE compliance_webhook_events ADD COLUMN IF NOT EXISTS "customerId" TEXT`)
      await client.query(`ALTER TABLE compliance_webhook_events ADD COLUMN IF NOT EXISTS "sourceIp" TEXT`)
      await client.query(`ALTER TABLE compliance_webhook_events ADD COLUMN IF NOT EXISTS headers JSONB NOT NULL DEFAULT '{}'`)
      await client.query(`ALTER TABLE compliance_webhook_events ADD COLUMN IF NOT EXISTS normalized JSONB NOT NULL DEFAULT '{}'`)
      await client.query(`ALTER TABLE compliance_webhook_events ADD COLUMN IF NOT EXISTS "signalType" TEXT`)
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_webhook_events_src_extid
        ON compliance_webhook_events (source, "externalId")
        WHERE "externalId" IS NOT NULL
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_compliance_webhook_events_signal
        ON compliance_webhook_events (source, "signalType", "receivedAt" DESC)
      `)
    }

    // Ensure controlDetails column exists on compliance_policy_analyses (added after initial table creation)
    if (existingSet.has('compliance_policy_analyses')) {
      await client.query(`ALTER TABLE compliance_policy_analyses ADD COLUMN IF NOT EXISTS "controlDetails" JSONB NOT NULL DEFAULT '[]'`)
    }

    // compliancePortalEnabled column on companies is now in Prisma schema
    // + migration 20260330000000_add_compliance_portal_enabled

    // =========================================================================
    // Policy Generation System Tables
    // Wrapped in try/catch so failures here don't block existing compliance features.
    // Tables are created on demand — if this fails, the catalog route still works.
    // =========================================================================
    try {
      // --- policy_org_profiles ---
      if (!existingSet.has('policy_org_profiles')) {
        await client.query(`
          CREATE TABLE IF NOT EXISTS policy_org_profiles (
            id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "companyId"     TEXT NOT NULL UNIQUE,
            answers         JSONB NOT NULL DEFAULT '{}',
            "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedBy"     TEXT NOT NULL DEFAULT ''
          )
        `)
        await client.query(`CREATE INDEX IF NOT EXISTS idx_policy_org_profiles_company ON policy_org_profiles ("companyId")`)
        await client.query(`
          DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_org_profiles_companyId_fkey') THEN
              ALTER TABLE policy_org_profiles
              ADD CONSTRAINT "policy_org_profiles_companyId_fkey"
              FOREIGN KEY ("companyId") REFERENCES companies(id) ON DELETE CASCADE;
            END IF;
          END $$
        `)
      }

      // --- policy_intake_answers ---
      if (!existingSet.has('policy_intake_answers')) {
        await client.query(`
          CREATE TABLE IF NOT EXISTS policy_intake_answers (
            id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "companyId"     TEXT NOT NULL,
            "policySlug"    TEXT NOT NULL,
            answers         JSONB NOT NULL DEFAULT '{}',
            "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedBy"     TEXT NOT NULL DEFAULT '',
            UNIQUE ("companyId", "policySlug")
          )
        `)
        await client.query(`CREATE INDEX IF NOT EXISTS idx_policy_intake_answers_company ON policy_intake_answers ("companyId")`)
        await client.query(`
          DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_intake_answers_companyId_fkey') THEN
              ALTER TABLE policy_intake_answers
              ADD CONSTRAINT "policy_intake_answers_companyId_fkey"
              FOREIGN KEY ("companyId") REFERENCES companies(id) ON DELETE CASCADE;
            END IF;
          END $$
        `)
      }

      // --- policy_generation_records ---
      if (!existingSet.has('policy_generation_records')) {
        await client.query(`
          CREATE TABLE IF NOT EXISTS policy_generation_records (
            id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "companyId"     TEXT NOT NULL,
            "policySlug"    TEXT NOT NULL,
            "policyId"      TEXT,
            status          TEXT NOT NULL DEFAULT 'missing',
            version         INT NOT NULL DEFAULT 0,
            "inputSnapshot" JSONB NOT NULL DEFAULT '{}',
            "inputHash"     TEXT NOT NULL DEFAULT '',
            "generatedAt"   TIMESTAMPTZ,
            "generatedBy"   TEXT,
            "approvedAt"    TIMESTAMPTZ,
            "approvedBy"    TEXT,
            "exportedAt"    TIMESTAMPTZ,
            "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE ("companyId", "policySlug")
          )
        `)
        await client.query(`CREATE INDEX IF NOT EXISTS idx_policy_generation_records_company ON policy_generation_records ("companyId")`)
        await client.query(`
          DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_generation_records_companyId_fkey') THEN
              ALTER TABLE policy_generation_records
              ADD CONSTRAINT "policy_generation_records_companyId_fkey"
              FOREIGN KEY ("companyId") REFERENCES companies(id) ON DELETE CASCADE;
            END IF;
          END $$
        `)
      }

      // --- policy_versions ---
      if (!existingSet.has('policy_versions')) {
        await client.query(`
          CREATE TABLE IF NOT EXISTS policy_versions (
            id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "companyId"     TEXT NOT NULL,
            "policySlug"    TEXT NOT NULL,
            version         INT NOT NULL DEFAULT 1,
            "policyId"      TEXT NOT NULL,
            content         TEXT NOT NULL DEFAULT '',
            status          TEXT NOT NULL DEFAULT 'draft',
            "inputSnapshot" JSONB NOT NULL DEFAULT '{}',
            "generatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "generatedBy"   TEXT NOT NULL DEFAULT '',
            "approvedAt"    TIMESTAMPTZ,
            "approvedBy"    TEXT,
            UNIQUE ("companyId", "policySlug", version)
          )
        `)
        await client.query(`CREATE INDEX IF NOT EXISTS idx_policy_versions_company_slug ON policy_versions ("companyId", "policySlug")`)
        await client.query(`
          DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_versions_companyId_fkey') THEN
              ALTER TABLE policy_versions
              ADD CONSTRAINT "policy_versions_companyId_fkey"
              FOREIGN KEY ("companyId") REFERENCES companies(id) ON DELETE CASCADE;
            END IF;
          END $$
        `)
      }
    } catch (policyTableErr) {
      // Log but don't block — catalog route handles missing tables gracefully
      console.error('[ensure-tables] Policy generation table creation failed:', policyTableErr instanceof Error ? policyTableErr.message : policyTableErr)
    }

    // =========================================================================
    // Integration credentials (per-tenant encrypted secrets)
    // See src/lib/crypto.ts, src/lib/credentials.ts, and
    // docs/runbooks/CREDENTIALS_MIGRATION.md.
    // =========================================================================
    try {
      if (!existingSet.has('integration_credentials')) {
        await client.query(`
          CREATE TABLE IF NOT EXISTS integration_credentials (
            id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "companyId"       TEXT NOT NULL,
            "connectorType"   TEXT NOT NULL,
            "encryptedValue"  TEXT NOT NULL,
            metadata          JSONB NOT NULL DEFAULT '{}',
            "lastRotatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "createdBy"       TEXT NOT NULL DEFAULT '',
            "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedBy"       TEXT NOT NULL DEFAULT '',
            UNIQUE ("companyId", "connectorType")
          )
        `)
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_integration_credentials_company
          ON integration_credentials ("companyId")
        `)
        await client.query(`
          DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_credentials_companyId_fkey') THEN
              ALTER TABLE integration_credentials
              ADD CONSTRAINT "integration_credentials_companyId_fkey"
              FOREIGN KEY ("companyId") REFERENCES companies(id) ON DELETE CASCADE;
            END IF;
          END $$
        `)
      }

      if (!existingSet.has('integration_credential_access_log')) {
        await client.query(`
          CREATE TABLE IF NOT EXISTS integration_credential_access_log (
            id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "credentialId"  TEXT NOT NULL,
            "companyId"     TEXT NOT NULL,
            "connectorType" TEXT NOT NULL,
            "accessedBy"    TEXT NOT NULL,
            purpose         TEXT NOT NULL DEFAULT '',
            "accessedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_credential_access_credential
          ON integration_credential_access_log ("credentialId", "accessedAt" DESC)
        `)
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_credential_access_company
          ON integration_credential_access_log ("companyId", "accessedAt" DESC)
        `)
        await client.query(`
          DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_credential_access_log_credentialId_fkey') THEN
              ALTER TABLE integration_credential_access_log
              ADD CONSTRAINT "integration_credential_access_log_credentialId_fkey"
              FOREIGN KEY ("credentialId") REFERENCES integration_credentials(id) ON DELETE CASCADE;
            END IF;
          END $$
        `)
      }
    } catch (credentialTableErr) {
      // Log but don't block — nothing reads from these tables yet.
      console.error(
        '[ensure-tables] Integration credential table creation failed:',
        credentialTableErr instanceof Error ? credentialTableErr.message : credentialTableErr
      )
    }

    tablesEnsured = true
  } finally {
    client.release()
  }
}
