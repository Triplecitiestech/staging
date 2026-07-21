/**
 * Locks the SLA reporting model (owner decisions 2026-07-21):
 *   • SLA numbers come from Autotask's own per-contract determination.
 *   • SLA is reported ONLY for the "TCT – Fully Managed IT Services" agreement.
 *   • Monitoring/alert-queue and automated tickets never carry an SLA.
 * Grounded in live Tri-Bros June 2026 data: human tickets on SLA id 2 are
 * reportable; the 33 automated tickets + the No-SLA human tickets are not.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  getFullyManagedSlaId,
  isFullyManagedSla,
  isSlaReportableTicket,
  updateFullyManagedSlaId,
  resetFullyManagedSlaCache,
} from './sla-config';
import { resetTicketClassificationCache } from './ticket-classification';

afterEach(() => {
  resetFullyManagedSlaCache();
  resetTicketClassificationCache();
});

const HELP_DESK = 29683490;
const SECURITY_ALERT = 29683494;

describe('Fully Managed SLA id resolution', () => {
  it('defaults to the live TCT id (2) and matches only that id', () => {
    expect(getFullyManagedSlaId()).toBe(2);
    expect(isFullyManagedSla(2)).toBe(true);
    expect(isFullyManagedSla(1)).toBe(false); // Standard SLA
    expect(isFullyManagedSla(3)).toBe(false); // No SLA
    expect(isFullyManagedSla(null)).toBe(false);
    expect(isFullyManagedSla(undefined)).toBe(false);
  });

  it('re-resolves from the live SLA picklist by name and survives a bad fetch', () => {
    updateFullyManagedSlaId([
      { id: 1, label: 'Standard  SLA' },
      { id: 7, label: 'TCT – Fully Managed IT Services' },
      { id: 3, label: 'No SLA' },
    ]);
    expect(getFullyManagedSlaId()).toBe(7);
    expect(isFullyManagedSla(7)).toBe(true);
    expect(isFullyManagedSla(2)).toBe(false);

    // A picklist with no Fully Managed match must not blank the cache.
    updateFullyManagedSlaId([{ id: 1, label: 'Standard SLA' }]);
    expect(getFullyManagedSlaId()).toBe(7);
  });
});

describe('isSlaReportableTicket — the three gates', () => {
  it('reports a Fully-Managed human support ticket (Tri-Bros 34477)', () => {
    expect(isSlaReportableTicket({
      slaId: 2, source: 8, queueId: HELP_DESK, queueLabel: 'Help Desk',
      assignedResourceId: 29682938,
    })).toBe(true);
  });

  it('excludes Standard-SLA and No-SLA tickets', () => {
    const base = { source: 2, queueId: HELP_DESK, assignedResourceId: 1 };
    expect(isSlaReportableTicket({ ...base, slaId: 1 })).toBe(false); // Standard
    expect(isSlaReportableTicket({ ...base, slaId: 3 })).toBe(false); // No SLA
    expect(isSlaReportableTicket({ ...base, slaId: null })).toBe(false);
  });

  it('excludes automated monitoring tickets even if somehow on the FM SLA', () => {
    expect(isSlaReportableTicket({
      slaId: 2, source: 8, queueId: SECURITY_ALERT, queueLabel: 'Security Monitoring Alert',
      assignedResourceId: null,
    })).toBe(false);
  });

  it('excludes an alert-queue ticket a tech touched (SOC alert), matching the widget Queue filter', () => {
    // Tri-Bros 34221: human-source, assigned, but in the Security Monitoring
    // Alert queue — no SLA (and it is on No SLA in Autotask anyway).
    expect(isSlaReportableTicket({
      slaId: 2, source: 2, queueId: SECURITY_ALERT, queueLabel: 'Security Monitoring Alert',
      assignedResourceId: 29682935,
    })).toBe(false);
  });
});
