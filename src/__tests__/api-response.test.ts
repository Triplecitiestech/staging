import { describe, it, expect } from 'vitest'
import { apiSuccess, apiError } from '@/lib/api-response'

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
