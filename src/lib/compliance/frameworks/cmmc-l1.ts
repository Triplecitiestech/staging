/**
 * CMMC Level 1 Framework Definition + Evaluators
 *
 * CMMC Level 1 ("Foundational") covers the 17 basic safeguarding practices
 * required by FAR 52.204-21 to protect Federal Contract Information (FCI).
 * Self-assessment, annual.
 *
 * Source of truth: https://dodcio.defense.gov/CMMC/ (Practice Reference Guide)
 *                  FAR 52.204-21(b)(1) — basic safeguarding requirements
 *
 * The 17 practices span 6 domains:
 *   AC (Access Control)              — 4 practices
 *   IA (Identification & Auth)       — 2 practices
 *   MP (Media Protection)            — 1 practice
 *   PE (Physical Protection)         — 4 practices
 *   SC (System & Comms Protection)   — 2 practices
 *   SI (System & Info Integrity)     — 4 practices
 *
 * Many CMMC L1 practices map directly to CIS Controls v8 safeguards. To
 * avoid duplicating evaluator logic, the evaluators in this file delegate
 * to existing CIS v8 evaluators where the underlying check is identical
 * (e.g. CMMC SI.L1-b.1.xv "malicious code protection" === CIS 10.1
 * "Anti-Malware"). Practices with no CIS v8 equivalent (physical security,
 * media disposal) are marked `evaluationType: 'manual'` and surface as
 * needs_review in the assessment for the engineer to attest.
 */

import type {
  ControlDefinition,
  ControlEvaluator,
  EvaluationContext,
  EvaluationResult,
  FrameworkDefinition,
} from '../types'
import { CIS_V8_EVALUATORS } from './cis-v8'

// ---------------------------------------------------------------------------
// Helper: build a result with consistent shape
// ---------------------------------------------------------------------------

function result(
  controlId: string,
  ctx: EvaluationContext,
  status: EvaluationResult['status'],
  confidence: EvaluationResult['confidence'],
  reasoning: string,
  evidenceSourceTypes: string[],
  missingEvidence: string[],
  remediation: string | null = null
): EvaluationResult {
  const evidenceIds: string[] = []
  Array.from(ctx.evidence.entries()).forEach(([sourceType, record]) => {
    if (evidenceSourceTypes.includes(sourceType)) {
      evidenceIds.push(record.id)
    }
  })
  return { controlId, status, confidence, reasoning, evidenceIds, missingEvidence, remediation }
}

/**
 * Delegate to a CIS v8 evaluator and re-stamp the result with the CMMC
 * controlId. We preserve the underlying status/confidence/reasoning since
 * the technical check is the same; only the framework wrapper differs.
 */
function delegateTo(
  cisControlId: string,
  cmmcControlId: string,
  ctx: EvaluationContext,
  evaluatorPrefix?: string
): EvaluationResult {
  const evaluator = CIS_V8_EVALUATORS[cisControlId]
  if (!evaluator) {
    return result(cmmcControlId, ctx, 'not_assessed', 'none',
      `No evaluator wired up for delegate target ${cisControlId}.`, [], [])
  }
  const cisResult = evaluator(ctx)
  return {
    ...cisResult,
    controlId: cmmcControlId,
    reasoning: evaluatorPrefix
      ? `${evaluatorPrefix} ${cisResult.reasoning}`
      : cisResult.reasoning,
  }
}

/**
 * Return a "manual attestation needed" result for practices that cannot be
 * verified from automated evidence (e.g. physical security).
 */
function manual(
  controlId: string,
  ctx: EvaluationContext,
  reason: string
): EvaluationResult {
  return result(controlId, ctx, 'needs_review', 'low', reason, [], [])
}

// ---------------------------------------------------------------------------
// Control Definitions (the 17 CMMC L1 practices)
// ---------------------------------------------------------------------------

