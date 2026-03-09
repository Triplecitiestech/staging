/**
 * Configurable target/benchmark system for SLA and performance targets.
 *
 * Targets are resolved in priority order:
 *   1. Company-specific + priority-specific
 *   2. Priority-specific
 *   3. Company-specific (all priorities)
 *   4. Global default
 */

import { prisma } from '@/lib/prisma';
import { priorityToTargetScope } from './types';

/**
 * Resolve the target value for a given metric, considering priority and company scope.
 * Returns the target value in the metric's native unit, or null if no target is configured.
 */
export async function resolveTarget(
  metricKey: string,
  priority: number,
  companyId?: string,
): Promise<number | null> {
  const priorityScope = priorityToTargetScope(priority);

  // Try resolution in order: company+priority → priority → company → global
  const candidates = await prisma.reportingTarget.findMany({
    where: {
      metricKey,
      isActive: true,
      OR: [
        // Company + priority specific
        ...(companyId ? [{
          scope: 'company',
          scopeValue: `${companyId}:${priorityScope}`,
        }] : []),
        // Priority specific
        { scope: 'priority', scopeValue: priorityScope },
        // Company specific (all priorities)
        ...(companyId ? [{ scope: 'company', scopeValue: companyId }] : []),
        // Global
        { scope: 'global', scopeValue: '' },
      ],
    },
  });

  // Find best match by resolution order
  if (companyId) {
    const companyPriority = candidates.find(
      t => t.scope === 'company' && t.scopeValue === `${companyId}:${priorityScope}`
    );
    if (companyPriority) return companyPriority.targetValue;
  }

  const priorityTarget = candidates.find(
    t => t.scope === 'priority' && t.scopeValue === priorityScope
  );
  if (priorityTarget) return priorityTarget.targetValue;

  if (companyId) {
    const companyTarget = candidates.find(
      t => t.scope === 'company' && t.scopeValue === companyId
    );
    if (companyTarget) return companyTarget.targetValue;
  }

  const globalTarget = candidates.find(t => t.scope === 'global');
  if (globalTarget) return globalTarget.targetValue;

  return null;
}

/**
 * Get all active targets, optionally filtered by metric key.
 */
export async function getTargets(metricKey?: string) {
  return prisma.reportingTarget.findMany({
    where: {
      isActive: true,
      ...(metricKey ? { metricKey } : {}),
    },
    orderBy: [{ metricKey: 'asc' }, { scope: 'asc' }],
  });
}

/**
 * Create or update a target.
 */
export async function upsertTarget(data: {
  metricKey: string;
  scope: string;
  scopeValue: string | null;
  targetValue: number;
  unit: string;
  description?: string;
  createdBy: string;
}) {
  return prisma.reportingTarget.upsert({
    where: {
      metricKey_scope_scopeValue: {
        metricKey: data.metricKey,
        scope: data.scope,
        scopeValue: data.scopeValue ?? '',
      },
    },
    create: {
      metricKey: data.metricKey,
      scope: data.scope,
      scopeValue: data.scopeValue ?? '',
      targetValue: data.targetValue,
      unit: data.unit,
      description: data.description || null,
      createdBy: data.createdBy,
    },
    update: {
      targetValue: data.targetValue,
      unit: data.unit,
      description: data.description || null,
      isActive: true,
    },
  });
}

/**
 * Seed default targets. Idempotent — only creates if not present.
 */
