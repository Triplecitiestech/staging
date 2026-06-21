'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
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
  m365_consent_mode: string | null
  m365_consent_granted_at: string | null
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
  const searchParams = useSearchParams()
  const consentMode: 'legacy' | 'multi_tenant' =
    company.m365_consent_mode === 'multi_tenant' ? 'multi_tenant' : 'legacy'
  const isMultiTenant = consentMode === 'multi_tenant'

  // Allow ?step=2 etc. from the consent callback to deep-link into a specific step
  const stepFromUrl = parseInt(searchParams?.get('step') ?? '', 10)
  const [step, setStep] = useState(
    Number.isInteger(stepFromUrl) && stepFromUrl >= 1 && stepFromUrl <= 5 ? stepFromUrl : 1
  )

  // Step 2 is "connection established", which is true when either:
  //   - multi_tenant: customer admin has granted consent, OR
  //   - legacy:       per-tenant credentials are saved (or already verified)
  // Step 3 is "test passed", which only flips true when m365_setup_status === 'verified'.
  const step2Complete =
    (consentMode === 'multi_tenant' && !!company.m365_consent_granted_at) ||
    company.m365_setup_status === 'credentials_saved' ||
    company.m365_setup_status === 'verified'

  const [stepStatus, setStepStatus] = useState<Record<number, StepStatus>>({
    1: company.autotaskCompanyId ? 'complete' : 'pending',
    2: step2Complete ? 'complete' : 'pending',
    3: company.m365_setup_status === 'verified' ? 'complete' : 'pending',
    4: 'pending',
    5: company.onboarding_completed_at ? 'complete' : 'pending',
  })

  // Surface success / error from /api/admin/m365/consent/callback
  const consentSuccess = searchParams?.get('m365_consent_success') === '1'
  const consentError   = searchParams?.get('m365_consent_error')

  // Step 2 — M365 credentials form (legacy mode only — kept for backwards compat
  // and as an Advanced fallback when admin consent isn't an option)
  const [showLegacyForm, setShowLegacyForm] = useState(!isMultiTenant && (company.m365_client_id !== null || company.m365_client_secret_set))
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
  const [testResult, setTestResult]     = useState<{ success: boolean; tenantName?: string; error?: string; warnings?: string[] } | null>(
    company.m365_setup_status === 'verified'
      ? { success: true, tenantName: 'Previously verified' }
      : null
  )

  // Step 2 — copy consent URL feedback
  const [copiedConsentUrl, setCopiedConsentUrl] = useState(false)

  // Step 1 — per-company contact sync (avoids the 60s global-sync timeout)
  const [syncingContacts, setSyncingContacts] = useState(false)
  const [contactSyncResult, setContactSyncResult] = useState<{
    ok: boolean
    message: string
  } | null>(null)
  const [syncingTickets, setSyncingTickets] = useState(false)
  const [ticketSyncResult, setTicketSyncResult] = useState<{
    ok: boolean
    message: string
  } | null>(null)

  // Step 1 — link an existing local company to its Autotask counterpart.
  // Used when the company was created via the manual form on /admin/companies/new
  // without going through the "Import from Autotask" search-and-import path,
  // so autotaskCompanyId ended up null.
  interface AtCompanyMatch {
    id: number
    name: string
    phone: string | null
  }
  const [atSearch, setAtSearch] = useState('')
  const [atResults, setAtResults] = useState<AtCompanyMatch[]>([])
  const [atSearching, setAtSearching] = useState(false)
  const [linkingAt, setLinkingAt] = useState(false)
  const [atLinkResult, setAtLinkResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Debounce the Autotask company search
  useEffect(() => {
    if (!atSearch || atSearch.length < 2) {
      setAtResults([])
      return
    }
    const controller = new AbortController()
    const t = setTimeout(async () => {
      setAtSearching(true)
      try {
        const res = await fetch(`/api/autotask/companies/search?q=${encodeURIComponent(atSearch)}`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setAtResults(Array.isArray(data.companies) ? data.companies : [])
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Search errors are silent — the search runs as the tech types
      } finally {
        setAtSearching(false)
      }
    }, 300)
    return () => { controller.abort(); clearTimeout(t) }
  }, [atSearch])

  async function handleLinkAutotaskCompany(atCompanyId: number) {
    setLinkingAt(true)
    setAtLinkResult(null)
    try {
      const res = await fetch('/api/autotask/companies/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: company.id, autotaskCompanyId: atCompanyId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        const detail = data.details ? ` — ${data.details}` : ''
        throw new Error((data.error || `HTTP ${res.status}`) + detail)
      }
      setAtLinkResult({
        ok: true,
        message: `Linked to Autotask. Refreshing to pick up the new Company ID…`,
      })
      // Hard reload so server-rendered company object reflects the new autotaskCompanyId
      setTimeout(() => window.location.reload(), 1200)
    } catch (err) {
      setAtLinkResult({ ok: false, message: err instanceof Error ? err.message : 'Failed to link' })
    } finally {
      setLinkingAt(false)
    }
  }

  async function handleSyncCompanyContacts() {
    setSyncingContacts(true)
    setContactSyncResult(null)
    try {
      const res = await fetch(`/api/admin/companies/${company.id}/sync-contacts`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setContactSyncResult({ ok: false, message: data.error || `HTTP ${res.status}` })
        return
      }
      const created = data.created ?? 0
      const updated = data.updated ?? 0
      const errs = data.errors as string[] | undefined
      const summary = `${created} created, ${updated} updated.${errs?.length ? ` ${errs.length} error(s).` : ''}`
      setContactSyncResult({ ok: !errs || errs.length === 0, message: summary })
    } catch (err) {
      setContactSyncResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Network error',
      })
    } finally {
      setSyncingContacts(false)
    }
  }

  async function handleSyncCompanyTickets() {
    setSyncingTickets(true)
    setTicketSyncResult(null)
    try {
      const res = await fetch(`/api/admin/companies/${company.id}/sync-tickets`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        setTicketSyncResult({ ok: false, message: data.error || `HTTP ${res.status}` })
        return
      }
      const created = data.created ?? 0
      const updated = data.updated ?? 0
      const errs = data.errors as string[] | undefined
      const summary = `${created} new, ${updated} updated (last 30 days)${errs?.length ? ` — ${errs.length} error(s)` : ''}`
      setTicketSyncResult({ ok: !errs || errs.length === 0, message: summary })
    } catch (err) {
      setTicketSyncResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Network error',
      })
    } finally {
      setSyncingTickets(false)
    }
  }

  // Step 4 — designate manager + send invite
  interface WizardContact {
    id: string
    name: string
    email: string
    customerRole: string
    inviteStatus: string
  }
  const [contactList, setContactList] = useState<WizardContact[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactsError, setContactsError] = useState<string | null>(null)
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null)
  const [managerSubmitting, setManagerSubmitting] = useState(false)
  const [managerResult, setManagerResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Step 5 — finalize
  const [completing, setCompleting]     = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)

  // Load this company's contacts whenever Step 4 becomes active.
  // We refetch on visit so any contacts the tech just added (via Sync Contacts or
  // the Add Contact form on the company page) show up without a full page reload.
  useEffect(() => {
    if (step !== 4) return
    let cancelled = false
    const controller = new AbortController()
    setContactsLoading(true)
    setContactsError(null)
    fetch(`/api/companies/${company.id}/contacts`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        const list: WizardContact[] = (Array.isArray(data) ? data : data.contacts || []).map((c: WizardContact) => ({
          id: c.id, name: c.name, email: c.email,
          customerRole: c.customerRole || 'CLIENT_USER',
          inviteStatus: c.inviteStatus || 'NOT_INVITED',
        }))
        setContactList(list)
        // Default selection: existing manager if any, else first contact
        const existingManager = list.find((c) => c.customerRole === 'CLIENT_MANAGER')
        setSelectedManagerId(existingManager?.id ?? list[0]?.id ?? null)
        // If a manager has already been designated AND invited (or accepted),
        // Step 4 is done. Without this the sidebar shows Step 4 as pending
        // after a page refresh even though the work is complete in the DB.
        if (existingManager && (existingManager.inviteStatus === 'INVITED' || existingManager.inviteStatus === 'ACCEPTED')) {
          setStepStatus((prev) => ({ ...prev, 4: 'complete' }))
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setContactsError(err instanceof Error ? err.message : 'Failed to load contacts')
      })
      .finally(() => {
        if (!cancelled) setContactsLoading(false)
      })
    return () => { cancelled = true; controller.abort() }
  }, [step, company.id])

  async function handleSetManagerAndInvite() {
    if (!selectedManagerId) {
      setManagerResult({ ok: false, message: 'Pick a contact first.' })
      return
    }
    setManagerSubmitting(true)
    setManagerResult(null)
    try {
      // 1. Promote to CLIENT_MANAGER
      const roleRes = await fetch('/api/contacts/invite', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: selectedManagerId, customerRole: 'CLIENT_MANAGER' }),
      })
      if (!roleRes.ok) {
        const err = await roleRes.json().catch(() => ({}))
        throw new Error(err.error || `Role update failed (HTTP ${roleRes.status})`)
      }

      // 2. Send the welcome email
      const inviteRes = await fetch('/api/contacts/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds: [selectedManagerId] }),
      })
      const inviteData = await inviteRes.json().catch(() => ({}))
      if (!inviteRes.ok || inviteData.sent === 0) {
        const failureDetail = inviteData.results?.[0]?.error || inviteData.error || `Invite failed (HTTP ${inviteRes.status})`
        throw new Error(failureDetail)
      }

      setManagerResult({ ok: true, message: 'Manager designated and welcome email sent.' })
      markStep(4, 'complete')
      // Update local state so the badge updates without a refetch
      setContactList((prev) => prev.map(c =>
        c.id === selectedManagerId
          ? { ...c, customerRole: 'CLIENT_MANAGER', inviteStatus: 'INVITED' }
          : c
      ))
    } catch (err) {
      setManagerResult({ ok: false, message: err instanceof Error ? err.message : 'Unexpected error' })
    } finally {
      setManagerSubmitting(false)
    }
  }

  // If the consent callback redirected us with success, mark step 2 done
  useEffect(() => {
    if (consentSuccess) {
      setStepStatus((prev) => ({ ...prev, 2: 'complete' }))
    }
  }, [consentSuccess])

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
        setTestResult({ success: true, tenantName: data.tenantName, warnings: data.warnings ?? [] })
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
      markStep(5, 'complete')
    } catch {
      setCompleteError('Network error — please try again')
    } finally {
      setCompleting(false)
    }
  }

  const STEPS = [
    { label: 'Autotask Sync'        },
    { label: 'M365 Connection'      },
    { label: 'Test Connection'      },
    { label: 'Manager & Invite'     },
    { label: 'Finalize'             },
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
                    <strong>Confirm the Autotask Company ID above shows a number</strong> (not &quot;Not linked&quot;). If it&rsquo;s missing, use the Autotask search box below to find and link this company &mdash; you can&rsquo;t sync contacts or tickets until this is set.
                  </li>
                  <li>
                    <strong>Sync this company&rsquo;s contacts</strong> using the button below the search. This pulls contacts for {company.displayName} only and finishes in seconds. You can also pick the manager directly in <strong>Step 4</strong> of this wizard.
                  </li>
                  <li>
                    Open the{' '}
                    <Link
                      href={`/admin/contacts?search=${encodeURIComponent(company.displayName)}`}
                      className="underline text-teal-300"
                    >
                      Contacts page (filtered to {company.displayName})
                    </Link>{' '}
                    if you want to confirm the contacts came over or adjust portal roles manually.
                  </li>
                </ol>
              </InfoBox>

              {!company.autotaskCompanyId && (
                <div className="bg-violet-950/40 border border-violet-500/30 rounded-lg p-4 space-y-3 text-sm text-violet-200">
                  <div>
                    <p className="font-semibold text-violet-100">
                      ⚠️ This company is not linked to Autotask yet.
                    </p>
                    <p className="text-xs text-violet-300 mt-1">
                      It was likely created via the manual &ldquo;Create New Company&rdquo; form without using the
                      &ldquo;Import from Autotask&rdquo; search. Search for it in Autotask below and link it &mdash; once linked,
                      contacts, tickets, and other syncs will pull data for this company.
                    </p>
                  </div>

                  <input
                    type="text"
                    value={atSearch}
                    onChange={(e) => setAtSearch(e.target.value)}
                    placeholder={`Search Autotask for "${company.displayName}"…`}
                    className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded text-sm text-white placeholder:text-violet-400/60 focus:outline-none focus:border-violet-400"
                  />

                  {atSearching && (
                    <p className="text-xs text-violet-300">Searching Autotask…</p>
                  )}

                  {!atSearching && atResults.length > 0 && (
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {atResults.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          disabled={linkingAt}
                          onClick={() => handleLinkAutotaskCompany(r.id)}
                          className="w-full text-left px-3 py-2 bg-slate-900/60 hover:bg-slate-900 border border-white/10 rounded text-xs text-white transition-colors disabled:opacity-50 flex items-center justify-between gap-2"
                        >
                          <span>
                            <span className="text-white font-medium">{r.name}</span>
                            {r.phone && <span className="text-violet-300 ml-2">· {r.phone}</span>}
                            <span className="text-violet-400/70 ml-2">(AT ID {r.id})</span>
                          </span>
                          <span className="text-violet-300 text-[10px]">Link →</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {!atSearching && atSearch.length >= 2 && atResults.length === 0 && !atLinkResult && (
                    <p className="text-xs text-violet-300/80">
                      No Autotask match for that name. If the company truly doesn&rsquo;t exist in Autotask, create it there first, then come back.
                    </p>
                  )}

                  {atLinkResult && (
                    <div
                      className={`text-xs px-3 py-2 rounded ${
                        atLinkResult.ok
                          ? 'bg-green-950/40 border border-green-500/30 text-green-300'
                          : 'bg-red-950/40 border border-red-500/30 text-red-300'
                      }`}
                    >
                      {atLinkResult.ok ? '✓ ' : '✗ '}{atLinkResult.message}
                    </div>
                  )}
                </div>
              )}

              {/*
                Per-company contact sync — calls /api/admin/companies/[id]/sync-contacts
                which only iterates this single company. The global Pipeline Status
                "Sync Contacts" button iterates every company and can exceed Vercel's
                60s function limit on larger tenants; use this one for onboarding flow.
              */}
              <div className="bg-slate-900/40 border border-white/10 rounded-lg p-4 space-y-3">
                <p className="text-sm text-white font-semibold">
                  Sync this company&rsquo;s contacts from Autotask
                </p>
                <p className="text-xs text-slate-400">
                  Pulls only {company.displayName}&rsquo;s contacts from Autotask &mdash; fast
                  ({company.autotaskCompanyId ? 'one API call' : 'requires Autotask Company ID first'}).
                  The global Pipeline Status sync iterates every company and can time out on
                  larger Autotask instances.
                </p>
                <button
                  type="button"
                  onClick={handleSyncCompanyContacts}
                  disabled={syncingContacts || !company.autotaskCompanyId}
                  className="px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-lg transition-colors font-medium"
                >
                  {syncingContacts ? 'Syncing…' : `Sync ${company.displayName} Contacts`}
                </button>
                {contactSyncResult && (
                  <div
                    className={`text-xs px-3 py-2 rounded ${
                      contactSyncResult.ok
                        ? 'bg-green-950/40 border border-green-500/30 text-green-300'
                        : 'bg-red-950/40 border border-red-500/30 text-red-300'
                    }`}
                  >
                    {contactSyncResult.ok ? '✓ ' : '✗ '}{contactSyncResult.message}
                  </div>
                )}
              </div>

              {/*
                Per-company ticket sync — calls /api/admin/companies/[id]/sync-tickets
                (forced, single company, last 30 days). The routine global sync is
                incremental (~2-day look-back) and won't backfill a newly-linked
                customer's older tickets; this does, so their SOC alerts show up.
              */}
              <div className="bg-slate-900/40 border border-white/10 rounded-lg p-4 space-y-3">
                <p className="text-sm text-white font-semibold">
                  Sync this company&rsquo;s tickets from Autotask
                </p>
                <p className="text-xs text-slate-400">
                  Pulls {company.displayName}&rsquo;s tickets from the last 30 days
                  ({company.autotaskCompanyId ? 'one-time backfill' : 'requires Autotask Company ID first'}).
                  Run this once after linking a company &mdash; the routine sync only looks back ~2 days and
                  won&rsquo;t backfill older tickets. SOC alerts appear once their tickets are synced.
                </p>
                <button
                  type="button"
                  onClick={handleSyncCompanyTickets}
                  disabled={syncingTickets || !company.autotaskCompanyId}
                  className="px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-lg transition-colors font-medium"
                >
                  {syncingTickets ? 'Syncing…' : `Sync ${company.displayName} Tickets`}
                </button>
                {ticketSyncResult && (
                  <div
                    className={`text-xs px-3 py-2 rounded ${
                      ticketSyncResult.ok
                        ? 'bg-green-950/40 border border-green-500/30 text-green-300'
                        : 'bg-red-950/40 border border-red-500/30 text-red-300'
                    }`}
                  >
                    {ticketSyncResult.ok ? '✓ ' : '✗ '}{ticketSyncResult.message}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 flex-wrap">
                <Link
                  href="/admin/reporting/status"
                  className="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                >
                  Pipeline Status →
                </Link>
                <Link
                  href={`/admin/contacts?search=${encodeURIComponent(company.displayName)}`}
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
                <h2 className="text-lg font-semibold text-white">Step 2 — Microsoft 365 Connection</h2>
                <p className="text-gray-400 text-sm mt-1">
                  The customer&apos;s Global Admin grants consent to the TCT Customer Portal once.
                  No app registrations or secrets to copy.
                </p>
              </div>

              {consentSuccess && (
                <div className="bg-green-950/40 border border-green-500/30 rounded-lg px-4 py-3 text-sm text-green-300">
                  ✓ Admin consent granted. Microsoft 365 is now connected for this customer.
                </div>
              )}

              {consentError && (
                <div className="bg-red-950/40 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300">
                  ✗ {consentError}
                </div>
              )}

              {isMultiTenant && company.m365_tenant_id ? (
                <div className="bg-slate-800/50 rounded-lg px-4 py-4 space-y-3">
                  <div className="flex items-center gap-2 text-green-300 text-sm font-medium">
                    <span>✓ Connected via admin consent</span>
                  </div>
                  <div className="text-xs text-gray-400 space-y-1">
                    <div>Customer tenant ID: <span className="font-mono text-gray-300">{company.m365_tenant_id}</span></div>
                    {company.m365_consent_granted_at && (
                      <div>Consented: {new Date(company.m365_consent_granted_at).toLocaleString()}</div>
                    )}
                  </div>
                  <a
                    href={`/api/admin/m365/consent?companyId=${company.id}`}
                    className="inline-block text-xs px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-gray-200 transition-colors"
                  >
                    Re-run consent flow (e.g. after permission changes)
                  </a>
                </div>
              ) : (
                <div className="space-y-4">
                  <InfoBox>
                    <p className="font-semibold text-blue-100">How this works:</p>
                    <ol className="list-decimal list-inside space-y-1 mt-2 text-sm">
                      <li>Click the button below &mdash; it opens Microsoft&rsquo;s consent prompt.</li>
                      <li>The customer&rsquo;s Global Admin signs in to <strong>their</strong> tenant.</li>
                      <li>They review the requested permissions and click <strong>Accept</strong>.</li>
                      <li>Microsoft redirects back here and stamps this company as connected.</li>
                    </ol>
                    <p className="mt-3 text-xs text-yellow-300">
                      The admin will see &ldquo;Unverified&rdquo; in the consent prompt until TCT completes
                      Microsoft Publisher Verification &mdash; that&rsquo;s expected and the consent still works.
                    </p>
                  </InfoBox>

                  <div className="bg-violet-950/40 border border-violet-500/30 rounded-lg p-4 text-sm text-violet-200 space-y-2">
                    <p className="font-semibold text-violet-100">Recommended: open this in an incognito browser</p>
                    <p>
                      Doing the consent flow in your normal browser will sign in the customer&rsquo;s
                      Global Admin account into your Microsoft profile cache and can confuse Outlook,
                      Teams, and SharePoint sessions afterwards.
                    </p>
                    <ol className="list-decimal list-inside text-xs space-y-1 mt-1">
                      <li>Click <strong>Copy consent URL</strong> below.</li>
                      <li>Open a new incognito / private window.</li>
                      <li>Sign in to <code className="text-teal-300">triplecitiestech.com/admin</code> with your TCT account.</li>
                      <li>Paste the consent URL in the address bar and press Enter.</li>
                      <li>On Microsoft&rsquo;s prompt, sign in as the customer&rsquo;s Global Admin and click Accept.</li>
                      <li>Close the incognito window when done.</li>
                    </ol>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <a
                      href={`/api/admin/m365/consent?companyId=${company.id}`}
                      className="flex-1 block text-center px-5 py-3 text-sm bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors font-medium"
                    >
                      Connect Microsoft 365 (this browser) →
                    </a>
                    <button
                      type="button"
                      onClick={async () => {
                        const baseUrl = window.location.origin
                        const url = `${baseUrl}/api/admin/m365/consent?companyId=${company.id}`
                        try {
                          await navigator.clipboard.writeText(url)
                          setCopiedConsentUrl(true)
                          setTimeout(() => setCopiedConsentUrl(false), 2500)
                        } catch {
                          // clipboard access can fail in non-secure contexts; show URL as a fallback
                          window.prompt('Copy this URL and paste it in incognito:', url)
                        }
                      }}
                      className="flex-1 px-5 py-3 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors font-medium"
                    >
                      {copiedConsentUrl ? '✓ Copied — paste in incognito' : 'Copy consent URL (for incognito)'}
                    </button>
                  </div>

                  <button
                    onClick={() => setShowLegacyForm((v) => !v)}
                    className="text-xs text-gray-400 hover:text-white underline"
                  >
                    {showLegacyForm ? 'Hide' : 'Show'} advanced: enter app registration credentials manually (legacy)
                  </button>
                </div>
              )}

              {showLegacyForm && !isMultiTenant && (
                <div className="border-t border-white/10 pt-5 space-y-4">
                  <p className="text-xs text-gray-500">
                    Legacy mode: only use this if the customer cannot grant admin consent to the multi-tenant app.
                    You&apos;ll need to manually create an app registration in their tenant first.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Directory (Tenant) ID</label>
                    <input
                      type="text"
                      value={tenantId}
                      onChange={(e) => setTenantId(e.target.value)}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Application (Client) ID</label>
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
                      Client Secret Value <span className="text-xs text-slate-500 font-normal">(NOT the Secret ID)</span>
                      {company.m365_client_secret_set && (
                        <span className="ml-2 text-xs text-teal-400 font-normal">(already set — only enter if rotating)</span>
                      )}
                    </label>
                    <input
                      type="password"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      placeholder={company.m365_client_secret_set ? '●●●●●●●● (leave blank to keep existing)' : 'Paste the Value column (NOT Secret ID)'}
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                  {credsError && (
                    <div className="bg-red-950/40 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300">{credsError}</div>
                  )}
                  {credsSaved && (
                    <div className="bg-green-950/40 border border-green-500/30 rounded-lg px-4 py-3 text-sm text-green-300">
                      ✓ Credentials saved. Proceed to test the connection.
                    </div>
                  )}
                  <button
                    onClick={handleSaveCreds}
                    disabled={savingCreds}
                    className="px-5 py-2 text-sm bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
                  >
                    {savingCreds ? 'Saving...' : 'Save Legacy Credentials'}
                  </button>
                </div>
              )}

              <div className="flex justify-between gap-3 pt-3 border-t border-white/10">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                >
                  ← Back
                </button>
                {(isMultiTenant || credsSaved) && (
                  <button
                    onClick={() => setStep(3)}
                    className="px-5 py-2 text-sm bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors font-medium"
                  >
                    Continue →
                  </button>
                )}
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

              {!isMultiTenant && !credsSaved && !company.m365_client_secret_set && (
                <div className="bg-yellow-950/40 border border-yellow-500/30 rounded-lg px-4 py-3 text-sm text-yellow-300">
                  ⚠️ No credentials saved yet. Go back to Step 2 and connect Microsoft 365 first.
                </div>
              )}

              <div className="bg-slate-800/50 rounded-lg px-4 py-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Connection mode</span>
                  <span className="text-gray-300 text-xs">
                    {isMultiTenant ? 'Multi-tenant admin consent' : 'Per-tenant app reg (legacy)'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Tenant ID</span>
                  <span className="font-mono text-gray-300 text-xs">{tenantId || company.m365_tenant_id || '—'}</span>
                </div>
                {!isMultiTenant && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Client ID</span>
                      <span className="font-mono text-gray-300 text-xs">{clientId || company.m365_client_id || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Client Secret</span>
                      <span className="text-gray-300 text-xs">{(credsSaved || company.m365_client_secret_set) ? '●●●●●●●● (saved)' : 'Not set'}</span>
                    </div>
                  </>
                )}
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
                    <>
                      ✓ Connection successful — tenant: <strong>{testResult.tenantName}</strong>
                      {testResult.warnings && testResult.warnings.length > 0 && (
                        <ul className="mt-2 list-disc list-inside text-xs text-slate-300 space-y-1">
                          {testResult.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      )}
                    </>
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
                    disabled={testing || (!isMultiTenant && !credsSaved && !company.m365_client_secret_set)}
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
                <h2 className="text-lg font-semibold text-white">Step 4 &mdash; Designate Manager &amp; Send Welcome Email</h2>
                <p className="text-gray-400 text-sm mt-1">
                  Pick the contact who should be the portal manager. They&rsquo;ll get an email instructing them to sign in with their Microsoft 365 credentials.
                </p>
              </div>

              {contactsLoading && (
                <p className="text-sm text-slate-400">Loading contacts&hellip;</p>
              )}

              {contactsError && (
                <div className="bg-red-950/40 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300">
                  Failed to load contacts: {contactsError}
                </div>
              )}

              {!contactsLoading && !contactsError && contactList.length === 0 && (
                <div className="bg-violet-950/40 border border-violet-500/30 rounded-lg px-4 py-3 text-sm text-violet-200 space-y-2">
                  <p>No contacts on file for this company yet.</p>
                  <p className="text-xs">
                    Go back to <strong>Step 1</strong> and run <strong>Sync Contacts</strong> in Pipeline Status, then return here. (Or add one manually on the{' '}
                    <Link href={`/admin/companies/${company.id}`} className="underline">company detail page</Link>.)
                  </p>
                </div>
              )}

              {!contactsLoading && contactList.length > 0 && (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {contactList.map((c) => {
                    const isSelected = selectedManagerId === c.id
                    return (
                      <label
                        key={c.id}
                        className={`flex items-start gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-teal-950/40 border-teal-500/50'
                            : 'bg-slate-800/40 border-white/10 hover:bg-slate-800/60'
                        }`}
                      >
                        <input
                          type="radio"
                          name="managerContact"
                          checked={isSelected}
                          onChange={() => setSelectedManagerId(c.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-white">{c.name || '(no name)'}</span>
                            {c.customerRole === 'CLIENT_MANAGER' && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-teal-500/20 text-teal-300 rounded border border-teal-500/30">CURRENT MANAGER</span>
                            )}
                            {c.inviteStatus === 'INVITED' && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-500/20 text-blue-300 rounded border border-blue-500/30">INVITED</span>
                            )}
                            {c.inviteStatus === 'ACCEPTED' && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-green-500/20 text-green-300 rounded border border-green-500/30">ACCEPTED</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 truncate">{c.email}</p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}

              {managerResult && (
                <div className={`rounded-lg px-4 py-3 text-sm ${
                  managerResult.ok
                    ? 'bg-green-950/40 border border-green-500/30 text-green-300'
                    : 'bg-red-950/40 border border-red-500/30 text-red-300'
                }`}>
                  {managerResult.ok ? '✓ ' : '✗ '}{managerResult.message}
                </div>
              )}

              <p className="text-xs text-slate-500">
                You can also manage roles and resend invites manually on the{' '}
                <Link href={`/admin/contacts?search=${encodeURIComponent(company.displayName)}`} className="underline text-teal-300">
                  Contacts page
                </Link>.
              </p>

              <div className="flex justify-between gap-3">
                <button
                  onClick={() => setStep(3)}
                  className="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                >
                  ← Back
                </button>
                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={handleSetManagerAndInvite}
                    disabled={!selectedManagerId || managerSubmitting || contactList.length === 0}
                    className="px-5 py-2 text-sm bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white rounded-lg transition-colors font-medium"
                  >
                    {managerSubmitting ? 'Sending…' : 'Set as Manager + Send Invite'}
                  </button>
                  {stepStatus[4] === 'complete' && (
                    <button
                      onClick={() => setStep(5)}
                      className="px-5 py-2 text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors font-medium"
                    >
                      Continue →
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 5: Finalize ── */}
          {step === 5 && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-white">Step 5 &mdash; Finalize</h2>
                <p className="text-gray-400 text-sm mt-1">
                  Review the final checklist, then mark this customer as fully onboarded.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  { label: 'Autotask synced',                       done: !!company.autotaskCompanyId },
                  { label: 'At least one contact set to CLIENT_MANAGER', done: hasManager || stepStatus[4] === 'complete', ...(!hasManager && stepStatus[4] !== 'complete' && { note: 'Designate one in Step 4' }) },
                  {
                    label: isMultiTenant ? 'Microsoft 365 admin consent granted' : 'M365 credentials saved',
                    done: isMultiTenant
                      ? !!company.m365_consent_granted_at
                      : credsSaved || !!company.m365_client_secret_set,
                  },
                  { label: 'Graph API connection verified',          done: testResult?.success ?? company.m365_setup_status === 'verified' },
                  { label: 'Welcome email sent',                     done: stepStatus[4] === 'complete' },
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
                <p className="font-semibold text-blue-100">Customer portal URL:</p>
                <CodeBlock>{`${process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com'}/portal/${company.slug}/dashboard`}</CodeBlock>
                <p className="mt-2 text-xs">
                  The manager you designated in Step 4 was emailed this link automatically and instructed to sign in with their Microsoft 365 credentials.
                </p>
              </InfoBox>

              {completeError && (
                <div className="bg-red-950/40 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300">
                  {completeError}
                </div>
              )}

              {stepStatus[5] === 'complete' && (
                <div className="bg-green-950/40 border border-green-500/30 rounded-lg px-4 py-3 text-sm text-green-300">
                  ✓ Onboarding complete. This customer is fully set up in the portal.
                </div>
              )}

              <div className="flex justify-between gap-3">
                <button
                  onClick={() => setStep(4)}
                  className="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                >
                  ← Back
                </button>
                <div className="flex gap-3">
                  {stepStatus[5] !== 'complete' && (
                    <button
                      onClick={handleComplete}
                      disabled={completing}
                      className="px-5 py-2 text-sm bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                    >
                      {completing ? 'Marking…' : '✓ Mark Onboarding Complete'}
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
