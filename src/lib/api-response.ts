/**
 * Standard API response envelope for all create/mutate actions.
 *
 * Every response includes a requestId for log correlation.
 * Success responses include data with id + url.
 * Error responses include a human-readable message.
 */

import { NextResponse } from 'next/server'

export interface ApiSuccessResponse<T = Record<string, unknown>> {
  success: true
  data: T & { id: string; url: string }
  requestId: string
}

export interface ApiErrorResponse {
  success: false
  error: string
  code?: string
  requestId: string
}

export type ApiResponse<T = Record<string, unknown>> = ApiSuccessResponse<T> | ApiErrorResponse

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
