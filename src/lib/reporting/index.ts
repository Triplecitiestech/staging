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

// Base query services
export {
  getTechnicianMetrics,
  getCompanyServiceDeskMetrics,
  getCustomerHealthMetrics,
  getDashboardSummary,
  getBenchmarkComparisons,
} from './services';

// Enhanced services (Phase 3)
export {
  getEnhancedTechnicianReport,
  getEnhancedCompanyReport,
  getEnhancedDashboardReport,
  getEnhancedHealthReport,
} from './enhanced-services';

// Filters
export {
  resolvePreset,
  parseFiltersFromParams,
  getComparisonRange,
  generateTrendBuckets,
  dateToBucketKey,
} from './filters';
export type { DatePreset, ReportFilters } from './filters';

// Scheduling & delivery (Phase 5)
export {
  getSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  processScheduledReports,
  getDeliveryHistory,
} from './scheduler';

// Email templates
export { buildReportEmail } from './email-templates';

// Advanced analytics (Phase 6)
export {
  detectAnomalies,
  generateInsights,
  predictTrends,
} from './analytics';
export type { AnomalyAlert, OperationalInsight, PredictiveTrend } from './analytics';

// Job status tracking
export { createJobTracker, getLastSuccessfulRun } from './job-status';

// Business Review / QBR (Phase 7)
export {
  generateBusinessReview,
  listBusinessReviews,
  getBusinessReview,
  updateReviewStatus,
  deleteBusinessReview,
  getReviewPrintableHTML,
  sendBusinessReviewEmail,
} from './business-review';

// Types
export * from './types';
