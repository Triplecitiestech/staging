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
  | 'connection'      // DB/network connection failures
  | 'timeout'         // Operation timed out
  | 'rate_limit'      // Rate limited by external service
  | 'server_error'    // 5xx from external service
  | 'data_violation'  // Upstream schema rule broken (missing/paired required field)
  | 'auth'            // Authentication/authorization failure
  | 'validation'      // Bad input / client error
  | 'unknown';        // Unclassified

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
 * Bodies that name a SCHEMA rule: a required field was missing, or two fields
 * that must be supplied together were not.
 *
 * These are never retryable — the identical call can never succeed — but the
 * HTTP STATUS does not say so. Autotask answers a schema violation with
 * `500 {"errors":["Data violation: When assigning a Resource, you must assign
 * both a assignedResourceID and assignedResourceRoleID."]}`, which read as a
 * server error and sent a caller into a pointless retry loop (2026-07-29).
 * So the body decides, and it is checked BEFORE any status pattern.
 *
 * Keep this list tight and specific. A loose phrase like "is required" would
 * also swallow ordinary 400s, whose caller-fixable "correct the argument"
 * classification is already right.
 */
const DATA_VIOLATION_PATTERNS = [
  'data violation',
  'missing required field',
  'required field is missing',
  'must assign both',
];

/**
 * A 5xx whose body is a STRUCTURED error list is the vendor rejecting the
 * REQUEST, not reporting an outage.
 *
 * 2026-08-25, building Wilmar project 55: Autotask answered three different
 * request-shape problems with HTTP 500 and a JSON `errors[]` array —
 *
 *   {"errors":["The Task \"...\" has an invalid Resource and Role combination.",
 *              "billingCodeID is a required field when a Resource ... is assigned to a Task",
 *              "departmentID is a required field when a Resource ... is assigned to a Task"]}
 *   {"errors":["Picklist value [3] does not exist for noteType. ; on record number [1]."]}
 *
 * None matched DATA_VIOLATION_PATTERNS above, so they fell through to the bare
 * '500' status test and classified as server_error → TRANSIENT → "wait briefly
 * and retry". That advice can never work: the request is wrong, not the
 * service. The same batch also classified identical failures inconsistently
 * (some server_error, some connection) because the substring tests were
 * competing over incidental words in the body.
 *
 * The rule: an errors[] array means the vendor UNDERSTOOD the request well
 * enough to enumerate what is wrong with it. Deliberately narrow — a genuine
 * outage returns HTML, an empty body, or a gateway page, never this shape —
 * and messages that read as generic server failure are excluded below so a
 * vendor wrapping "Internal server error" in an errors array still retries.
 */
const STRUCTURED_ERRORS_RE = /"errors"\s*:\s*\[/i;

/**
 * Does a structured error message REFER TO THE REQUEST?
 *
 * This is the general rule that decides whether an `errors[]` body is the
 * vendor rejecting what was sent, or the vendor reporting its own fault. It
 * replaced a PHRASE ALLOWLIST on 2026-08-28, and the reason it replaced it is
 * the failure the allowlist caused:
 *
 *   PATCH Tickets 500 {"errors":["The companyLocationID[285] cannot be
 *   associated with the Ticket. The CompanyLocation must belong to the
 *   Ticket's, ConfigurationItem's, or the Contact's Company."]}
 *
 * matched none of the thirteen listed phrases, fell through to the bare '500'
 * status test, and came back TRANSIENT / fixableBy: retry — telling the caller
 * to retry a deterministic failure that this connector's own taxonomy says
 * must never be retried unchanged. An allowlist of sentences can only ever
 * recognise the rejections someone has already met; the vendor writes new ones
 * whenever it likes.
 *
 * The general rule, and the only signal that actually separates the two cases:
 * a REJECTION talks about the request — it names a field, quotes an id the
 * request carried, or states a rule the request broke. A FAULT does not; it
 * says something went wrong on the server and nothing about what was sent.
 *
 * So the three signals below are all "the message refers to the request":
 *   1. a camelCase identifier  — companyLocationID, assignedResourceRoleID
 *   2. a bracketed id or value — [285], [3]
 *   3. a rule statement        — must / cannot / is not valid / required
 *
 * The direction of the original allowlist is preserved: this is still POSITIVE
 * recognition, and an unrecognised body still falls through and keeps
 * retrying. Only the recognition itself is general instead of enumerated.
 * `{"errors":["internal error"]}`, `["Internal server error, please try
 * again"]` and `["Something went wrong"]` match none of the three and stay
 * transient, which is what the real-outage retry tests depend on.
 */
const CAMEL_CASE_IDENTIFIER = /\b[a-z]+[A-Z][A-Za-z]*\b/;
const BRACKETED_VALUE = /\[[^\]]{1,60}\]/;
const RULE_STATEMENT =
  /\b(must|cannot|can ?not|may not|is not|are not|does not|do not|invalid|not valid|required|missing|not permitted|not allowed|already|exceeds|too long|out of range|belongs? to|associated with|duplicate)\b/;

