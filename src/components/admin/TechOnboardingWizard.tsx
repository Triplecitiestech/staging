'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CompanyData {
  id: string
  slug: string
  displayName: string
  contactEmail: string | null
  autotaskCompanyId: string | null
  m365_tenant_id: string | null
  m365_client_id: string | null
  m365_client_secret_set: boolean
  m365_setup_status: string | null
  m365_verified_at: string | null
  onboarding_completed_at: string | null
}

interface TechOnboardingWizardProps {
  company: CompanyData
  hasManager: boolean
}

type StepStatus = 'pending' | 'complete' | 'error'

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function StepIndicator({
  number,
  label,
  status,
  active,
}: {
  number: number
  label: string
  status: StepStatus
  active: boolean
}) {
  return (
    <div className={`flex items-center gap-3 ${active ? 'opacity-100' : 'opacity-50'}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 border-2 transition-colors ${
          status === 'complete'
            ? 'bg-teal-500 border-teal-500 text-white'
            : status === 'error'
            ? 'bg-red-500 border-red-500 text-white'
            : active
            ? 'border-teal-400 text-teal-400 bg-transparent'
            : 'border-gray-600 text-gray-500 bg-transparent'
        }`}
      >
        {status === 'complete' ? '✓' : status === 'error' ? '!' : number}
      </div>
      <span className={`text-sm font-medium ${active ? 'text-white' : 'text-gray-500'}`}>{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Info box helper
// ---------------------------------------------------------------------------

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-blue-950/40 border border-blue-500/30 rounded-lg p-4 text-sm text-blue-200 space-y-1">
      {children}
    </div>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <code className="block bg-slate-900 border border-white/10 rounded px-3 py-2 text-xs text-teal-300 font-mono break-all select-all">
      {children}
    </code>
  )
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

export default function TechOnboardingWizard({ company, hasManager }: TechOnboardingWizardProps) {
  const [step, setStep] = useState(1)
  const [stepStatus, setStepStatus] = useState<Record<number, StepStatus>>({
    1: company.autotaskCompanyId ? 'complete' : 'pending',
    2: company.m365_setup_status === 'verified' ? 'complete' : 'pending',
    3: company.m365_setup_status === 'verified' ? 'complete' : 'pending',
    4: company.onboarding_completed_at ? 'complete' : 'pending',
  })

  // Step 2 — M365 credentials form
  const [tenantId, setTenantId]         = useState(company.m365_tenant_id ?? '')
  const [clientId, setClientId]         = useState(company.m365_client_id ?? '')
  const [clientSecret, setClientSecret] = useState('')
  const [savingCreds, setSavingCreds]   = useState(false)
  const [credsError, setCredsError]     = useState<string | null>(null)
  const [credsSaved, setCredsSaved]     = useState(
    company.m365_setup_status === 'credentials_saved' || company.m365_setup_status === 'verified'
  )

  // Step 3 — test connection
  const [testing, setTesting]           = useState(false)
  const [testResult, setTestResult]     = useState<{ success: boolean; tenantName?: string; error?: string } | null>(
    company.m365_setup_status === 'verified'
      ? { success: true, tenantName: 'Previously verified' }
      : null
  )

  // Step 4 — complete
  const [completing, setCompleting]     = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)

  const markStep = useCallback((s: number, status: StepStatus) => {
    setStepStatus((prev) => ({ ...prev, [s]: status }))
  }, [])

  // ── Step 2: Save credentials ──
  async function handleSaveCreds() {
    if (!tenantId.trim() || !clientId.trim() || (!clientSecret.trim() && !company.m365_client_secret_set)) {
      setCredsError('All three fields are required.')
      return
    }
    setSavingCreds(true)
    setCredsError(null)
    try {
      const body: Record<string, string> = {
        tenantId: tenantId.trim(),
        clientId: clientId.trim(),
      }
      if (clientSecret.trim()) {
        body.clientSecret = clientSecret.trim()
      } else if (company.m365_client_secret_set) {
        // Re-use existing secret — send a placeholder the server will ignore
        body.clientSecret = '__KEEP__'
      }

      const res = await fetch(`/api/admin/companies/${company.id}/m365`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) {
        setCredsError(data.error ?? 'Failed to save credentials')
        return
      }

      setCredsSaved(true)
      markStep(2, 'complete')
      setStep(3)
    } catch {
      setCredsError('Network error — please try again')
    } finally {
      setSavingCreds(false)
    }
  }

  // ── Step 3: Test connection ──
  async function handleTestConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`/api/admin/companies/${company.id}/m365`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test' }),
      })

      const data = await res.json()
      if (data.success) {
        setTestResult({ success: true, tenantName: data.tenantName })
        markStep(3, 'complete')
      } else {
        setTestResult({ success: false, error: data.error ?? 'Connection test failed' })
        markStep(3, 'error')
      }
    } catch {
      setTestResult({ success: false, error: 'Network error — please try again' })
      markStep(3, 'error')
    } finally {
      setTesting(false)
    }
  }

  // ── Step 4: Mark complete ──
  async function handleComplete() {
    setCompleting(true)
    setCompleteError(null)
    try {
      const res = await fetch(`/api/admin/companies/${company.id}/m365`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete_onboarding' }),
      })
      if (!res.ok) {
        const data = await res.json()
        setCompleteError(data.error ?? 'Failed to mark complete')
        return
      }
      markStep(4, 'complete')
    } catch {
      setCompleteError('Network error — please try again')
    } finally {
      setCompleting(false)
    }
  }

  const STEPS = [
    { label: 'Autotask Sync'       },
    { label: 'M365 App Registration' },
    { label: 'Test Connection'     },
    { label: 'Portal Access'       },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link
            href={`/admin/companies/${company.id}`}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            ← {company.displayName}
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-white">Customer Onboarding Wizard</h1>
        <p className="text-gray-400 mt-1 text-sm">
          Complete these steps to fully onboard <span className="text-white font-medium">{company.displayName}</span> into the portal.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar steps */}
        <div className="lg:col-span-1">
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4 sticky top-8">
            {STEPS.map((s, i) => (
              <button
                key={i}
                onClick={() => setStep(i + 1)}
                className="w-full text-left"
              >
                <StepIndicator
                  number={i + 1}
                  label={s.label}
                  status={stepStatus[i + 1] ?? 'pending'}
                  active={step === i + 1}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div className="lg:col-span-3 space-y-6">

          {/* ── STEP 1: Autotask Sync ── */}
          {step === 1 && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-white">Step 1 — Autotask Sync &amp; Manager Setup</h2>
                <p className="text-gray-400 text-sm mt-1">
                  Before the customer can use the portal, their contacts must be synced from Autotask and at least one contact must be promoted to Manager.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between bg-slate-800/50 rounded-lg px-4 py-3">
                  <span className="text-sm text-gray-300">Autotask Company ID</span>
                  <span className={`text-sm font-mono ${company.autotaskCompanyId ? 'text-teal-400' : 'text-red-400'}`}>
                    {company.autotaskCompanyId ?? 'Not linked'}
                  </span>
                </div>
              </div>

              <InfoBox>
                <p className="font-semibold text-blue-100 mb-2">Follow these steps in order:</p>
                <ol className="list-decimal list-inside space-y-2 mt-1">
                  <li>
                    <strong>On this site (triplecitiestech.com):</strong> Go to{' '}
                    <Link href="/admin/reporting/status" className="underline text-teal-300">Admin → More → Pipeline Status</Link>{' '}
                    and click <strong>Run</strong> next to <em>Sync Tickets</em> — this also syncs contacts for all companies.
                  </li>
                  <li>
                    <strong>On this site:</strong> Go to{' '}
                    <Link href="/admin/contacts" className="underline text-teal-300">Admin → More → Contacts</Link>,
                    search for this company, and confirm contacts were imported.
                  </li>
                  <li>
                    <strong>On this site — Contacts page:</strong> Find the contact who should be the portal manager.
                    In the <strong>Portal Role</strong> column, click the colored role badge (e.g. &ldquo;User&rdquo;) next to their name — it turns into a dropdown. Select <strong>Manager</strong>.
                    Their email address is what they will type to verify identity on the portal.
                    <em className="block text-blue-300 text-xs mt-0.5">Note: Portal roles are set here in the TCT admin, not inside Autotask.</em>
                  </li>
                  <li>
                    <strong>Verify above:</strong> The <em>Autotask Company ID</em> field above should show a number (not &quot;Not linked&quot;). If it&apos;s missing, the Autotask sync hasn&apos;t run for this company yet — re-run the sync.
                  </li>
                </ol>
              </InfoBox>

              {!company.autotaskCompanyId && (
                <div className="bg-yellow-950/40 border border-yellow-500/30 rounded-lg p-4 text-sm text-yellow-200">
                  ⚠️ This company has no Autotask Company ID linked. Go to{' '}
                  <Link href={`/admin/companies/${company.id}`} className="underline">
                    the company detail page
                  </Link>{' '}
                  and ensure the Autotask sync has run.
                </div>
              )}

              <div className="flex justify-end gap-3 flex-wrap">
                <Link
                  href="/admin/reporting/status"
                  className="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                >
                  Pipeline Status →
                </Link>
                <Link
                  href="/admin/contacts"
                  className="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                >
                  Contacts →
                </Link>
                <button
                  onClick={() => { markStep(1, 'complete'); setStep(2) }}
                  className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors font-medium"
                >
                  Mark Complete &amp; Continue →
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2: M365 App Registration ── */}
          {step === 2 && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-white">Step 2 — Microsoft 365 App Registration</h2>
                <p className="text-gray-400 text-sm mt-1">
                  Create an App Registration in the customer's Entra ID tenant, grant it Graph API permissions, and enter the credentials below.
                </p>
              </div>

              <InfoBox>
                <p className="font-semibold text-blue-100">Before You Begin — License Check</p>
                <p className="mt-1">Before setting up M365 integration, ensure this customer&apos;s tenant is in your Pax8 partner portal and the reseller relationship is established. If the tenant is not in Pax8:</p>
                <ol className="list-decimal list-inside space-y-1 mt-2">
                  <li>Log into <a href="https://app.pax8.com" target="_blank" rel="noopener noreferrer" className="underline text-teal-300">app.pax8.com</a></li>
                  <li>Go to <strong>Customers → Add Customer</strong></li>
                  <li>Link the customer&apos;s Microsoft tenant by entering their domain</li>
                  <li>Establish the reseller relationship (CSP indirect or direct)</li>
                  <li>Once linked, you can order and manage M365 licenses through Pax8</li>
                </ol>
                <p className="mt-2 text-yellow-300 text-xs font-medium">Without a Pax8 reseller relationship, license ordering for new employee onboarding will fail.</p>
              </InfoBox>

              <InfoBox>
                <p className="font-semibold text-blue-100">Instructions — do this in the customer's Entra admin center:</p>
                <ol className="list-decimal list-inside space-y-2 mt-2">
                  <li>
                    Sign into <strong>entra.microsoft.com</strong> as a Global Admin in the customer's tenant
                  </li>
                  <li>
                    Go to <strong>Applications → App registrations → New registration</strong>
                  </li>
                  <li>
                    Name it: <code className="text-teal-300">TCT Portal Integration</code>
                    — choose <strong>Single tenant</strong>
                  </li>
                  <li>
                    After creating, go to <strong>API permissions → Add a permission → Microsoft Graph → Application permissions</strong>
                    <br />
                    Add ALL of these:
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5 text-teal-200 font-mono text-xs">
                      <li>User.ReadWrite.All</li>
                      <li>Group.ReadWrite.All</li>
                      <li>GroupMember.ReadWrite.All</li>
                      <li>Directory.ReadWrite.All</li>
                      <li>Sites.ReadWrite.All</li>
                      <li>Organization.Read.All</li>
                    </ul>
                  </li>
                  <li>
                    Still in <strong>API permissions → Add a permission → Microsoft Graph → Delegated permissions</strong>
                    <br />
                    Add these (for user SSO login to the customer portal):
                    <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5 text-teal-200 font-mono text-xs">
                      <li>openid</li>
                      <li>profile</li>
                      <li>email</li>
                    </ul>
                  </li>
                  <li>Click <strong>Grant admin consent</strong> for the tenant</li>
                  <li>
                    Go to <strong>Authentication → Add a platform → Web</strong>
                    <br />
                    Set the <strong>Redirect URI</strong> to:
                    <code className="block bg-slate-900 border border-white/10 rounded px-3 py-2 text-xs text-teal-300 font-mono break-all select-all mt-1">
                      https://www.triplecitiestech.com/api/portal/auth/callback
                    </code>
                    <span className="block text-xs text-blue-300 mt-1">Under &ldquo;Implicit grant and hybrid flows&rdquo;, check <strong>ID tokens</strong>.</span>
                  </li>
                  <li>
                    Go to <strong>Certificates &amp; secrets → New client secret</strong>.
                    Set expiry to 24 months. Copy the secret <em>value immediately</em> (shown once).
                  </li>
                  <li>
                    Copy the <strong>Directory (tenant) ID</strong> and <strong>Application (client) ID</strong>
                    from the app overview page.
                  </li>
                </ol>
              </InfoBox>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Directory (Tenant) ID
                  </label>
                  <input
                    type="text"
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Application (Client) ID
                  </label>
                  <input
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Client Secret Value
                    {company.m365_client_secret_set && (
                      <span className="ml-2 text-xs text-teal-400 font-normal">
                        (already set — only enter if rotating)
                      </span>
                    )}
                  </label>
                  <input
                    type="password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder={company.m365_client_secret_set ? '●●●●●●●● (leave blank to keep existing)' : 'Paste the secret value here'}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              {credsError && (
                <div className="bg-red-950/40 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300">
                  {credsError}
                </div>
              )}

              {credsSaved && (
                <div className="bg-green-950/40 border border-green-500/30 rounded-lg px-4 py-3 text-sm text-green-300">
                  ✓ Credentials saved. Proceed to test the connection.
                </div>
              )}

              <div className="flex justify-between gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={handleSaveCreds}
                  disabled={savingCreds}
                  className="px-5 py-2 text-sm bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
                >
                  {savingCreds ? 'Saving...' : 'Save Credentials →'}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Test Connection ── */}
          {step === 3 && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-white">Step 3 — Test Connection</h2>
                <p className="text-gray-400 text-sm mt-1">
                  Verify that the credentials work by connecting to Microsoft Graph API.
                </p>
              </div>

              {!credsSaved && !company.m365_client_secret_set && (
                <div className="bg-yellow-950/40 border border-yellow-500/30 rounded-lg px-4 py-3 text-sm text-yellow-300">
                  ⚠️ No credentials saved yet. Go back to Step 2 and save credentials first.
                </div>
              )}

              <div className="bg-slate-800/50 rounded-lg px-4 py-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Tenant ID</span>
                  <span className="font-mono text-gray-300 text-xs">{tenantId || company.m365_tenant_id || '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Client ID</span>
                  <span className="font-mono text-gray-300 text-xs">{clientId || company.m365_client_id || '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Client Secret</span>
                  <span className="text-gray-300 text-xs">{(credsSaved || company.m365_client_secret_set) ? '●●●●●●●● (saved)' : 'Not set'}</span>
                </div>
              </div>

              {testResult && (
                <div
                  className={`rounded-lg px-4 py-3 text-sm ${
                    testResult.success
                      ? 'bg-green-950/40 border border-green-500/30 text-green-300'
                      : 'bg-red-950/40 border border-red-500/30 text-red-300'
                  }`}
                >
                  {testResult.success ? (
                    <>✓ Connection successful — tenant: <strong>{testResult.tenantName}</strong></>
                  ) : (
                    <>✗ {testResult.error}</>
                  )}
                </div>
              )}

              {testResult?.success && (
                <InfoBox>
                  <p className="font-semibold text-blue-100">Connection verified. What this enables:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>The onboarding wizard will show live M365 groups, Teams, and SharePoint sites to select from</li>
                    <li>License type picker will show only SKUs actually assigned to this tenant</li>
                    <li>Clone permissions picker will show real user accounts</li>
                    <li>The process route will automate provisioning via Graph API when a request is approved</li>
                  </ul>
                </InfoBox>
              )}

              <div className="flex justify-between gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                >
                  ← Back
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={handleTestConnection}
                    disabled={testing || (!credsSaved && !company.m365_client_secret_set)}
                    className="px-5 py-2 text-sm bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
                  >
                    {testing ? 'Testing...' : 'Test Connection'}
                  </button>
                  {testResult?.success && (
                    <button
                      onClick={() => { markStep(3, 'complete'); setStep(4) }}
                      className="px-5 py-2 text-sm bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors font-medium"
                    >
                      Continue →
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 4: Portal Access ── */}
          {step === 4 && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-white">Step 4 — Portal Access &amp; Final Checklist</h2>
                <p className="text-gray-400 text-sm mt-1">
                  Review the final checklist, then mark this customer as fully onboarded.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  { label: 'Autotask contact sync run',             done: !!company.autotaskCompanyId },
                  { label: 'At least one contact set to CLIENT_MANAGER', done: hasManager, ...(!hasManager && { note: 'No active CLIENT_MANAGER found — set one in Contacts' }) },
                  { label: 'M365 credentials saved',                done: credsSaved || !!company.m365_client_secret_set },
                  { label: 'Graph API connection verified',          done: testResult?.success ?? company.m365_setup_status === 'verified' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 bg-slate-800/40 rounded-lg px-4 py-3">
                    <div className={`w-5 h-5 rounded-full flex-shrink-0 border-2 flex items-center justify-center text-xs ${
                      item.done ? 'bg-teal-500 border-teal-500 text-white' : 'border-gray-600 text-transparent'
                    }`}>
                      {item.done ? '✓' : ''}
                    </div>
                    <div>
                      <p className={`text-sm ${item.done ? 'text-white' : 'text-gray-400'}`}>{item.label}</p>
                      {item.note && <p className="text-xs text-gray-500">{item.note}</p>}
                    </div>
                  </div>
                ))}
              </div>

              <InfoBox>
                <p className="font-semibold text-blue-100">Portal URL for this customer:</p>
                <CodeBlock>{`https://www.triplecitiestech.com/onboarding/${company.slug}`}</CodeBlock>
                <p className="mt-2 font-semibold text-blue-100">Share with the customer's manager contact. They will:</p>
                <ol className="list-decimal list-inside mt-1 space-y-1">
                  <li>Navigate to the portal URL</li>
                  <li>Sign in with their Microsoft 365 account (Azure AD SSO)</li>
                  <li>Managers automatically get access to Employee Management</li>
                  <li>Submit onboarding or offboarding requests</li>
                </ol>
              </InfoBox>

              {completeError && (
                <div className="bg-red-950/40 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300">
                  {completeError}
                </div>
              )}

              {stepStatus[4] === 'complete' && (
                <div className="bg-green-950/40 border border-green-500/30 rounded-lg px-4 py-3 text-sm text-green-300">
                  ✓ Onboarding complete. This customer is fully set up in the portal.
                </div>
              )}

              <div className="flex justify-between gap-3">
                <button
                  onClick={() => setStep(3)}
                  className="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                >
                  ← Back
                </button>
                <div className="flex gap-3">
                  {stepStatus[4] !== 'complete' && (
                    <button
                      onClick={handleComplete}
                      disabled={completing}
                      className="px-5 py-2 text-sm bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                    >
                      {completing ? 'Marking...' : '✓ Mark Onboarding Complete'}
                    </button>
                  )}
                  <Link
                    href={`/admin/companies/${company.id}`}
                    className="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                  >
                    ← Back to Company
                  </Link>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
