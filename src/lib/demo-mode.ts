/**
 * Demo Mode — Anonymization Engine
 *
 * When demo mode is active in the admin dashboard, all real company names,
 * contact names, emails, and metrics are anonymized client-side using
 * deterministic mappings. The same real name always maps to the same fake name
 * within a session, and metrics are slightly skewed (±5–15%) so data shapes
 * stay realistic but values aren't recognizable.
 *
 * IMPORTANT: This is purely a client-side display transform. No database data
 * is modified. Reporting pipelines, sync jobs, and APIs are unaffected.
 */

// ---------------------------------------------------------------------------
// Name pools — realistic business names and human names
// ---------------------------------------------------------------------------

const FAKE_COMPANIES = [
  'Meridian Technologies', 'Pinnacle Systems', 'Northgate Solutions',
  'Summit Digital', 'Atlas Industries', 'Crescent Networks',
  'Vanguard IT Group', 'Horizon Manufacturing', 'Apex Partners',
  'Lakeside Medical Center', 'Bridgeport Engineering', 'Redstone Corp',
  'Silverline Logistics', 'Copperfield Associates', 'Ironclad Security',
  'Bluewater Analytics', 'Westbrook Financial', 'Clearview Health',
  'Stonebridge Academy', 'Oakmont Properties', 'Riverdale Group',
  'Falcon Industries', 'Ember Creative', 'Aspen Consulting',
  'Trailblazer Holdings', 'Keystone Partners', 'Beacon Labs',
  'Magnolia Services', 'Ironwood Construction', 'Crestline Energy',
  'Pacific Rim Solutions', 'Evergreen Dynamics', 'Cedar Hill Associates',
  'Granite Peak Systems', 'Harbor Point Capital', 'Windmill Data',
  'Sapphire Technologies', 'Coral Bay Ventures', 'Snowcap Industries',
  'Thunderbolt Inc',
]

const FAKE_FIRST_NAMES = [
  'James', 'Sarah', 'Michael', 'Emily', 'Robert', 'Jessica',
  'David', 'Jennifer', 'Daniel', 'Amanda', 'Christopher', 'Ashley',
  'Matthew', 'Stephanie', 'Andrew', 'Nicole', 'Joshua', 'Michelle',
  'Ryan', 'Laura', 'Kevin', 'Rachel', 'Brandon', 'Heather',
  'Tyler', 'Megan', 'Nathan', 'Samantha', 'Aaron', 'Rebecca',
  'Brian', 'Katherine', 'Patrick', 'Olivia', 'Marcus', 'Hannah',
  'Derek', 'Grace', 'Trevor', 'Sophia',
]

const FAKE_LAST_NAMES = [
  'Anderson', 'Mitchell', 'Thompson', 'Garcia', 'Martinez', 'Robinson',
  'Clark', 'Lewis', 'Walker', 'Hall', 'Young', 'Allen',
  'King', 'Wright', 'Scott', 'Torres', 'Hill', 'Green',
  'Adams', 'Baker', 'Nelson', 'Carter', 'Morgan', 'Cooper',
  'Reed', 'Bailey', 'Bell', 'Murphy', 'Rivera', 'Sullivan',
  'Russell', 'Griffin', 'Hayes', 'Foster', 'Bennett', 'Price',
  'Sanders', 'Powell', 'Patterson', 'Jenkins',
]

const FAKE_DOMAINS = [
  'meridiantech.com', 'pinnaclesys.com', 'northgatesol.com',
  'summitdigital.com', 'atlasindustries.com', 'crescentnet.com',
  'vanguardit.com', 'horizonmfg.com', 'apexpartners.com',
  'lakesidemedical.org', 'bridgeporteng.com', 'redstonecorp.com',
  'silverlinelogistics.com', 'copperfieldassoc.com', 'ironcladsecu.com',
  'bluewateranalytics.com', 'westbrookfin.com', 'clearviewhealth.org',
  'stonebridgeacad.edu', 'oakmontprop.com', 'riverdalegroup.com',
  'falconindustries.com', 'embercreative.com', 'aspenconsulting.com',
  'trailblazerhold.com', 'keystonepartners.com', 'beaconlabs.com',
  'magnoliaservices.com', 'ironwoodconst.com', 'crestlineenergy.com',
  'pacificrimsol.com', 'evergreendyn.com', 'cedarhillassoc.com',
  'granitepeaksys.com', 'harborpointcap.com', 'windmilldata.com',
  'sapphiretech.com', 'coralbayventures.com', 'snowcapindustries.com',
  'thunderboltinc.com',
]

// ---------------------------------------------------------------------------
// Deterministic hash — gives stable mapping for the same input string
// ---------------------------------------------------------------------------

