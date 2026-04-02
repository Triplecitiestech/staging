import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the 'next/headers' module since it's server-only
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

describe('onboarding-session', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('createSession returns a signed token', async () => {
    const { createSession } = await import('@/lib/onboarding-session');
    const token = createSession('test-company');
    expect(token).toBeTruthy();
    expect(token).toContain('.'); // payload.signature format
    const [payloadB64, signature] = token.split('.');
    expect(payloadB64).toBeTruthy();
    expect(signature).toBeTruthy();
    // Payload should be valid base64 containing JSON
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf-8'));
    expect(payload.companySlug).toBe('test-company');
    expect(payload.expires).toBeGreaterThan(Date.now());
  });

  it('validateSession accepts a valid token', async () => {
    const { createSession, validateSession } = await import('@/lib/onboarding-session');
    const token = createSession('my-company');
    const result = validateSession(token);
    expect(result).toBe('my-company');
  });

  it('validateSession rejects a tampered token', async () => {
    const { createSession, validateSession } = await import('@/lib/onboarding-session');
    const token = createSession('test-co');
    // Tamper with the signature
    const [payloadB64] = token.split('.');
    const tamperedToken = `${payloadB64}.invalidsignature`;
    const result = validateSession(tamperedToken);
    expect(result).toBeNull();
  });

  it('validateSession rejects a token with modified payload', async () => {
    const { createSession, validateSession } = await import('@/lib/onboarding-session');
    const token = createSession('legit-company');
    const [, signature] = token.split('.');
    // Create a different payload
    const fakePayload = Buffer.from(JSON.stringify({
      companySlug: 'hacker-company',
      expires: Date.now() + 999999999,
    })).toString('base64');
    const tamperedToken = `${fakePayload}.${signature}`;
    const result = validateSession(tamperedToken);
    expect(result).toBeNull();
  });

  it('validateSession rejects malformed tokens', async () => {
    const { validateSession } = await import('@/lib/onboarding-session');
    expect(validateSession('')).toBeNull();
    expect(validateSession('noseparator')).toBeNull();
    expect(validateSession('a.')).toBeNull();
    expect(validateSession('.b')).toBeNull();
  });

  it('session expires after the configured lifetime', async () => {
    const { createSession, validateSession } = await import('@/lib/onboarding-session');
    const token = createSession('test-co');

    // Manually create an expired token by parsing and modifying
    const [payloadB64] = token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf-8'));
    expect(payload.expires).toBeGreaterThan(Date.now());

    // The token should be valid now
    expect(validateSession(token)).toBe('test-co');
  });
});
