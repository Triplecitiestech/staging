import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// In-memory ConnectorStagedWrite table — enough Prisma surface for the gate.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>
const db = new Map<string, Row>()
let idCounter = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function whereMatches(row: Row, where: any): boolean {
  if (where.id && row.id !== where.id) return false
  if (where.status) {
    if (typeof where.status === 'object' && 'in' in where.status) {
      if (!where.status.in.includes(row.status)) return false
    } else if (row.status !== where.status) return false
  }
  if (where.expiresAt?.lt && !(row.expiresAt < where.expiresAt.lt)) return false
  return true
}

vi.mock('@/lib/prisma', () => ({
  prisma: {
    connectorStagedWrite: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `sw-${++idCounter}`, ...data }
        db.set(row.id, row)
        return row
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findUnique: vi.fn(async ({ where }: any) => db.get(where.id) ?? null),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: vi.fn(async ({ where, data }: any) => {
        const row = { ...db.get(where.id), ...data }
        db.set(where.id, row)
        return row
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0
        for (const [id, row] of Array.from(db.entries())) {
          if (whereMatches(row, where)) {
            db.set(id, { ...row, ...data })
            count++
          }
        }
        return { count }
      }),
    },
  },
}))

const proxyGet = vi.fn()
const proxyPost = vi.fn()
const proxyPut = vi.fn()
const proxyDelete = vi.fn()
vi.mock('@/lib/ubiquiti-proxy', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = await importOriginal<any>()
  return {
    ...actual,
    proxyGet: (...args: unknown[]) => proxyGet(...args),
    proxyPost: (...args: unknown[]) => proxyPost(...args),
    proxyPut: (...args: unknown[]) => proxyPut(...args),
    proxyDelete: (...args: unknown[]) => proxyDelete(...args),
  }
})

import { stageUnifiWrite, executeUnifiStagedWrite } from './unifi-staged-writes'

const LIVE_POLICY = { id: 'fp-1', name: 'Block Guest to Corp', enabled: true, loggingEnabled: false, description: null }

function stageArgs() {
  return {
    area: 'unifi_firewall_policy',
    operation: 'update' as const,
    consoleId: 'F4E2C6:1815664374',
    siteId: 'site-a',
    targetId: 'fp-1',
    changes: { enabled: false },
    reason: 'ticket T123',
    stagedBy: 'tech@triplecitiestech.com',
  }
}

beforeEach(() => {
  db.clear()
  idCounter = 0
  proxyGet.mockReset()
  proxyPost.mockReset()
  proxyPut.mockReset()
  proxyDelete.mockReset()
  vi.stubEnv('CONNECTOR_UNIFI_WRITES_ENABLED', 'true')
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://www.triplecitiestech.com')
})
afterEach(() => vi.unstubAllEnvs())

describe('stageUnifiWrite', () => {
  it('refuses when the UniFi kill switch is off — even with config writes enabled', async () => {
    vi.stubEnv('CONNECTOR_UNIFI_WRITES_ENABLED', 'false')
    vi.stubEnv('CONNECTOR_CONFIG_WRITES_ENABLED', 'true')
    await expect(stageUnifiWrite(stageArgs())).rejects.toThrow(/UniFi writes are disabled/)
    expect(db.size).toBe(0)
  })

  it('stages an update WITHOUT writing: snapshot, diff, pending row, approval URL', async () => {
    proxyGet.mockResolvedValueOnce(LIVE_POLICY)
    const res = await stageUnifiWrite(stageArgs())

    expect(proxyGet).toHaveBeenCalledWith('F4E2C6:1815664374', '/sites/site-a/firewall/policies/fp-1')
    expect(proxyPut).not.toHaveBeenCalled()
    expect(proxyPost).not.toHaveBeenCalled()

    expect(res.status).toBe('pending_approval')
    expect(res.diff).toContain('~ enabled: true → false')
    expect(res.approvalUrl).toBe('https://www.triplecitiestech.com/admin/connector/staged-writes')
    expect(res.note).toMatch(/NOTHING has been written/)

    const row = db.get(res.stagedWriteId)!
    expect(row.targetSystem).toBe('unifi')
    expect(row.risk).toBe('high')
    expect(row.entityId).toBeNull()
    expect(row.entityPath).toBe('consoles/F4E2C6:1815664374/sites/site-a/firewall/policies/fp-1')
  })

  it('redacts secrets in the stored snapshot (WLAN passphrase never lands in the audit row)', async () => {
    proxyGet.mockResolvedValueOnce({ id: 'w1', name: 'Corp WiFi', enabled: true, passphrase: 'hunter2', hideName: false })
    const res = await stageUnifiWrite({ ...stageArgs(), area: 'unifi_wlan', targetId: 'w1', changes: { enabled: false } })
    const row = db.get(res.stagedWriteId)!
    expect(JSON.stringify(row.before)).not.toContain('hunter2')
  })

  it('refuses to stage against a target that does not exist', async () => {
    const { UnifiProxyError } = await vi.importActual<typeof import('@/lib/ubiquiti-proxy')>('@/lib/ubiquiti-proxy')
    proxyGet.mockRejectedValueOnce(new UnifiProxyError('Console x: /sites/... returned 404', 'NOT_FOUND'))
    await expect(stageUnifiWrite(stageArgs())).rejects.toThrow(/not found.*nothing staged/i)
    expect(db.size).toBe(0)
  })
})

