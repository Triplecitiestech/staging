'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminHeader from '@/components/admin/AdminHeader';

interface PlatformStatus {
  status: 'not_connected' | 'partially_connected' | 'connected';
  fields: Record<string, { configured: boolean; hint?: string }>;
  updatedAt?: string;
}

interface TestResult {
  platform: string;
  connected: boolean;
  details?: Record<string, string>;
  error?: string;
}

const PLATFORMS = [
  {
    id: 'facebook',
    name: 'Facebook',
    icon: 'f',
    color: 'bg-blue-600',
    borderColor: 'border-blue-500',
    fields: [
      { key: 'facebook_access_token', label: 'Page Access Token', type: 'password' as const, placeholder: 'EAAxxxxxxx...' },
      { key: 'facebook_page_id', label: 'Page ID', type: 'text' as const, placeholder: '123456789012345' }
    ],
    setupSteps: [
      'Go to <a href="https://developers.facebook.com" target="_blank" class="text-blue-400 underline">developers.facebook.com</a> and create a Meta App (type: Business)',
      'Under "Add Products", add <strong>Facebook Login</strong> and <strong>Pages API</strong>',
      'In Facebook Login settings, add your domain as a Valid OAuth Redirect URI',
      'Go to <strong>Tools > Graph API Explorer</strong>',
      'Select your app, then click <strong>Get User Access Token</strong>',
      'Select permissions: <code class="bg-slate-700 px-1 rounded">pages_manage_posts</code>, <code class="bg-slate-700 px-1 rounded">pages_read_engagement</code>, <code class="bg-slate-700 px-1 rounded">pages_read_user_content</code>',
      'Click <strong>Generate Access Token</strong> and authorize your Facebook account',
      'Exchange for a <strong>Page Access Token</strong>: In the Graph API Explorer, change the token dropdown from "User Token" to your Page',
      'Exchange the short-lived token for a <strong>long-lived token</strong> via: <code class="bg-slate-700 px-1 rounded text-xs">GET /oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=SHORT_TOKEN</code>',
      'Your <strong>Page ID</strong> is visible in the Graph API Explorer or in your Facebook Page\'s About section'
    ]
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: 'ig',
    color: 'bg-rose-600',
    borderColor: 'border-rose-500',
    fields: [
      { key: 'instagram_access_token', label: 'Access Token', type: 'password' as const, placeholder: 'IGQxxxxxxx...' },
      { key: 'instagram_account_id', label: 'Business Account ID', type: 'text' as const, placeholder: '17841400000000000' }
    ],
    setupSteps: [
      'Instagram posting requires a <strong>Facebook Business Page</strong> connected to your Instagram Business/Creator account',
      'Complete the Facebook setup above first — Instagram uses the same Meta App',
      'In your Meta App, add the <strong>Instagram Graph API</strong> product',
      'Connect your Instagram account to your Facebook Page (Instagram Settings > Account > Linked Accounts)',
      'In the Graph API Explorer, use the Facebook Page token and query: <code class="bg-slate-700 px-1 rounded text-xs">GET /me/accounts</code>',
      'For each page, query: <code class="bg-slate-700 px-1 rounded text-xs">GET /{page_id}?fields=instagram_business_account</code>',
      'The <code class="bg-slate-700 px-1 rounded">instagram_business_account.id</code> is your Business Account ID',
      'Add permissions: <code class="bg-slate-700 px-1 rounded">instagram_basic</code>, <code class="bg-slate-700 px-1 rounded">instagram_content_publish</code>',
      '<strong>Note:</strong> Instagram requires an image URL for every post. Posts without images will be skipped.'
    ]
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: 'in',
    color: 'bg-sky-700',
    borderColor: 'border-sky-500',
    fields: [
      { key: 'linkedin_access_token', label: 'Access Token', type: 'password' as const, placeholder: 'AQXxxxxxxx...' },
      { key: 'linkedin_org_id', label: 'Organization ID', type: 'text' as const, placeholder: '12345678' }
    ],
    setupSteps: [
      'Go to <a href="https://www.linkedin.com/developers" target="_blank" class="text-blue-400 underline">linkedin.com/developers</a> and create a new app',
      'Under <strong>Products</strong>, request access to <strong>Share on LinkedIn</strong> and <strong>Sign In with LinkedIn using OpenID Connect</strong>',
      'In the <strong>Auth</strong> tab, add your redirect URL and note your Client ID and Client Secret',
      'Generate an OAuth 2.0 access token with scopes: <code class="bg-slate-700 px-1 rounded">w_member_social</code>, <code class="bg-slate-700 px-1 rounded">w_organization_social</code>',
      'You can use the LinkedIn OAuth playground or a tool like Postman to complete the OAuth flow',
      'Your <strong>Organization ID</strong> is in your Company Page URL: linkedin.com/company/<strong>12345678</strong>',
      'Alternatively, query: <code class="bg-slate-700 px-1 rounded text-xs">GET /v2/organizationAcls?q=roleAssignee</code> to find your org ID',
      '<strong>Note:</strong> LinkedIn tokens expire after 60 days. You will need to refresh them periodically.'
    ]
  }
];

