import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequestLogger, generateRequestId } from '@/lib/server-logger'

describe('generateRequestId', () => {
  it('returns a string starting with req_', () => {
    const id = generateRequestId()
    expect(id).toMatch(/^req_[a-z0-9]+_[a-z0-9]+$/)
  })

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()))
    expect(ids.size).toBe(100)
  })
})

describe('createRequestLogger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('creates a logger with a requestId', () => {
    const log = createRequestLogger('POST /api/test')
    expect(log.requestId).toMatch(/^req_/)
  })

  it('logs info as structured JSON', () => {
    const log = createRequestLogger('POST /api/test', 'user@test.com')
    log.info('Test message', { key: 'value' })

    expect(console.log).toHaveBeenCalledOnce()
    const logCall = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const parsed = JSON.parse(logCall)

    expect(parsed.level).toBe('info')
    expect(parsed.message).toBe('Test message')
    expect(parsed.requestId).toBe(log.requestId)
    expect(parsed.route).toBe('POST /api/test')
    expect(parsed.context.key).toBe('value')
    expect(parsed.context.userId).toBe('user@test.com')
    expect(typeof parsed.context.elapsedMs).toBe('number')
  })

  it('logs warnings via console.warn', () => {
    const log = createRequestLogger('GET /api/test')
    log.warn('Warning message')

    expect(console.warn).toHaveBeenCalledOnce()
  })

  it('logs errors via console.error', () => {
    const log = createRequestLogger('GET /api/test')
    log.error('Error message')

    expect(console.error).toHaveBeenCalledOnce()
  })

  it('tracks elapsed time', async () => {
    const log = createRequestLogger('GET /api/test')
    await new Promise(resolve => setTimeout(resolve, 50))
    const elapsed = log.elapsed()
    expect(elapsed).toBeGreaterThanOrEqual(40) // allow some timing variance
  })

  it('startTimer returns duration on stop', async () => {
    const log = createRequestLogger('GET /api/test')
    const stop = log.startTimer('db-query')
    await new Promise(resolve => setTimeout(resolve, 50))
    const duration = stop()
    expect(duration).toBeGreaterThanOrEqual(40)
  })
})
