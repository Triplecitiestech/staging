/**
 * Policy Generation System — Master Policy Catalog
 *
 * Defines all known policy types, their expected sections, and framework mappings.
 * Based on EZ RED baseline policy set structure and industry standards.
 * This catalog is framework-agnostic — framework mappings are in framework-mappings.ts.
 *
 * New policy types can be added here without touching any other file.
 */

import type { PolicyCatalogItem, PolicyCategory } from './types'
import { FRAMEWORK_POLICY_MAPPINGS } from './framework-mappings'

// ---------------------------------------------------------------------------
// Master Policy Catalog
// ---------------------------------------------------------------------------

const RAW_CATALOG: Array<Omit<PolicyCatalogItem, 'frameworkRelevance'>> = [
  // --- Governance ---
  {
    slug: 'information-security-policy',
    name: 'Information Security Policy (WISP)',
    description: 'Written Information Security Program establishing the organization\'s overall security posture, objectives, and governance structure.',
    category: 'governance',
    expectedSections: [
      'Purpose and Scope', 'Policy Statement', 'Roles and Responsibilities',
      'Security Objectives', 'Risk Management Approach', 'Compliance Requirements',
      'Policy Review and Maintenance', 'Enforcement and Disciplinary Actions',
      'Definitions', 'Document Control',
    ],
    sortOrder: 1,
  },
  {
    slug: 'acceptable-use-policy',
    name: 'Acceptable Use Policy',
    description: 'Defines acceptable and prohibited use of organizational IT resources including computers, networks, email, internet, and other systems.',
    category: 'governance',
    expectedSections: [
      'Purpose and Scope', 'Acceptable Use', 'Prohibited Activities',
      'Email and Communications', 'Internet Usage', 'Social Media',
      'Personal Use of Company Resources', 'Monitoring and Privacy',
      'Enforcement and Consequences', 'Acknowledgment',
    ],
    sortOrder: 2,
  },
  {
    slug: 'ai-usage-policy',
    name: 'Artificial Intelligence Usage Policy',
    description: 'Governs the use of AI tools and services, including generative AI, within the organization.',
    category: 'governance',
    expectedSections: [
      'Purpose and Scope', 'Approved AI Tools', 'Prohibited Uses',
      'Data Protection Requirements', 'Confidential Information Handling',
      'Output Verification Requirements', 'Intellectual Property Considerations',
      'Vendor Assessment Requirements', 'Training Requirements',
      'Incident Reporting', 'Enforcement',
    ],
    sortOrder: 3,
  },
  {
    slug: 'risk-assessment-policy',
    name: 'Risk Assessment Policy',
    description: 'Establishes the methodology and cadence for conducting information security risk assessments.',
    category: 'governance',
    expectedSections: [
      'Purpose and Scope', 'Risk Assessment Methodology', 'Risk Identification',
      'Risk Analysis and Evaluation', 'Risk Treatment Options', 'Risk Acceptance Criteria',
      'Assessment Frequency and Triggers', 'Roles and Responsibilities',
      'Documentation Requirements', 'Risk Register Maintenance',
      'Reporting and Communication', 'Review Cycle',
    ],
    sortOrder: 4,
  },
  {
    slug: 'change-management-policy',
    name: 'Change Management Policy',
    description: 'Defines processes for requesting, evaluating, approving, and implementing changes to IT systems and infrastructure.',
    category: 'governance',
    expectedSections: [
      'Purpose and Scope', 'Change Categories', 'Change Request Process',
      'Impact Assessment', 'Change Advisory Board', 'Approval Process',
      'Implementation Planning', 'Testing Requirements', 'Rollback Procedures',
      'Emergency Changes', 'Post-Implementation Review', 'Documentation',
    ],
    sortOrder: 5,
  },

  // --- Access Control ---
  {
    slug: 'access-control-policy',
    name: 'Access Control Policy',
    description: 'Governs how access to systems, data, and facilities is granted, reviewed, and revoked.',
    category: 'access-control',
    expectedSections: [
      'Purpose and Scope', 'Access Control Principles', 'User Account Management',
      'Authentication Requirements', 'Authorization and Least Privilege',
      'Access Request and Approval Process', 'Access Review and Recertification',
      'Privileged Access Management', 'Service Account Management',
      'Access Revocation and Termination', 'Remote Access Requirements',
      'Audit and Monitoring', 'Enforcement',
    ],
    sortOrder: 10,
  },
  {
    slug: 'password-policy',
    name: 'Password and Authentication Policy',
    description: 'Defines requirements for password complexity, multi-factor authentication, and credential management.',
    category: 'access-control',
    expectedSections: [
      'Purpose and Scope', 'Password Requirements', 'Password Complexity Rules',
      'Password Expiration and History', 'Multi-Factor Authentication Requirements',
      'Account Lockout Policy', 'Password Storage and Transmission',
      'Shared and Service Account Passwords', 'Password Manager Usage',
      'Default Password Handling', 'Exception Process', 'Enforcement',
    ],
    sortOrder: 11,
  },
  {
    slug: 'remote-access-policy',
    name: 'Remote Access Policy',
    description: 'Establishes requirements and controls for remote access to organizational systems and data.',
    category: 'access-control',
    expectedSections: [
      'Purpose and Scope', 'Authorized Remote Access Methods', 'VPN Requirements',
      'Authentication for Remote Access', 'Device Requirements for Remote Access',
      'Network Security Requirements', 'Data Handling While Remote',
      'Monitoring and Logging', 'Third-Party Remote Access',
      'Incident Reporting', 'Enforcement',
    ],
    sortOrder: 12,
  },

  // --- Data Protection ---
  {
    slug: 'data-classification-policy',
    name: 'Data Classification and Handling Policy',
    description: 'Defines data classification levels and handling requirements for each level.',
    category: 'data-protection',
    expectedSections: [
      'Purpose and Scope', 'Classification Levels', 'Classification Criteria',
      'Data Ownership and Stewardship', 'Handling Requirements by Level',
      'Labeling and Marking', 'Storage Requirements', 'Transmission Requirements',
      'Disposal and Destruction', 'Reclassification Process', 'Enforcement',
    ],
    sortOrder: 20,
  },
  {
    slug: 'data-retention-policy',
    name: 'Data Retention and Disposal Policy',
    description: 'Establishes retention periods for different data types and secure disposal procedures.',
    category: 'data-protection',
    expectedSections: [
      'Purpose and Scope', 'Retention Schedule', 'Legal and Regulatory Requirements',
      'Data Storage Requirements', 'Data Disposal Methods', 'Media Sanitization',
      'Electronic Data Destruction', 'Physical Document Destruction',
      'Certificate of Destruction', 'Exception Process',
      'Audit Trail', 'Enforcement',
    ],
    sortOrder: 21,
  },
  {
    slug: 'encryption-policy',
    name: 'Encryption Policy',
    description: 'Defines requirements for encryption of data at rest, in transit, and in use.',
    category: 'data-protection',
    expectedSections: [
      'Purpose and Scope', 'Encryption Standards', 'Data at Rest Encryption',
      'Data in Transit Encryption', 'Key Management', 'Certificate Management',
      'Encryption for Email', 'Encryption for Mobile Devices',
      'Encryption for Removable Media', 'Exceptions and Waivers', 'Enforcement',
    ],
    sortOrder: 22,
  },
  {
    slug: 'privacy-policy',
    name: 'Privacy Policy',
    description: 'Establishes how the organization collects, uses, stores, and protects personal information.',
    category: 'data-protection',
    expectedSections: [
      'Purpose and Scope', 'Types of Personal Information Collected',
      'Collection Methods', 'Use of Personal Information', 'Disclosure and Sharing',
      'Data Subject Rights', 'Data Protection Measures', 'Cross-Border Transfers',
      'Retention Periods', 'Breach Notification', 'Contact Information', 'Updates',
    ],
    sortOrder: 23,
  },

  // --- Operations ---
  {
    slug: 'backup-disaster-recovery-policy',
    name: 'Backup and Disaster Recovery Policy',
    description: 'Defines backup requirements, disaster recovery procedures, and business continuity planning.',
    category: 'operations',
    expectedSections: [
      'Purpose and Scope', 'Backup Strategy', 'Backup Schedule and Frequency',
      'Backup Types', 'Backup Storage and Protection', 'Recovery Time Objectives',
      'Recovery Point Objectives', 'Backup Testing and Verification',
      'Disaster Recovery Procedures', 'Recovery Priorities',
      'Communication Plan', 'Post-Recovery Review', 'Enforcement',
    ],
    sortOrder: 30,
  },
  {
    slug: 'business-continuity-policy',
    name: 'Business Continuity Policy',
    description: 'Establishes the framework for maintaining critical business operations during and after disruptive events.',
    category: 'operations',
    expectedSections: [
      'Purpose and Scope', 'Business Impact Analysis', 'Critical Functions and Processes',
      'Recovery Strategies', 'Continuity Team and Responsibilities',
      'Communication Procedures', 'Alternate Site Procedures',
      'Testing and Exercise Program', 'Plan Maintenance and Review',
      'Vendor Dependencies', 'Training Requirements',
    ],
    sortOrder: 31,
  },
  {
    slug: 'patch-management-policy',
    name: 'Patch Management Policy',
    description: 'Defines the process for identifying, testing, and deploying patches to systems and applications.',
    category: 'operations',
    expectedSections: [
      'Purpose and Scope', 'Patch Classification', 'Patch Identification and Monitoring',
      'Risk Assessment', 'Testing Requirements', 'Deployment Schedule',
      'Emergency Patching Procedures', 'Exemptions and Deferrals',
      'Verification and Compliance Monitoring', 'Reporting', 'Enforcement',
    ],
    sortOrder: 32,
  },
  {
    slug: 'asset-management-policy',
    name: 'Asset Management Policy',
    description: 'Governs identification, classification, tracking, and lifecycle management of IT assets.',
    category: 'operations',
    expectedSections: [
      'Purpose and Scope', 'Asset Inventory Requirements', 'Asset Classification',
      'Asset Ownership and Custodianship', 'Procurement and Onboarding',
      'Configuration Management', 'Software License Management',
      'Asset Tracking and Monitoring', 'Decommissioning and Disposal',
      'Lost or Stolen Assets', 'Audit and Compliance', 'Enforcement',
    ],
    sortOrder: 33,
  },
  {
    slug: 'logging-monitoring-policy',
    name: 'Logging and Monitoring Policy',
    description: 'Establishes requirements for system logging, security monitoring, and log management.',
    category: 'operations',
    expectedSections: [
      'Purpose and Scope', 'Logging Requirements', 'Log Sources',
      'Log Content Standards', 'Log Retention', 'Log Protection',
      'Monitoring and Alerting', 'Security Event Detection',
      'Log Review Procedures', 'Incident Correlation',
      'Compliance Monitoring', 'Enforcement',
    ],
    sortOrder: 34,
  },
  {
    slug: 'network-security-policy',
    name: 'Network Security Policy',
    description: 'Defines requirements for securing the organization\'s network infrastructure.',
    category: 'operations',
    expectedSections: [
      'Purpose and Scope', 'Network Architecture', 'Network Segmentation',
      'Firewall Management', 'Wireless Network Security',
      'Network Access Control', 'Intrusion Detection/Prevention',
      'DNS Security', 'VPN and Encrypted Communications',
      'Network Monitoring', 'Guest Network Policy', 'Enforcement',
    ],
    sortOrder: 35,
  },
  {
    slug: 'vulnerability-management-policy',
    name: 'Vulnerability Management Policy',
    description: 'Establishes the process for identifying, assessing, and remediating security vulnerabilities.',
    category: 'operations',
    expectedSections: [
      'Purpose and Scope', 'Vulnerability Scanning Requirements',
      'Scanning Frequency and Scope', 'Vulnerability Assessment and Prioritization',
      'Remediation SLAs', 'Patch Management Integration',
      'Exception and Risk Acceptance Process', 'Penetration Testing',
      'Reporting and Metrics', 'Third-Party Vulnerability Management', 'Enforcement',
    ],
    sortOrder: 36,
  },

  // --- Incident Response ---
  {
    slug: 'incident-response-policy',
    name: 'Incident Response Policy',
    description: 'Defines the procedures for detecting, reporting, containing, and recovering from security incidents.',
    category: 'incident-response',
    expectedSections: [
      'Purpose and Scope', 'Incident Definitions and Classification',
      'Incident Response Team', 'Roles and Responsibilities',
      'Detection and Reporting', 'Initial Assessment and Triage',
      'Containment Strategies', 'Eradication and Recovery',
      'Evidence Preservation', 'Communication and Notification',
      'Post-Incident Review', 'Lessons Learned', 'Reporting Requirements',
    ],
    sortOrder: 40,
  },

  // --- Human Resources ---
  {
    slug: 'security-awareness-training-policy',
    name: 'Security Awareness and Training Policy',
    description: 'Establishes requirements for security awareness training for all personnel.',
    category: 'human-resources',
    expectedSections: [
      'Purpose and Scope', 'Training Requirements', 'Training Frequency',
      'Training Content', 'Role-Based Training', 'New Hire Training',
      'Phishing Simulation Program', 'Training Records and Tracking',
      'Compliance Verification', 'Third-Party and Contractor Training',
      'Metrics and Reporting', 'Enforcement',
    ],
    sortOrder: 50,
  },
  {
    slug: 'clean-desk-policy',
    name: 'Clean Desk and Clear Screen Policy',
    description: 'Requires employees to secure sensitive materials and lock screens when away from their workstation.',
    category: 'human-resources',
    expectedSections: [
      'Purpose and Scope', 'Clean Desk Requirements', 'Clear Screen Requirements',
      'Sensitive Document Handling', 'Workstation Security',
      'Meeting Room Procedures', 'Printing and Copying',
      'Compliance Checks', 'Enforcement',
    ],
    sortOrder: 51,
  },

  // --- BYOD / Mobile ---
  {
    slug: 'byod-policy',
    name: 'Bring Your Own Device (BYOD) Policy',
    description: 'Governs the use of personal devices for work purposes, including security requirements and acceptable use.',
    category: 'technical',
    expectedSections: [
      'Purpose and Scope', 'Eligible Devices', 'Enrollment Requirements',
      'Security Requirements', 'Mobile Device Management (MDM)',
      'Data Separation', 'Acceptable Use', 'Lost or Stolen Devices',
      'Remote Wipe Authority', 'Privacy Considerations',
      'Support and Maintenance', 'Termination and Offboarding', 'Enforcement',
    ],
    sortOrder: 60,
  },
  {
    slug: 'mobile-device-policy',
    name: 'Mobile Device Policy',
    description: 'Establishes security requirements for all mobile devices used to access organizational resources.',
    category: 'technical',
    expectedSections: [
      'Purpose and Scope', 'Device Inventory', 'Security Configuration',
      'Encryption Requirements', 'Authentication Requirements',
      'Application Management', 'OS and Patch Requirements',
      'Data Storage on Mobile Devices', 'Lost or Stolen Procedures',
      'Remote Wipe Capability', 'Monitoring and Compliance', 'Enforcement',
    ],
    sortOrder: 61,
  },

  // --- Vendor Management ---
  {
    slug: 'vendor-management-policy',
    name: 'Vendor Management Policy',
    description: 'Defines the process for assessing, selecting, monitoring, and managing third-party vendors and service providers.',
    category: 'vendor-management',
    expectedSections: [
      'Purpose and Scope', 'Vendor Classification', 'Vendor Risk Assessment',
      'Due Diligence Requirements', 'Security Requirements for Vendors',
      'Contractual Requirements', 'Ongoing Monitoring',
      'Performance Review', 'Incident Notification Requirements',
      'Vendor Termination and Transition', 'Subcontractor Management',
      'Record Keeping', 'Enforcement',
    ],
    sortOrder: 70,
  },

  // --- Compliance-Specific ---
  {
    slug: 'hipaa-security-policy',
    name: 'HIPAA Security Policy',
    description: 'Addresses HIPAA Security Rule requirements for protecting electronic Protected Health Information (ePHI).',
    category: 'compliance-specific',
    expectedSections: [
      'Purpose and Scope', 'Definitions (PHI, ePHI, Covered Entity, Business Associate)',
      'Administrative Safeguards', 'Physical Safeguards', 'Technical Safeguards',
      'Risk Analysis Requirements', 'Workforce Security',
      'Information Access Management', 'Security Awareness and Training',
      'Contingency Plan', 'Business Associate Agreements',
      'Breach Notification Procedures', 'Sanctions Policy',
      'Documentation and Retention', 'Policy Review',
    ],
    sortOrder: 80,
  },
  {
    slug: 'hipaa-privacy-policy',
    name: 'HIPAA Privacy Policy',
    description: 'Addresses HIPAA Privacy Rule requirements governing the use and disclosure of PHI.',
    category: 'compliance-specific',
    expectedSections: [
      'Purpose and Scope', 'Privacy Officer Designation',
      'Uses and Disclosures of PHI', 'Minimum Necessary Standard',
      'Patient Rights', 'Notice of Privacy Practices',
      'Authorization Requirements', 'De-identification Standards',
      'Business Associate Management', 'Complaint Process',
      'Training Requirements', 'Sanctions', 'Documentation and Retention',
    ],
    sortOrder: 81,
  },
  {
    slug: 'cui-handling-policy',
    name: 'Controlled Unclassified Information (CUI) Handling Policy',
    description: 'Defines requirements for handling, storing, and transmitting CUI per NIST 800-171 and CMMC requirements.',
    category: 'compliance-specific',
    expectedSections: [
      'Purpose and Scope', 'CUI Definitions and Categories', 'CUI Marking Requirements',
      'Access Control for CUI', 'Storage Requirements', 'Transmission Requirements',
      'CUI Handling Procedures', 'Destruction and Disposal',
      'Incident Reporting for CUI', 'Training Requirements',
      'Subcontractor and Flow-Down Requirements', 'Audit and Compliance',
    ],
    sortOrder: 82,
  },
  {
    slug: 'media-disposal-policy',
    name: 'Media Protection and Disposal Policy',
    description: 'Governs the handling, storage, transport, and destruction of physical and digital media.',
    category: 'data-protection',
    expectedSections: [
      'Purpose and Scope', 'Media Types', 'Media Labeling and Handling',
      'Media Storage Requirements', 'Media Transport',
      'Media Sanitization Standards', 'Destruction Methods',
      'Certificate of Destruction', 'Vendor Disposal Requirements',
      'Audit Trail', 'Enforcement',
    ],
    sortOrder: 24,
  },
  {
    slug: 'physical-security-policy',
    name: 'Physical Security Policy',
    description: 'Establishes requirements for physical access controls, facility security, and environmental protections.',
    category: 'operations',
    expectedSections: [
      'Purpose and Scope', 'Facility Access Controls', 'Visitor Management',
      'Physical Access Authorization', 'Security Monitoring (CCTV/Alarms)',
      'Environmental Controls', 'Equipment Security',
      'Secure Areas', 'Delivery and Loading Areas',
      'Off-Site Equipment', 'Enforcement',
    ],
    sortOrder: 37,
  },
  {
    slug: 'email-communications-policy',
    name: 'Email and Communications Policy',
    description: 'Defines acceptable use and security requirements for email and electronic communications.',
    category: 'governance',
    expectedSections: [
      'Purpose and Scope', 'Acceptable Email Use', 'Prohibited Email Activities',
      'Email Security Requirements', 'Phishing Awareness',
      'Attachment and Link Handling', 'Confidential Information via Email',
      'Email Retention', 'Auto-Forwarding Restrictions',
      'Messaging Platform Rules', 'Monitoring', 'Enforcement',
    ],
    sortOrder: 6,
  },
  {
    slug: 'configuration-management-policy',
    name: 'Secure Configuration Management Policy',
    description: 'Defines requirements for establishing and maintaining secure configurations for all IT systems.',
    category: 'technical',
    expectedSections: [
      'Purpose and Scope', 'Baseline Configuration Standards',
      'Configuration Change Control', 'Hardening Standards',
      'Default Account Management', 'Unnecessary Service Removal',
      'Configuration Monitoring', 'Deviation Management',
      'Configuration Documentation', 'Enforcement',
    ],
    sortOrder: 62,
  },
  {
    slug: 'software-management-policy',
    name: 'Software Management Policy',
    description: 'Governs software inventory, authorized software, and prevention of unauthorized software.',
    category: 'operations',
    expectedSections: [
      'Purpose and Scope', 'Software Inventory Requirements',
      'Authorized Software List', 'Software Request and Approval',
      'Software Installation Restrictions', 'License Compliance',
      'Open Source Software', 'Shadow IT Prevention',
      'Software Removal', 'Audit and Compliance', 'Enforcement',
    ],
    sortOrder: 38,
  },
  {
    slug: 'endpoint-protection-policy',
    name: 'Endpoint Protection Policy',
    description: 'Defines requirements for anti-malware, endpoint detection and response, and endpoint security controls.',
    category: 'technical',
    expectedSections: [
      'Purpose and Scope', 'Anti-Malware Requirements',
      'Endpoint Detection and Response (EDR)', 'Endpoint Firewall',
      'Device Encryption', 'USB and Removable Media Controls',
      'Auto-Run Prevention', 'Endpoint Monitoring',
      'Update and Patch Requirements', 'Enforcement',
    ],
    sortOrder: 63,
  },
  {
    slug: 'dns-web-filtering-policy',
    name: 'DNS and Web Filtering Policy',
    description: 'Establishes requirements for DNS filtering and web content filtering to protect against malicious sites.',
    category: 'technical',
    expectedSections: [
      'Purpose and Scope', 'DNS Filtering Requirements',
      'Web Content Categories', 'Block and Allow Lists',
      'HTTPS Inspection', 'Bypass Procedures',
      'Monitoring and Reporting', 'User Notifications',
      'Exception Process', 'Enforcement',
    ],
    sortOrder: 64,
  },
]

