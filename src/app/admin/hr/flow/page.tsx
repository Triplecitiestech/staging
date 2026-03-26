'use client'

import AdminHeader from '@/components/admin/AdminHeader'

// ─── Flow step types ─────────────────────────────────────────────────────────

interface FlowStep {
  id: string
  label: string
  system: 'portal' | 'platform' | 'autotask' | 'graph' | 'email' | 'cron'
  description: string
  condition?: string
}

interface FlowBranch {
  label: string
  condition: string
  steps: FlowStep[]
}

// ─── Color mapping per system ────────────────────────────────────────────────

const SYSTEM_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  portal:   { bg: 'bg-blue-950/50',   border: 'border-blue-500/40',  text: 'text-blue-300',  badge: 'bg-blue-500/20 text-blue-300' },
  platform: { bg: 'bg-slate-800/50',  border: 'border-slate-500/40', text: 'text-slate-300', badge: 'bg-slate-500/20 text-slate-300' },
  autotask: { bg: 'bg-cyan-950/50',   border: 'border-cyan-500/40',  text: 'text-cyan-300',  badge: 'bg-cyan-500/20 text-cyan-300' },
  graph:    { bg: 'bg-violet-950/50',  border: 'border-violet-500/40', text: 'text-violet-300', badge: 'bg-violet-500/20 text-violet-300' },
  email:    { bg: 'bg-emerald-950/50', border: 'border-emerald-500/40', text: 'text-emerald-300', badge: 'bg-emerald-500/20 text-emerald-300' },
  cron:     { bg: 'bg-rose-950/50',    border: 'border-rose-500/40',  text: 'text-rose-300',  badge: 'bg-rose-500/20 text-rose-300' },
}

const SYSTEM_LABELS: Record<string, string> = {
  portal: 'Customer Portal',
  platform: 'TCT Platform',
  autotask: 'Autotask PSA',
  graph: 'Microsoft Graph',
  email: 'Email (Resend)',
  cron: 'Scheduled Cron',
}

// ─── Onboarding flow ─────────────────────────────────────────────────────────

const ONBOARDING_STEPS: FlowStep[] = [
  { id: 'ob-1',  label: 'Manager submits onboarding form',         system: 'portal',   description: 'Customer portal form with employee details, license selection, group memberships, computer needs.' },
  { id: 'ob-2',  label: 'Validate requester & create HR request',  system: 'platform', description: 'Verify submitter is CLIENT_MANAGER or isPrimary. Store answers in hr_requests table.' },
  { id: 'ob-3',  label: 'Resolve display names from tenant',       system: 'graph',    description: 'Fetch group names, license SKU names, SharePoint site names from Microsoft Graph to build human-readable ticket.' },
  { id: 'ob-4',  label: 'Load custom question metadata',           system: 'platform', description: 'Load per-client custom sections and question labels from customer_custom_sections/questions tables.' },
  { id: 'ob-5',  label: 'Create Autotask ticket',                  system: 'autotask', description: 'POST to Autotask Tickets API. Routes to Sales queue if new computer required. Includes full formatted description.' },
  { id: 'ob-6',  label: 'Log time entry (0.5 hours)',              system: 'autotask', description: 'POST to Autotask TimeEntries API with resource ID and summary.' },
  { id: 'ob-7',  label: 'Create M365 user account',               system: 'graph',    description: 'POST /users with displayName, UPN, temp password, job title, department, usage location. If start_date is in the future, account is created LOCKED (accountEnabled=false).' },
  { id: 'ob-8',  label: 'Assign license',                         system: 'graph',    description: 'POST /users/{id}/assignLicense with selected SKU ID.' },
  { id: 'ob-9',  label: 'Add to security groups',                 system: 'graph',    description: 'POST /groups/{id}/members/$ref for each selected security group.' },
  { id: 'ob-10', label: 'Add to distribution lists',              system: 'graph',    description: 'POST /groups/{id}/members/$ref for each selected distribution list.' },
  { id: 'ob-11', label: 'Add to Teams groups',                    system: 'graph',    description: 'POST /groups/{id}/members/$ref for each selected Teams group.' },
  { id: 'ob-12', label: 'Add to SharePoint sites',                system: 'graph',    description: 'POST /sites/{id}/permissions for each selected SharePoint site.' },
  { id: 'ob-13', label: 'Clone permissions (if requested)',        system: 'graph',    description: 'Copy groups and licenses from source user to new user.', condition: 'clone_permissions = yes' },
  { id: 'ob-14', label: 'Update ticket with provisioning results', system: 'autotask', description: 'PATCH ticket description with results, groups added, failed steps, and manual action checklist.' },
  { id: 'ob-15', label: 'Add customer-visible completion note',    system: 'autotask', description: 'Ticket note (publish=1) visible to customer: email, license, groups added.' },
  { id: 'ob-16', label: 'Send credential email',                  system: 'email',    description: 'Email with new UPN + temp password. If account is locked for future start date, email notes the account is locked and when it will be unlocked.' },
  { id: 'ob-17', label: 'Close, schedule, or leave open',         system: 'autotask', description: 'Close (status 5) if all automated and start_date is today/past. Set to "scheduled" if future start date. Left open if steps failed.' },
]