function describesTheRequest(text: string, options: { allowBrackets?: boolean } = {}): boolean {
  const { allowBrackets = true } = options;
  return (
    // Case-SENSITIVE: a camelCase identifier is only a field name if the
    // capitalisation survived, so this one must not see a lowercased string.
    CAMEL_CASE_IDENTIFIER.test(text) ||
    (allowBrackets && BRACKETED_VALUE.test(text)) ||
    RULE_STATEMENT.test(text.toLowerCase())
  );
}

/**
 * THE CLOSED HALF OF THE PROBLEM: what a 5xx FAULT sounds like.
 *
 * Recognition used to run one way only — positively, looking for rejections —
 * and that direction can never be finished, because the vendor invents a new
 * rejection sentence whenever it likes. It is the same shape this repo has now
 * paid for five times (`periodType`, `parentIdField`, the errors[] phrase
 * list, `killSwitchState`, this): a check built from previously-observed cases
 * makes the next unobserved case the guaranteed next bug.
 *
 * The asymmetry that fixes it: the REJECTION vocabulary is open-ended, but the
 * FAULT vocabulary is tiny, stable and genuinely closed. A 5xx that is really
 * an outage says something went wrong with the SERVER and nothing about what
 * was sent — it has a handful of ways to say that, and they have not changed
 * in twenty years of HTTP. So faults are what gets enumerated, and everything
 * else a vendor took the trouble to write about the request is a rejection.
 *
 * Verified against the live 2026-09-21 example this could not classify:
 *
 *   {"errors":["This time entry is for a recurring Service Contract. Whether
 *    or not it shows on the Invoice is determined by the Company's Show
 *    Recurring Service Contract Labor Invoice configuration setting."]}
 *
 * It names no camelCase field, quotes no bracketed id and states no rule in
 * the listed words, so all three positive signals missed it and the caller was
 * told to retry a configuration fact that will never change on its own.
 */
const FAULT_VOCABULARY = [
  'internal error',
  'internal server error',
  'server error',
  'the server encountered',
  'an error occurred while processing',
  'unexpected error',
  'unknown error',
  'something went wrong',
  'please try again',
  'try again later',
  'service unavailable',
  'temporarily unavailable',
  'bad gateway',
  'gateway timeout',
  'gateway time-out',
  'request timed out',
  'out of memory',
  'general failure',
];

/** Does this body read as the server reporting its OWN fault? */
function soundsLikeAFault(text: string): boolean {
  const lower = text.toLowerCase();
  return FAULT_VOCABULARY.some(p => lower.includes(p));
}

/** Markup means an error PAGE, which carries no vendor statement about the request. */
const LOOKS_LIKE_MARKUP = /<\s*(!doctype|html|head|body|title|h1|p|div)\b/i;

