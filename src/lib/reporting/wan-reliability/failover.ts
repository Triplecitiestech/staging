/**
 * WAN failover-capability detection (pure).
 *
 * Why this exists: Domotz reachability (device or collector) cannot see a
 * primary-circuit outage that failed over to a secondary uplink — the firewall
 * keeps routing, so nothing goes "down" from Domotz's vantage point. So before
 * the report makes ANY claim about ISP/circuit reliability, it must know whether
 * the site can fail over. If it can (or we can't tell), the report must caveat
 * that primary-circuit outages may be invisible — never imply the circuit is
 * healthy.
 *
 * Detection order:
 *   1. Admin override (persisted per-site wanMode) wins.
 *   2. Otherwise infer from the gateway's vendor/model/type — match a known
 *      multi-WAN / failover-capable family.
 *   3. Otherwise 'unknown'.
 *
 * No-false-negatives rule: the masking caveat is shown for EVERYTHING except a
 * site an admin has explicitly confirmed single-WAN. A false caveat ("we might
 * not see the circuit") is acceptable; a false "100% / SLA-compliant" is not.
 */

/** Admin override stored per site. `null` means "no override — infer". */
export type WanModeOverride = 'single_wan' | 'failover_capable' | null

/** Resolved capability used by the report. */
export type FailoverCapability = 'single_wan' | 'failover_capable' | 'unknown'

export interface FailoverAssessment {
  capability: FailoverCapability
  /** Where the verdict came from. */
  source: 'admin' | 'detected' | 'default'
  /** Human reason, e.g. "Meraki MX (integrated/secondary WAN supported)". */
  matchedReason: string | null
  /**
   * True when the report must warn that primary-circuit outages may be masked.
   * On for failover_capable AND unknown; off only for admin-confirmed single_wan.
   */
  showMaskingCaveat: boolean
}

/**
 * Known multi-WAN / failover-capable gateway families. Matched case-insensitively
 * against "vendor model typeLabel deviceName". Conservative by design: a match
 * means "this hardware can fail over", which turns the caveat ON with a confident
 * explanation. Non-matches fall through to 'unknown' (caveat still ON).
 */
const FAILOVER_CAPABLE_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\bmeraki\b|\bmx\d{2,}\b/i, reason: 'Cisco Meraki MX (WAN2 / integrated cellular failover)' },
  { re: /sonicwall|\bnsa\b|\bnsv\b|\btz\s?\d/i, reason: 'SonicWall (dual-WAN / failover)' },
  { re: /fortigate|fortinet|\bfg-?\d/i, reason: 'Fortinet FortiGate (multi-WAN / SD-WAN)' },
  { re: /palo\s?alto|\bpa-?\d{3}/i, reason: 'Palo Alto (multiple uplinks)' },
  { re: /watchguard|firebox/i, reason: 'WatchGuard Firebox (multi-WAN)' },
  { re: /peplink|pepwave|\bbalance\b|\bmax\s?(transit|br1|hd)/i, reason: 'Peplink/Pepwave (SD-WAN / failover)' },
  { re: /cradlepoint/i, reason: 'Cradlepoint (cellular failover)' },
  { re: /\budm\b|udm[-\s]?(pro|se)|dream\s?machine|\busg\b|unifi\s?(security|gateway)|\buxg\b/i, reason: 'Ubiquiti UniFi gateway (WAN2 failover)' },
  { re: /edgerouter|edgemax/i, reason: 'Ubiquiti EdgeRouter (dual-WAN capable)' },
  { re: /pfsense|opnsense|netgate/i, reason: 'pfSense/OPNsense (multi-WAN capable)' },
  { re: /draytek|vigor/i, reason: 'DrayTek Vigor (multi-WAN)' },
  { re: /velocloud|silver\s?peak|versa|\bsd-?wan\b/i, reason: 'SD-WAN appliance (multi-uplink)' },
  { re: /firepower|\basa\s?55/i, reason: 'Cisco ASA/Firepower (multiple uplinks)' },
]

/**
 * Assess whether a site can fail over, from the gateway device descriptors and
 * an optional admin override.
 */
export function assessFailoverCapability(input: {
  vendor?: string | null
  model?: string | null
  typeLabel?: string | null
  deviceName?: string | null
  override?: WanModeOverride
}): FailoverAssessment {
  if (input.override === 'single_wan') {
    return { capability: 'single_wan', source: 'admin', matchedReason: 'Marked single-WAN by an administrator', showMaskingCaveat: false }
  }
  if (input.override === 'failover_capable') {
    return { capability: 'failover_capable', source: 'admin', matchedReason: 'Marked failover-capable by an administrator', showMaskingCaveat: true }
  }

  const haystack = [input.vendor, input.model, input.typeLabel, input.deviceName].filter(Boolean).join(' ')
  if (haystack.trim()) {
    for (const { re, reason } of FAILOVER_CAPABLE_PATTERNS) {
      if (re.test(haystack)) {
        return { capability: 'failover_capable', source: 'detected', matchedReason: reason, showMaskingCaveat: true }
      }
    }
  }

  // Couldn't confirm single-WAN → must still caveat (no false negatives).
  return {
    capability: 'unknown',
    source: 'default',
    matchedReason: null,
    showMaskingCaveat: true,
  }
}
