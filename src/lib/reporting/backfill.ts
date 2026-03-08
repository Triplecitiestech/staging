/**
 * Backfill utility — populates reporting tables with historical data.
 *
 * Uses a time-budgeted approach: runs as many steps as possible within
 * the timeout, then returns progress. The route handler auto-chains
 * by calling itself until all work is complete.
 */

import { syncTickets, syncTimeEntries, syncTicketNotes, syncResources } from './sync';
import { computeLifecycle } from './lifecycle';
import { aggregateTechnicianDaily, aggregateCompanyDaily } from './aggregation';
import { computeCustomerHealth } from './health-score';
import { seedDefaultTargets } from './targets';
import { ensureReportingTables } from './ensure-tables';

// Steps in order. Each has a name and runner function.
const BACKFILL_STEPS = [
  'ensure_tables',
  'seed_targets',
  'sync_resources',
  'sync_tickets',
  'sync_time_entries',
  'sync_ticket_notes',
  'compute_lifecycle',
  'aggregate_technician',
  'aggregate_company',
  'compute_health',
] as const;

type StepName = (typeof BACKFILL_STEPS)[number];

interface StepResult {
  step: string;
  status: 'success' | 'failed' | 'skipped';
  detail?: string;
  durationMs: number;
  remaining?: number;
}

export interface BackfillResult {
  steps: StepResult[];
  errors: string[];
  complete: boolean;
  nextStep: string | null;
  totalDurationMs: number;
}

/**
 * Run backfill starting from `startStep`, processing as much as possible
 * within `timeBudgetMs`. Returns which step to continue from.
 */
export async function runBackfill(
  months: number = 6,
  startStep: StepName | string = BACKFILL_STEPS[0],
  timeBudgetMs: number = 50000,
): Promise<BackfillResult> {
  const globalStart = Date.now();
  const result: BackfillResult = { steps: [], errors: [], complete: false, nextStep: null, totalDurationMs: 0 };
  const days = months * 30;

  // Find starting index
  let startIdx = BACKFILL_STEPS.indexOf(startStep as StepName);
  if (startIdx === -1) startIdx = 0;

  for (let i = startIdx; i < BACKFILL_STEPS.length; i++) {
    const stepName = BACKFILL_STEPS[i];

    // Check time budget before each step
    if (Date.now() - globalStart > timeBudgetMs) {
      result.nextStep = stepName;
      result.totalDurationMs = Date.now() - globalStart;
      return result;
    }

    const stepStart = Date.now();
    try {
      const stepResult = await runStep(stepName, days, timeBudgetMs - (Date.now() - globalStart));
      result.steps.push({
        step: stepName,
        status: 'success',
        detail: stepResult.detail,
        durationMs: Date.now() - stepStart,
        remaining: stepResult.remaining,
      });

      // If this step has remaining work, come back to it
      if (stepResult.remaining && stepResult.remaining > 0) {
        result.nextStep = stepName;
        result.totalDurationMs = Date.now() - globalStart;
        return result;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.steps.push({ step: stepName, status: 'failed', detail: msg, durationMs: Date.now() - stepStart });
      result.errors.push(`${stepName}: ${msg}`);
      // Continue to next step on failure (don't block entire pipeline)
    }
  }

  // All steps completed
  result.complete = true;
  result.totalDurationMs = Date.now() - globalStart;
  return result;
}

async function runStep(
  step: StepName,
  days: number,
  remainingBudgetMs: number,
): Promise<{ detail: string; remaining?: number }> {
  // Give each step a max of the remaining budget minus 5s buffer
  const stepBudget = Math.max(5000, remainingBudgetMs - 5000);

  switch (step) {
    case 'ensure_tables': {
      await ensureReportingTables();
      return { detail: 'Tables verified' };
    }
    case 'seed_targets': {
      const res = await seedDefaultTargets();
      return { detail: `Created ${res.created}/${res.total}` };
    }
    case 'sync_resources': {
      const res = await syncResources();
      return { detail: `Created: ${res.created}, Updated: ${res.updated}` };
    }
    case 'sync_tickets': {
      const res = await syncTickets(days);
      return { detail: `Created: ${res.created}, Updated: ${res.updated}` };
    }
    case 'sync_time_entries': {
      const res = await syncTimeEntries(stepBudget);
      return { detail: `Created: ${res.created}, Updated: ${res.updated}, Processed: ${res.processed}`, remaining: res.remaining };
    }
    case 'sync_ticket_notes': {
      const res = await syncTicketNotes(stepBudget);
      return { detail: `Created: ${res.created}, Updated: ${res.updated}, Processed: ${res.processed}`, remaining: res.remaining };
    }
    case 'compute_lifecycle': {
      const res = await computeLifecycle();
      return { detail: `Computed: ${res.computed}` };
    }
    case 'aggregate_technician': {
      const res = await aggregateTechnicianDaily();
      return { detail: `Rows: ${res.rowsComputed}`, remaining: res.remaining };
    }
    case 'aggregate_company': {
      const res = await aggregateCompanyDaily();
      return { detail: `Rows: ${res.rowsComputed}`, remaining: res.remaining };
    }
    case 'compute_health': {
      const res = await computeCustomerHealth();
      return { detail: `Computed: ${res.computed}` };
    }
    default:
      return { detail: 'Unknown step' };
  }
}