/**
 * Pull the 5xx status and the response body out of an AutotaskClient-style
 * error message: `Autotask PATCH Tickets failed (500): <body>`.
 *
 * This exists so the BODY can decide before the STATUS does even when the body
 * is not a JSON errors[] array. Before this, a 5xx whose body named a field in
 * plain text — `String value exceeds maximum length (field:x).` — fell past the
 * structured check straight onto the bare '500' test and came back TRANSIENT /
 * "wait briefly and retry" for a deterministic rejection.
 */
function serverErrorBody(raw: string): { status: number; body: string } | null {
  const m = raw.match(/\((5\d\d)\)\s*:?\s*([\s\S]*)$/);
  if (!m) return null;
  const body = m[2].trim();
  return body ? { status: Number(m[1]), body } : null;
}

/**
 * Within a structured rejection, does the body describe CURRENT STATE blocking
 * the request rather than the request's shape? Those are two different fixes:
 * a shape problem is caller-fixable (change the argument), a state problem is
 * not (re-read, or a human resolves it).
 */
const STATE_DEPENDENT_IN_BODY = [
  // Cross-record ASSOCIATION conflicts. The blocking value is one the record
  // already holds, or one that belongs to a different parent — so the fix is a
  // change to state (clear it, or move the other record too), not a corrected
  // argument. This is the family the 2026-08-28 companyLocationID re-parent
  // failure belongs to: the caller never sent companyLocationID at all.
  'cannot be associated',
  'must belong to',
  'does not belong to',
  'belongs to a different',
  'already exists',
  'already been',
  'is currently',
  'cannot be deleted',
  'cannot be modified',
  'is in use',
  'has been closed',
  'no longer',
  'is locked',
  'would create a circular',
];

interface StructuredErrorBody {
  messages: string[];
  /**
   * The body could not be parsed (our client slices responses at 500 chars),
   * so `messages` is raw text that still carries JSON punctuation. The bracket
   * signal is suppressed for these: `["...` would otherwise look like a
   * bracketed id the request carried, when it is only the array literal.
   */
  truncated: boolean;
}

