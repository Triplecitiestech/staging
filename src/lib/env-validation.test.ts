import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateEnvironment } from '@/lib/env-validation';

describe('validateEnvironment', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns no missing vars when all critical vars are set', () => {
    process.env.DATABASE_URL = 'postgres://localhost/test';
    process.env.NEXTAUTH_SECRET = 'secret';
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    process.env.AZURE_AD_CLIENT_ID = 'id';
    process.env.AZURE_AD_CLIENT_SECRET = 'secret';
    process.env.AZURE_AD_TENANT_ID = 'tenant';

    const { missing } = validateEnvironment();
    expect(missing).toHaveLength(0);
  });

  it('reports missing critical vars', () => {
    delete process.env.DATABASE_URL;
    delete process.env.NEXTAUTH_SECRET;
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    process.env.AZURE_AD_CLIENT_ID = 'id';
    process.env.AZURE_AD_CLIENT_SECRET = 'secret';
    process.env.AZURE_AD_TENANT_ID = 'tenant';

    const { missing } = validateEnvironment();
    expect(missing).toContain('DATABASE_URL');
    expect(missing).toContain('NEXTAUTH_SECRET');
  });

  it('reports missing recommended vars as warnings', () => {
    // Set all critical vars
    process.env.DATABASE_URL = 'postgres://localhost/test';
    process.env.NEXTAUTH_SECRET = 'secret';
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    process.env.AZURE_AD_CLIENT_ID = 'id';
    process.env.AZURE_AD_CLIENT_SECRET = 'secret';
    process.env.AZURE_AD_TENANT_ID = 'tenant';
    // Don't set recommended vars
    delete process.env.ONBOARDING_SIGNING_KEY;
    delete process.env.CRON_SECRET;

    const { warnings } = validateEnvironment();
    expect(warnings).toContain('ONBOARDING_SIGNING_KEY');
    expect(warnings).toContain('CRON_SECRET');
  });
});
