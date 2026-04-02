import { describe, it, expect } from 'vitest';
import {
  formatMinutes,
  isResolvedStatus,
  isWaitingCustomerStatus,
  PRIORITY_LABELS,
  mapAutotaskLabelToCustomerStatus,
  resolveCustomerStatusLabel,
} from '@/lib/tickets/utils';

describe('formatMinutes', () => {
  it('formats minutes under 60 as minutes', () => {
    expect(formatMinutes(30)).toBe('30m');
    expect(formatMinutes(0)).toBe('0m');
    expect(formatMinutes(59)).toBe('59m');
  });

  it('formats minutes between 60 and 1440 as hours', () => {
    expect(formatMinutes(60)).toBe('1.0h');
    expect(formatMinutes(90)).toBe('1.5h');
    expect(formatMinutes(120)).toBe('2.0h');
  });

  it('formats minutes over 1440 as days', () => {
    expect(formatMinutes(1440)).toBe('1.0d');
    expect(formatMinutes(2880)).toBe('2.0d');
  });
});

describe('isResolvedStatus', () => {
  it('returns true for resolved status IDs (5, 13, 29)', () => {
    expect(isResolvedStatus(5)).toBe(true);
    expect(isResolvedStatus(13)).toBe(true);
    expect(isResolvedStatus(29)).toBe(true);
  });

  it('returns false for non-resolved status IDs', () => {
    expect(isResolvedStatus(1)).toBe(false);
    expect(isResolvedStatus(4)).toBe(false);
    expect(isResolvedStatus(7)).toBe(false);
    expect(isResolvedStatus(0)).toBe(false);
  });
});

describe('isWaitingCustomerStatus', () => {
  it('returns true for waiting customer status IDs (7, 12)', () => {
    expect(isWaitingCustomerStatus(7)).toBe(true);
    expect(isWaitingCustomerStatus(12)).toBe(true);
  });

  it('returns false for other status IDs', () => {
    expect(isWaitingCustomerStatus(1)).toBe(false);
    expect(isWaitingCustomerStatus(5)).toBe(false);
  });
});

describe('PRIORITY_LABELS', () => {
  it('has labels for priorities 1-4', () => {
    expect(PRIORITY_LABELS[1]).toBe('Critical');
    expect(PRIORITY_LABELS[2]).toBe('High');
    expect(PRIORITY_LABELS[3]).toBe('Medium');
    expect(PRIORITY_LABELS[4]).toBe('Low');
  });
});

