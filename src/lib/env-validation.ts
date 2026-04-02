/**
 * Environment variable validation — runs at import time.
 *
 * In production, missing critical env vars throw immediately (fail-fast).
 * In development, missing vars are logged as warnings.
 *
 * Import this module in layout.tsx or instrumentation.ts to catch
 * misconfigurations before they cause cryptic runtime errors.
 */

const CRITICAL_VARS = [
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
  'AZURE_AD_CLIENT_ID',
  'AZURE_AD_CLIENT_SECRET',
  'AZURE_AD_TENANT_ID',
] as const

const RECOMMENDED_VARS = [
  'ONBOARDING_SIGNING_KEY',
  'ANTHROPIC_API_KEY',
  'RESEND_API_KEY',
  'TURNSTILE_SECRET_KEY',
  'CRON_SECRET',
] as const

export function validateEnvironment(): { missing: string[]; warnings: string[] } {
  const missing: string[] = []
  const warnings: string[] = []

  for (const v of CRITICAL_VARS) {
    if (!process.env[v]) {
      missing.push(v)
    }
  }

  for (const v of RECOMMENDED_VARS) {
    if (!process.env[v]) {
      warnings.push(v)
    }
  }

  if (process.env.NODE_ENV === 'production' && missing.length > 0) {
    console.error(
      `[ENV] FATAL: Missing critical environment variables: ${missing.join(', ')}. ` +
      'Application may not function correctly.'
    )
  }

  if (warnings.length > 0) {
    console.warn(
      `[ENV] Warning: Missing recommended environment variables: ${warnings.join(', ')}. ` +
      'Some features will be unavailable.'
    )
  }

  return { missing, warnings }
}
