'use client';

import { useState } from 'react';
import Link from 'next/link';

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  message: string;
  details?: string;
  duration?: number;
}

interface TestResponse {
  success: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    timestamp: string;
  };
  results: TestResult[];
  message: string;
}

export default function BlogSystemTestPage() {
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<TestResponse | null>(null);

  const runTests = async () => {
    setTesting(true);
    setTestResults(null);

    try {
      const response = await fetch('/api/test/blog-system');
      const data = await response.json();
      setTestResults(data);
    } catch (error) {
      setTestResults({
        success: false,
        summary: {
          total: 0,
          passed: 0,
          failed: 1,
          skipped: 0,
          timestamp: new Date().toISOString()
        },
        results: [],
        message: `Failed to run tests: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 py-12 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-6">
            <h1 className="text-3xl font-bold text-white mb-2">
              🧪 Blog System Automated Tests
            </h1>
            <p className="text-blue-100">
              Comprehensive testing to verify your blog system is working correctly
            </p>
          </div>

          {/* Content */}
          <div className="p-8">
            {/* Run Tests Button */}
            {!testResults && (
              <div className="text-center py-8">
                <div className="text-6xl mb-6">🔍</div>
                <h2 className="text-2xl font-bold text-gray-800 mb-4">
                  Ready to Test Your Blog System?
                </h2>
                <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
                  This will run automated tests to verify:
                </p>
                <ul className="text-left max-w-md mx-auto mb-8 space-y-2">
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Blog pages are accessible (/blog, /blog/setup)</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>API endpoints are responding</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Environment variables are configured</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>System is ready for blog generation</span>
                  </li>
                </ul>
                <button
                  onClick={runTests}
                  disabled={testing}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:shadow-lg transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {testing ? (
                    <>
                      <span className="inline-block animate-spin mr-2">⚙️</span>
                      Running Tests...
                    </>
                  ) : (
                    'Run All Tests'
                  )}
                </button>
              </div>
            )}

            {/* Test Results */}
            {testResults && (
              <div className="space-y-6">
                {/* Summary */}
                <div className={`rounded-lg p-6 ${testResults.success ? 'bg-green-50 border-2 border-green-200' : 'bg-red-50 border-2 border-red-200'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className={`text-2xl font-bold ${testResults.success ? 'text-green-800' : 'text-red-800'}`}>
                        {testResults.message}
                      </h2>
                      <p className="text-sm text-gray-600 mt-1">
                        Completed at {new Date(testResults.summary.timestamp).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-6xl">
                      {testResults.success ? '✅' : '❌'}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div className="bg-white rounded-lg p-3">
                      <div className="text-3xl font-bold text-gray-800">{testResults.summary.total}</div>
                      <div className="text-sm text-gray-600">Total Tests</div>
                    </div>
                    <div className="bg-white rounded-lg p-3">
                      <div className="text-3xl font-bold text-green-600">{testResults.summary.passed}</div>
                      <div className="text-sm text-gray-600">Passed</div>
                    </div>
                    <div className="bg-white rounded-lg p-3">
                      <div className="text-3xl font-bold text-red-600">{testResults.summary.failed}</div>
                      <div className="text-sm text-gray-600">Failed</div>
                    </div>
                    <div className="bg-white rounded-lg p-3">
                      <div className="text-3xl font-bold text-yellow-600">{testResults.summary.skipped}</div>
                      <div className="text-sm text-gray-600">Skipped</div>
                    </div>
                  </div>
                </div>

                {/* Detailed Results */}
                <div className="space-y-3">
                  <h3 className="text-xl font-bold text-gray-800">Detailed Results</h3>
                  {testResults.results.map((result, idx) => (
                    <div
                      key={idx}
                      className={`rounded-lg p-4 border-2 ${
                        result.status === 'passed'
                          ? 'bg-green-50 border-green-200'
                          : result.status === 'failed'
                          ? 'bg-red-50 border-red-200'
                          : 'bg-yellow-50 border-yellow-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-semibold text-gray-800 mb-1">
                            {result.message}
                          </div>
                          {result.details && (
                            <div className="text-sm text-gray-600">{result.details}</div>
                          )}
                        </div>
                        {result.duration && (
                          <div className="text-xs text-gray-500 ml-4">
                            {result.duration}ms
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-4 justify-center pt-6 border-t">
                  <button
                    onClick={runTests}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg transform hover:scale-105 transition-all duration-200"
                  >
                    Run Tests Again
                  </button>
                  {testResults.success ? (
                    <Link
                      href="/blog"
                      className="bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors inline-block"
                    >
                      Visit Blog →
                    </Link>
                  ) : (
                    <Link
                      href="/blog/setup"
                      className="bg-yellow-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-yellow-700 transition-colors inline-block"
                    >
                      Go to Setup →
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-8 py-4 border-t border-gray-200">
            <p className="text-sm text-gray-600 text-center">
              💡 Tip: Run these tests after deploying to verify everything works correctly
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