/** Extract the messages from an Autotask-style `{"errors":[...]}` body. */
function structuredErrorMessages(raw: string): StructuredErrorBody | null {
  if (!STRUCTURED_ERRORS_RE.test(raw)) return null;
  const start = raw.search(/[[{]/);
  if (start < 0) return null;
  try {
    const parsed = JSON.parse(raw.slice(start)) as { errors?: unknown };
    const errors = parsed?.errors;
    if (!Array.isArray(errors)) return null;
    const messages = errors
      .map((e) => (typeof e === 'string' ? e : (e as { message?: unknown })?.message))
      .filter((m): m is string => typeof m === 'string' && m.trim().length > 0);
    return messages.length ? { messages, truncated: false } : null;
  } catch {
    // Truncated body. The array opened, so the shape is still a structured
    // rejection — fall back to the text after `"errors":[`, which is the
    // message content rather than the wrapper.
    const openedAt = raw.search(STRUCTURED_ERRORS_RE);
    const afterArray = raw.slice(raw.indexOf('[', openedAt) + 1);
    return { messages: [afterArray || raw], truncated: true };
  }
}

/**
 * Classify an error to determine if it's transient (retryable) or permanent.
 */
export function classifyError(err: unknown): ClassifiedError {
  const message = err instanceof Error ? err.message : String(err);
  const lowerMessage = message.toLowerCase();

  // Schema violation — checked FIRST, because it is the only signal here that
  // the status code actively contradicts (Autotask returns 500 for these) and
  // the phrases are specific enough that nothing transient matches them.
  if (DATA_VIOLATION_PATTERNS.some(p => lowerMessage.includes(p))) {
    return { category: 'data_violation', isTransient: false, message, original: err };
  }

  // Structured errors[] body — the vendor enumerated what is wrong with the
  // REQUEST. Checked before every status test for the same reason as above:
  // Autotask returns 500 for these, and the status is the misleading part.
  // RATE LIMITS FIRST, and before anything reads the body.
  //
  // The body-over-status rule below exists because Autotask MISUSES 500 for
  // request rejections. A 429 is not misused — it means exactly what it says,
  // and it must retry. Moving the body check above the status test without this
  // guard broke that: `429 {"errors":["rate limited"]}` has a structured body,
  // names no fault, names no field, and so fell into the rejection default and
  // stopped retrying a limit that clears by itself.
  if (RATE_LIMIT_PATTERNS.some(p => lowerMessage.includes(p.toLowerCase()))) {
    return { category: 'rate_limit', isTransient: true, message, original: err };
  }

  // Whether the status is one Autotask is known to misuse. The body only gets
  // to overrule a status that lies, and 5xx is the only one that does.
  const fiveXX = serverErrorBody(message);

  const structured = structuredErrorMessages(message);
  if (structured) {
    const joined = structured.messages.join(' ');
    // A FAULT gets first refusal, and it is the only thing enumerated here.
    // `{"errors":["internal error"]}` is a server reporting itself, not a
    // rejection, and it must keep retrying.
    if (!soundsLikeAFault(joined)) {
      // State FIRST, and as its own recognition route: naming the state that
      // blocks the request ("has been closed", "cannot be associated") is a
      // reference to the request just as much as naming a field is. It routes to
      // a different owner than a malformed argument — the caller cannot correct
      // an argument to make a closed record accept a write.
      if (STATE_DEPENDENT_IN_BODY.some(p => joined.toLowerCase().includes(p))) {
        return { category: 'data_violation', isTransient: false, message, original: err };
      }
      if (describesTheRequest(joined, { allowBrackets: !structured.truncated })) {
        return { category: 'validation', isTransient: false, message, original: err };
      }
      // The vendor enumerated a problem in an errors[] array, did not phrase it
      // as its own fault, and did not trip any of the three positive signals.
      //
      // This used to fall through to the status test and come back TRANSIENT.
      // It is now a rejection, because the errors[] SHAPE is itself the vendor
      // saying "here is what is wrong with what you sent" — the positive
      // signals were only ever there to spare generic faults wrapped in one,
      // and soundsLikeAFault now does that job directly and by name.
      //
      // data_violation rather than validation is the conservative landing:
      // PRECONDITION_FAILED says "re-read state, never retry unchanged" and
      // blames nobody, where INVALID_INPUT would tell the caller to correct an
      // argument the message never named. The live recurring-Service-Contract
      // rejection is exactly this case.
      //
      // Gated on a 5xx: on any other status the status itself is trustworthy,
      // and letting an unrecognised body overrule it would suppress retries the
      // status legitimately asks for.
      if (fiveXX) return { category: 'data_violation', isTransient: false, message, original: err };
    }
  }

  // UNSTRUCTURED 5xx body. The body still decides before the status does: a
  // vendor that wrote a sentence about the request rejected it, whatever the
  // status code says and whatever JSON shape it did or did not use. An empty
  // body, or an HTML error page, carries no such sentence and falls through to
  // the status tests below — which is what keeps a real outage retrying.
  if (!structured && fiveXX && !LOOKS_LIKE_MARKUP.test(fiveXX.body) && !soundsLikeAFault(fiveXX.body)) {
    if (STATE_DEPENDENT_IN_BODY.some(p => fiveXX.body.toLowerCase().includes(p))) {
      return { category: 'data_violation', isTransient: false, message, original: err };
    }
    if (describesTheRequest(fiveXX.body)) {
      return { category: 'validation', isTransient: false, message, original: err };
    }
    // Unstructured AND unrecognised: unlike an errors[] array, a bare body is
    // not by itself a statement about the request, so this one keeps retrying.
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
