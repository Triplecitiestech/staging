import { StaffRole } from '@prisma/client'

/**
 * Staff Permission System for Triple Cities Tech
 *
 * Role Hierarchy (highest to lowest):
 *   SUPER_ADMIN > ADMIN > BILLING_ADMIN > TECHNICIAN
 *
 * Each role includes specific permissions. Higher roles inherit
 * all permissions from lower roles unless noted otherwise.
 */

// All possible permission keys
export type Permission =
  // Staff management
  | 'manage_staff_roles'
  | 'view_staff'
  | 'deactivate_staff'
  // Company/Project management
  | 'manage_companies'
  | 'delete_companies'
  | 'view_companies'
  | 'manage_projects'
  | 'view_projects'
  // Customer portal
  | 'invite_customers'
  | 'manage_customer_roles'
  | 'impersonate_customer'
  | 'view_contacts'
  // Blog
  | 'manage_blog'
  | 'approve_blog'
  // SOC / Security
  | 'manage_soc'
  | 'view_soc'
  // Marketing
  | 'manage_marketing'
  // Reporting
  | 'view_reports'
  | 'view_billing'
  | 'manage_billing'
  // System
  | 'system_settings'
  | 'run_migrations'
  | 'view_audit_log'
  | 'autotask_sync'
  // Tasks
  | 'update_task_status'
  | 'add_notes'
  | 'view_assigned_tasks'

// Permission definitions per role
const ROLE_PERMISSIONS: Record<StaffRole, Permission[]> = {
  SUPER_ADMIN: [
    'manage_staff_roles',
    'view_staff',
    'deactivate_staff',
    'manage_companies',
    'delete_companies',
    'view_companies',
    'manage_projects',
    'view_projects',
    'invite_customers',
    'manage_customer_roles',
    'impersonate_customer',
    'view_contacts',
    'manage_blog',
    'approve_blog',
    'manage_soc',
    'view_soc',
    'manage_marketing',
    'view_reports',
    'view_billing',
    'manage_billing',
    'system_settings',
    'run_migrations',
    'view_audit_log',
    'autotask_sync',
    'update_task_status',
    'add_notes',
    'view_assigned_tasks',
  ],
  ADMIN: [
    'view_staff',
    'manage_companies',
    'view_companies',
    'manage_projects',
    'view_projects',
    'invite_customers',
    'manage_customer_roles',
    'impersonate_customer',
    'view_contacts',
    'manage_blog',
    'approve_blog',
    'manage_soc',
    'view_soc',
    'manage_marketing',
    'view_reports',
    'view_billing',
    'view_audit_log',
    'autotask_sync',
    'update_task_status',
    'add_notes',
    'view_assigned_tasks',
  ],
  BILLING_ADMIN: [
    'view_staff',
    'view_companies',
    'view_projects',
    'view_contacts',
    'view_reports',
    'view_billing',
    'manage_billing',
    'view_assigned_tasks',
  ],
  TECHNICIAN: [
    'view_projects',
    'view_companies',
    'view_contacts',
    'update_task_status',
    'add_notes',
    'view_assigned_tasks',
  ],
}

/**
 * Per-user permission overrides stored as JSON on StaffUser
 */
export interface PermissionOverrides {
  granted?: Permission[]
  revoked?: Permission[]
}

/**
 * Parse permission overrides from JSON (safe for unknown DB data)
 */
export function parseOverrides(raw: unknown): PermissionOverrides {
  if (!raw || typeof raw !== 'object') return {}
  const obj = raw as Record<string, unknown>
  return {
    granted: Array.isArray(obj.granted) ? obj.granted.filter((p): p is Permission => typeof p === 'string') : [],
    revoked: Array.isArray(obj.revoked) ? obj.revoked.filter((p): p is Permission => typeof p === 'string') : [],
  }
}

/**
 * Check if a role has a specific permission, with optional per-user overrides
 */
export function hasPermission(
  role: StaffRole | string | undefined | null,
  permission: Permission,
  overrides?: PermissionOverrides | null,
): boolean {
  if (!role) return false

  // Per-user overrides take priority
  if (overrides?.granted?.includes(permission)) return true
  if (overrides?.revoked?.includes(permission)) return false

  const perms = ROLE_PERMISSIONS[role as StaffRole]
  if (!perms) return false
  return perms.includes(permission)
}

/**
 * Check if a role has ANY of the given permissions
 */
export function hasAnyPermission(
  role: StaffRole | string | undefined | null,
  permissions: Permission[],
  overrides?: PermissionOverrides | null,
): boolean {
  return permissions.some(p => hasPermission(role, p, overrides))
}

