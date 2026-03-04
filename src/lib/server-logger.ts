/**
 * Structured server-side logging with correlation IDs and latency timing.
 *
 * Usage:
 *   const log = createRequestLogger('POST /api/companies')
 *   log.info('Starting company creation', { displayName })
 *   // ... do work ...
 *   log.info('Company created', { companyId, durationMs: log.elapsed() })
 *   log.error('Failed to create company', { error: err.message })
 */

export interface RequestLogger {
  requestId: string
  info: (message: string, context?: Record<string, unknown>) => void
  warn: (message: string, context?: Record<string, unknown>) => void
  error: (message: string, context?: Record<string, unknown>) => void
  /** Milliseconds since this logger was created */
  elapsed: () => number
  /** Create a timing marker; call the returned fn to get elapsed ms since marker */
  startTimer: (label: string) => () => number
}

export function generateRequestId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `req_${timestamp}_${random}`
}

export function createRequestLogger(route: string, userId?: string): RequestLogger {
  const requestId = generateRequestId()
  const startTime = Date.now()

  function log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      requestId,
      route,
      message,
      context: {
        ...context,
        userId,
        elapsedMs: Date.now() - startTime,
      },
    }

    if (level === 'error') {
      console.error(JSON.stringify(entry))
    } else if (level === 'warn') {
      console.warn(JSON.stringify(entry))
    } else {
      console.log(JSON.stringify(entry))
    }
  }

  return {
    requestId,
    info: (message, context) => log('info', message, context),
    warn: (message, context) => log('warn', message, context),
    error: (message, context) => log('error', message, context),
    elapsed: () => Date.now() - startTime,
    startTimer: (label: string) => {
      const timerStart = Date.now()
      return () => {
        const duration = Date.now() - timerStart
        log('info', `Timer: ${label}`, { [`${label}Ms`]: duration })
        return duration
      }
    },
  }
}
