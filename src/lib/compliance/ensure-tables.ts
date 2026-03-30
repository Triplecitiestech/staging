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
           'compliance_audit_log'
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

    tablesEnsured = true
  } finally {
    client.release()
  }
}