/**
 * Check if a role has ALL of the given permissions
 */
export function hasAllPermissions(
  role: StaffRole | string | undefined | null,
  permissions: Permission[],
  overrides?: PermissionOverrides | null,
): boolean {
  return permissions.every(p => hasPermission(role, p, overrides))
}

/**
 * Get effective permissions for a role + overrides
 */
export function getPermissions(role: StaffRole | string | undefined | null, overrides?: PermissionOverrides | null): Permission[] {
  if (!role) return []
  const base = ROLE_PERMISSIONS[role as StaffRole] || []
  if (!overrides) return base

  const result = new Set<Permission>(base)
  if (overrides.granted) overrides.granted.forEach(p => result.add(p))
  if (overrides.revoked) overrides.revoked.forEach(p => result.delete(p))
  return Array.from(result)
}

/**
 * Get all possible permissions (for admin UI)
 */
export function getAllPermissions(): Permission[] {
  return ALL_PERMISSIONS
}

/**
 * All permission keys (for UI rendering)
 */
export const ALL_PERMISSIONS: Permission[] = [
  'manage_staff_roles', 'view_staff', 'deactivate_staff',
  'manage_companies', 'delete_companies', 'view_companies',
  'manage_projects', 'view_projects',
  'invite_customers', 'manage_customer_roles', 'impersonate_customer', 'view_contacts',
  'manage_blog', 'approve_blog',
  'manage_soc', 'view_soc',
  'manage_marketing',
  'view_reports', 'view_billing', 'manage_billing',
  'system_settings', 'run_migrations', 'view_audit_log', 'autotask_sync',
  'update_task_status', 'add_notes', 'view_assigned_tasks',
]

/**
 * Human-readable labels and categories for permissions (admin UI)
 */
export const PERMISSION_META: Record<Permission, { label: string; category: string; description: string }> = {
  manage_staff_roles: { label: 'Manage Staff Roles', category: 'Staff', description: 'Change staff roles and permissions' },
  view_staff: { label: 'View Staff', category: 'Staff', description: 'View staff list and details' },
  deactivate_staff: { label: 'Deactivate Staff', category: 'Staff', description: 'Enable/disable staff accounts' },
  manage_companies: { label: 'Manage Companies', category: 'Companies', description: 'Create and edit companies' },
  delete_companies: { label: 'Delete Companies', category: 'Companies', description: 'Delete companies permanently' },
  view_companies: { label: 'View Companies', category: 'Companies', description: 'View company details' },
  manage_projects: { label: 'Manage Projects', category: 'Projects', description: 'Create and edit projects' },
  view_projects: { label: 'View Projects', category: 'Projects', description: 'View project details' },
  invite_customers: { label: 'Invite Customers', category: 'Customer Portal', description: 'Send portal invites to contacts' },
  manage_customer_roles: { label: 'Manage Customer Roles', category: 'Customer Portal', description: 'Change customer portal roles' },
  impersonate_customer: { label: 'Impersonate Customer', category: 'Customer Portal', description: 'View portal as a customer' },
  view_contacts: { label: 'View Contacts', category: 'Customer Portal', description: 'View contact list' },
  manage_blog: { label: 'Manage Blog', category: 'Content', description: 'Create and edit blog posts' },
  approve_blog: { label: 'Approve Blog', category: 'Content', description: 'Approve blog posts for publishing' },
  manage_soc: { label: 'Manage SOC', category: 'Security', description: 'Configure SOC rules and incidents' },
  view_soc: { label: 'View SOC', category: 'Security', description: 'View SOC dashboard and alerts' },
  manage_marketing: { label: 'Manage Marketing', category: 'Marketing', description: 'Create and send campaigns' },
  view_reports: { label: 'View Reports', category: 'Reporting', description: 'Access reports and analytics' },
  view_billing: { label: 'View Billing', category: 'Reporting', description: 'View billing information' },
  manage_billing: { label: 'Manage Billing', category: 'Reporting', description: 'Manage billing and invoices' },
  system_settings: { label: 'System Settings', category: 'System', description: 'Manage platform settings' },
  run_migrations: { label: 'Run Migrations', category: 'System', description: 'Execute database migrations' },
  view_audit_log: { label: 'View Audit Log', category: 'System', description: 'View system audit trail' },
  autotask_sync: { label: 'Autotask Sync', category: 'System', description: 'Trigger Autotask data sync' },
  update_task_status: { label: 'Update Tasks', category: 'Tasks', description: 'Change task status' },
  add_notes: { label: 'Add Notes', category: 'Tasks', description: 'Add notes to tasks and projects' },
  view_assigned_tasks: { label: 'View Assigned Tasks', category: 'Tasks', description: 'View tasks assigned to you' },
}