export default function SocialSetupPage() {
  const [platformStatuses, setPlatformStatuses] = useState<Record<string, PlatformStatus>>({});
  const [loading, setLoading] = useState(true);
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [showSteps, setShowSteps] = useState<Record<string, boolean>>({});

  const fetchConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/blog/social-config');
      if (response.ok) {
        const data = await response.json();
        setPlatformStatuses(data.platforms);
      }
    } catch (error) {
      console.error('Failed to load social config:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async (platformId: string) => {
    setSaving(platformId);
    try {
      const platform = PLATFORMS.find(p => p.id === platformId);
      if (!platform) return;

      const credentials: Record<string, string> = {};
      for (const field of platform.fields) {
        if (formData[field.key]) {
          credentials[field.key] = formData[field.key];
        }
      }

      const response = await fetch('/api/blog/social-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: platformId, credentials })
      });

      if (response.ok) {
        // Clear form and refresh
        const newFormData = { ...formData };
        for (const field of platform.fields) {
          delete newFormData[field.key];
        }
        setFormData(newFormData);
        await fetchConfig();
      }
    } catch (error) {
      console.error('Failed to save config:', error);
    } finally {
      setSaving(null);
    }
  };

  const handleTest = async (platformId: string) => {
    setTesting(platformId);
    try {
      const response = await fetch('/api/blog/social-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: platformId })
      });

      if (response.ok) {
        const result = await response.json();
        setTestResults(prev => ({ ...prev, [platformId]: result }));
      }
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [platformId]: { platform: platformId, connected: false, error: 'Network error' }
      }));
    } finally {
      setTesting(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400">Connected</span>;
      case 'partially_connected':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400">Partial</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/20 text-slate-400">Not Connected</span>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <AdminHeader />
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-white">Social Media Setup</h1>
          </div>
          <p className="text-slate-400">
            Connect your social media accounts to automatically publish blog content to Facebook, Instagram, and LinkedIn.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {PLATFORMS.map(platform => {
              const status = platformStatuses[platform.id];
              const isExpanded = expandedPlatform === platform.id;
              const testResult = testResults[platform.id];

              return (
                <div
                  key={platform.id}
                  className={`border rounded-xl overflow-hidden transition-all ${
                    isExpanded ? `${platform.borderColor} border-opacity-50` : 'border-slate-700'
                  } bg-slate-800/50`}
                >
                  {/* Platform Header */}
                  <button
                    onClick={() => setExpandedPlatform(isExpanded ? null : platform.id)}
                    className="w-full flex items-center justify-between p-5 hover:bg-slate-800/80 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg ${platform.color} flex items-center justify-center text-white font-bold text-sm`}>
                        {platform.icon}
                      </div>
                      <div className="text-left">
                        <h3 className="text-lg font-semibold text-white">{platform.name}</h3>
                        {status?.updatedAt && (
                          <p className="text-xs text-slate-500">
                            Last updated: {new Date(status.updatedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {getStatusBadge(status?.status || 'not_connected')}
                      <svg
                        className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t border-slate-700 p-5 space-y-6">
                      {/* Setup Instructions Toggle */}
                      <div>
                        <button
                          onClick={() => setShowSteps(prev => ({ ...prev, [platform.id]: !prev[platform.id] }))}
                          className="text-sm text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                        >
                          <svg className={`w-4 h-4 transition-transform ${showSteps[platform.id] ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          {showSteps[platform.id] ? 'Hide' : 'Show'} Setup Instructions
                        </button>

                        {showSteps[platform.id] && (
                          <div className="mt-3 p-4 bg-slate-900/50 border border-slate-700 rounded-lg">
                            <h4 className="text-sm font-semibold text-slate-300 mb-3">Setup Steps:</h4>
                            <ol className="space-y-2">
                              {platform.setupSteps.map((step, idx) => (
                                <li key={idx} className="flex gap-3 text-sm text-slate-400">
                                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-700 text-slate-300 flex items-center justify-center text-xs font-semibold">
                                    {idx + 1}
                                  </span>
                                  <span dangerouslySetInnerHTML={{ __html: step }} />
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </div>

                      {/* Credential Fields */}
                      <div className="space-y-4">
                        {platform.fields.map(field => (
                          <div key={field.key}>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                              {field.label}
                              {status?.fields[field.key]?.configured && (
                                <span className="ml-2 text-xs text-emerald-400">Configured</span>
                              )}
                            </label>
                            <input
                              type={field.type}
                              placeholder={
                                status?.fields[field.key]?.configured
                                  ? `Current value ends in ${status.fields[field.key].hint || '****'} — enter new value to update`
                                  : field.placeholder
                              }
                              value={formData[field.key] || ''}
                              onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                              className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
                            />
                          </div>
                        ))}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={() => handleSave(platform.id)}
                          disabled={saving === platform.id || !platform.fields.some(f => formData[f.key])}
                          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
                        >
                          {saving === platform.id ? 'Saving...' : 'Save Credentials'}
                        </button>

                        <button
                          onClick={() => handleTest(platform.id)}
                          disabled={testing === platform.id || status?.status === 'not_connected'}
                          className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700/50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
                        >
                          {testing === platform.id ? 'Testing...' : 'Test Connection'}
                        </button>
                      </div>

                      {/* Test Result */}
                      {testResult && (
                        <div className={`p-4 rounded-lg border ${
                          testResult.connected
                            ? 'bg-emerald-500/10 border-emerald-500/30'
                            : 'bg-red-500/10 border-red-500/30'
                        }`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-sm font-semibold ${testResult.connected ? 'text-emerald-400' : 'text-red-400'}`}>
                              {testResult.connected ? 'Connection Successful' : 'Connection Failed'}
                            </span>
                          </div>
                          {testResult.details && (
                            <div className="text-xs text-slate-400 space-y-0.5">
                              {Object.entries(testResult.details).map(([key, value]) => (
                                <div key={key}><span className="text-slate-500">{key}:</span> {value}</div>
                              ))}
                            </div>
                          )}
                          {testResult.error && (
                            <p className="text-xs text-red-400 mt-1">{testResult.error}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Blog Health Link */}
        <div className="mt-8 p-4 bg-slate-800/50 border border-slate-700 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-300">Blog System Health</h3>
              <p className="text-xs text-slate-500 mt-0.5">Check generation, approval, publishing, and social media status</p>
            </div>
            <a
              href="/api/blog/health"
              target="_blank"
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              View Health
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
