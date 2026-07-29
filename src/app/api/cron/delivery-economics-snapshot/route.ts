import { cronHandler } from '@/lib/cron-wrapper';
import { generateDeliveryEconomicsReport } from '@/lib/reporting/delivery-economics/service';
import { saveSnapshot } from '@/lib/reporting/delivery-economics/snapshots';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const WINDOW_DAYS = 180;

/**
 * GET /api/cron/delivery-economics-snapshot
 *
 * Weekly capture of the Delivery Economics report (Mondays). Each run APPENDS a
 * snapshot, so the figures become a time series — the trend is the finding, and
 * a single reading of this report tells you very little.
 *
 * The rolling 180-day window means each snapshot is directly comparable to the
 * last. Snapshots are never overwritten, so history survives even after the
 * underlying Autotask entries age out of easy reach.
 */
export const GET = cronHandler(
  { name: 'delivery_economics_snapshot', timeoutMs: 290000 },
  async () => {
    const to = new Date();
    const from = new Date(to.getTime() - WINDOW_DAYS * 86_400_000);

    const report = await generateDeliveryEconomicsReport({ from, to });
    const { saved, tableMissing } = await saveSnapshot(report, 'cron');

    if (tableMissing) {
      // Not a failure: the analysis ran. The table just is not migrated yet, so
      // there is nowhere to keep it. Reported as a message rather than an error
      // so the cron does not alert every week for an operator step.
      return {
        success: true,
        message: 'Report generated but delivery_economics_snapshots is missing — POST /api/migrations/run once.',
      };
    }

    const latest = report.monthly[report.monthly.length - 1];
    return {
      success: true,
      message:
        `Snapshot saved (${report.timeEntriesAnalysed} entries, ` +
        `${report.capacity.customerHoursPerMonth}h/mo customer, ` +
        `${report.capacity.idleHoursPerMonth}h/mo idle` +
        (latest ? `, internal share ${latest.internalSharePct}%` : '') +
        ')',
      data: { saved, warnings: report.notes.length },
    };
  }
);
