/**
 * Policy Generation System — Framework-to-Policy Mappings
 *
 * Maps specific controls from HIPAA, NIST 800-171, CMMC, and CIS v8
 * to the policy types that address them.
 *
 * Coverage types:
 *   full     — this policy directly and primarily addresses the control
 *   partial  — this policy contributes to but doesn't fully satisfy the control
 *   supporting — this policy provides contextual/supporting documentation
 */

import type { FrameworkPolicyMapping } from './types'

export const FRAMEWORK_POLICY_MAPPINGS: FrameworkPolicyMapping[] = [

  // =========================================================================
  // CIS Controls v8
  // =========================================================================

  // CIS 1 - Inventory and Control of Enterprise Assets
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'asset-management-policy', controlId: 'cis-v8-1.1', controlTitle: 'Establish and Maintain Detailed Enterprise Asset Inventory', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'asset-management-policy', controlId: 'cis-v8-1.2', controlTitle: 'Address Unauthorized Assets', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'asset-management-policy', controlId: 'cis-v8-1.3', controlTitle: 'Utilize an Active Discovery Tool', coverageType: 'partial' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'asset-management-policy', controlId: 'cis-v8-1.4', controlTitle: 'Use DHCP Logging to Update Asset Inventory', coverageType: 'partial' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'asset-management-policy', controlId: 'cis-v8-1.5', controlTitle: 'Use a Passive Asset Discovery Tool', coverageType: 'partial' },

  // CIS 2 - Inventory and Control of Software Assets
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'software-management-policy', controlId: 'cis-v8-2.1', controlTitle: 'Establish and Maintain a Software Inventory', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'software-management-policy', controlId: 'cis-v8-2.2', controlTitle: 'Ensure Authorized Software is Currently Supported', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'software-management-policy', controlId: 'cis-v8-2.3', controlTitle: 'Address Unauthorized Software', coverageType: 'full' },

  // CIS 3 - Data Protection
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'data-classification-policy', controlId: 'cis-v8-3.1', controlTitle: 'Establish and Maintain a Data Management Process', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'data-classification-policy', controlId: 'cis-v8-3.2', controlTitle: 'Establish and Maintain a Data Inventory', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'data-classification-policy', controlId: 'cis-v8-3.3', controlTitle: 'Configure Data Access Control Lists', coverageType: 'partial' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'data-retention-policy', controlId: 'cis-v8-3.4', controlTitle: 'Enforce Data Retention', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'data-retention-policy', controlId: 'cis-v8-3.5', controlTitle: 'Securely Dispose of Data', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'media-disposal-policy', controlId: 'cis-v8-3.5', controlTitle: 'Securely Dispose of Data', coverageType: 'partial' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'encryption-policy', controlId: 'cis-v8-3.6', controlTitle: 'Encrypt Data on End-User Devices', coverageType: 'full' },

  // CIS 4 - Secure Configuration
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'configuration-management-policy', controlId: 'cis-v8-4.1', controlTitle: 'Establish and Maintain a Secure Configuration Process', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'network-security-policy', controlId: 'cis-v8-4.2', controlTitle: 'Establish and Maintain a Secure Configuration Process for Network Infrastructure', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'configuration-management-policy', controlId: 'cis-v8-4.3', controlTitle: 'Configure Automatic Session Locking', coverageType: 'partial' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'endpoint-protection-policy', controlId: 'cis-v8-4.5', controlTitle: 'Implement and Manage a Host-Based Firewall', coverageType: 'partial' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'encryption-policy', controlId: 'cis-v8-4.6', controlTitle: 'Securely Manage Enterprise Assets and Software', coverageType: 'partial' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'configuration-management-policy', controlId: 'cis-v8-4.7', controlTitle: 'Manage Default Accounts', coverageType: 'full' },

  // CIS 5 - Account Management
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'access-control-policy', controlId: 'cis-v8-5.1', controlTitle: 'Establish and Maintain an Account Inventory', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'password-policy', controlId: 'cis-v8-5.2', controlTitle: 'Use Unique Passwords', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'access-control-policy', controlId: 'cis-v8-5.3', controlTitle: 'Disable Dormant Accounts', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'access-control-policy', controlId: 'cis-v8-5.4', controlTitle: 'Restrict Administrator Privileges', coverageType: 'full' },

  // CIS 6 - Access Control Management
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'access-control-policy', controlId: 'cis-v8-6.1', controlTitle: 'Establish an Access Granting Process', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'access-control-policy', controlId: 'cis-v8-6.2', controlTitle: 'Establish an Access Revoking Process', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'password-policy', controlId: 'cis-v8-6.3', controlTitle: 'Require MFA for Externally-Exposed Applications', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'remote-access-policy', controlId: 'cis-v8-6.4', controlTitle: 'Require MFA for Remote Network Access', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'password-policy', controlId: 'cis-v8-6.5', controlTitle: 'Require MFA for Administrative Access', coverageType: 'full' },

  // CIS 7 - Continuous Vulnerability Management
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'vulnerability-management-policy', controlId: 'cis-v8-7.1', controlTitle: 'Establish and Maintain a Vulnerability Management Process', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'vulnerability-management-policy', controlId: 'cis-v8-7.2', controlTitle: 'Establish and Maintain a Remediation Process', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'patch-management-policy', controlId: 'cis-v8-7.3', controlTitle: 'Perform Automated Operating System Patch Management', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'patch-management-policy', controlId: 'cis-v8-7.4', controlTitle: 'Perform Automated Application Patch Management', coverageType: 'full' },

  // CIS 8 - Audit Log Management
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'logging-monitoring-policy', controlId: 'cis-v8-8.1', controlTitle: 'Establish and Maintain an Audit Log Management Process', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'logging-monitoring-policy', controlId: 'cis-v8-8.2', controlTitle: 'Collect Audit Logs', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'logging-monitoring-policy', controlId: 'cis-v8-8.3', controlTitle: 'Ensure Adequate Audit Log Storage', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'logging-monitoring-policy', controlId: 'cis-v8-8.5', controlTitle: 'Collect Detailed Audit Logs', coverageType: 'full' },

  // CIS 9 - Email and Web Browser Protections
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'email-communications-policy', controlId: 'cis-v8-9.1', controlTitle: 'Ensure Use of Only Fully Supported Browsers and Email Clients', coverageType: 'partial' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'dns-web-filtering-policy', controlId: 'cis-v8-9.2', controlTitle: 'Use DNS Filtering Services', coverageType: 'full' },

  // CIS 10 - Malware Defenses
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'endpoint-protection-policy', controlId: 'cis-v8-10.1', controlTitle: 'Deploy and Maintain Anti-Malware Software', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'endpoint-protection-policy', controlId: 'cis-v8-10.2', controlTitle: 'Configure Automatic Anti-Malware Signature Updates', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'endpoint-protection-policy', controlId: 'cis-v8-10.3', controlTitle: 'Disable Autorun and Autoplay', coverageType: 'full' },

  // CIS 11 - Data Recovery
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'backup-disaster-recovery-policy', controlId: 'cis-v8-11.1', controlTitle: 'Establish and Maintain a Data Recovery Practice', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'backup-disaster-recovery-policy', controlId: 'cis-v8-11.2', controlTitle: 'Perform Automated Backups', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'backup-disaster-recovery-policy', controlId: 'cis-v8-11.3', controlTitle: 'Protect Recovery Data', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'backup-disaster-recovery-policy', controlId: 'cis-v8-11.4', controlTitle: 'Establish and Maintain an Isolated Instance of Recovery Data', coverageType: 'full' },

  // CIS 12 - Network Infrastructure Management
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'network-security-policy', controlId: 'cis-v8-12.1', controlTitle: 'Ensure Network Infrastructure is Up-to-Date', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'encryption-policy', controlId: 'cis-v8-12.6', controlTitle: 'Use of Encrypted Sessions for Network Management', coverageType: 'partial' },

  // CIS 13 - Network Monitoring and Defense
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'logging-monitoring-policy', controlId: 'cis-v8-13.1', controlTitle: 'Centralize Security Event Alerting', coverageType: 'full' },

  // CIS 14 - Security Awareness and Skills Training
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'security-awareness-training-policy', controlId: 'cis-v8-14.1', controlTitle: 'Establish and Maintain a Security Awareness Program', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'security-awareness-training-policy', controlId: 'cis-v8-14.2', controlTitle: 'Train Workforce Members to Recognize Social Engineering Attacks', coverageType: 'full' },

  // CIS 15 - Service Provider Management
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'vendor-management-policy', controlId: 'cis-v8-15.1', controlTitle: 'Establish and Maintain an Inventory of Service Providers', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'vendor-management-policy', controlId: 'cis-v8-15.2', controlTitle: 'Establish and Maintain a Service Provider Management Policy', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'vendor-management-policy', controlId: 'cis-v8-15.7', controlTitle: 'Securely Decommission Service Providers', coverageType: 'full' },

  // CIS 17 - Incident Response Management
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'incident-response-policy', controlId: 'cis-v8-17.1', controlTitle: 'Designate Personnel to Manage Incident Handling', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'incident-response-policy', controlId: 'cis-v8-17.2', controlTitle: 'Establish and Maintain Contact Information for Reporting Security Incidents', coverageType: 'full' },
  { frameworkId: 'cis-v8', frameworkName: 'CIS Controls v8', policySlug: 'incident-response-policy', controlId: 'cis-v8-17.3', controlTitle: 'Establish and Maintain an Enterprise Process for Reporting Incidents', coverageType: 'full' },

  // =========================================================================
  // HIPAA
  // =========================================================================

  // Administrative Safeguards (45 CFR 164.308)
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'risk-assessment-policy', controlId: 'hipaa-164.308-a1', controlTitle: 'Security Management Process - Risk Analysis', coverageType: 'full' },
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'information-security-policy', controlId: 'hipaa-164.308-a1', controlTitle: 'Security Management Process', coverageType: 'partial' },
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'incident-response-policy', controlId: 'hipaa-164.308-a6', controlTitle: 'Security Incident Procedures', coverageType: 'full' },
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'backup-disaster-recovery-policy', controlId: 'hipaa-164.308-a7', controlTitle: 'Contingency Plan', coverageType: 'full' },
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'business-continuity-policy', controlId: 'hipaa-164.308-a7', controlTitle: 'Contingency Plan', coverageType: 'partial' },
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'access-control-policy', controlId: 'hipaa-164.308-a3', controlTitle: 'Workforce Security', coverageType: 'full' },
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'access-control-policy', controlId: 'hipaa-164.308-a4', controlTitle: 'Information Access Management', coverageType: 'full' },
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'security-awareness-training-policy', controlId: 'hipaa-164.308-a5', controlTitle: 'Security Awareness and Training', coverageType: 'full' },
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'vendor-management-policy', controlId: 'hipaa-164.308-b1', controlTitle: 'Business Associate Contracts', coverageType: 'full' },
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'hipaa-security-policy', controlId: 'hipaa-164.308-a1', controlTitle: 'Security Management Process', coverageType: 'full' },
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'hipaa-security-policy', controlId: 'hipaa-164.308-a2', controlTitle: 'Assigned Security Responsibility', coverageType: 'full' },
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'hipaa-security-policy', controlId: 'hipaa-164.308-a8', controlTitle: 'Evaluation', coverageType: 'full' },

  // Physical Safeguards (45 CFR 164.310)
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'physical-security-policy', controlId: 'hipaa-164.310-a1', controlTitle: 'Facility Access Controls', coverageType: 'full' },
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'asset-management-policy', controlId: 'hipaa-164.310-d1', controlTitle: 'Device and Media Controls', coverageType: 'full' },
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'media-disposal-policy', controlId: 'hipaa-164.310-d1', controlTitle: 'Device and Media Controls', coverageType: 'partial' },

  // Technical Safeguards (45 CFR 164.312)
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'access-control-policy', controlId: 'hipaa-164.312-a1', controlTitle: 'Access Control', coverageType: 'full' },
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'logging-monitoring-policy', controlId: 'hipaa-164.312-b', controlTitle: 'Audit Controls', coverageType: 'full' },
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'encryption-policy', controlId: 'hipaa-164.312-a2iv', controlTitle: 'Encryption and Decryption', coverageType: 'full' },
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'encryption-policy', controlId: 'hipaa-164.312-e1', controlTitle: 'Transmission Security', coverageType: 'full' },
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'password-policy', controlId: 'hipaa-164.312-d', controlTitle: 'Person or Entity Authentication', coverageType: 'full' },

  // Privacy Rule
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'hipaa-privacy-policy', controlId: 'hipaa-164.502', controlTitle: 'Uses and Disclosures of PHI', coverageType: 'full' },
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'hipaa-privacy-policy', controlId: 'hipaa-164.514', controlTitle: 'Minimum Necessary', coverageType: 'full' },
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'hipaa-privacy-policy', controlId: 'hipaa-164.520', controlTitle: 'Notice of Privacy Practices', coverageType: 'full' },
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'data-classification-policy', controlId: 'hipaa-164.502', controlTitle: 'Uses and Disclosures - Data Classification', coverageType: 'partial' },

  // Breach Notification Rule
  { frameworkId: 'hipaa', frameworkName: 'HIPAA', policySlug: 'incident-response-policy', controlId: 'hipaa-164.404', controlTitle: 'Breach Notification to Individuals', coverageType: 'full' },

  // =========================================================================
  // NIST 800-171
  // =========================================================================

  // 3.1 Access Control
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'access-control-policy', controlId: 'nist-3.1.1', controlTitle: 'Limit system access to authorized users', coverageType: 'full' },
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'access-control-policy', controlId: 'nist-3.1.2', controlTitle: 'Limit system access to authorized transactions and functions', coverageType: 'full' },
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'remote-access-policy', controlId: 'nist-3.1.12', controlTitle: 'Monitor and control remote access sessions', coverageType: 'full' },
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'encryption-policy', controlId: 'nist-3.1.13', controlTitle: 'Employ cryptographic mechanisms to protect CUI during remote access', coverageType: 'full' },
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'mobile-device-policy', controlId: 'nist-3.1.18', controlTitle: 'Control connection of mobile devices', coverageType: 'full' },
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'encryption-policy', controlId: 'nist-3.1.19', controlTitle: 'Encrypt CUI on mobile devices', coverageType: 'full' },

  // 3.2 Awareness and Training
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'security-awareness-training-policy', controlId: 'nist-3.2.1', controlTitle: 'Ensure personnel are aware of security risks', coverageType: 'full' },
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'security-awareness-training-policy', controlId: 'nist-3.2.2', controlTitle: 'Ensure personnel are trained to carry out security duties', coverageType: 'full' },
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'security-awareness-training-policy', controlId: 'nist-3.2.3', controlTitle: 'Provide security awareness training on recognizing insider threats', coverageType: 'full' },

  // 3.3 Audit and Accountability
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'logging-monitoring-policy', controlId: 'nist-3.3.1', controlTitle: 'Create and retain system audit logs', coverageType: 'full' },
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'logging-monitoring-policy', controlId: 'nist-3.3.2', controlTitle: 'Ensure actions can be traced to individual users', coverageType: 'full' },

  // 3.4 Configuration Management
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'configuration-management-policy', controlId: 'nist-3.4.1', controlTitle: 'Establish and maintain baseline configurations', coverageType: 'full' },
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'change-management-policy', controlId: 'nist-3.4.3', controlTitle: 'Track, review, approve changes to systems', coverageType: 'full' },
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'configuration-management-policy', controlId: 'nist-3.4.6', controlTitle: 'Employ the principle of least functionality', coverageType: 'partial' },

  // 3.5 Identification and Authentication
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'password-policy', controlId: 'nist-3.5.1', controlTitle: 'Identify system users and processes', coverageType: 'full' },
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'password-policy', controlId: 'nist-3.5.2', controlTitle: 'Authenticate users and devices', coverageType: 'full' },
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'password-policy', controlId: 'nist-3.5.3', controlTitle: 'Use multifactor authentication', coverageType: 'full' },

  // 3.6 Incident Response
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'incident-response-policy', controlId: 'nist-3.6.1', controlTitle: 'Establish an operational incident-handling capability', coverageType: 'full' },
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'incident-response-policy', controlId: 'nist-3.6.2', controlTitle: 'Track, document, and report incidents', coverageType: 'full' },

  // 3.7 Maintenance
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'patch-management-policy', controlId: 'nist-3.7.1', controlTitle: 'Perform maintenance on organizational systems', coverageType: 'full' },

  // 3.8 Media Protection
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'media-disposal-policy', controlId: 'nist-3.8.1', controlTitle: 'Protect system media containing CUI', coverageType: 'full' },
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'media-disposal-policy', controlId: 'nist-3.8.3', controlTitle: 'Sanitize media before disposal', coverageType: 'full' },
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'encryption-policy', controlId: 'nist-3.8.6', controlTitle: 'Implement cryptographic mechanisms for CUI on portable storage', coverageType: 'full' },

  // 3.9 Personnel Security
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'access-control-policy', controlId: 'nist-3.9.2', controlTitle: 'Ensure CUI protection during personnel actions like terminations', coverageType: 'partial' },

  // 3.10 Physical Protection
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'physical-security-policy', controlId: 'nist-3.10.1', controlTitle: 'Limit physical access to systems and equipment', coverageType: 'full' },

  // 3.11 Risk Assessment
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'risk-assessment-policy', controlId: 'nist-3.11.1', controlTitle: 'Periodically assess risk to organizational operations', coverageType: 'full' },
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'vulnerability-management-policy', controlId: 'nist-3.11.2', controlTitle: 'Scan for vulnerabilities periodically', coverageType: 'full' },

  // 3.12 Security Assessment
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'information-security-policy', controlId: 'nist-3.12.1', controlTitle: 'Periodically assess security controls', coverageType: 'full' },
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'information-security-policy', controlId: 'nist-3.12.4', controlTitle: 'Develop and implement plans of action', coverageType: 'partial' },

  // 3.13 System and Communications Protection
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'network-security-policy', controlId: 'nist-3.13.1', controlTitle: 'Monitor and protect communications at external boundaries', coverageType: 'full' },
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'encryption-policy', controlId: 'nist-3.13.8', controlTitle: 'Implement cryptographic mechanisms to prevent unauthorized disclosure', coverageType: 'full' },
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'cui-handling-policy', controlId: 'nist-3.13.16', controlTitle: 'Protect CUI at rest', coverageType: 'full' },

  // 3.14 System and Information Integrity
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'endpoint-protection-policy', controlId: 'nist-3.14.2', controlTitle: 'Provide protection from malicious code', coverageType: 'full' },
  { frameworkId: 'nist-800-171', frameworkName: 'NIST 800-171', policySlug: 'logging-monitoring-policy', controlId: 'nist-3.14.6', controlTitle: 'Monitor organizational systems for attacks', coverageType: 'full' },

  // =========================================================================
  // CMMC (Level 1 + Level 2)
  // =========================================================================

  // CMMC L1 maps closely to NIST 800-171 basic safeguarding (17 practices)
  { frameworkId: 'cmmc-l1', frameworkName: 'CMMC Level 1', policySlug: 'access-control-policy', controlId: 'cmmc-AC.L1-b.1.i', controlTitle: 'Authorized Access Control', coverageType: 'full' },
  { frameworkId: 'cmmc-l1', frameworkName: 'CMMC Level 1', policySlug: 'password-policy', controlId: 'cmmc-IA.L1-b.1.v', controlTitle: 'Identification', coverageType: 'full' },
  { frameworkId: 'cmmc-l1', frameworkName: 'CMMC Level 1', policySlug: 'endpoint-protection-policy', controlId: 'cmmc-SI.L1-b.1.vi', controlTitle: 'Malicious Code Protection', coverageType: 'full' },
  { frameworkId: 'cmmc-l1', frameworkName: 'CMMC Level 1', policySlug: 'physical-security-policy', controlId: 'cmmc-PE.L1-b.1.iii', controlTitle: 'Physical Access', coverageType: 'full' },
  { frameworkId: 'cmmc-l1', frameworkName: 'CMMC Level 1', policySlug: 'media-disposal-policy', controlId: 'cmmc-MP.L1-b.1.iv', controlTitle: 'Media Disposal', coverageType: 'full' },

  // CMMC L2 maps to full NIST 800-171 (110 practices)
  { frameworkId: 'cmmc-l2', frameworkName: 'CMMC Level 2', policySlug: 'access-control-policy', controlId: 'cmmc-AC.L2-3.1.1', controlTitle: 'Authorized Access Control', coverageType: 'full' },
  { frameworkId: 'cmmc-l2', frameworkName: 'CMMC Level 2', policySlug: 'security-awareness-training-policy', controlId: 'cmmc-AT.L2-3.2.1', controlTitle: 'Role-Based Risk Awareness', coverageType: 'full' },
  { frameworkId: 'cmmc-l2', frameworkName: 'CMMC Level 2', policySlug: 'logging-monitoring-policy', controlId: 'cmmc-AU.L2-3.3.1', controlTitle: 'System Auditing', coverageType: 'full' },
  { frameworkId: 'cmmc-l2', frameworkName: 'CMMC Level 2', policySlug: 'configuration-management-policy', controlId: 'cmmc-CM.L2-3.4.1', controlTitle: 'System Baselining', coverageType: 'full' },
  { frameworkId: 'cmmc-l2', frameworkName: 'CMMC Level 2', policySlug: 'password-policy', controlId: 'cmmc-IA.L2-3.5.3', controlTitle: 'Multifactor Authentication', coverageType: 'full' },
  { frameworkId: 'cmmc-l2', frameworkName: 'CMMC Level 2', policySlug: 'incident-response-policy', controlId: 'cmmc-IR.L2-3.6.1', controlTitle: 'Incident Handling', coverageType: 'full' },
  { frameworkId: 'cmmc-l2', frameworkName: 'CMMC Level 2', policySlug: 'patch-management-policy', controlId: 'cmmc-MA.L2-3.7.1', controlTitle: 'System Maintenance', coverageType: 'full' },
  { frameworkId: 'cmmc-l2', frameworkName: 'CMMC Level 2', policySlug: 'media-disposal-policy', controlId: 'cmmc-MP.L2-3.8.3', controlTitle: 'Media Sanitization', coverageType: 'full' },
  { frameworkId: 'cmmc-l2', frameworkName: 'CMMC Level 2', policySlug: 'physical-security-policy', controlId: 'cmmc-PE.L2-3.10.1', controlTitle: 'Physical Access Limitation', coverageType: 'full' },
  { frameworkId: 'cmmc-l2', frameworkName: 'CMMC Level 2', policySlug: 'risk-assessment-policy', controlId: 'cmmc-RA.L2-3.11.1', controlTitle: 'Risk Assessments', coverageType: 'full' },
  { frameworkId: 'cmmc-l2', frameworkName: 'CMMC Level 2', policySlug: 'information-security-policy', controlId: 'cmmc-CA.L2-3.12.1', controlTitle: 'Security Control Assessment', coverageType: 'full' },
  { frameworkId: 'cmmc-l2', frameworkName: 'CMMC Level 2', policySlug: 'network-security-policy', controlId: 'cmmc-SC.L2-3.13.1', controlTitle: 'Boundary Protection', coverageType: 'full' },
  { frameworkId: 'cmmc-l2', frameworkName: 'CMMC Level 2', policySlug: 'encryption-policy', controlId: 'cmmc-SC.L2-3.13.8', controlTitle: 'CUI Encryption', coverageType: 'full' },
  { frameworkId: 'cmmc-l2', frameworkName: 'CMMC Level 2', policySlug: 'endpoint-protection-policy', controlId: 'cmmc-SI.L2-3.14.2', controlTitle: 'Malicious Code Protection', coverageType: 'full' },
  { frameworkId: 'cmmc-l2', frameworkName: 'CMMC Level 2', policySlug: 'vulnerability-management-policy', controlId: 'cmmc-SI.L2-3.14.1', controlTitle: 'Flaw Remediation', coverageType: 'full' },
  { frameworkId: 'cmmc-l2', frameworkName: 'CMMC Level 2', policySlug: 'remote-access-policy', controlId: 'cmmc-AC.L2-3.1.12', controlTitle: 'Remote Access Control', coverageType: 'full' },
  { frameworkId: 'cmmc-l2', frameworkName: 'CMMC Level 2', policySlug: 'cui-handling-policy', controlId: 'cmmc-SC.L2-3.13.16', controlTitle: 'CUI at Rest', coverageType: 'full' },
]

// ---------------------------------------------------------------------------
// Helper: Get all mappings for a framework
// ---------------------------------------------------------------------------

export function getMappingsForFramework(frameworkId: string): FrameworkPolicyMapping[] {
  return FRAMEWORK_POLICY_MAPPINGS.filter((m) => m.frameworkId === frameworkId)
}

/** Get unique policy slugs required/recommended for a set of frameworks */
export function getRequiredPolicySlugs(frameworkIds: string[]): string[] {
  const slugs = new Set<string>()
  for (const m of FRAMEWORK_POLICY_MAPPINGS) {
    if (frameworkIds.includes(m.frameworkId)) {
      slugs.add(m.policySlug)
    }
  }
  return Array.from(slugs)
}

/** Get control count per policy for a set of frameworks */
export function getControlCountByPolicy(frameworkIds: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const m of FRAMEWORK_POLICY_MAPPINGS) {
    if (frameworkIds.includes(m.frameworkId)) {
      counts.set(m.policySlug, (counts.get(m.policySlug) ?? 0) + 1)
    }
  }
  return counts
}