// ---------------------------------------------------------------------------
// Build the full catalog by attaching framework relevance
// ---------------------------------------------------------------------------

function buildCatalog(): PolicyCatalogItem[] {
  return RAW_CATALOG.map((item) => {
    const relevance = FRAMEWORK_POLICY_MAPPINGS
      .filter((m) => m.policySlug === item.slug)
      .reduce((acc, m) => {
        const existing = acc.find((r) => r.frameworkId === m.frameworkId)
        if (existing) {
          if (!existing.controlIds.includes(m.controlId)) {
            existing.controlIds.push(m.controlId)
          }
          // Upgrade requirement level: required > recommended > supporting
          if (m.coverageType === 'full' && existing.requirement !== 'required') {
            existing.requirement = 'required'
          } else if (m.coverageType === 'partial' && existing.requirement === 'supporting') {
            existing.requirement = 'recommended'
          }
        } else {
          acc.push({
            frameworkId: m.frameworkId,
            controlIds: [m.controlId],
            requirement: m.coverageType === 'full' ? 'required' : m.coverageType === 'partial' ? 'recommended' : 'supporting',
          })
        }
        return acc
      }, [] as PolicyCatalogItem['frameworkRelevance'])

    return { ...item, frameworkRelevance: relevance }
  })
}

export const POLICY_CATALOG: PolicyCatalogItem[] = buildCatalog()

