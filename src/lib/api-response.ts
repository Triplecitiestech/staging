/**
 * Standard API response envelope.
 *
 * Two tiers:
 * 1. General-purpose: `apiOk()` / `apiError()` — for any endpoint
 * 2. Create-specific: `apiSuccess()` — for mutation endpoints that return id + url
 *
 * Every response includes a requestId for log correlation.
 * Error responses include a human-readable message.
 *
 * Usage:
 *   return apiOk({ companies: [...] }, reqId)        // read endpoint
 *   return apiOk({ updated: true }, reqId, 200)      // update endpoint
 *   return apiSuccess({ id: '123' }, '/api/x', reqId) // create endpoint
 *   return apiError('Not found', reqId, 404)          // any error
 */

import { NextResponse } from 'next/server'
import crypto from 'crypto'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiSuccessResponse<T = Record<string, unknown>> {
  success: true
  data: T & { id: string; url: string }
  requestId: string
}

export interface ApiOkResponse<T = unknown> {
  success: true
  data: T
  requestId: string
}

export interface ApiErrorResponse {
  success: false
  error: string
  code?: string
  requestId: string
}

export type ApiResponse<T = Record<string, unknown>> = ApiSuccessResponse<T> | ApiErrorResponse

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a short request ID for log correlation */
export function generateRequestId(): string {
  return `req_${crypto.randomBytes(8).toString('hex')}`
}

/**
 * General-purpose success response. Works for any endpoint (read, update, delete).
 * Does NOT require id/url — use `apiSuccess()` for create endpoints that return those.
 */
export function apiOk<T>(
  data: T,
  requestId: string,
  status = 200
): NextResponse<ApiOkResponse<T>> {
  return NextResponse.json(
    {
      success: true as const,
      data,
      requestId,
    },
    { status }
  )
}

/**
 * Create/mutate success response. Requires id + url for the created resource.
 */
export function apiSuccess<T extends { id: string }>(
  data: T,
  url: string,
  requestId: string,
  status = 200
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true as const,
      data: { ...data, url },
      requestId,
    },
    { status }
  )
}

/**
 * Error response. Always includes a human-readable error message.
 * Optional `code` for machine-readable error classification.
 */
export function apiError(
  error: string,
  requestId: string,
  status = 500,
  code?: string
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      success: false as const,
      error,
      ...(code && { code }),
      requestId,
    },
    { status }
  )
}

