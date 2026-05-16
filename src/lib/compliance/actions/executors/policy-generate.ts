/**
 * Policy generation executor — answers operator feedback #5a:
 * "the Apply Fix button should allow you to generate or revise the
 * policy needed".
 *
 * One generic catalog action (`policy.generate_for_control`) covers
 * every (framework, control) pair that has a documented policy in
 * FRAMEWORK_POLICY_MAPPINGS. At click time the executor receives
 * the originating control via ExecutorContext.metadata, looks up the
 * matching policy slug, and either generates a new draft or revises
 * the existing one if the customer already has a policy by that slug.
 *
 * The draft lands in compliance_policies (source='generated'). The
 * operator reviews it on workflow step 4 (Policies) and — in a
 * follow-up slice — approves it before TCT publishes it to the
 * customer's chosen storage (SharePoint, IT Glue, etc.).
 *
 * No customer-tenant mutation happens here. blastRadius='none'.
 */

import { getPool } from '@/lib/db-pool'
import { generatePolicy } from '../../policy-generation/generator'
import { getCatalogItem } from '../../policy-generation/catalog'
import { FRAMEWORK_POLICY_MAPPINGS } from '../../policy-generation/framework-mappings'
import { getCustomerProfileAnswers } from '../../customer-profile-schema'
import { applyPolicyPresenceHook } from '../../policy-presence-hook'
import type { ExecutorContext, ExecutorResult } from '../executors'
import type { PreviewerContext, ImpactPreview } from '../previewers'

/**
 * Resolve the control metadata passed in via ExecutorContext.metadata.
 * Returns null when the caller didn't pass enough info.
 */
interface ResolvedControl {
  frameworkId: string
  controlId: string
  /** Short form ("3.5") for matching against FRAMEWORK_POLICY_MAPPINGS. */
  shortControlId: string
  /** Prefixed form ("cis-v8-3.5") for matching too. */
  prefixedControlId: string
  /** Base framework id without IG suffix — mappings use the base form. */
  baseFrameworkId: string
}

function resolveControlFromMetadata(meta: Record<string, unknown> | undefined): ResolvedControl | null {
  const frameworkId = typeof meta?.frameworkId === 'string' ? meta.frameworkId : null
  const controlId = typeof meta?.controlId === 'string' ? meta.controlId : null
  if (!frameworkId || !controlId) return null
  const shortControlId = controlId.replace(/^[a-z]+-[a-z0-9]+-/, '')
  const baseFrameworkId = frameworkId.replace(/-ig\d+$/, '')
  const prefixedControlId = controlId.includes('-') ? controlId : `${baseFrameworkId}-${controlId}`
  return { frameworkId, controlId, shortControlId, prefixedControlId, baseFrameworkId }
}

/** Pick the highest-coverage policy mapping for a given control. */
function pickMappingForControl(rc: ResolvedControl) {
  const candidates = FRAMEWORK_POLICY_MAPPINGS.filter((m) =>
    (m.frameworkId === rc.baseFrameworkId || m.frameworkId === rc.frameworkId) &&
    (m.controlId === rc.controlId ||
      m.controlId === rc.prefixedControlId ||
      m.controlId === rc.shortControlId)
  )
  if (candidates.length === 0) return null
  // Prefer full > partial > supporting coverage.
  const order = { full: 0, partial: 1, supporting: 2 }
  candidates.sort((a, b) => (order[a.coverageType] ?? 3) - (order[b.coverageType] ?? 3))
  return candidates[0]
}

interface ExistingPolicy {
  id: string
  title: string
  content: string
  updatedAt: string
}

async function findExistingPolicy(companyId: string, policySlug: string): Promise<ExistingPolicy | null> {
  // compliance_policies doesn't store a `slug` column today — match by
  // exact title to the catalog item's name. Imperfect (an uploaded
  // policy with a custom title won't match) but good enough for the
  // "revise our own previously-generated policy" case which is the
  // primary reason to mode='improve' here.
  const catalog = (getCatalogItem(policySlug))
  if (!catalog) return null
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<ExistingPolicy>(
      `SELECT id, title, content, "updatedAt"::text AS "updatedAt"
         FROM compliance_policies
        WHERE "companyId" = $1
          AND title = $2
        ORDER BY "updatedAt" DESC
        LIMIT 1`,
      [companyId, catalog.name]
    )
    return res.rows[0] ?? null
  } catch {
    return null
  } finally {
    client.release()
  }
}

async function getCompanyDisplayName(companyId: string): Promise<string> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<{ displayName: string }>(
      `SELECT "displayName" FROM companies WHERE id = $1`, [companyId]
    )
    return res.rows[0]?.displayName ?? 'Customer'
  } finally {
    client.release()
  }
}

/**
 * Generate (or revise) the documented policy that satisfies the
 * originating control. Idempotent in the sense that a second click
 * detects the existing generated policy and switches to revise mode
 * rather than creating a duplicate row.
 */
