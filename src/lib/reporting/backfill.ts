/**
 * Backfill utility — populates reporting tables with historical data.
 *
 * Runs sync for a wide date range, then computes lifecycle and daily aggregation
 * for each day in the backfill range.
 */

import { syncTickets, syncTimeEntries, syncTicketNotes, syncResources } from './sync';
import { computeLifecycle } from './lifecycle';
import { aggregateTechnicianDaily, aggregateCompanyDaily } from './aggregation';
import { computeCustomerHealth } from './health-score';
import { seedDefaultTargets } from './targets';

interface BackfillResult {
  steps: Array<{ step: string; status: string; detail?: string }>;
  errors: string[];
}

/**
 * Run a full backfill for the specified number of months.
 * This is a long-running operation — should be called with adequate timeout.
 */
export async function runBackfill(months: number = 6): Promise<BackfillResult> {
  const result: BackfillResult = { steps: [], errors: [] };
  const days = months * 30;

  // Step 1: Seed default targets
  try {
    const targets = await seedDefaultTargets();
    result.steps.push({ step: 'seed_targets', status: 'success', detail: `Created ${targets.created}/${targets.total}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.steps.push({ step: 'seed_targets', status: 'failed', detail: msg });
    result.errors.push(msg);
  }

  // Step 2: Sync resources
  try {
    const res = await syncResources();
    result.steps.push({ step: 'sync_resources', status: 'success', detail: `Created: ${res.created}, Updated: ${res.updated}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.steps.push({ step: 'sync_resources', status: 'failed', detail: msg });
    result.errors.push(msg);
  }

  // Step 3: Sync tickets (wide range)
  try {
    const res = await syncTickets(days);
    result.steps.push({ step: 'sync_tickets', status: 'success', detail: `Created: ${res.created}, Updated: ${res.updated}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.steps.push({ step: 'sync_tickets', status: 'failed', detail: msg });
    result.errors.push(msg);
  }

  // Step 4: Sync time entries
  try {
    const res = await syncTimeEntries();
    result.steps.push({ step: 'sync_time_entries', status: 'success', detail: `Created: ${res.created}, Updated: ${res.updated}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.steps.push({ step: 'sync_time_entries', status: 'failed', detail: msg });
    result.errors.push(msg);
  }

  // Step 5: Sync ticket notes
  try {
    const res = await syncTicketNotes();
    result.steps.push({ step: 'sync_ticket_notes', status: 'success', detail: `Created: ${res.created}, Updated: ${res.updated}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.steps.push({ step: 'sync_ticket_notes', status: 'failed', detail: msg });
    result.errors.push(msg);
  }

  // Step 6: Compute lifecycle
  try {
    const res = await computeLifecycle();
    result.steps.push({ step: 'compute_lifecycle', status: 'success', detail: `Computed: ${res.computed}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.steps.push({ step: 'compute_lifecycle', status: 'failed', detail: msg });
    result.errors.push(msg);
  }

  // Step 7: Aggregate daily metrics for each day in the range
  const now = new Date();
  let dailyErrors = 0;
  for (let d = days; d >= 1; d--) {
    const date = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
    try {
      await aggregateTechnicianDaily(date);
      await aggregateCompanyDaily(date);
    } catch {
      dailyErrors++;
    }
  }
  result.steps.push({
    step: 'aggregate_daily',
    status: dailyErrors > 0 ? 'partial' : 'success',
    detail: `Processed ${days} days, ${dailyErrors} errors`,
  });

  // Step 8: Compute health scores
  try {
    const res = await computeCustomerHealth();
    result.steps.push({ step: 'compute_health', status: 'success', detail: `Computed: ${res.computed}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.steps.push({ step: 'compute_health', status: 'failed', detail: msg });
    result.errors.push(msg);
  }

  return result;
}
