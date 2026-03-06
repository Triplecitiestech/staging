/**
 * Demo Mode - Contoso Industries
 * Provides realistic demo data for safe demonstrations
 * without exposing real customer data.
 */

export const DEMO_COMPANY = {
  id: 'demo-contoso-001',
  slug: 'contoso-industries',
  displayName: 'Contoso Industries',
  primaryContact: 'Sarah Mitchell',
  contactEmail: 'sarah.mitchell@contoso.com',
  contactTitle: 'VP of Technology',
}

export const DEMO_PROJECTS = [
  {
    id: 'demo-proj-001',
    title: 'Network Infrastructure Upgrade',
    projectType: 'INFRASTRUCTURE',
    status: 'ACTIVE',
    createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    company: DEMO_COMPANY,
    phases: [
      {
        id: 'demo-phase-001',
        title: 'Assessment & Planning',
        description: 'Initial network assessment and migration planning',
        status: 'COMPLETE',
        customerNotes: null,
        orderIndex: 0,
        tasks: [
          { id: 'demo-task-001', taskText: 'Network topology mapping', completed: true, orderIndex: 0, status: 'REVIEWED_AND_DONE', notes: 'Full L2/L3 topology documented' },
          { id: 'demo-task-002', taskText: 'Bandwidth analysis report', completed: true, orderIndex: 1, status: 'REVIEWED_AND_DONE', notes: null },
          { id: 'demo-task-003', taskText: 'Migration plan approval', completed: true, orderIndex: 2, status: 'REVIEWED_AND_DONE', notes: null },
        ],
      },
      {
        id: 'demo-phase-002',
        title: 'Core Switch Deployment',
        description: 'Replace aging core switches with Meraki MS390 stack',
        status: 'IN_PROGRESS',
        customerNotes: null,
        orderIndex: 1,
        tasks: [
          { id: 'demo-task-004', taskText: 'Procure Meraki MS390 switches', completed: true, orderIndex: 0, status: 'REVIEWED_AND_DONE', notes: null },
          { id: 'demo-task-005', taskText: 'Configure VLANs and routing', completed: false, orderIndex: 1, status: 'WORK_IN_PROGRESS', notes: 'VLANs 10, 20, 30, 40 configured. Testing routing between segments.' },
          { id: 'demo-task-006', taskText: 'Cutover window scheduling', completed: false, orderIndex: 2, status: 'WAITING_ON_CLIENT', notes: 'Need customer to confirm maintenance window' },
          { id: 'demo-task-007', taskText: 'Post-cutover validation', completed: false, orderIndex: 3, status: 'NOT_STARTED', notes: null },
        ],
      },
      {
        id: 'demo-phase-003',
        title: 'Wireless Deployment',
        description: 'Deploy new Meraki MR46 access points across all floors',
        status: 'NOT_STARTED',
        customerNotes: null,
        orderIndex: 2,
        tasks: [
          { id: 'demo-task-008', taskText: 'Wireless site survey', completed: false, orderIndex: 0, status: 'NOT_STARTED', notes: null },
          { id: 'demo-task-009', taskText: 'AP mounting and cabling', completed: false, orderIndex: 1, status: 'NOT_STARTED', notes: null },
          { id: 'demo-task-010', taskText: 'SSID and security configuration', completed: false, orderIndex: 2, status: 'NOT_STARTED', notes: null },
        ],
      },
    ],
  },
  {
    id: 'demo-proj-002',
    title: 'Microsoft 365 Migration',
    projectType: 'CLOUD_MIGRATION',
    status: 'ACTIVE',
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    company: DEMO_COMPANY,
    phases: [
      {
        id: 'demo-phase-004',
        title: 'Tenant Setup',
        description: 'Configure Microsoft 365 tenant and domain verification',
        status: 'COMPLETE',
        customerNotes: null,
        orderIndex: 0,
        tasks: [
          { id: 'demo-task-011', taskText: 'Domain verification', completed: true, orderIndex: 0, status: 'REVIEWED_AND_DONE', notes: null },
          { id: 'demo-task-012', taskText: 'MX record cutover', completed: true, orderIndex: 1, status: 'REVIEWED_AND_DONE', notes: null },
        ],
      },
      {
        id: 'demo-phase-005',
        title: 'Mailbox Migration',
        description: 'Migrate 85 mailboxes from on-premise Exchange to Exchange Online',
        status: 'IN_PROGRESS',
        customerNotes: null,
        orderIndex: 1,
        tasks: [
          { id: 'demo-task-013', taskText: 'Batch 1 migration (executives)', completed: true, orderIndex: 0, status: 'REVIEWED_AND_DONE', notes: '12 mailboxes migrated successfully' },
          { id: 'demo-task-014', taskText: 'Batch 2 migration (departments)', completed: false, orderIndex: 1, status: 'WORK_IN_PROGRESS', notes: '45 of 73 mailboxes complete' },
          { id: 'demo-task-015', taskText: 'Shared mailbox migration', completed: false, orderIndex: 2, status: 'NOT_STARTED', notes: null },
          { id: 'demo-task-016', taskText: 'Decommission on-prem Exchange', completed: false, orderIndex: 3, status: 'NOT_STARTED', notes: null },
        ],
      },
    ],
  },
]

