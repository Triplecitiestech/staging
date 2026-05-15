/**
 * Policy presence hook.
 *
 * When a policy is uploaded, AI-generated, or analyzed, the customer
 * profile should reflect that the corresponding policy category now
 * has a documented artifact. The "Documented Policies" section of the
 * profile (see CUSTOMER_PROFILE_SECTIONS) holds these presence-keys;
 * this module is the single mapper that resolves a policy → profile
 * keys and writes the flips.
 *
 * Mapping rules (intentionally conservative — only set 'yes' when we
 * can match a category or a strong title keyword; never auto-set
 * 'no'):
 *
 *   category includes 'aup'                     → policy_aup_present
 *   title contains 'acceptable use'             → policy_aup_present
 *   category includes 'incident_response'       → policy_ir_present
 *   title contains 'incident response' / 'IR'   → policy_ir_present
 *   category includes 'bcdr' / 'disaster_rec'   → policy_dr_bcdr_present
 *   title contains 'disaster recovery' / 'BCDR' → policy_dr_bcdr_present
 *   category includes 'data_handling' / 'data_classification'
 *                                               → policy_data_handling_present
 *   category includes 'vendor' / 'third_party'  → policy_vendor_mgmt_present
 *   category includes 'access_control'          → policy_access_control_present
 *   title contains 'access control'             → policy_access_control_present
 *   category includes 'security_awareness' / 'training'
 *                                               → policy_security_awareness_present
 *
 * The hook never overwrites an existing 'yes' or 'no' answer with
 * itself — saveCustomerProfileAnswers does a merge under the hood, so
 * this just supplies the keys to set.
 */

import { saveCustomerProfileAnswers } from './customer-profile-schema'

export interface PolicyPresenceInput {
  title: string
  category: string
  source?: string
}

const KEY_AUP = 'policy_aup_present'
const KEY_IR = 'policy_ir_present'
const KEY_BCDR = 'policy_dr_bcdr_present'
const KEY_DATA = 'policy_data_handling_present'
const KEY_VENDOR = 'policy_vendor_mgmt_present'
const KEY_ACCESS = 'policy_access_control_present'
const KEY_AWARENESS = 'policy_security_awareness_present'

/**
 * Pure mapper: given a policy's title + category, return the set of
 * presence-keys that should be flipped to 'yes'. Exported separately
 * so callers can preview what will change before writing.
 */
export function presenceKeysForPolicy(p: PolicyPresenceInput): string[] {
  const keys = new Set<string>()
  const title = (p.title || '').toLowerCase()
  const category = (p.category || '').toLowerCase()
  const text = `${title} ${category}`

  if (category.includes('aup') || title.includes('acceptable use')) keys.add(KEY_AUP)
  if (
    category.includes('incident_response') ||
    category.includes('incident response') ||
    title.includes('incident response') ||
    /\birp\b/.test(text)
  )
    keys.add(KEY_IR)
  if (
    category.includes('bcdr') ||
    category.includes('disaster_rec') ||
    category.includes('disaster recovery') ||
    title.includes('disaster recovery') ||
    title.includes('bcdr')
  )
    keys.add(KEY_BCDR)
  if (
    category.includes('data_handling') ||
    category.includes('data_classification') ||
    title.includes('data classification') ||
    title.includes('data handling')
  )
    keys.add(KEY_DATA)
  if (
    category.includes('vendor') ||
    category.includes('third_party') ||
    category.includes('third-party') ||
    title.includes('vendor') ||
    title.includes('third-party') ||
    title.includes('third party')
  )
    keys.add(KEY_VENDOR)
  if (
    category.includes('access_control') ||
    category.includes('access control') ||
    title.includes('access control') ||
    title.includes('account management')
  )
    keys.add(KEY_ACCESS)
  if (
    category.includes('security_awareness') ||
    category.includes('training') ||
    title.includes('security awareness') ||
    title.includes('awareness training')
  )
    keys.add(KEY_AWARENESS)

  return Array.from(keys)
}

/**
 * Side-effecting hook: writes 'yes' for every presence-key matched by
 * `presenceKeysForPolicy`. Safe to call after a policy create / update
 * / generate. Failures are logged but don't throw — a profile-update
 * failure should never block a successful policy write.
 */
export async function applyPolicyPresenceHook(
  companyId: string,
  policy: PolicyPresenceInput,
  actor: string
): Promise<{ keysSet: string[] }> {
  const keys = presenceKeysForPolicy(policy)
  if (keys.length === 0) return { keysSet: [] }
  const update: Record<string, string> = {}
  for (const k of keys) update[k] = 'yes'
  try {
    await saveCustomerProfileAnswers(companyId, update, actor)
  } catch (err) {
    console.error(
      '[policy-presence-hook] failed to flip presence keys',
      { companyId, keys, err }
    )
  }
  return { keysSet: keys }
}
