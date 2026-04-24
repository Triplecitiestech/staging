/**
 * Secret encryption — AES-256-GCM with envelope encryption.
 *
 * Used to encrypt per-tenant integration credentials at rest. See
 * `docs/runbooks/CREDENTIALS_MIGRATION.md` for the rollout plan and
 * `src/lib/credentials.ts` for the consumer.
 *
 * Design:
 *   - Master key lives in `ENCRYPTION_MASTER_KEY_V<version>` env var.
 *   - Ciphertext is tagged with its key version so rotation can run
 *     incrementally: add a v2 key, re-encrypt row-by-row, retire v1.
 *   - AES-256-GCM provides integrity + confidentiality. Tampered
 *     ciphertext fails authentication on decrypt.
 *
 * Payload format (colon-separated, all base64 except the version prefix):
 *   v1:<iv>:<authTag>:<ciphertext>
 *
 * Nothing in this module reaches for the DB. It is deliberately isolated so
 * unit tests can cover the round-trip in isolation.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12       // GCM standard nonce size
const CURRENT_VERSION = 'v1'

type KeyVersion = `v${number}`

function loadKey(version: KeyVersion): Buffer {
  const envName = `ENCRYPTION_MASTER_KEY_${version.toUpperCase()}`
  const raw = process.env[envName]
  if (!raw) {
    throw new Error(
      `Encryption master key for ${version} is not set. Add ${envName} to the environment. ` +
      `Generate with: [Convert]::ToBase64String((1..32 | % { Get-Random -Max 256 }))`
    )
  }
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error(
      `${envName} must decode to exactly 32 bytes (got ${key.length}). ` +
      `Provide a base64-encoded 256-bit key.`
    )
  }
  return key
}

/**
 * Encrypt `plaintext` with the current master key. Result is safe to store
 * as text (TEXT column, JSON field). Always produces a fresh IV so
 * identical plaintexts produce different ciphertexts.
 */
export function encryptSecret(plaintext: string): string {
  if (typeof plaintext !== 'string') {
    throw new TypeError('encryptSecret expects a string')
  }
  const key = loadKey(CURRENT_VERSION)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [
    CURRENT_VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':')
}

/**
 * Decrypt a payload produced by `encryptSecret`. Throws if the payload is
 * malformed, the key version is missing, or the auth tag doesn't match
 * (which implies tampering or key mismatch).
 */
export function decryptSecret(payload: string): string {
  if (typeof payload !== 'string' || !payload) {
    throw new TypeError('decryptSecret expects a non-empty string payload')
  }
  const parts = payload.split(':')
  if (parts.length !== 4) {
    throw new Error('Malformed encrypted payload (expected 4 colon-separated segments)')
  }
  const [version, ivB64, tagB64, ctB64] = parts
  if (!/^v\d+$/.test(version)) {
    throw new Error(`Unrecognised key version: ${version}`)
  }
  const key = loadKey(version as KeyVersion)
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ])
  return plaintext.toString('utf8')
}

/**
 * Short, stable fingerprint of a secret. Safe to put in logs so that an
 * operator can confirm which value is in use without exposing it. A new
 * secret with the same fingerprint as an old one means they're identical.
 */
export function fingerprintSecret(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex').slice(0, 16)
}

/**
 * Returns the version prefix embedded in a payload without attempting
 * decryption. Useful for reporting how many rows still hold the old key.
 */
export function payloadVersion(payload: string): KeyVersion | null {
  const match = /^(v\d+):/.exec(payload)
  return match ? (match[1] as KeyVersion) : null
}

/**
 * True when the given env-var is configured with a valid 32-byte base64
 * key. Called by env-validation at startup so we fail loudly if Preview is
 * missing the variable.
 */
export function isEncryptionKeyConfigured(version: KeyVersion = CURRENT_VERSION): boolean {
  try {
    loadKey(version)
    return true
  } catch {
    return false
  }
}
