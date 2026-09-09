// src/lib/connector/autotask-role-findings.ts
//
// WHICH AUTOTASK ROLE IDS A TIME ENTRY ACCEPTS — settled empirically, and the
// work-type guidance that follows from it.
//
// ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
// Autotask keeps TWO per-resource role lists and they disagree:
// ResourceRoleDepartments (role paired with a department; the only one carrying
// departmentID) and ResourceServiceDeskRoles (the Service Desk list). For
// resource 29682885 (Kurtis Florance) the first held ONE role and the second
// held TEN, with different defaults. autotask_resource_roles reported both and
// said, correctly, that which list a write enforces against could not be
// determined from a read. That question then recurred across sessions and kept
// costing time, and a note from 2026-09-04 claimed Engineer had been REJECTED
// as an invalid resource/role combination — contradicting the live Service Desk
// list.
//
// So it was settled by experiment rather than argued about again.
//
// ── THE EXPERIMENT (2026-09-09) ────────────────────────────────────────────
// A scratch ticket was created on Autotask company 0 — Triple Cities Tech's
// OWN company record — precisely so no customer record was touched. (On
// 2026-09-08 a test write went against company 436, a real customer with the
// Client Portal active. That must not happen again: company 0 is the scratch
// target.) Ticket 35754 / T20260909.0028, closed afterwards with status 52
// "Complete - No Notify".
//
// One variable only: roleId. Ten minimal time entries, one per active role,
// each 1 minute, identical in every other respect. Then a NEGATIVE CONTROL
// with a role id that does not exist in the instance — without it, ten
// acceptances could not be told apart from Autotask not validating the field.
//
// RESULT: ALL TEN active roles were ACCEPTED. The nonexistent role was
// REJECTED with Autotask's own message:
//   HTTP 500 {"errors":["Reference value on field: roleID of timeEntryType:
//   Role does not exist or is invalid. ; on record number [1]."]}
//
// ── WHAT THAT PROVES, AND WHAT IT DOES NOT ─────────────────────────────────
// PROVES: a ticket time entry is NOT validated against
// ResourceRoleDepartments. That list held one role; nine entries using roles
// absent from it were accepted. Had it been the gate, nine of ten would have
// failed.
// PROVES: Autotask does validate the field, so the ten acceptances are a real
// result and not an absence of checking.
// DOES NOT PROVE: whether the gate is ResourceServiceDeskRoles or simply "any
// active role in the instance". Kurtis holds all ten active roles, so there is
// no role he lacks to test against, and this experiment cannot separate those
// two explanations. That is stated rather than papered over — the alternative
// would be a confident claim the measurement never supported, which is the
// failure mode this repo keeps paying for.
// NOT TESTED: TASK assignment. A task needs departmentID, which only
// ResourceRoleDepartments carries, so that constraint is unchanged and is not
// covered by anything here.
//
// RETRACTED: the 2026-09-04 claim that Engineer (29683355) was rejected as an
// invalid resource/role combination. Engineer was ACCEPTED — time entry 13856.

/** One role attempted in the experiment. */
export interface RoleTrialResult {
  roleId: number
  roleName: string
  accepted: boolean
  /** Autotask time-entry id created, when accepted. */
  timeEntryId?: number
  /** The vendor's verbatim error, when rejected. */
  error?: string
  /** Bill rate from autotask_list_roles, read live the same day. */
  hourlyRate: number
  hourlyFactor: number
}

export const TIME_ENTRY_ROLE_TRIALS: readonly RoleTrialResult[] = [
  { roleId: 29682834, roleName: 'Administration', accepted: true, timeEntryId: 13855, hourlyRate: 145, hourlyFactor: 1 },
  { roleId: 29683355, roleName: 'Engineer', accepted: true, timeEntryId: 13856, hourlyRate: 145, hourlyFactor: 1 },
  { roleId: 29683460, roleName: 'Network Engineer', accepted: true, timeEntryId: 13857, hourlyRate: 145, hourlyFactor: 1 },
  { roleId: 29683467, roleName: 'vCiO', accepted: true, timeEntryId: 13858, hourlyRate: 225, hourlyFactor: 1 },
  { roleId: 29683464, roleName: 'Help Desk', accepted: true, timeEntryId: 13859, hourlyRate: 145, hourlyFactor: 1 },
  { roleId: 29683458, roleName: 'Developer', accepted: true, timeEntryId: 13860, hourlyRate: 145, hourlyFactor: 1 },
  { roleId: 29683459, roleName: 'Emergency Technician', accepted: true, timeEntryId: 13861, hourlyRate: 225, hourlyFactor: 1.25 },
  { roleId: 29683461, roleName: 'Project Manager', accepted: true, timeEntryId: 13862, hourlyRate: 145, hourlyFactor: 1 },
  { roleId: 29683465, roleName: 'Low/High Voltage Technician', accepted: true, timeEntryId: 13863, hourlyRate: 145, hourlyFactor: 1 },
  { roleId: 29683466, roleName: 'After Hours Support', accepted: true, timeEntryId: 13864, hourlyRate: 225, hourlyFactor: 1.5 },
  {
    roleId: 99999999,
    roleName: '(negative control — does not exist in this instance)',
    accepted: false,
    error:
      'HTTP 500 {"errors":["Reference value on field: roleID of timeEntryType: Role does not exist or is invalid. ; on record number [1]."]}',
    hourlyRate: 0,
    hourlyFactor: 0,
  },
] as const

