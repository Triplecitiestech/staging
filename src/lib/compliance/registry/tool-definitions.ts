/**
 * Tool Capability Registry — Tool Definitions
 *
 * Defines all MSP tools with their capabilities and confidence levels.
 * This is the seed/default data. At runtime, these get loaded into
 * the compliance_tool_registry DB table and can be edited by admins.
 */

import type { ConnectorType, EvidenceSourceType } from '../types'

export type ToolIntegrationStatus = 'integrated' | 'planned' | 'known'
export type CapabilityConfidence = 'authoritative' | 'supplementary' | 'indirect'

export interface ToolCapability {
  capabilityId: string
  confidence: CapabilityConfidence
  dataDescription: string
  evidenceSourceTypes: EvidenceSourceType[]
}

export interface ToolDefinition {
  toolId: string
  name: string
  vendor: string
  category: string
  integrationStatus: ToolIntegrationStatus
  connectorType: ConnectorType | null
  description: string
  capabilities: ToolCapability[]
}

export const DEFAULT_TOOLS: ToolDefinition[] = [
  // ===== INTEGRATED TOOLS (have collectors in the codebase) =====

  {
    toolId: 'microsoft_graph', name: 'Microsoft 365 / Entra / Intune', vendor: 'Microsoft',
    category: 'Cloud Identity & Device Management',
    integrationStatus: 'integrated', connectorType: 'microsoft_graph',
    description: 'Azure AD / Entra ID for identity, Intune for device management, Defender for endpoint security, M365 Secure Score for posture.',
    capabilities: [
      { capabilityId: 'identity_management', confidence: 'authoritative',
        dataDescription: 'User accounts, groups, roles, enabled/disabled status, sign-in activity',
        evidenceSourceTypes: ['microsoft_users'] },
      { capabilityId: 'mfa_status', confidence: 'authoritative',
        dataDescription: 'MFA registration status, methods, per-user and admin MFA enforcement',
        evidenceSourceTypes: ['microsoft_mfa'] },
      { capabilityId: 'conditional_access', confidence: 'authoritative',
        dataDescription: 'Conditional Access policies — enabled/disabled, grant controls, conditions',
        evidenceSourceTypes: ['microsoft_conditional_access'] },
      { capabilityId: 'device_compliance', confidence: 'authoritative',
        dataDescription: 'Intune device compliance state, OS version, encryption, last sync',
        evidenceSourceTypes: ['microsoft_device_compliance'] },
      { capabilityId: 'disk_encryption', confidence: 'authoritative',
        dataDescription: 'BitLocker encryption status per managed Windows device',
        evidenceSourceTypes: ['microsoft_bitlocker'] },
      { capabilityId: 'antivirus_status', confidence: 'supplementary',
        dataDescription: 'Defender for Endpoint status, security alerts, managed device count',
        evidenceSourceTypes: ['microsoft_defender'] },
      { capabilityId: 'secure_score', confidence: 'authoritative',
        dataDescription: 'Microsoft Secure Score — current/max score, percentage, per-control scores',
        evidenceSourceTypes: ['microsoft_secure_score'] },
      { capabilityId: 'mail_transport_security', confidence: 'authoritative',
        dataDescription: 'Exchange Online transport rules, anti-phishing, spam filtering configuration',
        evidenceSourceTypes: ['microsoft_mail_transport'] },
      { capabilityId: 'audit_logging', confidence: 'authoritative',
        dataDescription: 'M365 Unified Audit Log — user/admin activity, sign-in logs, mailbox access',
        evidenceSourceTypes: ['microsoft_audit_log'] },
      { capabilityId: 'asset_inventory_managed', confidence: 'supplementary',
        dataDescription: 'Entra-joined and Intune-enrolled devices (managed endpoints only)',
        evidenceSourceTypes: ['microsoft_device_compliance'] },
    ],
  },

  {
    toolId: 'datto_rmm', name: 'Datto RMM', vendor: 'Kaseya/Datto',
    category: 'Endpoint Management',
    integrationStatus: 'integrated', connectorType: 'datto_rmm',
    description: 'Remote monitoring and management agent for endpoints. Manages patches, monitors health, runs scripts. Only sees devices with the RMM agent installed.',
    capabilities: [
      { capabilityId: 'asset_inventory_managed', confidence: 'authoritative',
        dataDescription: 'Hostname, OS, IP, device type, online status, last seen — for agent-installed devices only',
        evidenceSourceTypes: ['datto_rmm_devices'] },
      { capabilityId: 'patch_management', confidence: 'authoritative',
        dataDescription: 'Patch status, patches installed/pending/not-approved, reboot required',
        evidenceSourceTypes: ['datto_rmm_patches'] },
      { capabilityId: 'software_inventory', confidence: 'authoritative',
        dataDescription: 'Installed software list per device via RMM audit',
        evidenceSourceTypes: ['datto_rmm_devices'] },
      { capabilityId: 'antivirus_status', confidence: 'supplementary',
        dataDescription: 'AV product name and on/off status reported by the RMM agent',
        evidenceSourceTypes: ['datto_rmm_devices'] },
    ],
  },

  {
    toolId: 'datto_edr', name: 'Datto EDR', vendor: 'Kaseya/Datto',
    category: 'Endpoint Detection & Response',
    integrationStatus: 'integrated', connectorType: 'datto_edr',
    description: 'Endpoint detection and response — monitors for threats, malware, suspicious behavior on endpoints.',
    capabilities: [
      { capabilityId: 'edr_alerts', confidence: 'authoritative',
        dataDescription: 'Threat events with severity, type, hostname, timestamp — critical/high/medium/low classification',
        evidenceSourceTypes: ['datto_edr_alerts'] },
      { capabilityId: 'antivirus_status', confidence: 'authoritative',
        dataDescription: 'Active endpoint protection with real-time threat detection',
        evidenceSourceTypes: ['datto_edr_alerts'] },
    ],
  },

  {
    toolId: 'datto_bcdr', name: 'Datto BCDR', vendor: 'Kaseya/Datto',
    category: 'Backup & Disaster Recovery',
    integrationStatus: 'integrated', connectorType: 'datto_bcdr',
    description: 'Business continuity and disaster recovery — SIRIS/ALTO appliances, endpoint backup, cloud replication.',
    capabilities: [
      { capabilityId: 'backup_server', confidence: 'authoritative',
        dataDescription: 'Backup appliances, agent count, alert count, snapshot status, offsite replication',
        evidenceSourceTypes: ['datto_bcdr_backup'] },
    ],
  },

  {
    toolId: 'datto_saas', name: 'Datto SaaS Protection', vendor: 'Kaseya/Datto',
    category: 'SaaS Backup',
    integrationStatus: 'integrated', connectorType: 'datto_bcdr',
    description: 'Backup for Microsoft 365 and Google Workspace — mailboxes, SharePoint, Teams, OneDrive.',
    capabilities: [
      { capabilityId: 'backup_saas', confidence: 'authoritative',
        dataDescription: 'Protected seats by state (active/paused/unprotected), seat type (user/mailbox/site)',
        evidenceSourceTypes: ['datto_saas_backup'] },
    ],
  },

  {
    toolId: 'dnsfilter', name: 'DNSFilter', vendor: 'DNSFilter',
    category: 'DNS Security',
    integrationStatus: 'integrated', connectorType: 'dnsfilter',
    description: 'DNS-layer security filtering — blocks malicious domains, phishing, and categorized threats at the DNS level.',
    capabilities: [
      { capabilityId: 'dns_filtering', confidence: 'authoritative',
        dataDescription: 'Total/blocked queries, threat categories, top blocked domains, monthly trends',
        evidenceSourceTypes: ['dnsfilter_dns'] },
    ],
  },

  {
    toolId: 'autotask', name: 'Autotask PSA', vendor: 'Kaseya/Datto',
    category: 'Professional Services Automation',
    integrationStatus: 'integrated', connectorType: 'autotask',
    description: 'IT service management — tickets, projects, time entries, SLA tracking, customer management.',
    capabilities: [
      { capabilityId: 'ticketing_sla', confidence: 'authoritative',
        dataDescription: 'Tickets with status, priority, SLA, resolution times, assigned resources',
        evidenceSourceTypes: ['autotask_tickets'] },
    ],
  },

  // ===== KNOWN TOOLS (customer uses, not yet integrated) =====

  {
    toolId: 'domotz', name: 'Domotz', vendor: 'Domotz',
    category: 'Network Monitoring & Discovery',
    integrationStatus: 'integrated', connectorType: 'domotz',
    description: 'Active and passive network discovery — scans every IP and MAC address across VLANs. Monitors network device health, port status, and connectivity.',
    capabilities: [
      { capabilityId: 'asset_discovery_active', confidence: 'authoritative',
        dataDescription: 'All IP/MAC addresses on the network, device type identification, VLAN mapping, scan frequency',
        evidenceSourceTypes: ['domotz_network_discovery'] },
      { capabilityId: 'asset_discovery_passive', confidence: 'authoritative',
        dataDescription: 'Passive traffic observation to detect new devices connecting to the network',
        evidenceSourceTypes: ['domotz_network_discovery'] },
      { capabilityId: 'network_infrastructure', confidence: 'supplementary',
        dataDescription: 'Switch port mapping, AP status, network topology',
        evidenceSourceTypes: ['domotz_network_discovery'] },
    ],
  },

  {
    toolId: 'rocketcyber', name: 'RocketCyber', vendor: 'Kaseya/Datto',
    category: 'Managed SOC / SIEM',
    integrationStatus: 'known', connectorType: null,
    description: 'Managed SOC platform — aggregates security events from endpoints, network, and cloud for correlation and threat detection.',
    capabilities: [
      { capabilityId: 'siem_soc', confidence: 'authoritative',
        dataDescription: 'Centralized security event alerting, threat correlation, incident management',
        evidenceSourceTypes: [] },
    ],
  },

  {
    toolId: 'saas_alerts', name: 'SaaS Alerts', vendor: 'SaaS Alerts',
    category: 'SaaS Security Monitoring',
    integrationStatus: 'integrated', connectorType: 'saas_alerts',
    description: 'SaaS security platform with Respond (auto threat response), Unify (device-to-identity binding), and Fortify (M365 Secure Score management). Monitors M365, Google, Salesforce, Slack, Dropbox, Okta, Duo.',
    capabilities: [
      { capabilityId: 'saas_security_monitoring', confidence: 'authoritative',
        dataDescription: 'SaaS security events — suspicious logins, permission changes, anomalous behavior, severity classification',
        evidenceSourceTypes: ['saas_alerts_monitoring'] },
      { capabilityId: 'siem_soc', confidence: 'supplementary',
        dataDescription: 'Centralized SaaS event alerting with auto-response capabilities',
        evidenceSourceTypes: ['saas_alerts_monitoring'] },
      { capabilityId: 'audit_logging', confidence: 'supplementary',
        dataDescription: 'SaaS activity audit trail across monitored applications',
        evidenceSourceTypes: ['saas_alerts_monitoring'] },
    ],
  },

  {
    toolId: 'bullphish_id', name: 'Bullphish ID', vendor: 'Kaseya/ID Agent',
    category: 'Security Awareness Training',
    integrationStatus: 'known', connectorType: null,
    description: 'Security awareness training and phishing simulation platform for workforce education.',
    capabilities: [
      { capabilityId: 'security_awareness_training', confidence: 'authoritative',
        dataDescription: 'Training completion rates, phishing simulation results, user vulnerability scores',
        evidenceSourceTypes: [] },
    ],
  },

  {
    toolId: 'dark_web_id', name: 'Dark Web ID', vendor: 'Kaseya/ID Agent',
    category: 'Dark Web Monitoring',
    integrationStatus: 'known', connectorType: null,
    description: 'Monitors dark web marketplaces and data breach dumps for compromised employee credentials.',
    capabilities: [
      { capabilityId: 'dark_web_monitoring', confidence: 'authoritative',
        dataDescription: 'Compromised credential alerts, breach source identification, exposure reports',
        evidenceSourceTypes: [] },
    ],
  },

  {
    toolId: 'it_glue', name: 'IT Glue', vendor: 'Kaseya/Datto',
    category: 'IT Documentation',
    integrationStatus: 'integrated', connectorType: 'it_glue',
    description: 'IT documentation and CMDB — stores passwords, network diagrams, procedures, asset records, runbooks.',
    capabilities: [
      { capabilityId: 'it_documentation', confidence: 'authoritative',
        dataDescription: 'Documented procedures, password vault, network diagrams, configuration records',
        evidenceSourceTypes: ['it_glue_documentation'] },
    ],
  },

  {
    toolId: 'ubiquiti', name: 'Ubiquiti UniFi', vendor: 'Ubiquiti',
    category: 'Network Infrastructure',
    integrationStatus: 'known', connectorType: null,
    description: 'Network infrastructure — managed switches, wireless access points, routers, security gateways.',
    capabilities: [
      { capabilityId: 'network_infrastructure', confidence: 'authoritative',
        dataDescription: 'Switch/AP/router status, firmware versions, client connections, VLAN configuration',
        evidenceSourceTypes: [] },
    ],
  },
]

export const TOOL_MAP = new Map(DEFAULT_TOOLS.map((t) => [t.toolId, t]))
