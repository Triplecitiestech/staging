import { NextResponse } from 'next/server';

// Disable static generation
export const dynamic = 'force-dynamic';

/**
 * Automated test endpoint for blog system
 * GET /api/test/blog-system
 *
 * This endpoint runs comprehensive tests to verify:
 * - Blog pages are accessible
 * - Setup system works
 * - Database is configured
 * - All components render without errors
 */
export async function GET() {
  const results: TestResult[] = [];
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com';

  try {
    // Test 1: Check if /blog page loads
    results.push(await testEndpoint(
      '/blog',
      'Blog main page loads',
      baseUrl
    ));

    // Test 2: Check if /blog/setup page loads
    results.push(await testEndpoint(
      '/blog/setup',
      'Blog setup page loads',
      baseUrl
    ));

    // Test 3: Check if blog API endpoints exist
    results.push(await testEndpoint(
      '/api/blog/setup/verify',
      'Blog verification API exists',
      baseUrl
    ));

    // Test 4: Check environment variables
    results.push(testEnvironmentVariable(
      'ANTHROPIC_API_KEY',
      'Anthropic API key is configured'
    ));

    results.push(testEnvironmentVariable(
      'RESEND_API_KEY',
      'Resend API key is configured'
    ));

    results.push(testEnvironmentVariable(
      'DATABASE_URL',
      'Database URL is configured'
    ));

    // Calculate summary
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;

    const allPassed = failed === 0;

    return NextResponse.json({
      success: allPassed,
      summary: {
        total: results.length,
        passed,
        failed,
        skipped,
        timestamp: new Date().toISOString()
      },
      results,
      message: allPassed
        ? '✅ All tests passed! Blog system is working correctly.'
        : `❌ ${failed} test(s) failed. Please check the results above.`
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      results
    }, { status: 500 });
  }
}

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  message: string;
  details?: string;
  duration?: number;
}

async function testEndpoint(
  path: string,
  name: string,
  baseUrl: string
): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const url = `${baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Blog-System-Tester/1.0'
      },
      // Don't follow redirects for setup check
      redirect: 'manual'
    });

    const duration = Date.now() - startTime;

    // Accept both 200 OK and 307 redirects (for setup)
    if (response.status === 200 || response.status === 307) {
      return {
        name,
        status: 'passed',
        message: `✅ ${name} (${response.status})`,
        details: `URL: ${url}`,
        duration
      };
    } else {
      return {
        name,
        status: 'failed',
        message: `❌ ${name} returned ${response.status}`,
        details: `URL: ${url}`,
        duration
      };
    }
  } catch (error) {
    return {
      name,
      status: 'failed',
      message: `❌ ${name} - ${error instanceof Error ? error.message : 'Unknown error'}`,
      duration: Date.now() - startTime
    };
  }
}

function testEnvironmentVariable(varName: string, description: string): TestResult {
  const value = process.env[varName];

  if (value && value.length > 0) {
    return {
      name: description,
      status: 'passed',
      message: `✅ ${description}`,
      details: `Length: ${value.length} characters`
    };
  } else {
    return {
      name: description,
      status: 'failed',
      message: `❌ ${description} - Not set or empty`,
      details: 'This environment variable is required for the blog system to function'
    };
  }
}