// ─── Scheduled Onboarding flow ──────────────────────────────────────────────

const ONBOARDING_SCHEDULED: FlowBranch = {
  label: 'Scheduled Onboarding (Future Start Date)',
  condition: 'start_date is in the future — account is provisioned but locked until start date',
  steps: [
    { id: 'so-1',  label: 'Manager submits onboarding form',          system: 'portal',   description: 'Same form — start date is set to a future date.' },
    { id: 'so-2',  label: 'Validate requester & create HR request',   system: 'platform', description: 'Same validation and storage.' },
    { id: 'so-3',  label: 'Create Autotask ticket',                   system: 'autotask', description: 'Ticket created immediately with full description.' },
    { id: 'so-4',  label: 'Log time entry (0.5 hours)',               system: 'autotask', description: 'Time logged immediately.' },
    { id: 'so-5',  label: 'Create M365 user (LOCKED)',                system: 'graph',    description: 'Account created with accountEnabled=false. User cannot sign in yet.' },
    { id: 'so-6',  label: 'Assign license, groups, sites',            system: 'graph',    description: 'All permissions configured immediately so everything is ready on day one.' },
    { id: 'so-7',  label: 'Send credential email with locked notice', system: 'email',    description: 'Credentials sent now with warning: "Do NOT sign in before start date — account is locked."' },
    { id: 'so-8',  label: 'Add scheduled note to ticket',             system: 'autotask', description: 'Internal note: account provisioned but locked, will unlock on start date at 12:01 AM EST.' },
    { id: 'so-9',  label: 'Set request status to "scheduled"',        system: 'platform', description: 'HR request saved with status=scheduled. Cron will unlock on start date.' },
    { id: 'so-10', label: 'Cron runs at 12:01 AM EST daily',          system: 'cron',     description: 'Checks for scheduled onboarding requests where start_date <= today.' },
    { id: 'so-11', label: 'Enable account (unlock sign-in)',          system: 'graph',    description: 'PATCH /users/{id} accountEnabled=true. Employee can now sign in.' },
    { id: 'so-12', label: 'Add unlock note to ticket',                system: 'autotask', description: 'Customer-visible note: "Account unlocked — employee can now sign in."' },
    { id: 'so-13', label: 'Close ticket',                             system: 'autotask', description: 'Status 5 (Complete) — onboarding is fully done.' },
  ],
}

// ─── Offboarding flow ────────────────────────────────────────────────────────