/** Get a single catalog item by slug */
export function getCatalogItem(slug: string): PolicyCatalogItem | undefined {
  return POLICY_CATALOG.find((p) => p.slug === slug)
}

/** Get all catalog items for a set of frameworks */
export function getCatalogForFrameworks(frameworkIds: string[]): PolicyCatalogItem[] {
  return POLICY_CATALOG.filter((p) =>
    p.frameworkRelevance.some((r) => frameworkIds.includes(r.frameworkId))
  ).sort((a, b) => {
    // Sort: required first, then recommended, then supporting
    const reqOrder = { required: 0, recommended: 1, supporting: 2 }
    const aReq = Math.min(...a.frameworkRelevance
      .filter((r) => frameworkIds.includes(r.frameworkId))
      .map((r) => reqOrder[r.requirement] ?? 3))
    const bReq = Math.min(...b.frameworkRelevance
      .filter((r) => frameworkIds.includes(r.frameworkId))
      .map((r) => reqOrder[r.requirement] ?? 3))
    if (aReq !== bReq) return aReq - bReq
    return a.sortOrder - b.sortOrder
  })
}

/** Get category display name */
export function getCategoryLabel(cat: PolicyCategory): string {
  const labels: Record<PolicyCategory, string> = {
    'governance': 'Governance & Program',
    'access-control': 'Access Control',
    'data-protection': 'Data Protection',
    'operations': 'Operations & Infrastructure',
    'incident-response': 'Incident Response',
    'human-resources': 'Human Resources',
    'vendor-management': 'Vendor Management',
    'technical': 'Technical Controls',
    'compliance-specific': 'Compliance-Specific',
  }
  return labels[cat] ?? cat
}