const CMMC_L1_CONTROLS: ControlDefinition[] = [
  // === Access Control (AC) ===
  {
    controlId: 'cmmc-AC.L1-b.1.i',
    frameworkId: 'cmmc-l1',
    tier: 'L1',
    sortKey: [1, 1],
    category: 'AC - Access Control',
    title: 'Authorized Access Control [FAR 52.204-21(b)(1)(i)]',
    description: 'Limit information system access to authorized users, processes acting on behalf of authorized users, or devices (including other information systems).',
    evidenceSources: ['microsoft_users', 'microsoft_conditional_access', 'datto_rmm_devices'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'cmmc-AC.L1-b.1.ii',
    frameworkId: 'cmmc-l1',
    tier: 'L1',
    sortKey: [1, 2],
    category: 'AC - Access Control',
    title: 'Transaction & Function Control [FAR 52.204-21(b)(1)(ii)]',
    description: 'Limit information system access to the types of transactions and functions that authorized users are permitted to execute.',
    evidenceSources: ['microsoft_users', 'microsoft_conditional_access'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'cmmc-AC.L1-b.1.iii',
    frameworkId: 'cmmc-l1',
    tier: 'L1',
    sortKey: [1, 3],
    category: 'AC - Access Control',
    title: 'External Connections [FAR 52.204-21(b)(1)(iii)]',
    description: 'Verify and control/limit connections to and use of external information systems.',
    evidenceSources: ['microsoft_conditional_access', 'dnsfilter_dns'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'cmmc-AC.L1-b.1.iv',
    frameworkId: 'cmmc-l1',
    tier: 'L1',
    sortKey: [1, 4],
    category: 'AC - Access Control',
    title: 'Control Public Information [FAR 52.204-21(b)(1)(iv)]',
    description: 'Control information posted or processed on publicly accessible information systems.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual',
  },

  // === Identification and Authentication (IA) ===
  {
    controlId: 'cmmc-IA.L1-b.1.v',
    frameworkId: 'cmmc-l1',
    tier: 'L1',
    sortKey: [2, 1],
    category: 'IA - Identification and Authentication',
    title: 'Identification [FAR 52.204-21(b)(1)(v)]',
    description: 'Identify information system users, processes acting on behalf of users, or devices.',
    evidenceSources: ['microsoft_users', 'datto_rmm_devices'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'cmmc-IA.L1-b.1.vi',
    frameworkId: 'cmmc-l1',
    tier: 'L1',
    sortKey: [2, 2],
    category: 'IA - Identification and Authentication',
    title: 'Authentication [FAR 52.204-21(b)(1)(vi)]',
    description: 'Authenticate (or verify) the identities of those users, processes, or devices, as a prerequisite to allowing access to organizational information systems.',
    evidenceSources: ['microsoft_mfa', 'microsoft_conditional_access'],
    evaluationType: 'auto',
  },

  // === Media Protection (MP) ===
  {
    controlId: 'cmmc-MP.L1-b.1.vii',
    frameworkId: 'cmmc-l1',
    tier: 'L1',
    sortKey: [3, 1],
    category: 'MP - Media Protection',
    title: 'Media Disposal [FAR 52.204-21(b)(1)(vii)]',
    description: 'Sanitize or destroy information system media containing Federal Contract Information before disposal or release for reuse.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual',
  },

  // === Physical Protection (PE) — all manual (no automated evidence sources) ===
  {
    controlId: 'cmmc-PE.L1-b.1.viii',
    frameworkId: 'cmmc-l1',
    tier: 'L1',
    sortKey: [4, 1],
    category: 'PE - Physical Protection',
    title: 'Physical Access [FAR 52.204-21(b)(1)(viii)]',
    description: 'Limit physical access to organizational information systems, equipment, and the respective operating environments to authorized individuals.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual',
  },
  {
    controlId: 'cmmc-PE.L1-b.1.ix',
    frameworkId: 'cmmc-l1',
    tier: 'L1',
    sortKey: [4, 2],
    category: 'PE - Physical Protection',
    title: 'Escort Visitors [FAR 52.204-21(b)(1)(ix)]',
    description: 'Escort visitors and monitor visitor activity.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual',
  },
  {
    controlId: 'cmmc-PE.L1-b.1.x',
    frameworkId: 'cmmc-l1',
    tier: 'L1',
    sortKey: [4, 3],
    category: 'PE - Physical Protection',
    title: 'Physical Access Logs [FAR 52.204-21(b)(1)(x)]',
    description: 'Maintain audit logs of physical access.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual',
  },
  {
    controlId: 'cmmc-PE.L1-b.1.xi',
    frameworkId: 'cmmc-l1',
    tier: 'L1',
    sortKey: [4, 4],
    category: 'PE - Physical Protection',
    title: 'Manage Physical Access [FAR 52.204-21(b)(1)(xi)]',
    description: 'Control and manage physical access devices.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual',
  },

  // === System and Communications Protection (SC) ===
  {
    controlId: 'cmmc-SC.L1-b.1.xii',
    frameworkId: 'cmmc-l1',
    tier: 'L1',
    sortKey: [5, 1],
    category: 'SC - System and Communications Protection',
    title: 'Boundary Protection [FAR 52.204-21(b)(1)(xii)]',
    description: 'Monitor, control, and protect organizational communications (i.e., information transmitted or received by organizational information systems) at the external boundaries and key internal boundaries of the information systems.',
    evidenceSources: ['dnsfilter_dns', 'microsoft_conditional_access'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'cmmc-SC.L1-b.1.xiii',
    frameworkId: 'cmmc-l1',
    tier: 'L1',
    sortKey: [5, 2],
    category: 'SC - System and Communications Protection',
    title: 'Public-Access System Separation [FAR 52.204-21(b)(1)(xiii)]',
    description: 'Implement subnetworks for publicly accessible system components that are physically or logically separated from internal networks.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual',
  },

  // === System and Information Integrity (SI) ===
  {
    controlId: 'cmmc-SI.L1-b.1.xiv',
    frameworkId: 'cmmc-l1',
    tier: 'L1',
    sortKey: [6, 1],
    category: 'SI - System and Information Integrity',
    title: 'Flaw Remediation [FAR 52.204-21(b)(1)(xiv)]',
    description: 'Identify, report, and correct information and information system flaws in a timely manner.',
    evidenceSources: ['datto_rmm_patches', 'microsoft_device_compliance'],
    evaluationType: 'auto',
  },
  {
    controlId: 'cmmc-SI.L1-b.1.xv',
    frameworkId: 'cmmc-l1',
    tier: 'L1',
    sortKey: [6, 2],
    category: 'SI - System and Information Integrity',
    title: 'Malicious Code Protection [FAR 52.204-21(b)(1)(xv)]',
    description: 'Provide protection from malicious code at appropriate locations within organizational information systems.',
    evidenceSources: ['microsoft_defender', 'datto_edr_alerts'],
    evaluationType: 'auto',
  },
  {
    controlId: 'cmmc-SI.L1-b.1.xvi',
    frameworkId: 'cmmc-l1',
    tier: 'L1',
    sortKey: [6, 3],
    category: 'SI - System and Information Integrity',
    title: 'Update Malicious Code Protection [FAR 52.204-21(b)(1)(xvi)]',
    description: 'Update malicious code protection mechanisms when new releases are available.',
    evidenceSources: ['microsoft_defender', 'datto_edr_alerts'],
    evaluationType: 'auto',
  },
  {
    controlId: 'cmmc-SI.L1-b.1.xvii',
    frameworkId: 'cmmc-l1',
    tier: 'L1',
    sortKey: [6, 4],
    category: 'SI - System and Information Integrity',
    title: 'System & File Scanning [FAR 52.204-21(b)(1)(xvii)]',
    description: 'Perform periodic scans of the information system and real-time scans of files from external sources as files are downloaded, opened, or executed.',
    evidenceSources: ['microsoft_defender', 'datto_edr_alerts'],
    evaluationType: 'auto',
  },
]

// ---------------------------------------------------------------------------
// Evaluators — delegate to CIS v8 where the underlying check matches
// ---------------------------------------------------------------------------

const evaluators: Record<string, ControlEvaluator> = {}

// AC.L1-b.1.i: authorized access -> CIS 5.1 (Account Inventory) + 6.x
evaluators['cmmc-AC.L1-b.1.i'] = (ctx) =>
  delegateTo('cis-v8-5.1', 'cmmc-AC.L1-b.1.i', ctx,
    'CMMC requires limiting access to authorized users.')

// AC.L1-b.1.ii: function-level access -> CIS 5.4 (Restrict Admin Privileges)
// AC.L1-b.1.ii: transaction & function control. This is primarily about role-
// based access — which is best confirmed via intake (Step 2 customer context)
// rather than digital evidence alone. Falls back to CIS 5.4 if no intake answer.
evaluators['cmmc-AC.L1-b.1.ii'] = (ctx) => {
  const roleBased = ctx.environment?.rawAnswers?.access_role_based
  const adminRights = ctx.environment?.rawAnswers?.standard_user_admin_rights
  if (roleBased === 'role_restricted' && adminRights === 'no') {
    return result('cmmc-AC.L1-b.1.ii', ctx, 'pass', 'high',
      'Per intake: access to business applications is role-restricted by job function, and standard users do not have local administrator privileges. This satisfies CMMC AC.L1-b.1.ii via admin attestation.',
      [], [])
  }
  if (roleBased === 'partial' || adminRights === 'mixed') {
    return result('cmmc-AC.L1-b.1.ii', ctx, 'partial', 'medium',
      `Partial role-based access control reported in intake (access: ${roleBased}, admin rights: ${adminRights}). Some applications restricted; others may not be.`,
      [], [],
      'Tighten role-based access controls and remove local admin privileges from standard users.')
  }
  if (roleBased === 'all_equal' || adminRights === 'yes') {
    return result('cmmc-AC.L1-b.1.ii', ctx, 'fail', 'medium',
      `Per intake: ${roleBased === 'all_equal' ? 'all users have equal access to all applications' : 'most users have local admin privileges'}. CMMC AC.L1-b.1.ii is not satisfied.`,
      [], [],
      'Implement role-based access controls; remove local admin privileges from non-IT staff.')
  }
  // No intake answer — fall back to digital evidence via CIS 5.4
  return delegateTo('cis-v8-5.4', 'cmmc-AC.L1-b.1.ii', ctx,
    'CMMC requires limiting users to permitted transactions/functions. Customer intake answers (Step 2) would provide the most authoritative evidence — none currently captured.')
}

// AC.L1-b.1.iii: external connections -> CIS 12.6 (Encryption in Transit) + 9.2 (DNS Filtering)
evaluators['cmmc-AC.L1-b.1.iii'] = (ctx) => {
  const r1 = delegateTo('cis-v8-9.2', 'cmmc-AC.L1-b.1.iii', ctx)
  // If DNS filtering is in place, accept that as evidence of external-connection control
  if (r1.status === 'pass') return { ...r1, reasoning: `External connections are filtered. ${r1.reasoning}` }
  return r1
}

// AC.L1-b.1.iv: control public information -> manual (process/policy)
evaluators['cmmc-AC.L1-b.1.iv'] = (ctx) =>
  manual('cmmc-AC.L1-b.1.iv', ctx,
    'Manual review required: confirm a documented process exists for approving information posted on publicly accessible systems (websites, social media, etc.).')

// IA.L1-b.1.v: identify users -> CIS 5.1 (Account Inventory)
evaluators['cmmc-IA.L1-b.1.v'] = (ctx) =>
  delegateTo('cis-v8-5.1', 'cmmc-IA.L1-b.1.v', ctx,
    'CMMC requires identifying all users, processes, and devices.')

// IA.L1-b.1.vi: authenticate identities -> CIS 6.3/6.5 (MFA)
evaluators['cmmc-IA.L1-b.1.vi'] = (ctx) =>
  delegateTo('cis-v8-6.3', 'cmmc-IA.L1-b.1.vi', ctx,
    'CMMC requires authenticating user identities (MFA strongly recommended).')

// MP.L1-b.1.vii: media disposal -> manual (no telemetry)
evaluators['cmmc-MP.L1-b.1.vii'] = (ctx) =>
  manual('cmmc-MP.L1-b.1.vii', ctx,
    'Manual attestation required: confirm the organization sanitizes or destroys media containing FCI before disposal (e.g. NIST 800-88 sanitization, certified destruction service).')

// Physical security — all manual
// PE.L1-b.1.viii — Physical Access Limit (PE.1)
// Read intake answers (physical_access_control + physical_access_method) to
// determine whether physical access is restricted to authorized personnel.
evaluators['cmmc-PE.L1-b.1.viii'] = (ctx) => {
  const access = ctx.environment?.rawAnswers?.physical_access_control
  const method = ctx.environment?.rawAnswers?.physical_access_method
  if (access === 'restricted_locked') {
    return result('cmmc-PE.L1-b.1.viii', ctx, 'pass', 'high',
      `Per intake: physical access to office and IT equipment is restricted (locked office + locked server room/cabinet). Access method: ${method ?? 'documented in intake'}.`,
      [], [])
  }
  if (access === 'restricted_partial') {
    return result('cmmc-PE.L1-b.1.viii', ctx, 'partial', 'medium',
      'Per intake: office is locked but network equipment is in a shared area. Move network equipment to a locked enclosure for full coverage.',
      [], [], 'Install a locked rack or cabinet for network equipment.')
  }
  if (access === 'open') {
    return result('cmmc-PE.L1-b.1.viii', ctx, 'fail', 'medium',
      'Per intake: open office with minimal physical restrictions. CMMC PE.L1 requires physical access controls.',
      [], [], 'Implement office locks and restrict access to network/server equipment.')
  }
  return manual('cmmc-PE.L1-b.1.viii', ctx,
    'Customer intake (Step 2 > Physical Security) is required to assess this control. Capture physical access controls in the customer environment questionnaire.')
}

// PE.L1-b.1.ix — Escort Visitors (PE.2)
evaluators['cmmc-PE.L1-b.1.ix'] = (ctx) => {
  const escort = ctx.environment?.rawAnswers?.visitor_escort
  if (escort === 'always') {
    return result('cmmc-PE.L1-b.1.ix', ctx, 'pass', 'high',
      'Per intake: visitors are always escorted by an employee.',
      [], [])
  }
  if (escort === 'restricted_areas') {
    return result('cmmc-PE.L1-b.1.ix', ctx, 'partial', 'medium',
      'Per intake: visitors are escorted only in restricted areas. CMMC requires monitoring of all visitor activity.',
      [], [], 'Document visitor escort policy in IT Glue covering all areas with sensitive equipment or data.')
  }
  if (escort === 'no') {
    return result('cmmc-PE.L1-b.1.ix', ctx, 'fail', 'medium',
      'Per intake: no formal visitor escort policy. CMMC PE.L1 requires visitor escorting and monitoring.',
      [], [], 'Implement and document a visitor escort policy.')
  }
  return manual('cmmc-PE.L1-b.1.ix', ctx,
    'Customer intake (Step 2 > Physical Security > visitor escort) is required to assess this control.')
}

// PE.L1-b.1.x — Physical Access Logs
evaluators['cmmc-PE.L1-b.1.x'] = (ctx) => {
  const log = ctx.environment?.rawAnswers?.visitor_log
  const method = ctx.environment?.rawAnswers?.physical_access_method
  if (log === 'yes' || method === 'badge_keycard') {
    return result('cmmc-PE.L1-b.1.x', ctx, 'pass', 'high',
      `Per intake: physical access audit logs are maintained${method === 'badge_keycard' ? ' (badge/keycard system provides access logs)' : ' (visitor log)'}.`,
      [], [])
  }
  if (log === 'no') {
    return result('cmmc-PE.L1-b.1.x', ctx, 'fail', 'medium',
      'Per intake: no visitor log maintained. CMMC PE.L1 requires audit logs of physical access.',
      [], [], 'Implement a visitor log (paper or digital) and retain entries for at least 90 days.')
  }
  return manual('cmmc-PE.L1-b.1.x', ctx,
    'Customer intake (Step 2 > Physical Security > visitor log) is required to assess this control.')
}

// PE.L1-b.1.xi — Manage Physical Access Devices
evaluators['cmmc-PE.L1-b.1.xi'] = (ctx) => {
  const method = ctx.environment?.rawAnswers?.physical_access_method
  if (method === 'badge_keycard') {
    return result('cmmc-PE.L1-b.1.xi', ctx, 'pass', 'medium',
      'Per intake: badge/keycard system is in use. These systems inherently inventory and control physical access devices, with badge revocation on termination.',
      [], [], null)
  }
  if (method === 'key_locks' || method === 'combination' || method === 'mixed') {
    return result('cmmc-PE.L1-b.1.xi', ctx, 'needs_review', 'low',
      `Per intake: ${method.replace('_', ' ')} in use. Confirm there is a documented inventory of physical access devices (keys, combinations) and a recovery process when employees leave.`,
      [], ['it_glue_documentation'],
      'Document key/combination inventory and recovery procedure in IT Glue.')
  }
  return manual('cmmc-PE.L1-b.1.xi', ctx,
    'Customer intake (Step 2 > Physical Security > access method) is required to assess this control.')
}

// SC.L1-b.1.xii: boundary protection -> CIS 9.2 (DNS Filtering) + Conditional Access
evaluators['cmmc-SC.L1-b.1.xii'] = (ctx) =>
  delegateTo('cis-v8-9.2', 'cmmc-SC.L1-b.1.xii', ctx,
    'CMMC requires monitoring/control at network boundaries.')

// SC.L1-b.1.xiii: subnetwork separation -> manual (network architecture)
evaluators['cmmc-SC.L1-b.1.xiii'] = (ctx) =>
  manual('cmmc-SC.L1-b.1.xiii', ctx,
    'Manual review required: confirm publicly-accessible system components (web servers, guest WiFi, etc.) are physically or logically separated from internal networks (DMZ, VLAN segmentation).')

// SI.L1-b.1.xiv: flaw remediation -> CIS 7.3 (OS Patch) + 7.4 (App Patch)
evaluators['cmmc-SI.L1-b.1.xiv'] = (ctx) =>
  delegateTo('cis-v8-7.3', 'cmmc-SI.L1-b.1.xiv', ctx,
    'CMMC requires timely flaw identification and remediation.')

// SI.L1-b.1.xv: malicious code protection -> CIS 10.1 (Anti-Malware)
evaluators['cmmc-SI.L1-b.1.xv'] = (ctx) =>
  delegateTo('cis-v8-10.1', 'cmmc-SI.L1-b.1.xv', ctx,
    'CMMC requires malicious code protection at appropriate locations.')

// SI.L1-b.1.xvi: update malicious code protection -> CIS 10.2 (Configure Anti-Malware)
evaluators['cmmc-SI.L1-b.1.xvi'] = (ctx) =>
  delegateTo('cis-v8-10.2', 'cmmc-SI.L1-b.1.xvi', ctx,
    'CMMC requires updating anti-malware mechanisms when new releases are available.')

// SI.L1-b.1.xvii: periodic + real-time scans -> CIS 10.1 (Anti-Malware presence)
evaluators['cmmc-SI.L1-b.1.xvii'] = (ctx) =>
  delegateTo('cis-v8-10.1', 'cmmc-SI.L1-b.1.xvii', ctx,
    'CMMC requires periodic system scans and real-time scans of external files.')

// ---------------------------------------------------------------------------
// Framework export
// ---------------------------------------------------------------------------

export const CMMC_L1_FRAMEWORK: FrameworkDefinition = {
  id: 'cmmc-l1',
  name: 'CMMC Level 1 (Foundational)',
  version: '2.0',
  description: 'Cybersecurity Maturity Model Certification Level 1 — 17 basic safeguarding practices required by FAR 52.204-21 to protect Federal Contract Information (FCI). Annual self-assessment.',
  controls: CMMC_L1_CONTROLS,
}

export const CMMC_L1_EVALUATORS: Record<string, ControlEvaluator> = evaluators