export const DEMO_TICKETS = [
  {
    id: 9001,
    ticketNumber: 'T20260301.9001',
    title: 'VPN connection drops intermittently',
    status: '1',
    createDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    completedDate: null,
    priority: '2',
  },
  {
    id: 9002,
    ticketNumber: 'T20260225.9002',
    title: 'New employee onboarding - John Anderson',
    status: '5',
    createDate: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
    completedDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    priority: '3',
  },
  {
    id: 9003,
    ticketNumber: 'T20260228.9003',
    title: 'Printer queue not clearing on 3rd floor',
    status: '5',
    createDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    completedDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    priority: '3',
  },
]

export const DEMO_TIMELINE = {
  9001: [
    {
      id: 'demo-note-001',
      type: 'note',
      timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      author: 'Sarah Mitchell',
      authorType: 'customer',
      content: 'Our VPN has been dropping connections every 15-20 minutes since Monday. Affecting about 10 remote workers. We are using the Cisco AnyConnect client.',
      isInternal: false,
    },
    {
      id: 'demo-note-002',
      type: 'note',
      timestamp: new Date(Date.now() - 4.5 * 24 * 60 * 60 * 1000).toISOString(),
      author: 'Mike Rivera',
      authorType: 'technician',
      content: 'Investigating the ASA firewall logs. Seeing session timeouts correlating with your reports. Will check the idle timeout and DPD settings.',
      isInternal: false,
    },
    {
      id: 'demo-time-001',
      type: 'time_entry',
      timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      author: 'Mike Rivera',
      authorType: 'technician',
      content: 'Analyzed ASA firewall logs. Found DPD interval was set too aggressively. Adjusted from 10s to 30s. Increased idle timeout from 30min to 4hrs. Monitoring for 24 hours.',
      isInternal: false,
      hoursWorked: 1.5,
    },
    {
      id: 'demo-note-003',
      type: 'note',
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      author: 'Sarah Mitchell',
      authorType: 'customer',
      content: 'Much better over the past 2 days. Only one report of a disconnect. Can we continue monitoring?',
      isInternal: false,
    },
  ],
}

export const DEMO_STATS = {
  totalProjects: 2,
  activeProjects: 2,
  completedProjects: 0,
  totalCompanies: 1,
  totalBlogPosts: 12,
  publishedBlogPosts: 8,
  onHoldProjects: 0,
  totalPhases: 5,
}

/**
 * Check if demo mode is enabled
 */
export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('admin-demo-mode') === 'true'
}

/**
 * Toggle demo mode
 */
export function toggleDemoMode(): boolean {
  if (typeof window === 'undefined') return false
  const current = isDemoMode()
  localStorage.setItem('admin-demo-mode', current ? 'false' : 'true')
  return !current
}
