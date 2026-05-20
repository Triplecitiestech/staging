/**
 * CFO dashboard persistence. Uses the shared raw-pg pool (NOT Prisma — same
 * pattern as the reporting/SOC subsystems). A single key/value jsonb table
 * holds config (debts, category overrides, QuickBooks tokens, snapshots) and
 * the cached built dashboard.
 *
 * Self-healing: ensureCfoTables() creates the table on demand before any read
 * or write, so there is no separate migration step.
 */

import { getPool } from '@/lib/db-pool'
import type { CategoryMap, DebtsConfig, QbSnapshot, ArSnapshot } from './types'

const pool = getPool()

let tablesReady = false
export async function ensureCfoTables(): Promise<void> {
  if (tablesReady) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cfo_settings (
      key        TEXT PRIMARY KEY,
      value      JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  tablesReady = true
}

export async function getSetting<T>(key: string): Promise<T | null> {
  await ensureCfoTables()
  const res = await pool.query<{ value: T }>('SELECT value FROM cfo_settings WHERE key = $1 LIMIT 1', [key])
  return res.rows.length ? res.rows[0].value : null
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await ensureCfoTables()
  await pool.query(
    `INSERT INTO cfo_settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value)]
  )
}

// ─── Typed convenience accessors ────────────────────────────────────────────

export const getCategoryOverrides = () => getSetting<CategoryMap>('destination_categories')
export const saveCategoryOverrides = (map: CategoryMap) => setSetting('destination_categories', map)

export const getDebts = () => getSetting<DebtsConfig>('debts')
export const saveDebts = (debts: DebtsConfig) => setSetting('debts', debts)

export const getQbSnapshot = () => getSetting<QbSnapshot>('qb_snapshot')
export const getArSnapshot = () => getSetting<ArSnapshot>('ar_snapshot')

export interface QbTokens {
  accessToken: string
  refreshToken: string
  realmId: string
  env: string
  expiresAt: number
  connectedAt: string
}
export const getQbTokens = () => getSetting<QbTokens>('qb_tokens')
export const saveQbTokens = (t: QbTokens) => setSetting('qb_tokens', t)
export const clearQbTokens = () => setSetting('qb_tokens', {})
