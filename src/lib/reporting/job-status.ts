/**
 * Utility to track reporting job execution status.
 */

import { prisma } from '@/lib/prisma';
import { JobResult } from './types';

/**
 * Record the start of a job run. Returns a function to call when the job finishes.
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

    await prisma.reportingJobStatus.upsert({
      where: { jobName },
      create: {
        jobName,
        lastRunAt: new Date(),
        lastRunStatus: result.status,
        lastRunDurationMs: durationMs,
        lastRunError: result.error || null,
        lastRunMeta: result.meta ? JSON.parse(JSON.stringify(result.meta)) : null,
      },
      update: {
        lastRunAt: new Date(),
        lastRunStatus: result.status,
        lastRunDurationMs: durationMs,
        lastRunError: result.error || null,
        lastRunMeta: result.meta ? JSON.parse(JSON.stringify(result.meta)) : null,
      },
    });

    return jobResult;
  };
}

/**
 * Get the last successful run time for a job.
 */
export async function getLastSuccessfulRun(jobName: string): Promise<Date | null> {
  const record = await prisma.reportingJobStatus.findUnique({
    where: { jobName },
  });
  if (record && record.lastRunStatus === 'success' && record.lastRunAt) {
    return record.lastRunAt;
  }
  return null;
}
