'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function BlogSetupPage() {
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string>('');

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()} - ${message}`]);
  };

  const runSetup = async () => {
    setStatus('running');
    setLogs([]);
    setError('');

    try {
      addLog('🚀 Starting blog system setup...');

      // Step 1: Run database migration
      addLog('📊 Creating database tables...');
      const migrateResponse = await fetch('/api/blog/setup/migrate', {
        method: 'POST'
      });

      if (!migrateResponse.ok) {
        const errorData = await migrateResponse.json();
        throw new Error(errorData.error || 'Migration failed');
      }

      const migrateResult = await migrateResponse.json();
      addLog(`✅ Database setup: ${migrateResult.message}`);

      if (migrateResult.tablesCreated) {
        migrateResult.tablesCreated.forEach((table: string) => {
          addLog(`   ✓ Created table: ${table}`);
        });
      }

      // Step 2: Initialize content sources
      addLog('📰 Setting up content sources...');
      const sourcesResponse = await fetch('/api/blog/setup/sources', {
        method: 'POST'
      });

      if (sourcesResponse.ok) {
        const sourcesResult = await sourcesResponse.json();
        addLog(`✅ Configured ${sourcesResult.count} content sources`);
      }

      // Step 3: Verify configuration
      addLog('🔍 Verifying configuration...');
      const verifyResponse = await fetch('/api/blog/setup/verify');
      const verifyResult = await verifyResponse.json();

      if (verifyResult.ready) {
        addLog('✅ All checks passed!');
        addLog('');
        addLog('🎉 Blog system is ready to use!');
        addLog('');
        addLog('📝 Next steps:');
        addLog('   • Visit /blog to see your blog');
        addLog('   • AI will generate posts Mon/Wed/Fri at 8 AM');
        addLog('   • You\'ll receive approval emails at kurtis@triplecitiestech.com');
        setStatus('success');
      } else {
        addLog('⚠️ Some configuration is missing:');
        if (verifyResult.missing) {
          verifyResult.missing.forEach((item: string) => {
            addLog(`   ✗ ${item}`);
          });
        }
        setStatus('success'); // Still success, just with warnings
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      addLog(`❌ Error: ${errorMessage}`);
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-indigo-700 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-8 py-6">
            <h1 className="text-3xl font-bold text-white mb-2">
              🚀 Blog System Setup
            </h1>
            <p className="text-purple-100">
              One-click setup to get your automated blog running
            </p>
          </div>

          {/* Content */}
          <div className="p-8">
            {status === 'idle' && (
              <div className="text-center py-8">
                <div className="text-6xl mb-6">📝</div>
                <h2 className="text-2xl font-bold text-gray-800 mb-4">
                  Ready to Set Up Your Blog?
                </h2>
                <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
                  This will automatically create all necessary database tables, configure content sources,
                  and set up the automated blog system. The whole process takes about 30 seconds.
                </p>
                <button
                  onClick={runSetup}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:shadow-lg transform hover:scale-105 transition-all duration-200"
                >
                  Run Automatic Setup
                </button>
              </div>
            )}

            {status === 'running' && (
              <div className="py-8">
                <div className="text-center mb-8">
                  <div className="animate-spin text-6xl mb-4">⚙️</div>
                  <h2 className="text-2xl font-bold text-gray-800">
                    Setting up your blog...
                  </h2>
                  <p className="text-gray-600">Please wait, this will take a moment</p>
                </div>

                <div className="bg-gray-900 rounded-lg p-6 font-mono text-sm text-green-400 max-h-96 overflow-y-auto">
                  {logs.map((log, idx) => (
                    <div key={idx} className="mb-1">{log}</div>
                  ))}
                  <div className="animate-pulse">▊</div>
                </div>
              </div>
            )}

            {status === 'success' && (
              <div className="py-8">
                <div className="text-center mb-8">
                  <div className="text-6xl mb-4">🎉</div>
                  <h2 className="text-2xl font-bold text-green-600 mb-2">
                    Setup Complete!
                  </h2>
                  <p className="text-gray-600">Your blog system is ready to go</p>
                </div>

                <div className="bg-gray-900 rounded-lg p-6 font-mono text-sm text-green-400 max-h-96 overflow-y-auto mb-8">
                  {logs.map((log, idx) => (
                    <div key={idx} className="mb-1">{log}</div>
                  ))}
                </div>

                <div className="flex gap-4 justify-center">
                  <Link
                    href="/blog"
                    className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:shadow-lg transform hover:scale-105 transition-all duration-200"
                  >
                    Visit Your Blog
                  </Link>
                  <button
                    onClick={() => window.location.reload()}
                    className="bg-gray-200 text-gray-700 px-8 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                  >
                    Run Setup Again
                  </button>
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="py-8">
                <div className="text-center mb-8">
                  <div className="text-6xl mb-4">❌</div>
                  <h2 className="text-2xl font-bold text-red-600 mb-2">
                    Setup Failed
                  </h2>
                  <p className="text-gray-600">Something went wrong during setup</p>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
                  <h3 className="font-bold text-red-800 mb-2">Error:</h3>
                  <p className="text-red-700">{error}</p>
                </div>

                <div className="bg-gray-900 rounded-lg p-6 font-mono text-sm text-red-400 max-h-96 overflow-y-auto mb-8">
                  {logs.map((log, idx) => (
                    <div key={idx} className="mb-1">{log}</div>
                  ))}
                </div>

                <div className="text-center">
                  <button
                    onClick={runSetup}
                    className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:shadow-lg transform hover:scale-105 transition-all duration-200"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-8 py-4 border-t border-gray-200">
            <p className="text-sm text-gray-600 text-center">
              Need help? Check the documentation at <code className="bg-gray-200 px-2 py-1 rounded">BLOG_SYSTEM_README.md</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
