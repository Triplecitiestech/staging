/**
 * Workflow step-state computation — derives each step's status from
 * durable DB state, NOT in-session button clicks. Per CLAUDE.md:
 *
 *   "Wizard step status must derive from durable DB state, not
 *    in-session button clicks alone — the user will refresh,
 *    deep-link, or come back tomorrow and expect the sidebar to be
 *    accurate."
 *
 * Called from the workflow layout to render the persistent left nav
 * and from each step page to gate prev/next buttons.
 */

import { getPool } from '@/lib/db-pool'
import {
  CUSTOMER_PROFILE_QUESTIONS,
  CUSTOMER_PROFILE_TYPE,
} from './customer-profile-schema'

export type WorkflowStepKey =
  | 'onboard'
  | 'profile'
  | 'connect'
  | 'policies'
  | 'assess'
  | 'findings'
  | 'changes'
  | 'reassess'

export type WorkflowStepStatus = 'done' | 'current' | 'available' | 'locked'

export interface WorkflowStep {
  key: WorkflowStepKey
  number: number
  title: string
  description: string
  status: WorkflowStepStatus
  href: string
  detail?: string
}

const STEP_DEFINITIONS: Omit<WorkflowStep, 'status' | 'href' | 'detail'>[] = [
  { key: 'onboard',  number: 1, title: 'Onboard',           description: 'Link Autotask + Microsoft 365' },
  { key: 'profile',  number: 2, title: 'Customer Profile',  description: 'Industry, frameworks, scope' },
  { key: 'connect',  number: 3, title: 'Connect Tools',     description: 'Verify connectors + tool deployment' },
  { key: 'policies', number: 4, title: 'Policies',          description: 'Upload, generate, review policies' },
  { key: 'assess',   number: 5, title: 'Run Assessment',    description: 'Score against a framework' },
  { key: 'findings', number: 6, title: 'Findings',          description: 'Disposition + accept-risk + schedule' },
  { key: 'changes',  number: 7, title: 'Propose Changes',   description: 'CA policies, config profiles, send to customer' },
  { key: 'reassess', number: 8, title: 'Reassess',          description: 'Verify and re-score' },
]

interface RawStateRow {
  companyId: string
  autotaskCompanyId: string | null
  m365ConsentGrantedAt: Date | null
  m365SetupStatus: string | null
  profileAnswerCount: number
  verifiedConnectorCount: number
  toolRowCount: number
  latestAssessmentId: string | null
  openFindingCount: number
  draftedChangeCount: number
}

/**
 * Compute the full set of steps + their status for a company. Reads
 * the columns / tables it needs in one round-trip.
 */