export async function seedDefaultTargets(createdBy: string = 'system') {
  const defaults = [
    // ============================================================
    // SLA Targets — Matched to Autotask "TCT – Fully Managed IT Services" SLA
    // Agreement last updated: 10/23/2025 by Kurtis Florance
    // Timeframe: Business Hours | Goals: 95% first response, 95% resolution plan, 95% resolved
    // These targets apply ONLY to Platinum Managed Service companies.
    // ============================================================

    // First Response time targets by priority (business-hour minutes)
    { metricKey: 'first_response_time', scope: 'priority', scopeValue: 'CRITICAL', targetValue: 30, unit: 'minutes', description: 'First response within 0.5 business hours for critical tickets' },
    { metricKey: 'first_response_time', scope: 'priority', scopeValue: 'HIGH', targetValue: 60, unit: 'minutes', description: 'First response within 1 business hour for high priority tickets' },
    { metricKey: 'first_response_time', scope: 'priority', scopeValue: 'MEDIUM', targetValue: 120, unit: 'minutes', description: 'First response within 2 business hours for medium priority tickets' },
    { metricKey: 'first_response_time', scope: 'priority', scopeValue: 'LOW', targetValue: 480, unit: 'minutes', description: 'First response within 8 business hours for low priority tickets' },

    // Resolution Plan time targets by priority (business-hour minutes)
    // "Resolution Plan" = time to have a plan/path to resolution documented
    { metricKey: 'resolution_plan_time', scope: 'priority', scopeValue: 'CRITICAL', targetValue: 120, unit: 'minutes', description: 'Resolution plan within 2 business hours for critical tickets' },
    { metricKey: 'resolution_plan_time', scope: 'priority', scopeValue: 'HIGH', targetValue: 240, unit: 'minutes', description: 'Resolution plan within 4 business hours for high priority tickets' },
    { metricKey: 'resolution_plan_time', scope: 'priority', scopeValue: 'MEDIUM', targetValue: 480, unit: 'minutes', description: 'Resolution plan within 8 business hours for medium priority tickets' },
    { metricKey: 'resolution_plan_time', scope: 'priority', scopeValue: 'LOW', targetValue: 1440, unit: 'minutes', description: 'Resolution plan within 24 business hours for low priority tickets' },

    // Resolved time targets by priority (business-hour minutes)
    { metricKey: 'resolution_time', scope: 'priority', scopeValue: 'CRITICAL', targetValue: 240, unit: 'minutes', description: 'Resolve critical tickets within 4 business hours' },
    { metricKey: 'resolution_time', scope: 'priority', scopeValue: 'HIGH', targetValue: 480, unit: 'minutes', description: 'Resolve high priority tickets within 8 business hours' },
    { metricKey: 'resolution_time', scope: 'priority', scopeValue: 'MEDIUM', targetValue: 1440, unit: 'minutes', description: 'Resolve medium priority tickets within 24 business hours' },
    // Note: Low priority has no "Resolved" target in Autotask SLA
    // { metricKey: 'resolution_time', scope: 'priority', scopeValue: 'LOW' — not defined },

    // SLA compliance goal targets (percentage)
    { metricKey: 'sla_first_response_goal', scope: 'global', scopeValue: '', targetValue: 95, unit: 'percent', description: 'First Response Goal: 95% of tickets should meet first response SLA' },
    { metricKey: 'sla_resolution_plan_goal', scope: 'global', scopeValue: '', targetValue: 95, unit: 'percent', description: 'Resolution Plan Goal: 95% of tickets should meet resolution plan SLA' },
    { metricKey: 'sla_resolved_goal', scope: 'global', scopeValue: '', targetValue: 95, unit: 'percent', description: 'Resolved Goal: 95% of tickets should meet resolution SLA' },

    // Global targets
    { metricKey: 'reopen_rate', scope: 'global', scopeValue: '', targetValue: 5, unit: 'percent', description: 'Target reopen rate below 5%' },
    { metricKey: 'first_touch_resolution_rate', scope: 'global', scopeValue: '', targetValue: 30, unit: 'percent', description: 'Target 30% first touch resolution rate' },
    { metricKey: 'technician_daily_hours', scope: 'global', scopeValue: '', targetValue: 8, unit: 'hours', description: 'Target 8 hours logged per day per technician' },
    { metricKey: 'customer_monthly_support_hours', scope: 'global', scopeValue: '', targetValue: 20, unit: 'hours', description: 'Expected monthly support hours per customer' },
  ];

  let created = 0;
  for (const target of defaults) {
    const existing = await prisma.reportingTarget.findUnique({
      where: {
        metricKey_scope_scopeValue: {
          metricKey: target.metricKey,
          scope: target.scope,
          scopeValue: target.scopeValue ?? '',
        },
      },
    });

    if (!existing) {
      await prisma.reportingTarget.create({
        data: {
          ...target,
          createdBy,
        },
      });
      created++;
    }
  }

  return { created, total: defaults.length };
}