const OFFBOARDING_IMMEDIATE_STEPS: FlowStep[] = [
  { id: 'of-1',  label: 'Manager submits offboarding form',        system: 'portal',   description: 'Customer portal form with employee email, last day, urgency, data/device/file handling preferences.' },
  { id: 'of-2',  label: 'Validate requester & create HR request',  system: 'platform', description: 'Verify submitter is CLIENT_MANAGER or isPrimary. Store answers in hr_requests table.' },
  { id: 'of-3',  label: 'Resolve display names from tenant',       system: 'graph',    description: 'Fetch group names, license SKU names from Microsoft Graph for human-readable ticket.' },
  { id: 'of-4',  label: 'Load custom question metadata',           system: 'platform', description: 'Load per-client custom sections and question labels.' },
  { id: 'of-5',  label: 'Create Autotask ticket',                  system: 'autotask', description: 'POST to Autotask Tickets API with full formatted description including human-readable labels.' },
  { id: 'of-6',  label: 'Log time entry (1.0 hours)',              system: 'autotask', description: 'POST to Autotask TimeEntries API.' },
  { id: 'of-7',  label: 'Find user in Azure AD',                  system: 'graph',    description: 'GET /users?$filter=mail eq ... — resolves display name for ticket title.' },
  { id: 'of-8',  label: 'Revoke all active sessions',             system: 'graph',    description: 'POST /users/{id}/revokeSignInSessions — immediate termination only.', condition: 'Immediate termination' },
  { id: 'of-9',  label: 'Transfer OneDrive files',                system: 'graph',    description: 'POST /users/{id}/drive/root/invite — shares OneDrive with designated recipient.', condition: 'file_handling = transfer' },
  { id: 'of-10', label: 'Archive OneDrive to SharePoint',         system: 'graph',    description: 'Copy files to HR SharePoint site archive folder.', condition: 'file_handling = archive' },
  { id: 'of-11', label: 'Disable account',                        system: 'graph',    description: 'PATCH /users/{id} accountEnabled=false. Happens AFTER OneDrive operations.' },
  { id: 'of-12', label: 'Remove from all groups',                 system: 'graph',    description: 'DELETE /groups/{id}/members/{userId}/$ref for each group membership.' },
  { id: 'of-13', label: 'Remove all licenses',                    system: 'graph',    description: 'POST /users/{id}/assignLicense with removeLicenses for each SKU.' },
  { id: 'of-14', label: 'Update ticket with results',             system: 'autotask', description: 'PATCH ticket with groups/licenses removed by name, failed steps, manual action checklist.' },
  { id: 'of-15', label: 'Add customer-visible completion note',   system: 'autotask', description: 'Ticket note listing specific groups/licenses removed and pending manual steps.' },
  { id: 'of-16', label: 'Send offboarding confirmation email',    system: 'email',    description: 'Email to requester listing specific groups/licenses removed, manual steps pending.' },
  { id: 'of-17', label: 'Close or escalate ticket',               system: 'autotask', description: 'Close (status 5) if all automated. Escalate to high priority if manual steps remain.' },
]

const OFFBOARDING_SCHEDULED: FlowBranch = {
  label: 'Scheduled Offboarding (Future Date)',
  condition: 'last_day is in the future AND urgency is NOT immediate_termination',
  steps: [
    { id: 'os-1', label: 'Manager submits offboarding form',        system: 'portal',   description: 'Same form — last working day is set to a future date.' },
    { id: 'os-2', label: 'Validate requester & create HR request',  system: 'platform', description: 'Same validation. Status set to pending initially.' },
    { id: 'os-3', label: 'Create Autotask ticket with scheduled note', system: 'autotask', description: 'Ticket created immediately. Internal + customer note: "Scheduled to execute on [date] at 12:01 AM EST."' },
    { id: 'os-4', label: 'Log time entry (1.0 hours)',              system: 'autotask', description: 'Time logged immediately on ticket creation.' },
    { id: 'os-5', label: 'Set request status to "scheduled"',       system: 'platform', description: 'HR request saved with status=scheduled. M365 actions are NOT executed yet.' },
    { id: 'os-6', label: 'Cron runs at 12:01 AM EST daily',        system: 'cron',     description: '/api/cron/process-scheduled-offboards checks for requests where last_day <= today.' },
    { id: 'os-7', label: 'Execute all M365 actions',               system: 'graph',    description: 'Same pipeline as immediate: find user, OneDrive transfer/archive, disable, remove groups, remove licenses.' },
    { id: 'os-8', label: 'Update ticket with execution results',   system: 'autotask', description: 'PATCH ticket description + add notes with specific groups/licenses removed.' },
    { id: 'os-9', label: 'Send confirmation email to requester',   system: 'email',    description: 'Email with full details of what was removed.' },
    { id: 'os-10', label: 'Close or escalate ticket',              system: 'autotask', description: 'Close if all automated. Escalate if manual steps remain for TCT review.' },
  ],
}