describe('executeUnifiStagedWrite', () => {
  async function stagePolicy(): Promise<string> {
    proxyGet.mockResolvedValueOnce(LIVE_POLICY)
    const res = await stageUnifiWrite(stageArgs())
    return res.stagedWriteId
  }

  it('refuses anything not approved, pointing at the approval URL', async () => {
    const id = await stagePolicy()
    await expect(executeUnifiStagedWrite(id)).rejects.toThrow(/Not approved yet/)
    expect(db.get(id)!.status).toBe('pending_approval')
  })

  it('refuses rows that target another system without burning them', async () => {
    db.set('sw-at', { id: 'sw-at', targetSystem: 'autotask', status: 'approved', area: 'holiday', expiresAt: new Date(Date.now() + 60_000) })
    await expect(executeUnifiStagedWrite('sw-at')).rejects.toThrow(/autotask_execute_staged_write/)
    expect(db.get('sw-at')!.status).toBe('approved')
  })

  it('aborts as drifted when the live object changed since staging — nothing written', async () => {
    const id = await stagePolicy()
    db.set(id, { ...db.get(id)!, status: 'approved' })
    proxyGet.mockResolvedValueOnce({ ...LIVE_POLICY, name: 'RENAMED SINCE STAGING' })

    await expect(executeUnifiStagedWrite(id)).rejects.toThrow(/changed since staging.*name/i)
    expect(db.get(id)!.status).toBe('drifted')
    expect(proxyPut).not.toHaveBeenCalled()
  })

  it('executes an approved update via GET→merge→PUT, verifies, and is single-use', async () => {
    const id = await stagePolicy()
    db.set(id, { ...db.get(id)!, status: 'approved' })
    proxyGet.mockResolvedValueOnce(LIVE_POLICY) // drift check read
    proxyPut.mockResolvedValueOnce({ ok: true })
    proxyGet.mockResolvedValueOnce({ ...LIVE_POLICY, enabled: false }) // verify read

    const res = await executeUnifiStagedWrite(id)
    expect(res.status).toBe('executed')

    // Merge semantics: the PUT body is the LIVE object with only the approved
    // field changed — unapproved fields keep their live values.
    expect(proxyPut).toHaveBeenCalledWith(
      'F4E2C6:1815664374',
      '/sites/site-a/firewall/policies/fp-1',
      { ...LIVE_POLICY, enabled: false },
    )
    expect(res.verification).toMatchObject({ enabled: false })
    expect(db.get(id)!.status).toBe('executed')

    // Single-use: a second execution attempt must refuse.
    await expect(executeUnifiStagedWrite(id)).rejects.toThrow(/Cannot execute/)
  })

  it('redacts the write response before it lands in the audit row (PUT echoes passphrases)', async () => {
    proxyGet.mockResolvedValueOnce({ id: 'w1', name: 'Corp WiFi', enabled: true, hideName: false })
    const staged = await stageUnifiWrite({ ...stageArgs(), area: 'unifi_wlan', targetId: 'w1', changes: { enabled: false } })
    db.set(staged.stagedWriteId, { ...db.get(staged.stagedWriteId)!, status: 'approved' })

    proxyGet.mockResolvedValueOnce({ id: 'w1', name: 'Corp WiFi', enabled: true, hideName: false }) // drift read
    proxyPut.mockResolvedValueOnce({ id: 'w1', name: 'Corp WiFi', enabled: false, securityConfiguration: { type: 'WPA2_PERSONAL', passphrase: 'hunter2' } })
    proxyGet.mockResolvedValueOnce({ id: 'w1', name: 'Corp WiFi', enabled: false, passphrase: 'hunter2' }) // verify read

    await executeUnifiStagedWrite(staged.stagedWriteId)
    expect(JSON.stringify(db.get(staged.stagedWriteId)!.result)).not.toContain('hunter2')
  })

  it('expires overdue approvals instead of executing them', async () => {
    const id = await stagePolicy()
    db.set(id, { ...db.get(id)!, status: 'approved', expiresAt: new Date(Date.now() - 1000) })
    await expect(executeUnifiStagedWrite(id)).rejects.toThrow(/'expired'/)
    expect(proxyPut).not.toHaveBeenCalled()
  })

  it('refuses to execute when the kill switch was turned off after approval', async () => {
    const id = await stagePolicy()
    db.set(id, { ...db.get(id)!, status: 'approved' })
    vi.stubEnv('CONNECTOR_UNIFI_WRITES_ENABLED', 'false')
    await expect(executeUnifiStagedWrite(id)).rejects.toThrow(/UniFi writes are disabled/)
    expect(proxyPut).not.toHaveBeenCalled()
  })
})

describe('executeStagedWrite (Autotask path) guards UniFi rows', () => {
  it('refuses a UniFi row BEFORE the single-use claim so the approval is not burned', async () => {
    vi.doMock('@/lib/autotask', () => ({ AutotaskClient: class {} }))
    vi.doMock('@/lib/autotask-write', () => ({ patchConfigEntity: vi.fn(), createConfigEntity: vi.fn(), deleteConfigEntity: vi.fn() }))
    const { executeStagedWrite } = await import('./staged-writes')

    vi.stubEnv('CONNECTOR_CONFIG_WRITES_ENABLED', 'true')
    db.set('sw-uf', { id: 'sw-uf', targetSystem: 'unifi', status: 'approved', area: 'unifi_wlan', expiresAt: new Date(Date.now() + 60_000) })

    await expect(executeStagedWrite('sw-uf')).rejects.toThrow(/unifi_execute_staged_write/)
    expect(db.get('sw-uf')!.status).toBe('approved')
  })
})
