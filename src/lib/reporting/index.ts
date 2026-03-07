/**
 * Reporting & Analytics system barrel export.
 */

// Sync pipeline
export { syncTickets, syncTimeEntries, syncTicketNotes, syncResources } from './sync';

// Lifecycle computation
export { computeLifecycle } from './lifecycle';

// Daily aggregation
export { aggregateTechnicianDaily, aggregateCompanyDaily } from './aggregation';

// Health scoring
export { computeCustomerHealth } from './health-score';

// Target/benchmark management
export { resolveTarget, getTargets, upsertTarget, seedDefaultTargets } from './targets';

// Query services
export {
  getTechnicianMetrics,
  getCompanyServiceDeskMetrics,
  getCustomerHealthMetrics,
  getDashboardSummary,
  getBenchmarkComparisons,
} from './services';

// Job status tracking
export { createJobTracker, getLastSuccessfulRun } from './job-status';

// Types
export * from './types';
