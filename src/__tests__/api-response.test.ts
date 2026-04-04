import { describe, it, expect } from 'vitest'
import { apiSuccess, apiError, apiOk, generateRequestId } from '@/lib/api-response'

describe('apiSuccess', () => {
  it('returns a response with success: true and data with id + url', async () => {
    const response = apiSuccess(
      { id: 'abc-123', displayName: 'Acme Corp', slug: 'acme-corp', createdAt: '2025-01-01' },
      '/admin/companies',
      'req_test_123',
      201
    )

    expect(response.status).toBe(201)
    const body = await response.json()

    expect(body.success).toBe(true)
    expect(body.data.id).toBe('abc-123')
    expect(body.data.url).toBe('/admin/companies')
    expect(body.data.displayName).toBe('Acme Corp')
    expect(body.requestId).toBe('req_test_123')
  })
})

describe('apiError', () => {
  it('returns a response with success: false and error message', async () => {
    const response = apiError(
      'Something went wrong',
      'req_test_456',
      500,
      'INTERNAL_ERROR'
    )

    expect(response.status).toBe(500)
    const body = await response.json()

    expect(body.success).toBe(false)
    expect(body.error).toBe('Something went wrong')
    expect(body.code).toBe('INTERNAL_ERROR')
    expect(body.requestId).toBe('req_test_456')
  })

  it('omits code when not provided', async () => {
    const response = apiError('Unauthorized', 'req_test_789', 401)
    const body = await response.json()

    expect(body.code).toBeUndefined()
    expect(body.error).toBe('Unauthorized')
  })
})

describe('apiOk', () => {
  it('returns success: true with data fields spread at top level', async () => {
    const response = apiOk({ tickets: [{ id: '1' }], count: 1 }, 'req_ok_1')
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.tickets).toHaveLength(1)
    expect(body.count).toBe(1)
    expect(body.requestId).toBe('req_ok_1')
  })

  it('supports custom status codes', async () => {
    const response = apiOk({ created: true }, 'req_ok_2', 201)
    expect(response.status).toBe(201)
  })

  it('works with empty data', async () => {
    const response = apiOk({ items: [] }, 'req_ok_3')
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.items).toEqual([])
  })

  it('is backward-compatible — fields are at top level, not nested in data', async () => {
    const response = apiOk({ name: 'test' }, 'req_ok_4')
    const body = await response.json()
    expect(body.name).toBe('test')
    // Should NOT be nested under body.data
    expect(body.data).toBeUndefined()
  })
})

describe('generateRequestId', () => {
  it('returns a string starting with req_', () => {
    const id = generateRequestId()
    expect(id).toMatch(/^req_[0-9a-f]{16}$/)
  })

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()))
    expect(ids.size).toBe(100)
  })
})
