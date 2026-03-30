/**
 * Tool Capability Registry — Capability Taxonomy
 *
 * Defines the canonical set of capabilities that MSP tools provide.
 * Each capability represents a specific thing a tool CAN DO or a
 * specific DATA TYPE it provides. These are the atoms that bridge
 * tools to compliance controls.
 */

export interface CapabilityDefinition {
  id: string
  name: string
  category: string
  description: string
}

export const CAPABILITY_CATEGORIES = [
  'Asset Management',
  'Software Management',
  'Configuration & Hardening',
  'Identity & Access',
  'Vulnerability Management',
  'Security Operations',
  'Data Protection',
  'Network Security',
  'Documentation & Process',
] as const

export const CAPABILITIES: CapabilityDefinition[] = [
  // Asset Management
  { id: 'asset_discovery_active', name: 'Active Network Discovery', category: 'Asset Management',
    description: 'Active network scanning — ARP sweeps, ping scans, port scans. Discovers every IP/MAC on the network including unmanaged devices, IoT, printers, switches. Works across VLANs.' },
  { id: 'asset_discovery_passive', name: 'Passive Network Discovery', category: 'Asset Management',
    description: 'Passive network monitoring — observes traffic to identify connected devices without active probing.' },
  { id: 'asset_inventory_managed', name: 'Managed Endpoint Inventory', category: 'Asset Management',
    description: 'Inventory of endpoints that have a management agent installed. Does NOT include unmanaged devices.' },

  // Software Management
  { id: 'software_inventory', name: 'Software Inventory', category: 'Software Management',
    description: 'Enumeration of installed software on managed endpoints, including version and publisher.' },
  { id: 'patch_management', name: 'Patch Management', category: 'Software Management',
    description: 'Operating system and application patch status, deployment, and compliance. Tracks pending/installed/failed patches.' },

  // Configuration & Hardening
  { id: 'device_compliance', name: 'Device Compliance', category: 'Configuration & Hardening',
    description: 'Device configuration compliance against policies — screen lock, encryption, OS version, firewall status, etc.' },
  { id: 'disk_encryption', name: 'Disk Encryption', category: 'Configuration & Hardening',
    description: 'BitLocker/FileVault/dm-crypt encryption status on endpoints.' },
  { id: 'antivirus_status', name: 'Antivirus / Anti-Malware Status', category: 'Configuration & Hardening',
    description: 'Antivirus/anti-malware product deployment status, signature currency, and protection state.' },
  { id: 'secure_score', name: 'Security Posture Score', category: 'Configuration & Hardening',
    description: 'Aggregate security posture scoring that measures configuration baseline adherence.' },

  // Identity & Access
  { id: 'identity_management', name: 'Identity & Account Management', category: 'Identity & Access',
    description: 'User, group, and role management — account creation, disabling, group membership, admin role assignment.' },
  { id: 'mfa_status', name: 'MFA Enrollment & Enforcement', category: 'Identity & Access',
    description: 'Multi-factor authentication registration status, enforcement policies, method types (FIDO2, Authenticator, SMS).' },
  { id: 'conditional_access', name: 'Conditional Access Policies', category: 'Identity & Access',
    description: 'Conditional Access policies controlling sign-in requirements based on user risk, device compliance, location, and app sensitivity.' },

  // Vulnerability Management
  { id: 'edr_alerts', name: 'Endpoint Detection & Response', category: 'Vulnerability Management',
    description: 'EDR threat events — malware detections, suspicious behavior, compromised endpoints, threat severity classification.' },
  { id: 'dns_filtering', name: 'DNS Filtering', category: 'Network Security',
    description: 'DNS-layer threat filtering — blocks access to malicious domains, phishing sites, and categorized threats.' },

  // Data Protection
  { id: 'backup_server', name: 'Server/Endpoint Backup (BCDR)', category: 'Data Protection',
    description: 'On-premises and endpoint backup via BCDR appliances — snapshot status, offsite replication, backup success rate, alert tracking.' },
  { id: 'backup_saas', name: 'SaaS Application Backup', category: 'Data Protection',
    description: 'Cloud SaaS data backup — M365 mailboxes, SharePoint sites, Teams, Google Workspace. Seat protection status.' },
  { id: 'mail_transport_security', name: 'Email Transport Security', category: 'Data Protection',
    description: 'Email transport rules, anti-phishing policies, DMARC/DKIM/SPF configuration, spam filtering.' },

  // Security Operations
  { id: 'security_awareness_training', name: 'Security Awareness Training', category: 'Security Operations',
    description: 'Phishing simulation campaigns, training module completion rates, user vulnerability scoring.' },
  { id: 'dark_web_monitoring', name: 'Dark Web Credential Monitoring', category: 'Security Operations',
    description: 'Monitoring for compromised credentials appearing on dark web marketplaces and data breach dumps.' },
  { id: 'siem_soc', name: 'SIEM / Managed SOC', category: 'Security Operations',
    description: 'Security event aggregation, correlation, and monitoring — centralized alerting from multiple data sources.' },
  { id: 'saas_security_monitoring', name: 'SaaS Security Monitoring', category: 'Security Operations',
    description: 'Monitoring SaaS application security posture — suspicious sign-ins, data exfiltration, permission changes.' },

  // Network Security
  { id: 'network_infrastructure', name: 'Network Infrastructure Management', category: 'Network Security',
    description: 'Network device management — switches, access points, routers, firewalls. Firmware status, configuration, uptime.' },

  // Documentation & Process
  { id: 'it_documentation', name: 'IT Documentation / CMDB', category: 'Documentation & Process',
    description: 'Configuration management database — documented procedures, passwords, network diagrams, asset records, runbooks.' },
  { id: 'ticketing_sla', name: 'Ticketing & Incident Management', category: 'Documentation & Process',
    description: 'IT service ticket management — incident tracking, SLA compliance, resolution times, escalation procedures.' },
  { id: 'audit_logging', name: 'Audit Logging', category: 'Documentation & Process',
    description: 'User and admin activity audit trail — sign-in logs, mailbox access, file operations, admin configuration changes.' },
]

export const CAPABILITY_MAP = new Map(CAPABILITIES.map((c) => [c.id, c]))
