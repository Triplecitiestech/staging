// src/lib/connector/kill-switches.ts
//
// Kill switches for BACKGROUND AUTOMATIONS — behaviour that runs without anyone
// calling an MCP tool (the SOC analyzer emailing a customer, for example).
//
// Tool kill switches are declared per tool in TOOL_FACTS (capability-registry.ts)
// and the capability report derives the names it reads from there. An automation
// has no tool row to hang a switch on, so this table is its equivalent: the ONE
// declaration that both the runtime gate and the capability report read.
//
// Why a table and not `process.env.X` at the call site: 2026-09-08 the report
// read a hand-written list of switch names, CONNECTOR_SCAN_WRITES_ENABLED was
// never added to it, and five live tools were reported disabled while they ran.
// Here the runtime can ONLY read a switch through automationSwitchState(key),
// whose key is typed to this table — so a switch cannot be gated in code without
// being declared, and a declared switch cannot be missing from the report.
//
// NOTE ON TIMING (Vercel, verified 2026-09-28 against
// https://vercel.com/docs/environment-variables): "Any change you make to
// environment variables are not applied to previous deployments, they only apply
// to new deployments." Flipping one of these takes effect on the NEXT deployment
// (a redeploy of the current commit is enough). It is not instantaneous.

export type SwitchDefault = 'on' | 'off'

export interface AutomationKillSwitch {
  /** The environment variable an operator sets in Vercel. */
  envVar: string
  /** Behaviour when the variable is unset or empty. */
  default: SwitchDefault
  /** What the switch turns off, in plain words. */
  controls: string
  /** Where the code that honours it lives. */
  surface: string
}

export const AUTOMATION_KILL_SWITCHES = {
  soc_auto_customer_notify: {
    envVar: 'SOC_AUTO_CUSTOMER_NOTIFY',
    default: 'on',
    controls:
      'The SOC analyzer automatically posting a customer-visible note (which Autotask\'s own workflow rule emails to the ticket contact) when an assessment completes as Suspicious or Confirmed Malicious (once per incident). The SOC sends no email itself. Off = nothing is posted; the draft stays on the assessment for a technician.',
    surface: 'src/lib/soc/delivery.ts',
  },
} as const satisfies Record<string, AutomationKillSwitch>

export type AutomationSwitchKey = keyof typeof AUTOMATION_KILL_SWITCHES

const ON_VALUES = new Set(['on', 'true', '1', 'yes', 'enabled'])
const OFF_VALUES = new Set(['off', 'false', '0', 'no', 'disabled'])

export interface AutomationSwitchState {
  key: AutomationSwitchKey
  envVar: string
  enabled: boolean
  /** 'default' when the variable is unset/empty, 'env' when it was read and understood. */
  source: 'default' | 'env' | 'unrecognized_value'
  /** The raw value when it was not understood — reported, never silently mapped. */
  rawValue?: string
}

/**
 * Resolve one automation switch from the environment.
 *
 * An UNRECOGNISED value turns the automation OFF. Someone set the variable
 * because they meant to change something; guessing "on" for a typo like
 * "of" would keep emailing customers the operator was trying to stop.
 */
export function automationSwitchState(
  key: AutomationSwitchKey,
  env: Record<string, string | undefined> = process.env,
): AutomationSwitchState {
  const sw: AutomationKillSwitch = AUTOMATION_KILL_SWITCHES[key]
  const raw = (env[sw.envVar] ?? '').trim()
  if (raw === '') return { key, envVar: sw.envVar, enabled: sw.default === 'on', source: 'default' }
  const v = raw.toLowerCase()
  if (ON_VALUES.has(v)) return { key, envVar: sw.envVar, enabled: true, source: 'env' }
  if (OFF_VALUES.has(v)) return { key, envVar: sw.envVar, enabled: false, source: 'env' }
  return { key, envVar: sw.envVar, enabled: false, source: 'unrecognized_value', rawValue: raw.slice(0, 40) }
}

export function automationEnabled(key: AutomationSwitchKey, env?: Record<string, string | undefined>): boolean {
  return automationSwitchState(key, env).enabled
}

/** Every declared automation switch, resolved — what the capability report prints. */
export function allAutomationSwitchStates(env?: Record<string, string | undefined>): AutomationSwitchState[] {
  return (Object.keys(AUTOMATION_KILL_SWITCHES) as AutomationSwitchKey[]).map((k) => automationSwitchState(k, env))
}