function simpleHash(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

// Session-level seed for metric skewing (stable per browser session)
let _sessionSeed: number | null = null
function getSessionSeed(): number {
  if (_sessionSeed !== null) return _sessionSeed
  if (typeof window === 'undefined') return 42
  const stored = sessionStorage.getItem('demo-session-seed')
  if (stored) {
    _sessionSeed = parseInt(stored, 10)
  } else {
    _sessionSeed = Math.floor(Math.random() * 100000)
    sessionStorage.setItem('demo-session-seed', String(_sessionSeed))
  }
  return _sessionSeed
}

// ---------------------------------------------------------------------------
// Fake ticket title templates — realistic IT support titles
// ---------------------------------------------------------------------------

const TICKET_TITLE_TEMPLATES = [
  'Password reset request for {person}',
  'Unable to connect to VPN from remote office',
  'Outlook freezing when opening attachments',
  'New employee onboarding - {person}',
  'Printer not responding on 2nd floor',
  'MFA enrollment issue for {person}',
  'File share permissions update needed',
  'Laptop replacement request - {person}',
  'Network slowness reported at {company}',
  'Email delivery delay to external recipients',
  'Microsoft Teams call quality issues',
  'Software installation request - Adobe Acrobat',
  'Shared mailbox access request for {person}',
  'Monitor not detected after docking station update',
  'OneDrive sync errors on multiple devices',
  'Conference room display not connecting',
  'Firewall rule change request for {company}',
  'Antivirus quarantine false positive',
  'Scheduled server maintenance - patch Tuesday',
  'Backup job failure on file server',
  'SSL certificate renewal for web portal',
  'User account lockout - {person}',
  'Offboarding request - {person}',
  'SharePoint site permissions review',
  'Azure AD conditional access policy update',
  'Internal DNS resolution issue',
  'Endpoint detection alert - workstation review',
  'Phishing email reported by {person}',
  'QuickBooks database connectivity issue',
  'Wireless access point offline at {company}',
  'Intune device compliance remediation',
  'Email signature template update',
  'Remote desktop connection timeout',
  'Security awareness training enrollment',
  'Vendor VPN tunnel configuration',
  'Distribution list modification request',
  'Windows Update stuck on reboot loop',
  'Power outage follow-up - {company}',
  'Mobile device enrollment - {person}',
  'Weekly maintenance - routine system checks',
]

// ---------------------------------------------------------------------------
// Anonymization functions
// ---------------------------------------------------------------------------

/** Map a real company name to a deterministic fake company name */
export function anonCompany(realName: string): string {
  if (!realName) return realName
  const idx = simpleHash(realName.toLowerCase().trim()) % FAKE_COMPANIES.length
  return FAKE_COMPANIES[idx]
}

/** Map a real person name to a deterministic fake person name */
export function anonPerson(realName: string): string {
  if (!realName) return realName
  const h = simpleHash(realName.toLowerCase().trim())
  const first = FAKE_FIRST_NAMES[h % FAKE_FIRST_NAMES.length]
  const last = FAKE_LAST_NAMES[(h * 7) % FAKE_LAST_NAMES.length]
  return `${first} ${last}`
}

/** Map a real email to a deterministic fake email */
export function anonEmail(realEmail: string): string {
  if (!realEmail || !realEmail.includes('@')) return realEmail
  const [localPart] = realEmail.split('@')
  const h = simpleHash(localPart.toLowerCase().trim())
  const first = FAKE_FIRST_NAMES[h % FAKE_FIRST_NAMES.length].toLowerCase()
  const last = FAKE_LAST_NAMES[(h * 7) % FAKE_LAST_NAMES.length].toLowerCase()
  const domainIdx = (h * 13) % FAKE_DOMAINS.length
  return `${first}.${last}@${FAKE_DOMAINS[domainIdx]}`
}

/** Map a real ticket title to a deterministic fake ticket title */
export function anonTicketTitle(realTitle: string): string {
  if (!realTitle) return realTitle
  const h = simpleHash(realTitle.toLowerCase().trim())
  const template = TICKET_TITLE_TEMPLATES[h % TICKET_TITLE_TEMPLATES.length]
  // Fill in {person} and {company} placeholders deterministically
  const fakePerson = `${FAKE_FIRST_NAMES[(h * 3) % FAKE_FIRST_NAMES.length]} ${FAKE_LAST_NAMES[(h * 11) % FAKE_LAST_NAMES.length]}`
  const fakeCompany = FAKE_COMPANIES[(h * 7) % FAKE_COMPANIES.length]
  return template.replace('{person}', fakePerson).replace('{company}', fakeCompany)
}

/**
 * Skew a numeric value by ±5–15%, deterministic per key + session.
 * Pass a key (e.g. "tickets-created-companyId") so the same metric
 * always gets the same offset within a session.
 */
export function skewNumber(value: number, key: string): number {
  if (value === 0) return 0
  const seed = getSessionSeed()
  const h = simpleHash(`${key}-${seed}`)
  // Range: 0.85 to 1.15
  const factor = 0.85 + (h % 3001) / 10000
  const result = value * factor
  // Preserve integer vs float behavior
  return Number.isInteger(value) ? Math.round(result) : Math.round(result * 100) / 100
}

/**
 * Skew a percentage value (0–100) by ±3–8 points,
 * clamped to valid range.
 */
export function skewPercent(value: number | null, key: string): number | null {
  if (value === null || value === undefined) return value
  const seed = getSessionSeed()
  const h = simpleHash(`${key}-${seed}`)
  // Offset: -8 to +8
  const offset = -8 + (h % 1700) / 100
  const result = Math.round(Math.min(100, Math.max(0, value + offset)) * 10) / 10
  return result
}

// ---------------------------------------------------------------------------
// Toggle state (localStorage)
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'admin-demo-mode'

export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) === 'true'
}

export function toggleDemoMode(): boolean {
  if (typeof window === 'undefined') return false
  const current = isDemoMode()
  localStorage.setItem(STORAGE_KEY, current ? 'false' : 'true')
  // Reset session seed when toggling on so each demo session feels fresh
  if (!current) {
    const newSeed = Math.floor(Math.random() * 100000)
    sessionStorage.setItem('demo-session-seed', String(newSeed))
    _sessionSeed = newSeed
  }
  return !current
}

// ---------------------------------------------------------------------------
// Legacy demo data (kept for customer portal demo at /onboarding/contoso-industries)
// ---------------------------------------------------------------------------

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