export async function generatePolicyForControl(ctx: ExecutorContext): Promise<ExecutorResult> {
  const rc = resolveControlFromMetadata(ctx.metadata)
  if (!rc) {
    return {
      success: false,
      summary: 'Cannot generate policy — the originating control id wasn\'t passed through. This is a wiring bug; report it.',
    }
  }
  const mapping = pickMappingForControl(rc)
  if (!mapping) {
    return {
      success: false,
      summary: `No policy in the catalog covers ${rc.frameworkId} control ${rc.shortControlId}. (FRAMEWORK_POLICY_MAPPINGS has no entry.) Consider uploading a custom policy on step 4 instead.`,
    }
  }
  const catalog = getCatalogItem(mapping.policySlug)
  if (!catalog) {
    return {
      success: false,
      summary: `Policy slug "${mapping.policySlug}" found in framework-mappings but not in POLICY_CATALOG. Catalog data is out of sync.`,
    }
  }

  const [companyName, orgProfile, existing] = await Promise.all([
    getCompanyDisplayName(ctx.companyId),
    getCustomerProfileAnswers(ctx.companyId),
    findExistingPolicy(ctx.companyId, mapping.policySlug),
  ])

  let generated
  try {
    generated = await generatePolicy({
      policySlug: mapping.policySlug,
      companyName,
      // generatePolicy expects string | string[] | boolean values; the
      // profile reader gives us string | string[] | null. Filter nulls
      // and the shape lines up.
      orgProfile: Object.fromEntries(
        Object.entries(orgProfile).filter(([, v]) => v !== null && v !== undefined)
      ) as Record<string, string | string[] | boolean>,
      policyAnswers: {},
      selectedFrameworks: [rc.baseFrameworkId],
      mode: existing ? 'improve' : 'new',
      existingContent: existing?.content,
    })
  } catch (err) {
    return {
      success: false,
      summary: `Policy generator threw: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // Write the policy row + trigger the presence-key hook.
  const pool = getPool()
  const client = await pool.connect()
  try {
    let policyId: string
    if (existing) {
      await client.query(
        `UPDATE compliance_policies
           SET content = $1,
               source = 'generated',
               "frameworkIds" = $2::jsonb,
               "controlIds" = $3::jsonb,
               "updatedAt" = NOW()
         WHERE id = $4`,
        [
          generated.content,
          JSON.stringify([rc.baseFrameworkId]),
          JSON.stringify([rc.prefixedControlId]),
          existing.id,
        ]
      )
      policyId = existing.id
    } else {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO compliance_policies
           ("companyId", title, source, content, category, tags,
            "frameworkIds", "controlIds", "createdBy")
         VALUES ($1, $2, 'generated', $3, $4, '[]'::jsonb,
                 $5::jsonb, $6::jsonb, $7)
         RETURNING id`,
        [
          ctx.companyId,
          catalog.name,
          generated.content,
          catalog.category,
          JSON.stringify([rc.baseFrameworkId]),
          JSON.stringify([rc.prefixedControlId]),
          ctx.staffEmail,
        ]
      )
      policyId = ins.rows[0].id
    }

    // Flip the matching presence-key on the customer profile (uses the
    // same hook the manual upload flow uses).
    try {
      await applyPolicyPresenceHook(
        ctx.companyId,
        { title: catalog.name, category: catalog.category, source: 'generated' },
        ctx.staffEmail
      )
    } catch (err) {
      console.warn('[policy.generate_for_control] presence hook failed:', err)
    }

    return {
      success: true,
      summary: `${existing ? 'Revised' : 'Generated'} "${catalog.name}" for control ${rc.shortControlId}. Review it on step 4 (Policies). The next assessment will credit any controls it covers.`,
      details: {
        policyId,
        policySlug: mapping.policySlug,
        policyTitle: catalog.name,
        controlId: rc.controlId,
        frameworkId: rc.baseFrameworkId,
        mode: existing ? 'improve' : 'new',
        contentLength: generated.content.length,
      },
    }
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Previewer — read-only check of what would happen.
// ---------------------------------------------------------------------------

export async function previewGeneratePolicyForControl(ctx: PreviewerContext): Promise<ImpactPreview> {
  // PreviewerContext doesn't carry metadata today. Without the control
  // we can only tell the operator "this will pick a policy based on the
  // failing control". That's fine — the executor refuses cleanly if
  // the metadata is missing at apply-time.
  return {
    totalAffected: 1,
    entities: [{
      id: 'pending-policy',
      displayName: 'AI-generated policy draft',
      type: 'other',
      currentState: 'not yet generated',
      projectedState: 'drafted in compliance library',
    }],
    truncated: false,
    summary: 'Will generate (or revise) the policy that covers this control, using the customer profile as input. The draft lands in step 4 (Policies) for review — nothing is published outside TCT until you approve it in a future slice.',
    isLiveQuery: true,
    warnings: [
      'AI-generated drafts always need human review before being used as a real policy.',
      'Generation runs against Anthropic Claude — typical 20-40 seconds.',
    ],
  }
}
