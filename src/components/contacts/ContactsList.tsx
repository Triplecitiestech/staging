'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useDemoMode } from '@/components/admin/DemoModeProvider'

interface Contact {
  id: string
  name: string
  email: string
  title: string | null
  phone: string | null
  phoneType: 'MOBILE' | 'WORK' | null
  isPrimary: boolean
  isActive: boolean
  companyId: string
  customerRole: string
  inviteStatus: string
  invitedAt: string | null
  lastPortalLogin: string | null
  company: { id: string; displayName: string; slug: string }
}

interface StaffUser {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  lastLogin: string | null
  permissionOverrides?: { granted?: string[]; revoked?: string[] } | null
}

interface ContactsListProps {
  contacts: Contact[]
  staffUsers: StaffUser[]
  currentUserRole: string
  currentUserId: string
}

// Staff role display config with permission descriptions
const STAFF_ROLES: Record<string, {
  label: string
  color: string
  permissions: string[]
}> = {
  SUPER_ADMIN: {
    label: 'Super Admin',
    color: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    permissions: [
      'Manage staff roles & permissions',
      'System settings & migrations',
      'Delete companies/projects',
      'All Admin permissions',
    ],
  },
  ADMIN: {
    label: 'Admin',
    color: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    permissions: [
      'Manage companies, projects, contacts',
      'Invite customers & manage portal',
      'Blog, SOC, & marketing management',
      'View reports & billing',
      'Autotask sync operations',
    ],
  },
  BILLING_ADMIN: {
    label: 'Billing Admin',
    color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    permissions: [
      'View companies & projects',
      'View & manage billing',
      'View all reports',
      'View contacts & staff',
    ],
  },
  TECHNICIAN: {
    label: 'Technician',
    color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    permissions: [
      'View assigned projects & tasks',
      'Update task status',
      'Add notes to tasks/projects',
      'View companies & contacts',
    ],
  },
}

