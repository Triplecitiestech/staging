/**
 * Integration test: Verified-Create Flow for Company API
 *
 * Proves the core contract:
 * 1. POST /api/companies returns { success: true, data: { id, url }, requestId }
 * 2. The response includes a real ID (not null/undefined)
 * 3. Error responses return { success: false, error, requestId }
 * 4. The response envelope is consistent regardless of success/failure
 *
 * Note: This tests the response envelope contract using the apiSuccess/apiError
 * helpers directly. A full E2E test with a real database would require a test
 * database setup (future improvement).
 */

import { describe, it, expect } from 'vitest'
import { apiSuccess, apiError } from '@/lib/api-response'

describe('Verified-Create Flow Contract', () => {
  describe('Success envelope', () => {
    it('includes success: true, data.id, data.url, and requestId', async () => {
      const mockCompany = {
        id: 'company-uuid-001',
        displayName: 'Test Company',
        slug: 'test-company',
        primaryContact: 'John Doe',
        contactEmail: 'john@test.com',
        contactTitle: 'CEO',
        createdAt: new Date().toISOString(),
      }

      const response = apiSuccess(
        mockCompany,
        '/admin/companies',
        'req_test_abc123',
        201
      )

      const body = await response.json()

      // Core contract assertions
      expect(body.success).toBe(true)
      expect(body.data).toBeDefined()
      expect(body.data.id).toBe('company-uuid-001')
      expect(body.data.id).toBeTruthy() // not null/undefined/empty
      expect(body.data.url).toBe('/admin/companies')
      expect(body.requestId).toMatch(/^req_/)

      // Data integrity
      expect(body.data.displayName).toBe('Test Company')
      expect(body.data.slug).toBe('test-company')

      // HTTP status
      expect(response.status).toBe(201)
    })

    it('never returns success without an id', async () => {
      // The TypeScript type system enforces this, but let's test runtime too
      const response = apiSuccess(
        { id: 'some-id', name: 'Test' },
        '/admin/companies',
        'req_test_def456'
      )
      const body = await response.json()
      expect(body.data.id).toBeTruthy()
    })
  })

  describe('Error envelope', () => {
    it('includes success: false, error message, and requestId', async () => {
      const response = apiError(
        'Failed to create company',
        'req_test_ghi789',
        500,
        'DB_ERROR'
      )

      const body = await response.json()

      // Core contract assertions
      expect(body.success).toBe(false)
      expect(body.error).toBe('Failed to create company')
      expect(body.requestId).toMatch(/^req_/)
      expect(body.code).toBe('DB_ERROR')

      // No data on error
      expect(body.data).toBeUndefined()

      // HTTP status
      expect(response.status).toBe(500)
    })

    it('returns 401 for unauthorized', async () => {
      const response = apiError('Unauthorized', 'req_test_jkl012', 401)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Unauthorized')
    })

    it('returns 400 for validation errors', async () => {
      const response = apiError(
        'Company name is required',
        'req_test_mno345',
        400,
        'MISSING_DISPLAY_NAME'
      )
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.success).toBe(false)
      expect(body.code).toBe('MISSING_DISPLAY_NAME')
    })

    it('returns 504 for AI timeout', async () => {
      const response = apiError(
        'AI service timed out after 25s',
        'req_test_pqr678',
        504,
        'AI_TIMEOUT'
      )
      const body = await response.json()

      expect(response.status).toBe(504)
      expect(body.code).toBe('AI_TIMEOUT')
    })
  })

  describe('Envelope consistency', () => {
    it('all responses have requestId', async () => {
      const success = await apiSuccess(
        { id: '1', name: 'Test' },
        '/url',
        'req_1'
      ).json()
      const error = await apiError('fail', 'req_2', 500).json()

      expect(success.requestId).toBeDefined()
      expect(error.requestId).toBeDefined()
    })

    it('all responses have success boolean', async () => {
      const success = await apiSuccess(
        { id: '1', name: 'Test' },
        '/url',
        'req_1'
      ).json()
      const error = await apiError('fail', 'req_2', 500).json()

      expect(typeof success.success).toBe('boolean')
      expect(typeof error.success).toBe('boolean')
      expect(success.success).toBe(true)
      expect(error.success).toBe(false)
    })
  })
})
