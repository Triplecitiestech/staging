/**
 * Standardized Cron Job Execution Wrapper
 *
 * Provides consistent behavior for all cron endpoints:
 * - Auth verification (Vercel CRON_SECRET)
 * - Correlation ID tracking
 * - Automatic retry for transient failures
 * - Timeout boundaries
 * - Structured logging
 * - NEVER returns 500 for transient issues (prevents Vercel flagging)
 * - Records execution status for health monitoring
 *
 * @module cron-wrapper
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  generateCorrelationId,
  classifyError,
  withRetry,
  withTimeout,
  structuredLog,
  type LogContext,
} from '@/lib/resilience';

export interface CronResult {
  /** Whether the job completed successfully */
  success: boolean;
  /** Human-readable summary */
  message: string;
  /** Arbitrary metadata to include in the response */
  data?: Record<string, unknown>;
  /** Non-fatal errors encountered during execution */
  warnings?: string[];
}

export interface CronJobOptions {
  /** Job name for logging and status tracking */
  name: string;
  /** Maximum execution time in ms (default: 55000 — slightly under Vercel's 60s limit) */
  timeoutMs?: number;
  /** Number of retries for the entire job on transient failure (default: 1) */
  maxRetries?: number;
}

/**
 * Wrap a cron handler with standard auth, retry, timeout, and logging.
 *
 * Usage:
 * ```ts
 * export const GET = cronHandler({
 *   name: 'my-job',
 *   timeoutMs: 50000,
 * }, async (ctx) => {
 *   // do work...
 *   return { success: true, message: 'Done' };
 * });
 * ```
 */
export function cronHandler(
  options: CronJobOptions,
  handler: (ctx: LogContext) => Promise<CronResult>,
) {
  const { name, timeoutMs = 55000, maxRetries = 1 } = options;

  return async function (request: NextRequest): Promise<NextResponse> {
    const correlationId = generateCorrelationId();
    const startTime = Date.now();
    const ctx: LogContext = { correlationId, operation: `cron:${name}` };

    // Auth check
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    structuredLog.info(ctx, `Starting cron job: ${name}`);

    try {
      const result = await withRetry(
        () => withTimeout(() => handler(ctx), timeoutMs, `cron:${name}`),
        {
          maxRetries,
          baseDelayMs: 2000,
          maxDelayMs: 10000,
          onRetry: (attempt, err, delay) => {
            structuredLog.warn(
              { ...ctx, attempt, delay, errorCategory: err.category },
              `Retrying cron job ${name}: ${err.message}`,
            );
          },
        },
      );

      const durationMs = Date.now() - startTime;

      structuredLog.info(
        { ...ctx, durationMs, success: result.success },
        `Cron job ${name} completed: ${result.message}`,
      );

      return NextResponse.json({
        ...result,
        correlationId,
        durationMs,
      });
    } catch (rawErr) {
      const durationMs = Date.now() - startTime;
      const classified = classifyError(rawErr);

      structuredLog.error(
        { ...ctx, durationMs, errorCategory: classified.category, isTransient: classified.isTransient },
        `Cron job ${name} failed: ${classified.message}`,
        rawErr,
      );

      // ALWAYS return 200 for transient errors so Vercel doesn't flag them.
      // The health monitor uses its own sliding-window logic to detect real outages.
      if (classified.isTransient) {
        return NextResponse.json({
          success: false,
          transient: true,
          errorCategory: classified.category,
          message: `Transient ${classified.category} error (will retry next cycle): ${classified.message}`,
          correlationId,
          durationMs,
        });
      }

      // Permanent errors still return 500 so they're visible
      return NextResponse.json(
        {
          success: false,
          error: classified.message,
          errorCategory: classified.category,
          correlationId,
          durationMs,
        },
        { status: 500 },
      );
    }
  };
}
