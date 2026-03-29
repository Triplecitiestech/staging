/**
 * Resilience Utilities
 *
 * Central module for retry, timeout, circuit breaker, error classification,
 * and correlation ID generation. Used across cron jobs, API routes, and
 * external API clients to handle transient failures gracefully.
 *
 * @module resilience
 */

// ---------------------------------------------------------------------------
// Correlation ID
// ---------------------------------------------------------------------------

let correlationCounter = 0;

/**
 * Generate a short, unique correlation ID for request tracing.
 * Format: timestamp-counter (e.g., "1711728000000-42")
 */
export function generateCorrelationId(): string {
  return `${Date.now()}-${++correlationCounter}`;
}

// ---------------------------------------------------------------------------
// Error Classification
// ---------------------------------------------------------------------------

/** Categories of errors for determining retry behavior */
export type ErrorCategory =
  | 'connection'    // DB/network connection failures
  | 'timeout'       // Operation timed out
  | 'rate_limit'    // Rate limited by external service
  | 'server_error'  // 5xx from external service
  | 'auth'          // Authentication/authorization failure
  | 'validation'    // Bad input / client error
  | 'unknown';      // Unclassified

export interface ClassifiedError {
  category: ErrorCategory;
  isTransient: boolean;
  message: string;
  original: unknown;
}

const TRANSIENT_PATTERNS = [
  'timeout', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND',
  'EPIPE', 'EAI_AGAIN', 'socket hang up', 'network',
  'Connection terminated', 'connection', 'Failed to conn',
  'pool', 'Too many connections', 'remaining connection slots',
  'could not connect', 'fetch failed', 'aborted',
  'Client network socket disconnected',
];

const RATE_LIMIT_PATTERNS = [
  'rate limit', 'too many requests', '429',
];

/**
 * Classify an error to determine if it's transient (retryable) or permanent.
 */
export function classifyError(err: unknown): ClassifiedError {
  const message = err instanceof Error ? err.message : String(err);
  const lowerMessage = message.toLowerCase();

  // Rate limit
  if (RATE_LIMIT_PATTERNS.some(p => lowerMessage.includes(p.toLowerCase()))) {
    return { category: 'rate_limit', isTransient: true, message, original: err };
  }

  // Timeout
  if (lowerMessage.includes('timeout') || lowerMessage.includes('etimedout') || lowerMessage.includes('aborted')) {
    return { category: 'timeout', isTransient: true, message, original: err };
  }

  // Connection errors
  if (TRANSIENT_PATTERNS.some(p => lowerMessage.includes(p.toLowerCase()))) {
    return { category: 'connection', isTransient: true, message, original: err };
  }

  // HTTP status codes in error messages
  if (lowerMessage.includes('500') || lowerMessage.includes('502') || lowerMessage.includes('503') || lowerMessage.includes('504')) {
    return { category: 'server_error', isTransient: true, message, original: err };
  }

  if (lowerMessage.includes('401') || lowerMessage.includes('403') || lowerMessage.includes('unauthorized') || lowerMessage.includes('forbidden')) {
    return { category: 'auth', isTransient: false, message, original: err };
  }

  if (lowerMessage.includes('400') || lowerMessage.includes('404') || lowerMessage.includes('422')) {
    return { category: 'validation', isTransient: false, message, original: err };
  }

  return { category: 'unknown', isTransient: false, message, original: err };
}

// ---------------------------------------------------------------------------
// Retry with Exponential Backoff
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms before first retry (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay cap in ms (default: 15000) */
  maxDelayMs?: number;
  /** Jitter factor 0-1 to randomize delay (default: 0.2) */
  jitter?: number;
  /** Only retry if this returns true for the error (default: retry transient errors) */
  shouldRetry?: (err: ClassifiedError) => boolean;
  /** Called on each retry attempt for logging */
  onRetry?: (attempt: number, err: ClassifiedError, delayMs: number) => void;
}

/**
 * Execute an async function with exponential backoff retry.
 * Only retries transient errors by default.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 15000,
    jitter = 0.2,
    shouldRetry = (err) => err.isTransient,
    onRetry,
  } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (rawErr) {
      const classified = classifyError(rawErr);
      const isLastAttempt = attempt === maxRetries;

      if (isLastAttempt || !shouldRetry(classified)) {
        throw rawErr;
      }

      // Exponential backoff with jitter
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      const jitterAmount = exponentialDelay * jitter * Math.random();
      const delay = Math.min(exponentialDelay + jitterAmount, maxDelayMs);

      onRetry?.(attempt + 1, classified, delay);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Unreachable, but TypeScript needs this
  throw new Error('Retry exhausted');
}

// ---------------------------------------------------------------------------
// Timeout Wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap an async function with a timeout. Rejects with a timeout error if
 * the function doesn't resolve within the specified duration.
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  label = 'Operation',
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        });
      }),
    ]);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Circuit Breaker
// ---------------------------------------------------------------------------

export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit (default: 5) */
  failureThreshold?: number;
  /** How long to wait before trying again in ms (default: 60000) */
  resetTimeoutMs?: number;
  /** Name for logging */
  name?: string;
}