// ─── Rendering components ────────────────────────────────────────────────────

function StepCard({ step, index }: { step: FlowStep; index: number }) {
  const colors = SYSTEM_COLORS[step.system] ?? SYSTEM_COLORS.platform
  return (
    <div className={`relative flex gap-4 ${index > 0 ? 'mt-1' : ''}`}>
      {/* Connector line */}
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${colors.border} ${colors.bg} ${colors.text}`}>
          {index + 1}
        </div>
        <div className="w-px flex-1 bg-slate-700/50 min-h-[8px]" />
      </div>
      {/* Card */}
      <div className={`flex-1 rounded-lg border ${colors.border} ${colors.bg} p-3 mb-2`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className={`font-medium text-sm ${colors.text}`}>{step.label}</h4>
            <p className="text-xs text-slate-400 mt-1">{step.description}</p>
          </div>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${colors.badge}`}>
            {SYSTEM_LABELS[step.system]}
          </span>
        </div>
        {step.condition && (
          <div className="mt-2 text-[10px] text-slate-500 italic">Condition: {step.condition}</div>
        )}
      </div>
    </div>
  )
}

function FlowSection({ title, subtitle, steps }: { title: string; subtitle?: string; steps: FlowStep[] }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
      {subtitle && <p className="text-sm text-slate-400 mb-4">{subtitle}</p>}
      <div className="space-y-0">
        {steps.map((step, i) => (
          <StepCard key={step.id} step={step} index={i} />
        ))}
      </div>
    </div>
  )
}