describe('mapAutotaskLabelToCustomerStatus', () => {
  // Status ID takes precedence over label
  it('maps resolved status IDs to Closed regardless of label', () => {
    expect(mapAutotaskLabelToCustomerStatus('In Progress', 5)).toBe('Closed');
    expect(mapAutotaskLabelToCustomerStatus('New', 13)).toBe('Closed');
    expect(mapAutotaskLabelToCustomerStatus('Scheduled', 29)).toBe('Closed');
  });

  it('maps waiting customer status IDs to Awaiting Your Team regardless of label', () => {
    expect(mapAutotaskLabelToCustomerStatus('In Progress', 7)).toBe('Awaiting Your Team');
    expect(mapAutotaskLabelToCustomerStatus('New', 12)).toBe('Awaiting Your Team');
  });

  // Label-based mapping for non-special status IDs
  it('maps Complete/Closed/Resolved labels to Closed', () => {
    expect(mapAutotaskLabelToCustomerStatus('Complete', 99)).toBe('Closed');
    expect(mapAutotaskLabelToCustomerStatus('Closed', 99)).toBe('Closed');
    expect(mapAutotaskLabelToCustomerStatus('Resolved', 99)).toBe('Closed');
    expect(mapAutotaskLabelToCustomerStatus('Cancelled', 99)).toBe('Closed');
    expect(mapAutotaskLabelToCustomerStatus('Merged', 99)).toBe('Closed');
  });

  it('maps waiting customer labels to Awaiting Your Team', () => {
    expect(mapAutotaskLabelToCustomerStatus('Waiting on Customer', 99)).toBe('Awaiting Your Team');
    expect(mapAutotaskLabelToCustomerStatus('Waiting Customer', 99)).toBe('Awaiting Your Team');
    expect(mapAutotaskLabelToCustomerStatus('Pending Customer', 99)).toBe('Awaiting Your Team');
    expect(mapAutotaskLabelToCustomerStatus('Customer Note Added', 99)).toBe('Awaiting Your Team');
    expect(mapAutotaskLabelToCustomerStatus('Client Response', 99)).toBe('Awaiting Your Team');
  });

  it('maps scheduled labels to Scheduled', () => {
    expect(mapAutotaskLabelToCustomerStatus('Scheduled', 99)).toBe('Scheduled');
    expect(mapAutotaskLabelToCustomerStatus('Schedule', 99)).toBe('Scheduled');
  });

  it('maps in progress labels to In Progress', () => {
    expect(mapAutotaskLabelToCustomerStatus('In Progress', 99)).toBe('In Progress');
    expect(mapAutotaskLabelToCustomerStatus('Work in Progress', 99)).toBe('In Progress');
    expect(mapAutotaskLabelToCustomerStatus('Active', 99)).toBe('In Progress');
  });

  it('maps vendor waiting labels to Waiting on Vendor', () => {
    expect(mapAutotaskLabelToCustomerStatus('Waiting on Vendor', 99)).toBe('Waiting on Vendor');
    expect(mapAutotaskLabelToCustomerStatus('Waiting for Third Party', 99)).toBe('Waiting on Vendor');
  });

  it('maps escalated labels to Escalated', () => {
    expect(mapAutotaskLabelToCustomerStatus('Escalated', 99)).toBe('Escalated');
    expect(mapAutotaskLabelToCustomerStatus('Escalation', 99)).toBe('Escalated');
  });

  it('maps new/open/assigned labels to Open', () => {
    expect(mapAutotaskLabelToCustomerStatus('New', 99)).toBe('Open');
    expect(mapAutotaskLabelToCustomerStatus('Open', 99)).toBe('Open');
    expect(mapAutotaskLabelToCustomerStatus('Assigned', 99)).toBe('Open');
  });

  it('falls back to Open for unknown labels', () => {
    expect(mapAutotaskLabelToCustomerStatus('SomeUnknownStatus', 99)).toBe('Open');
  });

  it('is case insensitive', () => {
    expect(mapAutotaskLabelToCustomerStatus('IN PROGRESS', 99)).toBe('In Progress');
    expect(mapAutotaskLabelToCustomerStatus('waiting on customer', 99)).toBe('Awaiting Your Team');
    expect(mapAutotaskLabelToCustomerStatus('COMPLETE', 99)).toBe('Closed');
  });
});

describe('resolveCustomerStatusLabel', () => {
  it('uses picklist label when available', () => {
    const picklist = { 4: 'In Progress', 5: 'Complete' };
    expect(resolveCustomerStatusLabel(4, picklist)).toBe('In Progress');
    expect(resolveCustomerStatusLabel(5, picklist)).toBe('Closed');
  });

  it('falls back to Open for unknown status with null picklist', () => {
    expect(resolveCustomerStatusLabel(99, null)).toBe('Open');
  });

  it('falls back to Open for unknown status with empty picklist', () => {
    expect(resolveCustomerStatusLabel(99, {})).toBe('Open');
  });

  it('uses status ID classification when picklist is null', () => {
    expect(resolveCustomerStatusLabel(5, null)).toBe('Closed');
    expect(resolveCustomerStatusLabel(7, null)).toBe('Awaiting Your Team');
    expect(resolveCustomerStatusLabel(1, null)).toBe('Open');
  });
});
