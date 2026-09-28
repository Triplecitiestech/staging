import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'
import { AUTOMATION_KILL_SWITCHES, automationSwitchState } from './kill-switches'
import { buildCapabilityReport } from './capability-registry'

describe('SOC_AUTO_CUSTOMER_NOTIFY', () => {
  it('defaults ON when unset or empty', () => {
    expect(automationSwitchState('soc_auto_customer_notify', {})).toMatchObject({ enabled: true, source: 'default' })
    expect(automationSwitchState('soc_auto_customer_notify', { SOC_AUTO_CUSTOMER_NOTIFY: '  ' }).enabled).toBe(true)
  })
  it('reads the usual spellings of off and on', () => {
    for (const v of ['off', 'OFF', 'false', '0', 'no', 'disabled']) expect(automationSwitchState('soc_auto_customer_notify', { SOC_AUTO_CUSTOMER_NOTIFY: v }).enabled).toBe(false)
    for (const v of ['on', 'true', '1', 'yes', 'enabled']) expect(automationSwitchState('soc_auto_customer_notify', { SOC_AUTO_CUSTOMER_NOTIFY: v }).enabled).toBe(true)
  })
  it('an unrecognised value turns it OFF and is reported, never guessed', () => {
    expect(automationSwitchState('soc_auto_customer_notify', { SOC_AUTO_CUSTOMER_NOTIFY: 'of' })).toMatchObject({ enabled: false, source: 'unrecognized_value', rawValue: 'of' })
  })
})

describe('automation switches are derived into the capability report from the same declaration', () => {
  it('every declared automation switch appears in writeGuardrails.killSwitches and .automations', () => {
    const report = buildCapabilityReport([])
    for (const sw of Object.values(AUTOMATION_KILL_SWITCHES)) {
      expect(sw.envVar in report.writeGuardrails.killSwitches).toBe(true)
      expect(report.writeGuardrails.automations.some((a) => a.envVar === sw.envVar)).toBe(true)
    }
  })

  it('no code reads an automation switch variable directly — only through automationSwitchState()', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = path.join(dir, f)
        if (statSync(p).isDirectory()) { if (f !== 'node_modules' && f !== '__fixtures__') walk(p); continue }
        if (!/\.(ts|tsx)$/.test(f) || /\.test\.tsx?$/.test(f) || p.endsWith(path.join('connector', 'kill-switches.ts'))) continue
        const src = readFileSync(p, 'utf8')
        for (const sw of Object.values(AUTOMATION_KILL_SWITCHES)) {
          if (src.includes(`process.env.${sw.envVar}`) || src.includes(`process.env['${sw.envVar}']`)) offenders.push(`${p} reads ${sw.envVar}`)
        }
      }
    }
    walk(path.resolve(__dirname, '..', '..'))
    expect(offenders).toEqual([])
  })
})