export async function getWorkflowState(companyId: string): Promise<WorkflowStep[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    // Companies row + denormalized counts in one shot. Each subselect
    // tolerates missing tables (returns 0) via outer COALESCE; the
    // tables themselves are created by ensureComplianceTables() and
    // should always exist in any environment that's seen a compliance
    // page, but we still want this query to be robust against partial
    // schemas.
    const res = await client.query<RawStateRow>(
      `SELECT
         c.id AS "companyId",
         c."autotaskCompanyId",
         c.m365_consent_granted_at AS "m365ConsentGrantedAt",
         c.m365_setup_status AS "m365SetupStatus",
         COALESCE((
           SELECT COUNT(*)::int FROM jsonb_each(fr.answers)
            WHERE jsonb_each.value IS NOT NULL
              AND jsonb_each.value <> 'null'::jsonb
              AND jsonb_each.value <> '""'::jsonb
              AND jsonb_each.value <> '[]'::jsonb
         ), 0) AS "profileAnswerCount",
         (SELECT COUNT(*)::int FROM compliance_connectors
            WHERE "companyId" = c.id AND status = 'verified') AS "verifiedConnectorCount",
         (SELECT COUNT(*)::int FROM compliance_company_tools
            WHERE "companyId" = c.id) AS "toolRowCount",
         (SELECT id FROM compliance_assessments
            WHERE "companyId" = c.id ORDER BY "createdAt" DESC LIMIT 1) AS "latestAssessmentId",
         (SELECT COUNT(*)::int FROM compliance_findings f
            JOIN compliance_assessments a ON a.id = f."assessmentId"
            WHERE a."companyId" = c.id AND f.status IN ('fail','needs_review')) AS "openFindingCount",
         (SELECT COUNT(*)::int FROM compliance_pending_changes
            WHERE "companyId" = c.id AND status = 'drafted') AS "draftedChangeCount"
       FROM companies c
       LEFT JOIN form_responses fr
         ON fr.company_id = c.id AND fr.schema_type = $2
       WHERE c.id = $1`,
      [companyId, CUSTOMER_PROFILE_TYPE]
    )
    const row = res.rows[0]
    if (!row) {
      return STEP_DEFINITIONS.map((s) => ({
        ...s,
        status: 'locked',
        href: `/admin/compliance/${companyId}/${s.key}`,
      }))
    }

    const requiredProfileKeys = CUSTOMER_PROFILE_QUESTIONS.filter((q) => q.required).length

    const onboardDone = Boolean(
      row.autotaskCompanyId &&
        (row.m365ConsentGrantedAt || row.m365SetupStatus === 'verified')
    )
    const profileDone = row.profileAnswerCount >= requiredProfileKeys
    const connectDone = row.verifiedConnectorCount >= 1 && row.toolRowCount >= 1
    const policiesDone = false // computed in a later slice
    const assessDone = Boolean(row.latestAssessmentId)
    const findingsDone = assessDone && row.openFindingCount === 0
    const changesDone = false // later slice
    const reassessDone = false // later slice

    const doneByKey: Record<WorkflowStepKey, boolean> = {
      onboard: onboardDone,
      profile: profileDone,
      connect: connectDone,
      policies: policiesDone,
      assess: assessDone,
      findings: findingsDone,
      changes: changesDone,
      reassess: reassessDone,
    }

    // The "current" step is the first step that isn't done. Everything
    // before it is `done`. Everything after it that has its prereqs met
    // is `available`; otherwise `locked`.
    let foundCurrent = false
    const steps: WorkflowStep[] = STEP_DEFINITIONS.map((s) => {
      const isDone = doneByKey[s.key]
      let status: WorkflowStepStatus
      let detail: string | undefined
      if (isDone) {
        status = 'done'
      } else if (!foundCurrent) {
        status = 'current'
        foundCurrent = true
      } else {
        // Steps after the current one that aren't done are reachable —
        // the operator may want to jump ahead to scan findings or
        // changes. The "current" highlight tells them where to focus,
        // but it doesn't gate navigation. Per-step prerequisite gating
        // (e.g. findings requires an assessment) lives inside each
        // step's own page.
        status = 'available'
      }
      if (s.key === 'profile' && !isDone) {
        detail = `${row.profileAnswerCount} of ${requiredProfileKeys} required answers complete`
      } else if (s.key === 'connect') {
        detail = `${row.verifiedConnectorCount} verified connector${row.verifiedConnectorCount === 1 ? '' : 's'} · ${row.toolRowCount} tool row${row.toolRowCount === 1 ? '' : 's'}`
      } else if (s.key === 'findings' && assessDone) {
        detail = `${row.openFindingCount} open finding${row.openFindingCount === 1 ? '' : 's'}`
      } else if (s.key === 'changes' && row.draftedChangeCount > 0) {
        detail = `${row.draftedChangeCount} drafted`
      }
      return { ...s, status, href: `/admin/compliance/${companyId}/${s.key}`, detail }
    })
    return steps
  } finally {
    client.release()
  }
}

/** Find a step by key from a pre-computed state list. */
export function findStep(steps: WorkflowStep[], key: WorkflowStepKey): WorkflowStep | undefined {
  return steps.find((s) => s.key === key)
}

/** Pick the previous and next step relative to a given key, for nav buttons. */
export function adjacentSteps(steps: WorkflowStep[], key: WorkflowStepKey): {
  prev: WorkflowStep | undefined
  next: WorkflowStep | undefined
} {
  const idx = steps.findIndex((s) => s.key === key)
  if (idx === -1) return { prev: undefined, next: undefined }
  return { prev: steps[idx - 1], next: steps[idx + 1] }
}
