#!/usr/bin/env node

/**
 * Blog System End-to-End Test Script
 * Tests all critical blog endpoints to ensure the system works
 */

const baseUrl = process.env.TEST_URL || 'http://localhost:3000';

const tests = [];
let passed = 0;
let failed = 0;

function log(message, type = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warn: '\x1b[33m',
    reset: '\x1b[0m'
  };
  const prefix = {
    info: 'ℹ',
    success: '✓',
    error: '✗',
    warn: '⚠'
  };
  console.log(`${colors[type]}${prefix[type]} ${message}${colors.reset}`);
}

async function test(name, fn) {
  try {
    log(`Testing: ${name}`, 'info');
    await fn();
    log(`PASS: ${name}`, 'success');
    passed++;
  } catch (error) {
    log(`FAIL: ${name}`, 'error');
    console.error(`  Error: ${error.message}`);
    if (error.details) {
      console.error(`  Details:`, error.details);
    }
    failed++;
  }
}

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    const contentType = response.headers.get('content-type');
    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    throw new Error(`Request failed: ${error.message}`);
  }
}

async function runTests() {
  log('='.repeat(60), 'info');
  log('Blog System End-to-End Test Suite', 'info');
  log(`Target: ${baseUrl}`, 'info');
  log('='.repeat(60), 'info');
  console.log('');

  // Test 1: Verify endpoint
  await test('GET /api/blog/setup/verify - Blog system verification', async () => {
    const res = await request('/api/blog/setup/verify');
    if (!res.ok) {
      throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    }
    log(`  Status: ${res.data.status || 'Unknown'}`, 'info');
    if (res.data.missing && res.data.missing.length > 0) {
      log(`  Missing config: ${res.data.missing.join(', ')}`, 'warn');
    }
  });

  // Test 2: Create/migrate tables
  await test('POST /api/blog/setup/migrate - Database migration', async () => {
    const res = await request('/api/blog/setup/migrate', { method: 'POST' });
    if (!res.ok) {
      const error = new Error(`Status ${res.status}`);
      error.details = res.data;
      throw error;
    }
    if (res.data.tablesCreated && res.data.tablesCreated.length > 0) {
      log(`  Tables: ${res.data.tablesCreated.join(', ')}`, 'info');
    }
  });

  // Test 3: Guidelines API
  await test('GET /api/blog/settings/guidelines - Get AI guidelines', async () => {
    const res = await request('/api/blog/settings/guidelines');
    if (!res.ok) {
      throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    }
    if (!res.data.guidelines || typeof res.data.guidelines !== 'string') {
      throw new Error('Guidelines should be a non-empty string');
    }
    log(`  Guidelines length: ${res.data.guidelines.length} chars`, 'info');
  });

  // Test 4: Create first blog post
  await test('GET /api/blog/create-first-post - Create initial post', async () => {
    const res = await request('/api/blog/create-first-post');
    if (!res.ok) {
      const error = new Error(`Status ${res.status}`);
      error.details = res.data;
      throw error;
    }
    if (!res.data.post || !res.data.post.slug) {
      throw new Error('Post should have a slug');
    }
    log(`  Created post: ${res.data.post.title}`, 'info');
    log(`  URL: ${res.data.post.url}`, 'info');
  });

  // Test 5: Verify tables exist and can be queried
  await test('Database tables query check', async () => {
    const res = await request('/api/blog/setup/verify');
    if (!res.ok) {
      throw new Error(`Verification failed: ${res.status}`);
    }
    if (!res.data.checks || !res.data.checks.database) {
      throw new Error('Database check failed');
    }
    log(`  Database: ${res.data.checks.database ? 'OK' : 'FAIL'}`, res.data.checks.database ? 'success' : 'error');
    log(`  Categories: ${res.data.checks.categories ? 'OK' : 'FAIL'}`, res.data.checks.categories ? 'success' : 'error');
  });

  // Summary
  console.log('');
  log('='.repeat(60), 'info');
  log(`Test Results: ${passed} passed, ${failed} failed`, failed === 0 ? 'success' : 'error');
  log('='.repeat(60), 'info');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  console.error(error);
  process.exit(1);
});
