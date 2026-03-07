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
    // First response time targets by priority (minutes)
    { metricKey: 'first_response_time', scope: 'priority', scopeValue: 'CRITICAL', targetValue: 15, unit: 'minutes', description: 'First response within 15 minutes for critical tickets' },
    { metricKey: 'first_response_time', scope: 'priority', scopeValue: 'HIGH', targetValue: 60, unit: 'minutes', description: 'First response within 1 hour for high priority tickets' },
    { metricKey: 'first_response_time', scope: 'priority', scopeValue: 'MEDIUM', targetValue: 240, unit: 'minutes', description: 'First response within 4 hours for medium priority tickets' },
    { metricKey: 'first_response_time', scope: 'priority', scopeValue: 'LOW', targetValue: 480, unit: 'minutes', description: 'First response within 8 hours for low priority tickets' },

    // Resolution time targets by priority (minutes)
    { metricKey: 'resolution_time', scope: 'priority', scopeValue: 'CRITICAL', targetValue: 240, unit: 'minutes', description: 'Resolve critical tickets within 4 hours' },
    { metricKey: 'resolution_time', scope: 'priority', scopeValue: 'HIGH', targetValue: 480, unit: 'minutes', description: 'Resolve high priority tickets within 8 hours' },
    { metricKey: 'resolution_time', scope: 'priority', scopeValue: 'MEDIUM', targetValue: 2880, unit: 'minutes', description: 'Resolve medium priority tickets within 2 business days' },
    { metricKey: 'resolution_time', scope: 'priority', scopeValue: 'LOW', targetValue: 7200, unit: 'minutes', description: 'Resolve low priority tickets within 5 business days' },

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