/**
 * Get permissions grouped by category (for admin UI)
 */
export function getPermissionsByCategory(): Record<string, { permission: Permission; label: string; description: string }[]> {
  const groups: Record<string, { permission: Permission; label: string; description: string }[]> = {}
  for (const perm of ALL_PERMISSIONS) {
    const meta = PERMISSION_META[perm]
    if (!groups[meta.category]) groups[meta.category] = []
    groups[meta.category].push({ permission: perm, label: meta.label, description: meta.description })
  }
  return groups
}

/**
 * Check if role can manage another role (for role assignment UI)
 * SUPER_ADMIN can assign any role
 * No other role can assign roles
 */
export function canAssignRole(assignerRole: StaffRole | string | undefined | null, _targetRole: StaffRole | string): boolean {
  if (!assignerRole) return false
  if (assignerRole !== 'SUPER_ADMIN') return false
  // SUPER_ADMIN can assign any role
  return true
}

/**
 * Role display metadata for UI
 */
export interface RoleDisplayInfo {
  label: string
  description: string
  color: string
  badgeColor: string
  permissions: string[]
}

export const STAFF_ROLE_DISPLAY: Record<string, RoleDisplayInfo> = {
  SUPER_ADMIN: {
    label: 'Super Admin',
    description: 'Full system control — manage staff, settings, billing, and all operations',
    color: 'text-rose-400',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    permissions: [
      'Manage staff roles and permissions',
      'System settings and migrations',
      'Delete companies and projects',
      'All Admin permissions',
    ],
  },
  ADMIN: {
    label: 'Admin',
    description: 'Full operational access — manage companies, projects, blog, SOC, and marketing',
    color: 'text-violet-400',
    badgeColor: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    permissions: [
      'Manage companies, projects, and contacts',
      'Invite customers and manage portal access',
      'Manage blog, SOC, and marketing',
      'View reports and billing',
      'Autotask sync operations',
    ],
  },
  BILLING_ADMIN: {
    label: 'Billing Admin',
    description: 'Financial access — view companies and projects, manage billing and reports',
    color: 'text-emerald-400',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    permissions: [
      'View companies and projects',
      'View and manage billing',
      'View all reports',
      'View contacts and staff list',
    ],
  },
  TECHNICIAN: {
    label: 'Technician',
    description: 'Field tech access — view assigned projects, update tasks, add notes',
    color: 'text-cyan-400',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    permissions: [
      'View assigned projects and tasks',
      'Update task status',
      'Add notes to tasks and projects',
      'View companies and contacts',
    ],
  },
}

export const CUSTOMER_ROLE_DISPLAY: Record<string, RoleDisplayInfo> = {
  CLIENT_MANAGER: {
    label: 'Manager',
    description: 'Full portal access for their company',
    color: 'text-purple-400',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    permissions: [
      'View all company projects and phases',
      'Submit and manage support tickets',
      'View ticket history and timelines',
      'Manage other contacts for their company',
    ],
  },
  CLIENT_USER: {
    label: 'User',
    description: 'Standard portal access',
    color: 'text-cyan-400',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    permissions: [
      'View company projects and phases',
      'Submit and view support tickets',
      'View ticket history and timelines',
    ],
  },
  CLIENT_VIEWER: {
    label: 'Viewer',
    description: 'Read-only portal access',
    color: 'text-slate-400',
    badgeColor: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    permissions: [
      'View company projects and phases',
      'View support tickets (cannot submit)',
    ],
  },
}

/**
 * Legacy role mapping — maps old role names to new ones
 * Used during migration period for any hardcoded checks
 */
export function mapLegacyRole(role: string): StaffRole {
  switch (role) {
    case 'ADMIN': return 'ADMIN' as StaffRole
    case 'MANAGER': return 'ADMIN' as StaffRole
    case 'VIEWER': return 'TECHNICIAN' as StaffRole
    default: return role as StaffRole
  }
}

/**
 * Ordered list of staff roles from highest to lowest privilege
 */
export const STAFF_ROLE_ORDER: StaffRole[] = [
  'SUPER_ADMIN' as StaffRole,
  'ADMIN' as StaffRole,
  'BILLING_ADMIN' as StaffRole,
  'TECHNICIAN' as StaffRole,
]
