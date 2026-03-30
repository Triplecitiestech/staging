/**
 * Tool Capability Registry — Control-to-Capability Mapping
 *
 * Maps each CIS v8 control to the capabilities needed to evaluate it.
 * This replaces the hardcoded evidenceSources on ControlDefinition.
 *
 * Each control specifies:
 *   - requiredCapabilities: what MUST be checked to evaluate this control
 *   - supplementaryCapabilities: what improves confidence but isn't strictly required
 *   - evaluationHint: how to interpret the capability data for this specific control
 */

export interface ControlCapabilityRequirement {
  controlId: string
  requiredCapabilities: string[]
  supplementaryCapabilities: string[]
  evaluationHint: string
}

export const CIS_V8_CAPABILITY_MAP: ControlCapabilityRequirement[] = [
  // === 1 - Inventory and Control of Enterprise Assets ===
  { controlId: 'cis-v8-1.1', requiredCapabilities: ['asset_inventory_managed'], supplementaryCapabilities: ['asset_discovery_active'],
    evaluationHint: 'Check total managed device count from RMM/Intune. Active discovery data from Domotz shows full network picture including unmanaged devices.' },
  { controlId: 'cis-v8-1.2', requiredCapabilities: ['asset_inventory_managed'], supplementaryCapabilities: ['asset_discovery_active'],
    evaluationHint: 'Verify a process exists to address unauthorized assets weekly. Compare active discovery results against managed inventory to identify rogues.' },
  { controlId: 'cis-v8-1.3', requiredCapabilities: ['asset_discovery_active'], supplementaryCapabilities: ['asset_inventory_managed'],
    evaluationHint: 'Requires an active discovery tool (like Domotz) running daily. RMM agent inventory is NOT active discovery — it only sees managed devices.' },
  { controlId: 'cis-v8-1.4', requiredCapabilities: ['asset_discovery_passive', 'network_infrastructure'], supplementaryCapabilities: [],
    evaluationHint: 'Check if DHCP logging is enabled. May require manual verification or network infrastructure data.' },
  { controlId: 'cis-v8-1.5', requiredCapabilities: ['asset_discovery_passive'], supplementaryCapabilities: ['asset_discovery_active'],
    evaluationHint: 'Requires a passive discovery tool monitoring network traffic for new devices.' },

  // === 2 - Software Assets ===
  { controlId: 'cis-v8-2.1', requiredCapabilities: ['software_inventory'], supplementaryCapabilities: ['asset_inventory_managed'],
    evaluationHint: 'Check that a detailed software inventory is maintained via RMM audit data.' },
  { controlId: 'cis-v8-2.2', requiredCapabilities: ['software_inventory'], supplementaryCapabilities: ['patch_management'],
    evaluationHint: 'Verify that only currently supported software versions are authorized.' },
  { controlId: 'cis-v8-2.3', requiredCapabilities: ['software_inventory', 'device_compliance'], supplementaryCapabilities: [],
    evaluationHint: 'Check that unauthorized software is removed or has documented exceptions.' },

  // === 3 - Data Protection ===
  { controlId: 'cis-v8-3.1', requiredCapabilities: ['it_documentation'], supplementaryCapabilities: [],
    evaluationHint: 'Requires a documented data management process — check IT Glue for data classification policy.' },
  { controlId: 'cis-v8-3.2', requiredCapabilities: ['it_documentation'], supplementaryCapabilities: [],
    evaluationHint: 'Requires a data inventory — check IT Glue for documented sensitive data locations.' },
  { controlId: 'cis-v8-3.3', requiredCapabilities: ['conditional_access', 'identity_management'], supplementaryCapabilities: [],
    evaluationHint: 'Check Conditional Access policies enforce data access based on need-to-know.' },
  { controlId: 'cis-v8-3.4', requiredCapabilities: ['it_documentation'], supplementaryCapabilities: ['backup_saas'],
    evaluationHint: 'Requires documented data retention policy with min/max timelines.' },
  { controlId: 'cis-v8-3.5', requiredCapabilities: ['it_documentation'], supplementaryCapabilities: [],
    evaluationHint: 'Requires documented data disposal process commensurate with sensitivity.' },
  { controlId: 'cis-v8-3.6', requiredCapabilities: ['disk_encryption'], supplementaryCapabilities: ['device_compliance'],
    evaluationHint: 'Check BitLocker/FileVault encryption rate on end-user devices.' },

  // === 4 - Secure Configuration ===
  { controlId: 'cis-v8-4.1', requiredCapabilities: ['secure_score', 'device_compliance'], supplementaryCapabilities: [],
    evaluationHint: 'Check Microsoft Secure Score and Intune compliance for baseline configuration adherence.' },
  { controlId: 'cis-v8-4.2', requiredCapabilities: ['network_infrastructure', 'it_documentation'], supplementaryCapabilities: [],
    evaluationHint: 'Requires documented secure configuration for firewalls, routers, switches.' },
  { controlId: 'cis-v8-4.3', requiredCapabilities: ['device_compliance'], supplementaryCapabilities: ['secure_score'],
    evaluationHint: 'Check Intune policies for automatic screen lock (15min desktop, 2min mobile).' },
  { controlId: 'cis-v8-4.4', requiredCapabilities: ['antivirus_status', 'device_compliance'], supplementaryCapabilities: ['asset_inventory_managed'],
    evaluationHint: 'Check that host-based firewalls are enabled on servers via Defender/device compliance.' },
  { controlId: 'cis-v8-4.5', requiredCapabilities: ['antivirus_status', 'device_compliance'], supplementaryCapabilities: ['asset_inventory_managed'],
    evaluationHint: 'Check that host-based firewalls are enabled on end-user devices.' },
  { controlId: 'cis-v8-4.6', requiredCapabilities: ['disk_encryption'], supplementaryCapabilities: [],
    evaluationHint: 'Check BitLocker encryption rate on enterprise assets.' },
  { controlId: 'cis-v8-4.7', requiredCapabilities: ['identity_management'], supplementaryCapabilities: [],
    evaluationHint: 'Check for enabled default/generic accounts (admin@, administrator@, guest@).' },

  // === 5 - Account Management ===
  { controlId: 'cis-v8-5.1', requiredCapabilities: ['identity_management'], supplementaryCapabilities: [],
    evaluationHint: 'Check that all accounts are inventoried in Entra ID including service accounts.' },
  { controlId: 'cis-v8-5.2', requiredCapabilities: ['mfa_status', 'identity_management'], supplementaryCapabilities: [],
    evaluationHint: 'Check MFA registration rate. MFA enforcement significantly reduces password-only risk.' },
  { controlId: 'cis-v8-5.3', requiredCapabilities: ['identity_management'], supplementaryCapabilities: ['audit_logging'],
    evaluationHint: 'Check for dormant accounts with no sign-in for 45+ days.' },
  { controlId: 'cis-v8-5.4', requiredCapabilities: ['identity_management', 'mfa_status'], supplementaryCapabilities: [],
    evaluationHint: 'Check that admin privileges use dedicated admin accounts, not daily-use accounts.' },

  // === 6 - Access Control ===
  { controlId: 'cis-v8-6.1', requiredCapabilities: ['conditional_access', 'identity_management'], supplementaryCapabilities: ['it_documentation'],
    evaluationHint: 'Check CA policies enforce structured access granting. Documentation of process improves confidence.' },
  { controlId: 'cis-v8-6.2', requiredCapabilities: ['identity_management'], supplementaryCapabilities: ['ticketing_sla', 'it_documentation'],
    evaluationHint: 'Check for disabled accounts as evidence of offboarding. Ticketing data can show offboarding procedures.' },
  { controlId: 'cis-v8-6.3', requiredCapabilities: ['mfa_status', 'conditional_access'], supplementaryCapabilities: [],
    evaluationHint: 'Check MFA registration rate and CA policies requiring MFA for external apps.' },
  { controlId: 'cis-v8-6.4', requiredCapabilities: ['mfa_status', 'conditional_access'], supplementaryCapabilities: [],
    evaluationHint: 'Check CA policy requiring MFA for remote/VPN network access.' },
  { controlId: 'cis-v8-6.5', requiredCapabilities: ['mfa_status'], supplementaryCapabilities: ['identity_management'],
    evaluationHint: 'Check MFA registration specifically for admin role accounts.' },

  // === 7 - Vulnerability Management ===
  { controlId: 'cis-v8-7.1', requiredCapabilities: ['patch_management'], supplementaryCapabilities: ['it_documentation', 'secure_score'],
    evaluationHint: 'Check that a documented vulnerability management process exists with regular review.' },
  { controlId: 'cis-v8-7.2', requiredCapabilities: ['patch_management', 'ticketing_sla'], supplementaryCapabilities: [],
    evaluationHint: 'Check for risk-based remediation with monthly review — patches + ticket resolution data.' },
  { controlId: 'cis-v8-7.3', requiredCapabilities: ['patch_management'], supplementaryCapabilities: ['device_compliance'],
    evaluationHint: 'Check OS patch rate from RMM. Should be automated and monthly or more frequent.' },
  { controlId: 'cis-v8-7.4', requiredCapabilities: ['patch_management'], supplementaryCapabilities: ['software_inventory'],
    evaluationHint: 'Check application patch management — third-party app updates via RMM.' },

  // === 8 - Audit Log Management ===
  { controlId: 'cis-v8-8.1', requiredCapabilities: ['audit_logging'], supplementaryCapabilities: ['it_documentation'],
    evaluationHint: 'Check that audit log management process is documented with collection/review/retention requirements.' },
  { controlId: 'cis-v8-8.2', requiredCapabilities: ['audit_logging'], supplementaryCapabilities: ['secure_score'],
    evaluationHint: 'Check that audit logging is enabled across enterprise assets (M365 Unified Audit Log).' },
  { controlId: 'cis-v8-8.3', requiredCapabilities: ['audit_logging'], supplementaryCapabilities: [],
    evaluationHint: 'Check that log storage is adequate for retention requirements.' },
  { controlId: 'cis-v8-8.5', requiredCapabilities: ['audit_logging', 'secure_score'], supplementaryCapabilities: [],
    evaluationHint: 'Check detailed logging for sensitive data assets — mailbox audit, SharePoint, sign-in logs.' },

  // === 9 - Email and Web Browser ===
  { controlId: 'cis-v8-9.1', requiredCapabilities: ['software_inventory'], supplementaryCapabilities: ['device_compliance'],
    evaluationHint: 'Check that only supported browser/email client versions are in use via software inventory.' },
  { controlId: 'cis-v8-9.2', requiredCapabilities: ['dns_filtering'], supplementaryCapabilities: [],
    evaluationHint: 'Check DNSFilter is active with query/block data. Should cover all enterprise endpoints.' },

  // === 10 - Malware Defenses ===
  { controlId: 'cis-v8-10.1', requiredCapabilities: ['antivirus_status'], supplementaryCapabilities: ['edr_alerts', 'device_compliance'],
    evaluationHint: 'Check anti-malware deployment rate across all devices. Both AV (Defender/RMM) and EDR count.' },
  { controlId: 'cis-v8-10.2', requiredCapabilities: ['antivirus_status'], supplementaryCapabilities: ['device_compliance'],
    evaluationHint: 'Check that AV signature auto-updates are configured.' },
  { controlId: 'cis-v8-10.3', requiredCapabilities: ['device_compliance'], supplementaryCapabilities: ['secure_score'],
    evaluationHint: 'Check Intune/GPO policy disabling autorun and autoplay for removable media.' },

  // === 11 - Data Recovery ===
  { controlId: 'cis-v8-11.1', requiredCapabilities: ['backup_server', 'backup_saas'], supplementaryCapabilities: ['it_documentation'],
    evaluationHint: 'Check both BCDR and SaaS backup are active with documented recovery procedures.' },
  { controlId: 'cis-v8-11.2', requiredCapabilities: ['backup_server', 'backup_saas'], supplementaryCapabilities: [],
    evaluationHint: 'Check that automated backups run weekly or more frequently.' },
  { controlId: 'cis-v8-11.3', requiredCapabilities: ['backup_server'], supplementaryCapabilities: [],
    evaluationHint: 'Check that backup data is encrypted or separated with equivalent protection to source data.' },
  { controlId: 'cis-v8-11.4', requiredCapabilities: ['backup_server'], supplementaryCapabilities: [],
    evaluationHint: 'Check for offsite/air-gapped backup copies (Datto cloud offsite replication qualifies).' },

  // === 12 - Network Infrastructure ===
  { controlId: 'cis-v8-12.1', requiredCapabilities: ['network_infrastructure'], supplementaryCapabilities: ['it_documentation'],
    evaluationHint: 'Check that network infrastructure firmware is current and supported.' },
  { controlId: 'cis-v8-12.6', requiredCapabilities: ['secure_score', 'conditional_access'], supplementaryCapabilities: ['mail_transport_security'],
    evaluationHint: 'Check TLS enforcement for web/email — M365 enforces TLS 1.2+ by default.' },

  // === 13 - Network Monitoring ===
  { controlId: 'cis-v8-13.1', requiredCapabilities: ['siem_soc'], supplementaryCapabilities: ['edr_alerts', 'dns_filtering'],
    evaluationHint: 'Check for centralized security event alerting — ideally a SIEM/SOC like RocketCyber.' },

  // === 14 - Security Awareness Training ===
  { controlId: 'cis-v8-14.1', requiredCapabilities: ['security_awareness_training'], supplementaryCapabilities: [],
    evaluationHint: 'Check for an active security awareness program — Bullphish ID training campaigns.' },
  { controlId: 'cis-v8-14.2', requiredCapabilities: ['security_awareness_training'], supplementaryCapabilities: [],
    evaluationHint: 'Check phishing simulation results and social engineering training completion.' },
  { controlId: 'cis-v8-14.3', requiredCapabilities: ['security_awareness_training'], supplementaryCapabilities: ['mfa_status'],
    evaluationHint: 'Check training on authentication best practices. MFA data can supplement.' },
  { controlId: 'cis-v8-14.4', requiredCapabilities: ['security_awareness_training'], supplementaryCapabilities: [],
    evaluationHint: 'Check training on data handling — storage, transfer, disposal of sensitive data.' },
  { controlId: 'cis-v8-14.5', requiredCapabilities: ['security_awareness_training'], supplementaryCapabilities: [],
    evaluationHint: 'Check training on unintentional data exposure causes.' },
  { controlId: 'cis-v8-14.6', requiredCapabilities: ['security_awareness_training'], supplementaryCapabilities: ['ticketing_sla'],
    evaluationHint: 'Check training on recognizing and reporting security incidents.' },
  { controlId: 'cis-v8-14.7', requiredCapabilities: ['security_awareness_training'], supplementaryCapabilities: ['patch_management'],
    evaluationHint: 'Check training on identifying missing security updates.' },
  { controlId: 'cis-v8-14.8', requiredCapabilities: ['security_awareness_training'], supplementaryCapabilities: [],
    evaluationHint: 'Check training on dangers of insecure networks.' },

  // === 15 - Service Provider Management ===
  { controlId: 'cis-v8-15.1', requiredCapabilities: ['it_documentation'], supplementaryCapabilities: [],
    evaluationHint: 'Check IT Glue for a service provider inventory with classification.' },
  { controlId: 'cis-v8-15.2', requiredCapabilities: ['it_documentation'], supplementaryCapabilities: [],
    evaluationHint: 'Check for a documented service provider management policy.' },
  { controlId: 'cis-v8-15.7', requiredCapabilities: ['it_documentation'], supplementaryCapabilities: ['identity_management'],
    evaluationHint: 'Check that decommissioned providers have accounts disabled and data flows terminated.' },

  // === 16 - Application Security ===
  { controlId: 'cis-v8-16.1', requiredCapabilities: ['it_documentation'], supplementaryCapabilities: [],
    evaluationHint: 'Check for documented secure application development process.' },

  // === 17 - Incident Response ===
  { controlId: 'cis-v8-17.1', requiredCapabilities: ['it_documentation', 'ticketing_sla'], supplementaryCapabilities: [],
    evaluationHint: 'Check for designated incident handling personnel — primary and backup.' },
  { controlId: 'cis-v8-17.2', requiredCapabilities: ['it_documentation'], supplementaryCapabilities: [],
    evaluationHint: 'Check for documented incident contact information.' },
  { controlId: 'cis-v8-17.3', requiredCapabilities: ['it_documentation', 'ticketing_sla'], supplementaryCapabilities: [],
    evaluationHint: 'Check for documented incident reporting process with timeframes and personnel.' },
]

export const CIS_V8_CAPABILITY_INDEX = new Map(CIS_V8_CAPABILITY_MAP.map((m) => [m.controlId, m]))