export const TIME_ENTRY_ROLE_FINDING =
  'SETTLED EMPIRICALLY 2026-09-09 (scratch ticket 35754 on company 0, TCT\'s own record; one variable, ten roles, plus a negative control): a TICKET TIME ENTRY for resource 29682885 accepted ALL TEN active roles in this instance, including the nine that are absent from its ResourceRoleDepartments list. So a time entry is NOT validated against ResourceRoleDepartments — had that been the gate, nine of ten would have failed. Autotask DOES validate the field: a role id that does not exist was refused with "Reference value on field: roleID of timeEntryType: Role does not exist or is invalid", which is what makes the ten acceptances a real result rather than an absence of checking. WHAT IS STILL NOT ESTABLISHED: whether the gate is ResourceServiceDeskRoles or simply "any active role in the instance" — this resource holds all ten active roles, so there is no role it lacks to test against, and the experiment cannot separate those two. TASK assignment was NOT tested and is unchanged: it needs departmentID, which only ResourceRoleDepartments carries, so a task role must still come from that list. RETRACTED: the 2026-09-04 note that Engineer (29683355) was rejected as an invalid resource/role combination — Engineer was accepted, time entry 13856.'

// ---------------------------------------------------------------------------
// Work-type role guidance
// ---------------------------------------------------------------------------

/**
 * THE ROLE CHOSEN SETS THE BILL RATE, and on this instance the rates are not
 * uniform: 145/hr for Administration, Engineer, Developer, Network Engineer,
 * Project Manager, Help Desk and Low/High Voltage Technician, but 225/hr for
 * Emergency Technician, After Hours Support and vCIO.
 *
 * While a resource effectively held one role this could not go wrong. Now that
 * every role validates, it can go wrong in EITHER direction — under-billing
 * advisory work logged as Help Desk, or over-billing routine work logged as
 * After Hours. So the tool suggests a role from the nature of the work instead
 * of defaulting blindly to whichever list's default it happened to read.
 *
 * SUGGESTION, NOT SELECTION: the returned role is advisory and the caller
 * still passes roleId explicitly. Auto-selecting a 225/hr role from keyword
 * matching would be a billing decision made by a regex.
 */
export interface RoleSuggestion {
  roleId: number
  roleName: string
  hourlyRate: number
  rationale: string
  /** True when the guidance is a real match rather than the fallback. */
  matched: boolean
}

export const ROLE_IDS = {
  administration: 29682834,
  engineer: 29683355,
  developer: 29683458,
  emergencyTechnician: 29683459,
  networkEngineer: 29683460,
  projectManager: 29683461,
  helpDesk: 29683464,
  lowHighVoltage: 29683465,
  afterHoursSupport: 29683466,
  vcio: 29683467,
} as const

/** Kurtis's default for his own entries, per owner direction 2026-09-09. */
export const KURTIS_RESOURCE_ID = 29682885
export const KURTIS_DEFAULT_ROLE_ID = ROLE_IDS.networkEngineer

interface Rule {
  roleId: number
  roleName: string
  hourlyRate: number
  /** Words that indicate this kind of work. */
  terms: RegExp
  rationale: string
}