// All permissions with their base role assignments (for the permission editor)
const PERMISSION_CATEGORIES: { category: string; permissions: { key: string; label: string; description: string; roles: string[] }[] }[] = [
  {
    category: 'Staff',
    permissions: [
      { key: 'manage_staff_roles', label: 'Manage Staff Roles', description: 'Change staff roles and permissions', roles: ['SUPER_ADMIN'] },
      { key: 'view_staff', label: 'View Staff', description: 'View staff list and details', roles: ['SUPER_ADMIN', 'ADMIN', 'BILLING_ADMIN'] },
      { key: 'deactivate_staff', label: 'Deactivate Staff', description: 'Enable/disable staff accounts', roles: ['SUPER_ADMIN'] },
    ],
  },
  {
    category: 'Companies',
    permissions: [
      { key: 'manage_companies', label: 'Manage Companies', description: 'Create and edit companies', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { key: 'delete_companies', label: 'Delete Companies', description: 'Delete companies permanently', roles: ['SUPER_ADMIN'] },
      { key: 'view_companies', label: 'View Companies', description: 'View company details', roles: ['SUPER_ADMIN', 'ADMIN', 'BILLING_ADMIN', 'TECHNICIAN'] },
    ],
  },
  {
    category: 'Projects',
    permissions: [
      { key: 'manage_projects', label: 'Manage Projects', description: 'Create and edit projects', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { key: 'view_projects', label: 'View Projects', description: 'View project details', roles: ['SUPER_ADMIN', 'ADMIN', 'BILLING_ADMIN', 'TECHNICIAN'] },
    ],
  },
  {
    category: 'Customer Portal',
    permissions: [
      { key: 'invite_customers', label: 'Invite Customers', description: 'Send portal invites to contacts', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { key: 'manage_customer_roles', label: 'Manage Customer Roles', description: 'Change customer portal roles', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { key: 'impersonate_customer', label: 'Impersonate Customer', description: 'View portal as a customer', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { key: 'view_contacts', label: 'View Contacts', description: 'View contact list', roles: ['SUPER_ADMIN', 'ADMIN', 'BILLING_ADMIN', 'TECHNICIAN'] },
    ],
  },
  {
    category: 'Content',
    permissions: [
      { key: 'manage_blog', label: 'Manage Blog', description: 'Create and edit blog posts', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { key: 'approve_blog', label: 'Approve Blog', description: 'Approve blog posts for publishing', roles: ['SUPER_ADMIN', 'ADMIN'] },
    ],
  },
  {
    category: 'Security',
    permissions: [
      { key: 'manage_soc', label: 'Manage SOC', description: 'Configure SOC rules and incidents', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { key: 'view_soc', label: 'View SOC', description: 'View SOC dashboard and alerts', roles: ['SUPER_ADMIN', 'ADMIN'] },
    ],
  },
  {
    category: 'Marketing',
    permissions: [
      { key: 'manage_marketing', label: 'Manage Marketing', description: 'Create and send campaigns', roles: ['SUPER_ADMIN', 'ADMIN'] },
    ],
  },
  {
    category: 'Reporting',
    permissions: [
      { key: 'view_reports', label: 'View Reports', description: 'Access reports and analytics', roles: ['SUPER_ADMIN', 'ADMIN', 'BILLING_ADMIN'] },
      { key: 'view_billing', label: 'View Billing', description: 'View billing information', roles: ['SUPER_ADMIN', 'ADMIN', 'BILLING_ADMIN'] },
      { key: 'manage_billing', label: 'Manage Billing', description: 'Manage billing and invoices', roles: ['SUPER_ADMIN', 'BILLING_ADMIN'] },
    ],
  },
  {
    category: 'System',
    permissions: [
      { key: 'system_settings', label: 'System Settings', description: 'Manage platform settings', roles: ['SUPER_ADMIN'] },
      { key: 'run_migrations', label: 'Run Migrations', description: 'Execute database migrations', roles: ['SUPER_ADMIN'] },
      { key: 'view_audit_log', label: 'View Audit Log', description: 'View system audit trail', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { key: 'autotask_sync', label: 'Autotask Sync', description: 'Trigger Autotask data sync', roles: ['SUPER_ADMIN', 'ADMIN'] },
    ],
  },
  {
    category: 'Tasks',
    permissions: [
      { key: 'update_task_status', label: 'Update Tasks', description: 'Change task status', roles: ['SUPER_ADMIN', 'ADMIN', 'TECHNICIAN'] },
      { key: 'add_notes', label: 'Add Notes', description: 'Add notes to tasks and projects', roles: ['SUPER_ADMIN', 'ADMIN', 'TECHNICIAN'] },
      { key: 'view_assigned_tasks', label: 'View Assigned Tasks', description: 'View tasks assigned to you', roles: ['SUPER_ADMIN', 'ADMIN', 'BILLING_ADMIN', 'TECHNICIAN'] },
    ],
  },
]

// Customer role display config
const CUSTOMER_ROLES: Record<string, { label: string; color: string; permissions: string[] }> = {
  CLIENT_MANAGER: {
    label: 'Manager',
    color: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    permissions: ['View all company projects', 'Submit & manage tickets', 'Manage contacts for their company'],
  },
  CLIENT_USER: {
    label: 'User',
    color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    permissions: ['View company projects', 'Submit & view tickets', 'View ticket timelines'],
  },
  CLIENT_VIEWER: {
    label: 'Viewer',
    color: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    permissions: ['View company projects', 'View tickets (read-only)'],
  },
}

const INVITE_STATUS: Record<string, { label: string; color: string; dotColor: string }> = {
  NOT_INVITED: { label: 'Not Invited', color: 'text-slate-500', dotColor: 'bg-slate-500' },
  INVITED: { label: 'Pending', color: 'text-blue-400', dotColor: 'bg-blue-400' },
  ACCEPTED: { label: 'Active', color: 'text-emerald-400', dotColor: 'bg-emerald-400' },
  DECLINED: { label: 'Declined', color: 'text-rose-400', dotColor: 'bg-rose-400' },
}

export default function ContactsList({ contacts, staffUsers: initialStaff, currentUserRole, currentUserId }: ContactsListProps) {
  const router = useRouter()
  const demo = useDemoMode()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'clients' | 'staff'>('clients')
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set())
  const [sendingInvites, setSendingInvites] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewContact, setPreviewContact] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [roleEditing, setRoleEditing] = useState<string | null>(null)
  const [staffRoleEditing, setStaffRoleEditing] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [impersonating, setImpersonating] = useState<string | null>(null)
  const [staffUsers, setStaffUsers] = useState(initialStaff)
  const [permissionsOpen, setPermissionsOpen] = useState<string | null>(null)
  const [permEditorOpen, setPermEditorOpen] = useState<string | null>(null)
  const [permSaving, setPermSaving] = useState(false)

  useEffect(() => { setStaffUsers(initialStaff) }, [initialStaff])

  const isSuperAdmin = currentUserRole === 'SUPER_ADMIN'
  const canInvite = ['SUPER_ADMIN', 'ADMIN'].includes(currentUserRole)

  const filteredContacts = contacts.filter(c => {
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.company.displayName.toLowerCase().includes(q) ||
      (c.title && c.title.toLowerCase().includes(q))
  })

  const filteredStaff = staffUsers.filter(s => {
    const q = search.toLowerCase()
    return s.name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      (STAFF_ROLES[s.role]?.label || s.role).toLowerCase().includes(q)
  })

  const toggleSelect = (id: string) => {
    setSelectedContacts(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedContacts.size === filteredContacts.length) {
      setSelectedContacts(new Set())
    } else {
      setSelectedContacts(new Set(filteredContacts.map(c => c.id)))
    }
  }

  const sendInvites = useCallback(async (contactIds: string[]) => {
    setSendingInvites(true)
    setActionResult(null)
    try {
      const res = await fetch('/api/contacts/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds }),
      })
      const data = await res.json()
      if (!res.ok) {
        setActionResult({ type: 'error', message: data.error || 'Failed to send invites' })
      } else {
        setActionResult({ type: 'success', message: `Sent ${data.sent} invite(s)${data.failed > 0 ? `, ${data.failed} failed` : ''}` })
        setSelectedContacts(new Set())
        router.refresh()
      }
    } catch {
      setActionResult({ type: 'error', message: 'Failed to send invites' })
    }
    setSendingInvites(false)
  }, [router])

  const showPreview = async (contactId: string) => {
    setLoadingPreview(true)
    setPreviewContact(contactId)
    try {
      const res = await fetch(`/api/contacts/invite?contactId=${contactId}`)
      const data = await res.json()
      if (res.ok) {
        setPreviewHtml(data.html)
      }
    } catch { /* */ }
    setLoadingPreview(false)
  }

  const updateCustomerRole = async (contactId: string, customerRole: string) => {
    try {
      const res = await fetch('/api/contacts/invite', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, customerRole }),
      })
      if (res.ok) {
        setRoleEditing(null)
        router.refresh()
      }
    } catch { /* */ }
  }

  const updateStaffRole = async (staffId: string, role: string) => {
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, role }),
      })
      const data = await res.json()
      if (res.ok) {
        setStaffRoleEditing(null)
        setStaffUsers(prev => prev.map(s => s.id === staffId ? { ...s, role } : s))
        setActionResult({ type: 'success', message: `Updated ${data.staff.name} to ${STAFF_ROLES[role]?.label || role}` })
      } else {
        setActionResult({ type: 'error', message: data.error || 'Failed to update role' })
      }
    } catch {
      setActionResult({ type: 'error', message: 'Failed to update role' })
    }
  }

  const toggleStaffActive = async (staffId: string, isActive: boolean) => {
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, isActive }),
      })
      const data = await res.json()
      if (res.ok) {
        setStaffUsers(prev => prev.map(s => s.id === staffId ? { ...s, isActive } : s))
        setActionResult({ type: 'success', message: `${data.staff.name} ${isActive ? 'activated' : 'deactivated'}` })
      } else {
        setActionResult({ type: 'error', message: data.error || 'Failed to update status' })
      }
    } catch {
      setActionResult({ type: 'error', message: 'Failed to update status' })
    }
  }

  const togglePermissionOverride = async (staffId: string, permission: string, action: 'grant' | 'revoke' | 'reset') => {
    const staff = staffUsers.find(s => s.id === staffId)
    if (!staff) return

    const current = staff.permissionOverrides || { granted: [], revoked: [] }
    const granted = new Set(current.granted || [])
    const revoked = new Set(current.revoked || [])

    // Remove from both sets first
    granted.delete(permission)
    revoked.delete(permission)

    // Then apply the new action
    if (action === 'grant') granted.add(permission)
    else if (action === 'revoke') revoked.add(permission)
    // 'reset' just removes from both (uses role default)

    const newOverrides = {
      granted: Array.from(granted),
      revoked: Array.from(revoked),
    }

    // Clean up empty overrides
    const isClean = newOverrides.granted.length === 0 && newOverrides.revoked.length === 0

    setPermSaving(true)
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, permissionOverrides: isClean ? null : newOverrides }),
      })
      const data = await res.json()
      if (res.ok) {
        setStaffUsers(prev => prev.map(s =>
          s.id === staffId ? { ...s, permissionOverrides: isClean ? null : newOverrides } : s
        ))
      } else {
        setActionResult({ type: 'error', message: data.error || 'Failed to update permissions' })
      }
    } catch {
      setActionResult({ type: 'error', message: 'Failed to update permissions' })
    }
    setPermSaving(false)
  }

  const impersonateCustomer = async (companySlug: string, contactId?: string) => {
    setImpersonating(companySlug)
    try {
      const res = await fetch('/api/onboarding/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companySlug, contactId }),
      })
      const data = await res.json()
      if (res.ok && data.portalUrl) {
        window.open(data.portalUrl, '_blank')
      } else {
        setActionResult({ type: 'error', message: data.error || 'Failed to open portal' })
      }
    } catch {
      setActionResult({ type: 'error', message: 'Failed to open portal' })
    }
    setImpersonating(null)
  }

  return (
    <div>
      {/* Search and tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
        <div className="relative flex-1 w-full sm:max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={tab === 'clients' ? 'Search client contacts...' : 'Search staff...'}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            <button
              onClick={() => setTab('clients')}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${
                tab === 'clients'
                  ? 'bg-cyan-500 text-white'
                  : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Client Contacts ({contacts.length})
            </button>
            <button
              onClick={() => setTab('staff')}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${
                tab === 'staff'
                  ? 'bg-cyan-500 text-white'
                  : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700'
              }`}
            >
              TCT Staff ({staffUsers.length})
            </button>
          </div>
          {tab === 'clients' && selectedContacts.size > 0 && canInvite && (
            <button
              onClick={() => sendInvites(Array.from(selectedContacts))}
              disabled={sendingInvites}
              className="px-4 py-2 text-sm font-semibold bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 disabled:opacity-50 transition-colors"
            >
              {sendingInvites ? 'Sending...' : `Send Invite (${selectedContacts.size})`}
            </button>
          )}
        </div>
      </div>

      {/* Action result banner */}
      {actionResult && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
          actionResult.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
            : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
        }`}>
          {actionResult.message}
          <button onClick={() => setActionResult(null)} className="float-right text-xs opacity-60 hover:opacity-100">dismiss</button>
        </div>
      )}

      {/* ======================= CLIENT CONTACTS TAB ======================= */}
      {tab === 'clients' && (
        <div>
          {/* Customer role legend */}
          <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            {Object.entries(CUSTOMER_ROLES).map(([key, role]) => (
              <div key={key} className="bg-slate-800/30 border border-white/5 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${role.color}`}>
                    {role.label}
                  </span>
                </div>
                <ul className="space-y-0.5">
                  {role.permissions.map(p => (
                    <li key={p} className="text-[11px] text-slate-400 flex items-start gap-1.5">
                      <span className="text-cyan-500 mt-0.5 flex-shrink-0">&#10003;</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="bg-slate-800/50 border border-white/10 rounded-lg overflow-hidden">
            {filteredContacts.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-slate-400">{search ? 'No contacts match your search' : 'No client contacts yet'}</p>
                <p className="text-sm text-slate-500 mt-1">Contacts are synced from Autotask or added from the company detail page</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      {canInvite && (
                        <th className="text-left px-3 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={selectedContacts.size === filteredContacts.length && filteredContacts.length > 0}
                            onChange={selectAll}
                            className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/50"
                          />
                        </th>
                      )}
                      <th className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Contact</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">Email</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Company</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        <span className="inline-flex items-center gap-1 group relative">
                          Portal Role
                          <svg className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 cursor-help transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="absolute left-0 top-full mt-1 z-50 hidden group-hover:block w-56 px-3 py-2 text-[11px] font-normal normal-case tracking-normal text-slate-200 bg-slate-800 border border-white/10 rounded-lg shadow-xl">
                            Portal roles control what customers can see and do in the customer portal. These permissions are managed through Autotask contact settings.
                          </span>
                        </span>
                      </th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Portal Access</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Access Details</th>
                      {canInvite && (
                        <th className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContacts.map(contact => {
                      const invite = INVITE_STATUS[contact.inviteStatus] || INVITE_STATUS.NOT_INVITED
                      const role = CUSTOMER_ROLES[contact.customerRole] || CUSTOMER_ROLES.CLIENT_USER
                      return (
                        <tr key={contact.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          {canInvite && (
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                checked={selectedContacts.has(contact.id)}
                                onChange={() => toggleSelect(contact.id)}
                                className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/50"
                              />
                            </td>
                          )}
                          <td className="px-3 py-3">
                            <div
                              className="flex items-center gap-2 cursor-pointer"
                              onClick={() => router.push(`/admin/companies/${contact.companyId}`)}
                            >
                              <div className="w-8 h-8 rounded-full bg-violet-500/20 text-violet-300 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {demo.person(contact.name)[0]?.toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-white truncate">{demo.person(contact.name)}</div>
                                {contact.title && <div className="text-[11px] text-slate-500 truncate">{contact.title}</div>}
                                <div className="text-[11px] text-slate-500 md:hidden truncate">{demo.email(contact.email)}</div>
                                {!contact.isActive && <span className="text-[10px] text-red-400">Inactive</span>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-sm text-slate-300 hidden md:table-cell">{demo.email(contact.email)}</td>
                          <td className="px-3 py-3">
                            <span className="text-sm text-cyan-400">{demo.company(contact.company.displayName)}</span>
                          </td>
                          <td className="px-3 py-3">
                            {roleEditing === contact.id && canInvite ? (
                              <select
                                defaultValue={contact.customerRole}
                                onChange={e => updateCustomerRole(contact.id, e.target.value)}
                                onBlur={() => setRoleEditing(null)}
                                autoFocus
                                className="text-xs bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white focus:outline-none focus:border-cyan-500"
                              >
                                <option value="CLIENT_MANAGER">Manager</option>
                                <option value="CLIENT_USER">User</option>
                                <option value="CLIENT_VIEWER">Viewer</option>
                              </select>
                            ) : (
                              <button
                                onClick={() => canInvite && setRoleEditing(contact.id)}
                                title={role.permissions.join(', ')}
                                className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${role.color} ${canInvite ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'} transition-opacity`}
                              >
                                {role.label}
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${invite.dotColor} flex-shrink-0`} />
                              <span className={`text-xs font-medium ${invite.color}`}>
                                {invite.label}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="text-[11px] text-slate-500 space-y-0.5">
                              {contact.invitedAt && (
                                <div>Invited: {new Date(contact.invitedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                              )}
                              {contact.lastPortalLogin && (
                                <div>Last login: {new Date(contact.lastPortalLogin).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                              )}
                              {!contact.invitedAt && !contact.lastPortalLogin && (
                                <div className="text-slate-600">No portal activity</div>
                              )}
                            </div>
                          </td>
                          {canInvite && (
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); sendInvites([contact.id]) }}
                                  disabled={sendingInvites}
                                  title={contact.inviteStatus === 'INVITED' ? 'Resend invite' : 'Send portal invite'}
                                  className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); showPreview(contact.id) }}
                                  title="Preview invite email"
                                  className="p-1.5 text-slate-400 hover:text-violet-400 hover:bg-violet-500/10 rounded transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); impersonateCustomer(contact.company.slug, contact.id) }}
                                  disabled={impersonating === contact.company.slug}
                                  title={`Impersonate ${contact.name || contact.email} in ${demo.company(contact.company.displayName)} portal`}
                                  className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================= TCT STAFF TAB ======================= */}
      {tab === 'staff' && (
        <div>
          {/* Staff role legend with permissions */}
          <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(STAFF_ROLES).map(([key, role]) => (
              <div key={key} className="bg-slate-800/30 border border-white/5 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${role.color}`}>
                    {role.label}
                  </span>
                </div>
                <ul className="space-y-0.5">
                  {role.permissions.map(p => (
                    <li key={p} className="text-[11px] text-slate-400 flex items-start gap-1.5">
                      <span className="text-cyan-500 mt-0.5 flex-shrink-0">&#10003;</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="bg-slate-800/50 border border-white/10 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Permissions</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden lg:table-cell">Last Login</th>
                    {isSuperAdmin && (
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.map(staff => {
                    const roleInfo = STAFF_ROLES[staff.role] || STAFF_ROLES.TECHNICIAN
                    const isCurrentUser = staff.id === currentUserId
                    return (
                      <tr key={staff.id} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${!staff.isActive ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                              staff.role === 'SUPER_ADMIN' ? 'bg-rose-500/20 text-rose-300' :
                              staff.role === 'ADMIN' ? 'bg-violet-500/20 text-violet-300' :
                              staff.role === 'BILLING_ADMIN' ? 'bg-emerald-500/20 text-emerald-300' :
                              'bg-cyan-500/20 text-cyan-300'
                            }`}>
                              {demo.person(staff.name)[0]?.toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-white truncate">
                                {demo.person(staff.name)}
                                {isCurrentUser && <span className="text-[10px] text-slate-500 ml-1">(you)</span>}
                              </div>
                              <div className="text-[11px] text-slate-500 md:hidden truncate">{demo.email(staff.email)}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 hidden md:table-cell">{demo.email(staff.email)}</td>
                        <td className="px-4 py-3">
                          {staffRoleEditing === staff.id && isSuperAdmin && !isCurrentUser ? (
                            <select
                              defaultValue={staff.role}
                              onChange={e => updateStaffRole(staff.id, e.target.value)}
                              onBlur={() => setStaffRoleEditing(null)}
                              autoFocus
                              className="text-xs bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white focus:outline-none focus:border-cyan-500"
                            >
                              <option value="SUPER_ADMIN">Super Admin</option>
                              <option value="ADMIN">Admin</option>
                              <option value="BILLING_ADMIN">Billing Admin</option>
                              <option value="TECHNICIAN">Technician</option>
                            </select>
                          ) : (
                            <button
                              onClick={() => isSuperAdmin && !isCurrentUser && setStaffRoleEditing(staff.id)}
                              className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${roleInfo.color} ${
                                isSuperAdmin && !isCurrentUser ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'
                              } transition-opacity`}
                            >
                              {roleInfo.label}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            const overrides = staff.permissionOverrides || { granted: [], revoked: [] }
                            const grantedCount = (overrides.granted || []).length
                            const revokedCount = (overrides.revoked || []).length
                            const hasOverrides = grantedCount > 0 || revokedCount > 0
                            return (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setPermissionsOpen(permissionsOpen === staff.id ? null : staff.id)}
                                  className="text-[11px] text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                                >
                                  {roleInfo.permissions.length} base
                                  <svg className={`w-3 h-3 transition-transform ${permissionsOpen === staff.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                                {hasOverrides && (
                                  <span className="flex items-center gap-1">
                                    {grantedCount > 0 && (
                                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">+{grantedCount}</span>
                                    )}
                                    {revokedCount > 0 && (
                                      <span className="text-[10px] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">-{revokedCount}</span>
                                    )}
                                  </span>
                                )}
                                {isSuperAdmin && !isCurrentUser && (
                                  <button
                                    onClick={() => setPermEditorOpen(permEditorOpen === staff.id ? null : staff.id)}
                                    title="Manage permissions"
                                    className="text-[10px] text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 px-1.5 py-0.5 rounded transition-colors"
                                  >
                                    Edit
                                  </button>
                                )}
                              </div>
                            )
                          })()}
                          {permissionsOpen === staff.id && (
                            <ul className="mt-1 space-y-0.5">
                              {roleInfo.permissions.map(p => (
                                <li key={p} className="text-[10px] text-slate-500 flex items-start gap-1">
                                  <span className="text-cyan-500 flex-shrink-0">&#10003;</span>
                                  {p}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                            staff.isActive
                              ? 'bg-green-500/20 text-green-300'
                              : 'bg-red-500/20 text-red-300'
                          }`}>
                            {staff.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-400 hidden lg:table-cell">
                          {staff.lastLogin
                            ? new Date(staff.lastLogin).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : 'Never'}
                        </td>
                        {isSuperAdmin && (
                          <td className="px-4 py-3">
                            {!isCurrentUser && (
                              <button
                                onClick={() => toggleStaffActive(staff.id, !staff.isActive)}
                                title={staff.isActive ? 'Deactivate account' : 'Activate account'}
                                className={`p-1.5 rounded transition-colors ${
                                  staff.isActive
                                    ? 'text-slate-400 hover:text-rose-400 hover:bg-rose-500/10'
                                    : 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10'
                                }`}
                              >
                                {staff.isActive ? (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                )}
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Permission Editor Modal */}
      {permEditorOpen && (() => {
        const staff = staffUsers.find(s => s.id === permEditorOpen)
        if (!staff) return null
        const overrides = staff.permissionOverrides || { granted: [], revoked: [] }
        const grantedSet = new Set(overrides.granted || [])
        const revokedSet = new Set(overrides.revoked || [])
        const roleInfo = STAFF_ROLES[staff.role] || STAFF_ROLES.TECHNICIAN

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setPermEditorOpen(null)}>
            <div className="bg-slate-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <div>
                  <h3 className="text-lg font-bold text-white">Manage Permissions</h3>
                  <p className="text-sm text-slate-400 mt-0.5">
                    {demo.person(staff.name)} &middot; <span className={`${roleInfo.color.split(' ').find(c => c.startsWith('text-'))}`}>{roleInfo.label}</span>
                  </p>
                </div>
                <button
                  onClick={() => setPermEditorOpen(null)}
                  className="p-1 text-slate-400 hover:text-white rounded transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                <div className="bg-slate-800/50 border border-white/5 rounded-lg px-4 py-3 text-xs text-slate-400">
                  <span className="text-cyan-400 font-medium">Base role:</span> {roleInfo.label} &mdash; permissions from the role are shown as defaults.
                  Click to grant (+) or revoke (-) individual permissions beyond the base role.
                </div>

                {PERMISSION_CATEGORIES.map(cat => (
                  <div key={cat.category}>
                    <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">{cat.category}</h4>
                    <div className="space-y-1">
                      {cat.permissions.map(perm => {
                        const fromRole = perm.roles.includes(staff.role)
                        const isGranted = grantedSet.has(perm.key)
                        const isRevoked = revokedSet.has(perm.key)
                        const effective = isGranted || (fromRole && !isRevoked)

                        return (
                          <div key={perm.key} className={`flex items-center justify-between rounded-lg px-3 py-2 border transition-colors ${
                            isGranted ? 'bg-emerald-500/10 border-emerald-500/20' :
                            isRevoked ? 'bg-rose-500/10 border-rose-500/20' :
                            'bg-slate-800/30 border-white/5'
                          }`}>
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                                effective ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/50 text-slate-600'
                              }`}>
                                {effective ? (
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm text-white flex items-center gap-2">
                                  {perm.label}
                                  {isGranted && <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/20 px-1 rounded">GRANTED</span>}
                                  {isRevoked && <span className="text-[9px] font-bold text-rose-400 bg-rose-500/20 px-1 rounded">REVOKED</span>}
                                  {!isGranted && !isRevoked && fromRole && <span className="text-[9px] text-slate-500">from role</span>}
                                </div>
                                <div className="text-[11px] text-slate-500">{perm.description}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                              {/* Grant button — show if not already effectively granted via role */}
                              {(!fromRole || isRevoked) && !isGranted && (
                                <button
                                  onClick={() => togglePermissionOverride(staff.id, perm.key, 'grant')}
                                  disabled={permSaving}
                                  title="Grant this permission"
                                  className="text-[10px] text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded transition-colors disabled:opacity-50"
                                >
                                  +Grant
                                </button>
                              )}
                              {/* Revoke button — show if currently effective */}
                              {effective && !isRevoked && (
                                <button
                                  onClick={() => togglePermissionOverride(staff.id, perm.key, 'revoke')}
                                  disabled={permSaving}
                                  title="Revoke this permission"
                                  className="text-[10px] text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-2 py-1 rounded transition-colors disabled:opacity-50"
                                >
                                  -Revoke
                                </button>
                              )}
                              {/* Reset button — show if overridden */}
                              {(isGranted || isRevoked) && (
                                <button
                                  onClick={() => togglePermissionOverride(staff.id, perm.key, 'reset')}
                                  disabled={permSaving}
                                  title="Reset to role default"
                                  className="text-[10px] text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-700 px-2 py-1 rounded transition-colors disabled:opacity-50"
                                >
                                  Reset
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-6 py-3 border-t border-white/10 flex items-center justify-between">
                <p className="text-[11px] text-slate-500">
                  Changes are saved automatically
                </p>
                <button
                  onClick={() => setPermEditorOpen(null)}
                  className="text-sm text-white bg-cyan-600 hover:bg-cyan-500 px-4 py-1.5 rounded-lg transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Email Preview Modal */}
      {previewContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h3 className="text-lg font-bold text-white">Invite Email Preview</h3>
              <button
                onClick={() => { setPreviewContact(null); setPreviewHtml(null) }}
                className="p-1 text-slate-400 hover:text-white rounded transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-2 bg-white rounded-b-xl">
              {loadingPreview ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-slate-500 text-sm">Loading preview...</div>
                </div>
              ) : previewHtml ? (
                <iframe
                  srcDoc={previewHtml}
                  className="w-full h-[60vh] border-0"
                  title="Email Preview"
                  sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                />
              ) : (
                <div className="flex items-center justify-center h-64">
                  <div className="text-slate-500 text-sm">Failed to load preview</div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
              <button
                onClick={() => { setPreviewContact(null); setPreviewHtml(null) }}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  if (previewContact) {
                    sendInvites([previewContact])
                    setPreviewContact(null)
                    setPreviewHtml(null)
                  }
                }}
                disabled={sendingInvites}
                className="px-4 py-2 text-sm font-semibold bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 disabled:opacity-50 transition-colors"
              >
                Send This Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
