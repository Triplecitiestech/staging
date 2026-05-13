/**
 * Billable Handoff — link finding dispositions to the per-customer
 * "Compliance Operations" Project + PhaseTask hierarchy.
 *
 * The pattern: one persistent Project per customer (title: "Compliance
 * Operations"), with a new Phase per engagement window. Findings flagged
 * as `billable_project` get a PhaseTask under the current open phase.
 *
 * Today the disposition link-project route accepts an existing projectId
 * (and optional phaseTaskId) and stores the link. The helpers here are
 * the path to fully automate it: they get-or-create the project, the
 * phase, and the task on demand. UI integration follows in P2.
 *
 * See docs/plans/COMPLIANCE_ARCHITECTURE.md §2.9 and
 * docs/plans/CHANGE_MANAGEMENT_AND_REMEDIATION.md §9.
 */

import { prisma } from '@/lib/prisma'

export const COMPLIANCE_OPERATIONS_PROJECT_TITLE = 'Compliance Operations'

export interface ComplianceTaskInput {
  /** Customer the work is for. */
  companyId: string
  /** Framework + control the finding belongs to, for traceability in the task title. */
  frameworkId: string
  controlId: string
  /** Friendly control name (e.g. CIS 6.3 → "Require MFA for All Accounts"). */
  controlName: string
  /** Suggested remediation summary; rendered as the task body. */
  taskText: string
  /** Optional disposition fields that should flow into the task. */
  assigneeEmail?: string
  dueDate?: Date
  internalNotes?: string
  /** Caller (for createdBy/lastModifiedBy). */
  staffEmail: string
}

export interface ComplianceTaskResult {
  projectId: string
  phaseId: string
  phaseTaskId: string
  createdProject: boolean
  createdPhase: boolean
  createdTask: boolean
}

/**
 * Get the customer's persistent "Compliance Operations" Project, creating
 * it on demand. Returns the Project id and whether it was just created.
 */
export async function getOrCreateComplianceOperationsProject(
  companyId: string,
  staffEmail: string
): Promise<{ id: string; created: boolean }> {
  // Look for an existing project with the canonical title that's not cancelled.
  const existing = await prisma.project.findFirst({
    where: {
      companyId,
      title: COMPLIANCE_OPERATIONS_PROJECT_TITLE,
      status: { in: ['ACTIVE', 'ON_HOLD'] },
    },
    select: { id: true },
  })
  if (existing) return { id: existing.id, created: false }

  // Generate a unique slug for the new project.
  const baseSlug = `${slugify(companyId)}-compliance-operations`
  const slug = await uniqueSlug(baseSlug)
  const created = await prisma.project.create({
    data: {
      companyId,
      title: COMPLIANCE_OPERATIONS_PROJECT_TITLE,
      slug,
      projectType: 'CUSTOM',
      status: 'ACTIVE',
      createdBy: staffEmail,
      lastModifiedBy: staffEmail,
      isVisibleToCustomer: true,
    },
    select: { id: true },
  })
  return { id: created.id, created: true }
}

/**
 * Get the currently open (NOT_STARTED or IN_PROGRESS) Phase under the
 * given project, or create a new "Current Engagement" phase if none exists.
 */
export async function getOrCreateActiveEngagementPhase(
  projectId: string,
  staffEmail: string
): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.phase.findFirst({
    where: { projectId, status: { in: ['NOT_STARTED', 'SCHEDULED', 'IN_PROGRESS'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  if (existing) return { id: existing.id, created: false }

  // Find the next orderIndex.
  const last = await prisma.phase.findFirst({
    where: { projectId },
    orderBy: { orderIndex: 'desc' },
    select: { orderIndex: true },
  })
  // Phase has no createdBy/lastModifiedBy fields (unlike Project) — staff
  // attribution lives in audit logs at the route layer.
  void staffEmail
  const created = await prisma.phase.create({
    data: {
      projectId,
      title: `Compliance Engagement — ${new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' })}`,
      description: 'Findings flagged as billable from the compliance assessment cycle.',
      status: 'NOT_STARTED',
      orderIndex: (last?.orderIndex ?? 0) + 1,
    },
    select: { id: true },
  })
  return { id: created.id, created: true }
}

/**
 * Get-or-create the Project + Phase, then create a PhaseTask for this finding.
 * Returns identifiers for caller storage on the disposition row.
 */
export async function createComplianceTaskForDisposition(
  input: ComplianceTaskInput
): Promise<ComplianceTaskResult> {
  const project = await getOrCreateComplianceOperationsProject(input.companyId, input.staffEmail)
  const phase = await getOrCreateActiveEngagementPhase(project.id, input.staffEmail)

  const last = await prisma.phaseTask.findFirst({
    where: { phaseId: phase.id },
    orderBy: { orderIndex: 'desc' },
    select: { orderIndex: true },
  })
  const task = await prisma.phaseTask.create({
    data: {
      phaseId: phase.id,
      taskText: `[Compliance] ${input.frameworkId.toUpperCase()} ${input.controlId} — ${input.controlName}\n\n${input.taskText}`,
      orderIndex: (last?.orderIndex ?? 0) + 1,
      status: 'NOT_STARTED',
      priority: 'MEDIUM',
      assignedTo: input.assigneeEmail,
      dueDate: input.dueDate,
      notes: input.internalNotes,
      isVisibleToCustomer: true,
    },
    select: { id: true },
  })

  return {
    projectId: project.id,
    phaseId: phase.id,
    phaseTaskId: task.id,
    createdProject: project.created,
    createdPhase: phase.created,
    createdTask: true,
  }
}

// ---------------------------------------------------------------------------
// Slug helpers
// ---------------------------------------------------------------------------

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'compliance'
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base
  let n = 1
  // Simple linear probe — collisions are extremely rare since `slugify` already
  // includes the companyId.
  while (true) {
    const taken = await prisma.project.findUnique({ where: { slug }, select: { id: true } })
    if (!taken) return slug
    n += 1
    slug = `${base}-${n}`
    if (n > 100) {
      // Sentinel — fall back to a timestamp suffix rather than spin forever.
      return `${base}-${Date.now()}`
    }
  }
}