interface CircuitState {
  failures: number;
  state: 'closed' | 'open' | 'half-open';
  lastFailureTime: number;
  lastError?: string;
}

const circuits = new Map<string, CircuitState>();

/**
 * Execute a function with circuit breaker protection.
 * After `failureThreshold` failures, the circuit opens and rejects immediately
 * for `resetTimeoutMs`, then allows one probe request (half-open).
 */
export async function withCircuitBreaker<T>(
  fn: () => Promise<T>,
  options: CircuitBreakerOptions = {},
): Promise<T> {
  const {
    failureThreshold = 5,
    resetTimeoutMs = 60000,
    name = 'default',
  } = options;

  let state = circuits.get(name);
  if (!state) {
    state = { failures: 0, state: 'closed', lastFailureTime: 0 };
    circuits.set(name, state);
  }

  // Check if circuit should transition from open to half-open
  if (state.state === 'open') {
    const elapsed = Date.now() - state.lastFailureTime;
    if (elapsed >= resetTimeoutMs) {
      state.state = 'half-open';
    } else {
      throw new Error(
        `Circuit breaker [${name}] is OPEN (${state.failures} failures, last: ${state.lastError}). ` +
        `Will retry in ${Math.round((resetTimeoutMs - elapsed) / 1000)}s.`
      );
    }
  }

  try {
    const result = await fn();

    // Success — reset the circuit
    state.failures = 0;
    state.state = 'closed';
    state.lastError = undefined;

    return result;
  } catch (err) {
    state.failures++;
    state.lastFailureTime = Date.now();
    state.lastError = err instanceof Error ? err.message : String(err);

    if (state.failures >= failureThreshold) {
      state.state = 'open';
      console.error(
        `[CircuitBreaker:${name}] Circuit OPENED after ${state.failures} failures. ` +
        `Last error: ${state.lastError}. Will retry in ${resetTimeoutMs / 1000}s.`
      );
    }

    throw err;
  }
}

/**
 * Get the current state of a circuit breaker (for monitoring/health checks).
 */
export function getCircuitState(name: string): CircuitState | undefined {
  return circuits.get(name);
}

// ---------------------------------------------------------------------------
// Structured Logger
// ---------------------------------------------------------------------------

export interface LogContext {
  correlationId: string;
  operation: string;
  [key: string]: unknown;
}

/**
 * Structured log helper that outputs JSON-formatted log lines.
 * In production, these can be parsed by log aggregators.
 */
export const structuredLog = {
  info(ctx: LogContext, message: string) {
    console.log(JSON.stringify({
      level: 'info',
      timestamp: new Date().toISOString(),
      correlationId: ctx.correlationId,
      operation: ctx.operation,
      message,
      ...omitKeys(ctx, ['correlationId', 'operation']),
    }));
  },

  warn(ctx: LogContext, message: string) {
    console.warn(JSON.stringify({
      level: 'warn',
      timestamp: new Date().toISOString(),
      correlationId: ctx.correlationId,
      operation: ctx.operation,
      message,
      ...omitKeys(ctx, ['correlationId', 'operation']),
    }));
  },

  error(ctx: LogContext, message: string, error?: unknown) {
    console.error(JSON.stringify({
      level: 'error',
      timestamp: new Date().toISOString(),
      correlationId: ctx.correlationId,
      operation: ctx.operation,
      message,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
      ...omitKeys(ctx, ['correlationId', 'operation']),
    }));
  },
};

function omitKeys(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!keys.includes(k)) result[k] = v;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Database Query Retry Helper
// ---------------------------------------------------------------------------

/**
 * Execute a database operation with retry logic optimized for serverless.
 * Specifically handles Prisma/pg connection failures during cold starts.
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  label = 'DB operation',
): Promise<T> {
  return withRetry(fn, {
    maxRetries: 2,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    jitter: 0.3,
    onRetry: (attempt, err, delay) => {
      console.warn(
        `[${label}] Retry ${attempt} after ${err.category} error (delay: ${Math.round(delay)}ms): ${err.message}`
      );
    },
  });
}
