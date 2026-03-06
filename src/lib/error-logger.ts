/**
 * Automatic Error Logging System
 *
 * Captures server errors, API errors, client runtime errors,
 * and unhandled exceptions. Deduplicates by message + source.
 */

interface ErrorLogEntry {
  level?: 'error' | 'warn' | 'fatal';
  source: 'server' | 'api' | 'client' | 'unhandled';
  message: string;
  stack?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log an error to the database with deduplication.
 * Errors with the same message+source within 1 hour are counted, not duplicated.
 */
export async function logError(entry: ErrorLogEntry): Promise<void> {
  try {
    const { prisma } = await import('@/lib/prisma');

    // Try to find a recent matching error (within 1 hour) for deduplication
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const existing = await prisma.errorLog.findFirst({
      where: {
        message: entry.message,
        source: entry.source,
        resolved: false,
        lastSeen: { gte: oneHourAgo },
      },
      orderBy: { lastSeen: 'desc' },
    });

    if (existing) {
      // Increment count and update last seen
      await prisma.errorLog.update({
        where: { id: existing.id },
        data: {
          count: { increment: 1 },
          lastSeen: new Date(),
          ...(entry.metadata ? { metadata: entry.metadata as object } : {}),
        },
      });
    } else {
      // Create new error log entry
      await prisma.errorLog.create({
        data: {
          level: entry.level || 'error',
          source: entry.source,
          message: entry.message.substring(0, 2000), // Limit message length
          stack: entry.stack?.substring(0, 5000),
          path: entry.path,
          method: entry.method,
          statusCode: entry.statusCode,
          userId: entry.userId,
          metadata: (entry.metadata || {}) as object,
        },
      });
    }
  } catch (logErr) {
    // Fallback to console if DB logging fails (don't cause infinite loop)
    console.error('[ErrorLogger] Failed to log error to DB:', logErr);
    console.error('[ErrorLogger] Original error:', entry.message);
  }
}

/**
 * Wrap an API route handler with automatic error logging.
 */
export function withErrorLogging(
  handler: (request: Request) => Promise<Response>,
  routePath: string
) {
  return async (request: Request): Promise<Response> => {
    try {
      const response = await handler(request);

      // Log server errors (5xx)
      if (response.status >= 500) {
        const body = await response.clone().text();
        await logError({
          source: 'api',
          message: `API ${response.status}: ${routePath}`,
          path: routePath,
          method: request.method,
          statusCode: response.status,
          metadata: { responseBody: body.substring(0, 500) },
        });
      }

      return response;
    } catch (error) {
      await logError({
        source: 'api',
        level: 'fatal',
        message: error instanceof Error ? error.message : 'Unknown API error',
        stack: error instanceof Error ? error.stack : undefined,
        path: routePath,
        method: request.method,
        statusCode: 500,
      });
      throw error;
    }
  };
}
