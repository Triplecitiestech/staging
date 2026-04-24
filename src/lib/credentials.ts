/**
 * Per-tenant integration credential store.
 *
 * Centralises how we read + write credentials for third-party integrations
 * (Microsoft Graph, Datto RMM, IT Glue, etc.). Credentials are encrypted at
 * rest with the envelope scheme in `src/lib/crypto.ts`, and every read is
 * audited.
 *
 * THIS MODULE IS CURRENTLY DORMANT. The vendor clients still pull from
 * `process.env.*` and the `companies.m365_client_secret` column. The
 * migration plan in `docs/runbooks/CREDENTIALS_MIGRATION.md` walks through
 * how to cut each integration over. The dual-read pattern below is designed
 * so that a caller can safely fall back to the legacy source during
 * migration without forcing a big-bang cutover.
 *
 * Tables (see `src/lib/compliance/ensure-tables.ts`):
 *   integration_credentials              — per-company encrypted secrets
 *   integration_credential_access_log    — read audit trail
 */

import { getPool } from '@/lib/db-pool'
import { decryptSecret, encryptSecret, fingerprintSecret } from '@/lib/crypto'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'

export type IntegrationConnectorType =
  | 'microsoft_graph'
  | 'datto_rmm'
  | 'datto_edr'
  | 'datto_bcdr'
  | 'datto_saas'
  | 'dnsfilter'
  | 'autotask'
  | 'domotz'
  | 'it_glue'
  | 'saas_alerts'
  | 'ubiquiti'
  | 'myitprocess'
  | 'pax8'

export interface CredentialMetadata {
  /** Non-secret identifiers (tenantId, clientId, apiUrl, partnerId, etc.) */
  [key: string]: unknown
}

export interface StoredCredential {
  secret: string
  metadata: CredentialMetadata
  source: 'per_tenant' | 'msp_env' | 'legacy_column'
  lastRotatedAt: Date | null
  fingerprint: string
}

export interface AccessContext {
  /**
   * Who read the credential. Staff email for UI-driven reads, or a job name
   * like 'compliance:collect-evidence' for background work. Free-form — we
   * just log it.
   */
  accessedBy: string
  /**
   * What it was for — 'assessment' | 'sync' | 'verify' | 'migration' etc.
   * Used to satisfy auditors asking "who touched this secret and why".
   */
  purpose: string
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Fetch a credential for a company + connector. Writes an access-log row
 * before decrypting; if decryption fails the log still records the attempt.
 *
 * Returns null when no per-tenant credential is stored. Callers that want a
 * fallback to MSP-global env vars during migration should use
 * `getCredentialWithFallback` instead.
 */
export async function getCredential(
  companyId: string,
  connectorType: IntegrationConnectorType,
  context: AccessContext
): Promise<StoredCredential | null> {
  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<{
      id: string
      encryptedValue: string
      metadata: CredentialMetadata
      lastRotatedAt: Date | null
    }>(
      `SELECT id, "encryptedValue", metadata, "lastRotatedAt"
       FROM integration_credentials
       WHERE "companyId" = $1 AND "connectorType" = $2
       LIMIT 1`,
      [companyId, connectorType]
    )

    if (res.rows.length === 0) return null
    const row = res.rows[0]

    // Log BEFORE decrypting so failed reads still leave an audit trail.
    await client.query(
      `INSERT INTO integration_credential_access_log
        ("credentialId", "companyId", "connectorType", "accessedBy", purpose)
       VALUES ($1, $2, $3, $4, $5)`,
      [row.id, companyId, connectorType, context.accessedBy, context.purpose]
    )

    const secret = decryptSecret(row.encryptedValue)
    return {
      secret,
      metadata: row.metadata ?? {},
      source: 'per_tenant',
      lastRotatedAt: row.lastRotatedAt,
      fingerprint: fingerprintSecret(secret),
    }
  } finally {
    client.release()
  }
}

/**
 * Per-tenant read with graceful fallback to MSP-level env vars. Used during
 * the migration window so integrations keep working before each company
 * has been moved to the new table.
 *
 * NB: env-var fallbacks are NOT audited (there's no row to reference). Once
 * every tenant has a per-tenant credential row, drop `fallbackEnv` and
 * deprecate this function.
 */
export async function getCredentialWithFallback(
  companyId: string,
  connectorType: IntegrationConnectorType,
  context: AccessContext,
  fallback: {
    /** Env var name holding the MSP-global secret, or undefined to skip. */
    envVarName?: string
    /** Extra metadata to return alongside an env-var fallback. */
    metadata?: CredentialMetadata
  } = {}
): Promise<StoredCredential | null> {
  const perTenant = await getCredential(companyId, connectorType, context)
  if (perTenant) return perTenant

  if (fallback.envVarName) {
    const envValue = process.env[fallback.envVarName]
    if (envValue) {
      return {
        secret: envValue,
        metadata: fallback.metadata ?? {},
        source: 'msp_env',
        lastRotatedAt: null,
        fingerprint: fingerprintSecret(envValue),
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Upsert a per-tenant credential. Encrypts on the way in. Does NOT audit —
 * writes are rare, come from identifiable admin endpoints that already
 * have their own auth logging, and the access log is about read exposure.
 */
export async function setCredential(
  companyId: string,
  connectorType: IntegrationConnectorType,
  secret: string,
  metadata: CredentialMetadata,
  setBy: string
): Promise<void> {
  if (!secret) throw new Error('Refusing to store empty secret')
  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    const encrypted = encryptSecret(secret)
    await client.query(
      `INSERT INTO integration_credentials
        ("companyId", "connectorType", "encryptedValue", metadata, "createdBy")
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT ("companyId", "connectorType")
       DO UPDATE SET
         "encryptedValue" = EXCLUDED."encryptedValue",
         metadata         = EXCLUDED.metadata,
         "lastRotatedAt"  = NOW(),
         "updatedBy"      = EXCLUDED."createdBy",
         "updatedAt"      = NOW()`,
      [companyId, connectorType, encrypted, JSON.stringify(metadata), setBy]
    )
  } finally {
    client.release()
  }
}

/**
 * Delete a per-tenant credential. The access-log rows are kept (FK is
 * ON DELETE CASCADE so they go away with the credential — adjust if you
 * want audit rows to outlive the credential).
 */
export async function deleteCredential(
  companyId: string,
  connectorType: IntegrationConnectorType
): Promise<boolean> {
  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query(
      `DELETE FROM integration_credentials
       WHERE "companyId" = $1 AND "connectorType" = $2`,
      [companyId, connectorType]
    )
    return (res.rowCount ?? 0) > 0
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Introspection
// ---------------------------------------------------------------------------

export interface CredentialSummary {
  companyId: string
  connectorType: IntegrationConnectorType
  metadata: CredentialMetadata
  lastRotatedAt: Date | null
  createdAt: Date
  createdBy: string
}

/**
 * List credentials for a company (metadata only — secrets are never
 * returned). Powers admin UI that shows which integrations are configured.
 */
export async function listCompanyCredentials(companyId: string): Promise<CredentialSummary[]> {
  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<CredentialSummary>(
      `SELECT "companyId", "connectorType", metadata, "lastRotatedAt", "createdAt", "createdBy"
       FROM integration_credentials
       WHERE "companyId" = $1
       ORDER BY "connectorType"`,
      [companyId]
    )
    return res.rows
  } finally {
    client.release()
  }
}
