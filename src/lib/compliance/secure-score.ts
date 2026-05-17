/**
 * Microsoft Secure Score recommendations — fetch + map to TCT catalog
 * actions. Powers the per-customer Secure Score page where each
 * not-implemented recommendation gets a Remediate button when TCT
 * has a matching automated catalog action.
 *
 * The Graph data:
 *   - /security/secureScores (top-line score + controlScores array
 *     with implementation state per recommendation id).
 *   - /security/secureScoreControlProfiles (rich metadata per rec:
 *     title, description, remediation steps, max points, etc.).
 *
 * The two endpoints share the recommendation id (controlName /
 * id) so we join them in memory.
 *
 * The mapping from Microsoft's recommendation ids to TCT catalog
 * action ids is hand-maintained below — Microsoft has ~50-100
 * recommendations and only a subset have meaningful TCT-side
 * automation. Anything unmapped renders as "Manual: open in Entra
 * admin center" with a deep link.
 */

import { graphRequest, getGraphTokenForCompany } from '@/lib/graph'

/** Microsoft Graph secureScore shape (slim — only fields we use). */
interface GraphSecureScore {
  currentScore: number
  maxScore: number
  controlScores?: Array<{
    controlName: string
    /** points scored on this control (0 = not implemented, max = fully done). */
    score: number
    /** max points possible. */
    scoreInPercentage?: number
    on?: boolean
    /** Microsoft's per-control description repeated here. */
    description?: string
    /** Some control scores have implementationStatus (string). */
    implementationStatus?: string
  }>
  createdDateTime: string
}

/** Graph secureScoreControlProfile shape (slim). */
interface GraphSecureScoreControlProfile {
  id: string
  title: string
  controlCategory: string
  service: string
  /** Max points achievable for this control. */
  maxScore: number
  /** Operator-facing remediation text from Microsoft. */
  remediation?: string
  /** Microsoft-published action name (machine-readable). */
  actionType?: string
  /** Deep link into the appropriate Entra / Defender / etc. portal. */
  actionUrl?: string
  /** Operator-set state: Default | Ignored | ThirdParty | Reviewed. */
  controlStateUpdates?: Array<{ state: string; updatedDateTime: string }>
}

export interface SecureScoreRecommendation {
  /** Microsoft control id (e.g. "AdminMFAV2", "BlockLegacyAuthentication"). */
  id: string
  title: string
  category: string
  service: string
  maxScore: number
  /** Points currently scored on this rec (0 to maxScore). */
  currentScore: number
  /** Convenience flag — true when currentScore >= maxScore. */
  implemented: boolean
  /** Microsoft's recommended remediation text. */
  remediation: string | null
  /** Deep link into the right Entra / Defender admin surface. */
  actionUrl: string | null
  /** TCT catalog action id that, if applied, would remediate this. null = no automation. */
  catalogActionId: string | null
  /** Latest operator state set on the rec (e.g. 'Reviewed', 'Ignored'). */
  state: string | null
}

export interface SecureScoreSnapshot {
  currentScore: number
  maxScore: number
  percentage: number
  collectedAt: string
  recommendations: SecureScoreRecommendation[]
}

/**
 * Hand-maintained map: Microsoft's secureScoreControlProfile.id →
 * TCT catalog action id (executor handler name). Order matters — first
 * match wins. Recs not in this table render without a Remediate button
 * and fall back to the Microsoft deep link.
 *
 * Add a row here when a new TCT executor lands that automates one of
 * Microsoft's recommendations. Keep the case-insensitive id form
 * Microsoft uses (e.g. "AdminMFAV2", not "adminMfaV2").
 */
const MS_TO_TCT_ACTION: Record<string, string> = {
  // MFA recommendations — TCT enforces via the All-Users CA policy
  AdminMFAV2: 'm365.enforce_mfa_all_users',
  MFARegistrationV2: 'm365.enforce_mfa_all_users',
  PrivilegedAccountMFAV2: 'm365.enforce_mfa_all_users',
  UserMFAEnabledV2: 'm365.enforce_mfa_all_users',

  // Legacy auth block — TCT's blockLegacyAuth CA policy covers it
  BlockLegacyAuthentication: 'm365.block_legacy_authentication',
  Block_Legacy_Authentication: 'm365.block_legacy_authentication',

  // Password protection — TCT's banned-password list
  PWAgePolicyNew: 'm365.enable_password_protection',
  PWStrengthNew: 'm365.enable_password_protection',
  PasswordPolicy: 'm365.enable_password_protection',

  // Defender realtime monitoring — TCT's Intune config profile
  Defender_TurnOnMicrosoftDefenderAntivirus: 'defender.enable_real_time_protection',
  Defender_TurnOnRealTimeProtection: 'defender.enable_real_time_protection',
  DefenderRealTimeProtection: 'defender.enable_real_time_protection',
}

function mapToCatalog(msControlId: string): string | null {
  return MS_TO_TCT_ACTION[msControlId] ?? null
}

/**
 * Fetch the latest Secure Score + control profiles + join into a
 * single per-recommendation list with TCT catalog mapping applied.
 */
