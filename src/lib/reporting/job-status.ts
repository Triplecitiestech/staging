/**
 * Utility to track reporting job execution status.
 */

import { prisma } from '@/lib/prisma';
import { JobResult } from './types';

/**
 * Record the start of a job run. Returns a function to call when the job finishes.
 * If the reporting_job_status table doesn't exist, the finish function silently
 * skips the DB write (the job itself still runs).
 */
export function createJobTracker(jobName: string) {
  const startTime = Date.now();

  return async function finishJob(result: Omit<JobResult, 'jobName' | 'durationMs'>): Promise<JobResult> {
    const durationMs = Date.now() - startTime;
    const jobResult: JobResult = {
      jobName,
      durationMs,
      ...result,
    };

    try {
      // Preserve firstRunAt from existing record (if any)
      const existing = await prisma.reportingJobStatus.findUnique({
        where: { jobName },
        select: { lastRunMeta: true },
      });
      const existingMeta = existing?.lastRunMeta as Record<string, unknown> | null;
      const firstRunAt = existingMeta?.firstRunAt || new Date().toISOString();
      const meta = result.meta
        ? { ...JSON.parse(JSON.stringify(result.meta)), firstRunAt }
        : { firstRunAt };

      await prisma.reportingJobStatus.upsert({
        where: { jobName },
        create: {
          jobName,
          lastRunAt: new Date(),
          lastRunStatus: result.status,
          lastRunDurationMs: durationMs,
          lastRunError: result.error || null,
          lastRunMeta: meta,
        },
        update: {
          lastRunAt: new Date(),
          lastRunStatus: result.status,
          lastRunDurationMs: durationMs,
          lastRunError: result.error || null,
          lastRunMeta: meta,
        },
      });
    } catch (err) {
      // If reporting_job_status table doesn't exist, log and continue
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('does not exist') || msg.includes('P2021') || msg.includes('P2010')) {
        console.warn(`[job-status] reporting_job_status table missing — skipping status write for ${jobName}`);
      } else {
        console.error(`[job-status] Failed to write status for ${jobName}:`, msg);
      }
    }

    return jobResult;
  };
}

/**
 * Get the last successful run time for a job.
 * Returns null if the table doesn't exist.
 */
export async function getLastSuccessfulRun(jobName: string): Promise<Date | null> {
  try {
    const record = await prisma.reportingJobStatus.findUnique({
      where: { jobName },
    });
    if (record && (record.lastRunStatus === 'success' || record.lastRunStatus === 'partial') && record.lastRunAt) {
      return record.lastRunAt;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get the last run time for a job regardless of status.
 * This is used to avoid re-syncing data that was already processed
 * even if the overall job failed (e.g., timed out after syncing
 * some companies). Returns null if never run.
 */
export async function getLastRunTime(jobName: string): Promise<Date | null> {
  try {
    const record = await prisma.reportingJobStatus.findUnique({
      where: { jobName },
    });
    if (record?.lastRunAt) {
      return record.lastRunAt;
    }
    return null;
  } catch {
    return null;
  }
}