// Ordered: the first match wins, most specific first. Advisory and
// account/billing work are checked BEFORE network work, because "reviewed the
// network strategy with the owner" is advisory work that mentions a network.
const RULES: Rule[] = [
  {
    roleId: ROLE_IDS.vcio,
    roleName: 'vCiO',
    hourlyRate: 225,
    terms: /\b(strateg\w*|advisor\w*|roadmap|budget\w*|qbr|quarterly business review|business review|technology plan|planning session|steering|governance|risk assessment|recommendation to the (owner|client)|executive)\b/i,
    rationale: 'Strategic or advisory work maps to vCIO. Note this is a 225/hr role — confirm before logging routine work under it.',
  },
  {
    roleId: ROLE_IDS.administration,
    roleName: 'Administration',
    hourlyRate: 145,
    terms: /\b(billing|invoice\w*|account number|vendor account|licen[cs]\w*|renewal|subscription|procurement|purchase order|quote|credential request|portal (access|login|security code)|paperwork|contract admin\w*)\b/i,
    rationale: 'Account, billing and vendor-account administration maps to Administration.',
  },
  {
    roleId: ROLE_IDS.networkEngineer,
    roleName: 'Network Engineer',
    hourlyRate: 145,
    terms: /\b(network\w*|wan|lan|vlan|subnet|firewall|router|gateway|switch\w*|unifi|ubiquiti|meraki|isp|circuit|connectivity|dns|dhcp|vpn|wireless|wifi|wi-fi|access point|ap\b|latency|packet loss|outage|infrastructur\w*|cabling|uplink|port forward\w*)\b/i,
    rationale: 'Network, infrastructure and connectivity work maps to Network Engineer.',
  },
  {
    roleId: ROLE_IDS.afterHoursSupport,
    roleName: 'After Hours Support',
    hourlyRate: 225,
    terms: /\b(after hours|out of hours|overnight|weekend call|called out at night)\b/i,
    rationale: 'Work outside normal billing hours maps to After Hours Support. This is a 225/hr role (hourlyFactor 1.5) — only use it when the work genuinely was outside hours.',
  },
  {
    roleId: ROLE_IDS.emergencyTechnician,
    roleName: 'Emergency Technician',
    hourlyRate: 225,
    terms: /\b(emergency|critical outage|site down|business down|all users down)\b/i,
    rationale: 'Declared emergency work maps to Emergency Technician. This is a 225/hr role (hourlyFactor 1.25) — confirm the work was handled as an emergency.',
  },
  {
    roleId: ROLE_IDS.lowHighVoltage,
    roleName: 'Low/High Voltage Technician',
    hourlyRate: 145,
    terms: /\b(cable run|cable pull|telephony|phone (system|line) install|security camera\w*|cctv|door access|structured cabling|patch panel|keystone|conduit)\b/i,
    rationale: 'Telephony, cabling and security-camera work maps to Low/High Voltage Technician.',
  },
  {
    roleId: ROLE_IDS.projectManager,
    roleName: 'Project Manager',
    hourlyRate: 145,
    terms: /\b(project (management|plan|kickoff|status)|coordinat\w+ the (project|vendor|schedule)|schedule the (install|cutover)|cutover plan)\b/i,
    rationale: 'Project coordination maps to Project Manager.',
  },
  {
    roleId: ROLE_IDS.helpDesk,
    roleName: 'Help Desk',
    hourlyRate: 145,
    terms: /\b(password reset|mailbox|outlook|onedrive|sharepoint permission|printer|print queue|user (setup|onboard\w*|offboard\w*)|mfa|multi-?factor|teams|licence assign\w*|workstation|laptop|desktop|software install)\b/i,
    rationale: 'Routine end-user support maps to Help Desk.',
  },
]

/**
 * Suggest a role from a description of the work.
 *
 * Pure, and exported so the mapping is unit-tested rather than trusted. Returns
 * `matched: false` with the caller's own default (or Engineer) when nothing
 * matches — it never guesses a 225/hr role from a non-match.
 */
export function suggestRoleForWork(
  workDescription: string,
  opts: { resourceId?: number } = {},
): RoleSuggestion {
  const text = workDescription ?? ''

  for (const rule of RULES) {
    if (rule.terms.test(text)) {
      return {
        roleId: rule.roleId,
        roleName: rule.roleName,
        hourlyRate: rule.hourlyRate,
        rationale: rule.rationale,
        matched: true,
      }
    }
  }

  // No match. Kurtis's own entries default to Network Engineer per owner
  // direction; anyone else falls back to Engineer, the general-purpose role.
  const isKurtis = opts.resourceId === KURTIS_RESOURCE_ID
  return isKurtis
    ? {
        roleId: KURTIS_DEFAULT_ROLE_ID,
        roleName: 'Network Engineer',
        hourlyRate: 145,
        rationale:
          'Nothing in the description matched a specific work type, so this is Kurtis\'s standing default for his own entries (Network Engineer), which validates for this resource. Override it if the work was advisory, account/billing, or out of hours.',
        matched: false,
      }
    : {
        roleId: ROLE_IDS.engineer,
        roleName: 'Engineer',
        hourlyRate: 145,
        rationale:
          'Nothing in the description matched a specific work type, so this falls back to Engineer, the general-purpose 145/hr role. This is a SUGGESTION — pick deliberately, because the role sets the bill rate and three roles on this instance bill at 225/hr.',
        matched: false,
      }
}

/** The sentence the time-entry tool puts in front of a caller choosing a role. */
export const ROLE_RATE_WARNING =
  'THE ROLE SETS THE BILL RATE, and the rates on this instance are not uniform: Administration, Engineer, Developer, Network Engineer, Project Manager, Help Desk and Low/High Voltage Technician bill at 145/hr, while Emergency Technician (145 x 1.25), After Hours Support (145 x 1.5) and vCIO all bill at 225/hr. Every active role validates for resource 29682885, so an inappropriate role will NOT be refused — it will simply bill wrong, in either direction. Choose the role that describes the work: network/infrastructure/connectivity to Network Engineer, account/billing/vendor administration to Administration, strategic/advisory to vCIO, routine end-user support to Help Desk.'