export async function loadSecureScoreSnapshot(companyId: string): Promise<SecureScoreSnapshot | null> {
  const token = await getGraphTokenForCompany(companyId)
  if (!token) return null

  let scoreData
  try {
    scoreData = await graphRequest<{ value: GraphSecureScore[] }>(
      token, '/security/secureScores?$top=1'
    )
  } catch (err) {
    console.error('[secure-score] secureScores fetch failed:', err)
    return null
  }
  const score = scoreData?.value?.[0]
  if (!score) return null

  let profilesData
  try {
    // Paginate. The endpoint returns ~100 profiles per page and the
    // operator's tenant has ~194 recommendations — without following
    // @odata.nextLink we miss everything past page 1 and the UI shows
    // bare scid_* / mip_* ids instead of friendly titles.
    profilesData = { value: [] as GraphSecureScoreControlProfile[] }
    let nextUrl: string | null = '/security/secureScoreControlProfiles?$top=200'
    let pagesScanned = 0
    while (nextUrl && pagesScanned < 20) {
      const page: { value: GraphSecureScoreControlProfile[]; '@odata.nextLink'?: string } =
        await graphRequest(token, nextUrl)
      profilesData.value.push(...(page?.value ?? []))
      nextUrl = page?.['@odata.nextLink'] ?? null
      pagesScanned++
    }
  } catch (err) {
    console.error('[secure-score] controlProfiles fetch failed:', err)
    // Fall back to score-only — recs without profile metadata are
    // less rich but still actionable.
    profilesData = { value: [] }
  }
  const profileById = new Map<string, GraphSecureScoreControlProfile>()
  for (const p of profilesData?.value ?? []) profileById.set(p.id, p)

  const controlScores = score.controlScores ?? []
  const recommendations: SecureScoreRecommendation[] = controlScores.map((cs) => {
    const profile = profileById.get(cs.controlName)
    const maxScore = profile?.maxScore ?? cs.score ?? 0
    const currentScore = cs.score ?? 0
    const implemented = maxScore > 0 ? currentScore >= maxScore : Boolean(cs.on)
    const latestState = profile?.controlStateUpdates?.[profile.controlStateUpdates.length - 1]?.state ?? null
    return {
      id: cs.controlName,
      // Fall back to a humanized version of the internal id when
      // Microsoft hasn't published a friendly title for this control
      // (e.g. scid_2021, mip_sensitivitylabelspolicies). Better than
      // showing the raw key in the UI.
      title: profile?.title ?? humanizeControlName(cs.controlName),
      category: profile?.controlCategory ?? 'Uncategorized',
      service: profile?.service ?? 'Microsoft 365',
      maxScore,
      currentScore,
      implemented,
      remediation: profile?.remediation ?? cs.description ?? null,
      actionUrl: profile?.actionUrl ?? null,
      catalogActionId: mapToCatalog(cs.controlName),
      state: latestState,
    }
  })

  // Sort: not-implemented + remediable-by-TCT first, then
  // not-implemented + manual, then implemented (lowest priority).
  recommendations.sort((a, b) => {
    if (a.implemented !== b.implemented) return a.implemented ? 1 : -1
    if (!a.catalogActionId !== !b.catalogActionId) return a.catalogActionId ? -1 : 1
    // Within a tier, biggest-impact (max score) first.
    return b.maxScore - a.maxScore
  })

  const percentage = score.maxScore > 0 ? Math.round((score.currentScore / score.maxScore) * 100) : 0
  return {
    currentScore: score.currentScore,
    maxScore: score.maxScore,
    percentage,
    collectedAt: score.createdDateTime,
    recommendations,
  }
}

/**
 * Convert a Microsoft control-name id into something readable when
 * the secureScoreControlProfiles endpoint doesn't have a published
 * title for it. Examples:
 *   "mip_sensitivitylabelspolicies"          → "MIP Sensitivity Labels Policies"
 *   "mdo_thresholdreachedaction"             → "MDO Threshold Reached Action"
 *   "meeting_designatedpresenter_v1"         → "Meeting Designated Presenter (v1)"
 *   "scid_2021"                              → "Secure Score Control 2021"
 * Microsoft's internal ids aren't 100% consistent, so this is
 * best-effort — anything we can't parse falls back to title-case-on-
 * underscores.
 */
function humanizeControlName(controlName: string): string {
  if (controlName.startsWith('scid_')) {
    return `Secure Score Control ${controlName.slice(5)}`
  }
  // Strip a trailing _v\d version tag for cleaner display.
  const versionMatch = controlName.match(/^(.*)_v(\d+)$/)
  const versionSuffix = versionMatch ? ` (v${versionMatch[2]})` : ''
  const base = versionMatch ? versionMatch[1] : controlName

  // Known acronym prefixes that should stay uppercase.
  const KNOWN_PREFIXES: Record<string, string> = {
    mip: 'MIP',
    mdo: 'MDO',
    mca: 'MCA',
    mdc: 'MDC',
    mde: 'MDE',
    mcas: 'MCAS',
    edp: 'EDP',
    dlp: 'DLP',
  }
  return base
    .split('_')
    .map((token, idx) => {
      if (idx === 0 && KNOWN_PREFIXES[token.toLowerCase()]) return KNOWN_PREFIXES[token.toLowerCase()]
      return token.length === 0
        ? ''
        : token.charAt(0).toUpperCase() + token.slice(1)
    })
    .join(' ') + versionSuffix
}