function SystemLegend() {
  return (
    <div className="flex flex-wrap gap-3 mb-8">
      {Object.entries(SYSTEM_LABELS).map(([key, label]) => {
        const colors = SYSTEM_COLORS[key]
        return (
          <div key={key} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${colors.border} ${colors.bg}`}>
            <div className={`w-2.5 h-2.5 rounded-full ${colors.border} border-2`} />
            <span className={`text-xs font-medium ${colors.text}`}>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function HRFlowPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950">
      <AdminHeader />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-white mb-2">HR Automation Flow</h1>
        <p className="text-slate-400 mb-6">
          Visual map of all systems involved in employee onboarding and offboarding.
          Each step shows which system handles the action and what it does.
        </p>

        <SystemLegend />

        <div className="space-y-12">
          <FlowSection
            title="Employee Onboarding (Immediate)"
            subtitle="When start_date is today or in the past. All actions execute in sequence and account is ready immediately."
            steps={ONBOARDING_STEPS}
          />

          <div className="border-t border-slate-700/50 pt-8">
            <FlowSection
              title={ONBOARDING_SCHEDULED.label}
              subtitle={ONBOARDING_SCHEDULED.condition}
              steps={ONBOARDING_SCHEDULED.steps}
            />
          </div>

          <div className="border-t border-slate-700/50 pt-8">
            <FlowSection
              title="Employee Offboarding (Immediate)"
              subtitle="When last working day is today or in the past, OR urgency is Immediate Termination. All actions execute now."
              steps={OFFBOARDING_IMMEDIATE_STEPS}
            />
          </div>

          <div className="border-t border-slate-700/50 pt-8">
            <FlowSection
              title={OFFBOARDING_SCHEDULED.label}
              subtitle={OFFBOARDING_SCHEDULED.condition}
              steps={OFFBOARDING_SCHEDULED.steps}
            />
          </div>

          {/* Key decision points */}
          <div className="border-t border-slate-700/50 pt-8">
            <h3 className="text-lg font-semibold text-white mb-4">Key Decision Points</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
                <h4 className="text-sm font-semibold text-white mb-2">Immediate vs Scheduled (Offboarding)</h4>
                <ul className="text-xs text-slate-400 space-y-1">
                  <li>If <code className="text-cyan-400">last_day</code> is today or in the past &rarr; execute immediately</li>
                  <li>If <code className="text-cyan-400">last_day</code> is in the future &rarr; schedule for 12:01 AM EST on that date</li>
                  <li>If <code className="text-cyan-400">urgency_type</code> = immediate_termination &rarr; always execute immediately</li>
                </ul>
              </div>
              <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
                <h4 className="text-sm font-semibold text-white mb-2">Immediate vs Scheduled (Onboarding)</h4>
                <ul className="text-xs text-slate-400 space-y-1">
                  <li>If <code className="text-cyan-400">start_date</code> is today or in the past &rarr; account created and unlocked immediately</li>
                  <li>If <code className="text-cyan-400">start_date</code> is in the future &rarr; account created LOCKED, unlocked at 12:01 AM EST on start date</li>
                  <li>All groups, licenses, and SharePoint access configured immediately in both cases</li>
                  <li>Credentials shared in advance so employee is ready on day one</li>
                </ul>
              </div>
              <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
                <h4 className="text-sm font-semibold text-white mb-2">Ticket Closure</h4>
                <ul className="text-xs text-slate-400 space-y-1">
                  <li>All steps succeeded, no manual steps &rarr; ticket auto-closed</li>
                  <li>Manual steps remain (shared mailbox, failed steps) &rarr; ticket escalated to high priority</li>
                  <li>New computer required (onboarding) &rarr; ticket routed to Sales queue</li>
                </ul>
              </div>
              <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
                <h4 className="text-sm font-semibold text-white mb-2">OneDrive Before Disable</h4>
                <ul className="text-xs text-slate-400 space-y-1">
                  <li>OneDrive transfer and archive run <span className="text-emerald-400">before</span> account disable</li>
                  <li>Graph API cannot access a disabled user&apos;s drive</li>
                  <li>Sessions are revoked first (immediate termination) but account stays enabled for file ops</li>
                </ul>
              </div>
              <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
                <h4 className="text-sm font-semibold text-white mb-2">License Availability</h4>
                <ul className="text-xs text-slate-400 space-y-1">
                  <li>Available licenses are fetched live from the tenant via Graph API</li>
                  <li>Only licenses with available seats (&gt; 0) are shown in the form</li>
                  <li>If license assignment fails &rarr; becomes a manual step on the ticket</li>
                  <li>License procurement happens through <span className="text-violet-400">Pax8</span> (cloud marketplace for MSPs)</li>
                  <li>Pax8 integration not yet automated &mdash; TCT staff manually procure licenses when needed</li>
                </ul>
              </div>
              <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
                <h4 className="text-sm font-semibold text-white mb-2">Manual Steps (Not Yet Automated)</h4>
                <ul className="text-xs text-slate-400 space-y-1">
                  <li>Shared mailbox conversion &rarr; requires Exchange Admin Center</li>
                  <li>Email forwarding verification &rarr; manual check needed</li>
                  <li>SharePoint archive review &rarr; human confirms completeness</li>
                  <li>GDAP automation planned for future (eliminates per-tenant cert setup)</li>
                  <li>Pax8 license procurement &rarr; manual when no seats available</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Last updated */}
          <div className="text-center text-xs text-slate-600 pt-4">
            Last updated: 2026-03-26 &mdash; Added scheduled onboarding (locked accounts), scheduled offboarding, license availability, Pax8 reference
          </div>
        </div>
      </div>
    </div>
  )
}
