/**
 * Locks the HUMAN vs AUTOMATED ticket classification rule — the single
 * classifier every reporting surface uses. Grounded in live Autotask data
 * (Tri-Bros Transportation, June 2026): ~34 auto-generated monitoring tickets
 * (source 8, unassigned, auto-resolved) and ~11 real support tickets, plus
 * the confirmed misfiled ticket 34477 (source 8 but human-worked).
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  classifyTicket,
  isAutomatedTicket,
  isHumanTicket,
  splitByClassification,
  isAutomatedSource,
  isAlertQueue,
  getAutomatedSourceIds,
  getAlertQueueIds,
  updateTicketClassificationFromPicklists,
  resetTicketClassificationCache,
  automatedTicketSqlCondition,
  humanTicketSqlCondition,
  classifyMonitoringEvent,
} from './ticket-classification';

afterEach(() => resetTicketClassificationCache());

const HELP_DESK_QUEUE = 29683490;
const SECURITY_ALERT_QUEUE = 29683494;

describe('classifyTicket — primary source rule', () => {
  it('classifies every interactive source as human', () => {
    // Live TCT source picklist: all active non-monitoring sources.
    const interactiveSources = [-2, -1, 1, 2, 4, 5, 6, 11, 12, 14, 15];
    for (const source of interactiveSources) {
      expect(classifyTicket({ source, assignedResourceId: null })).toBe('human');
    }
  });

  it('classifies an unassigned source-8 alert ticket as automated', () => {
    // The typical SaaS Alerts / Datto EDR auto-ticket: source 8, no assignee,
    // Security Monitoring Alert queue, auto-resolved.
    expect(classifyTicket({
      source: 8,
      sourceLabel: 'Monitoring Alert',
      queueId: SECURITY_ALERT_QUEUE,
      queueLabel: 'Security Monitoring Alert',
      assignedResourceId: null,
      hoursLogged: 0,
    })).toBe('automated');
  });

  it('treats a null source as human — never hide possibly-real work', () => {
    expect(classifyTicket({ source: null, assignedResourceId: null })).toBe('human');
    expect(classifyTicket({ source: undefined, assignedResourceId: null })).toBe('human');
  });

  it('falls back to the source label when the id is unrecognized', () => {
    expect(classifyTicket({ source: 999, sourceLabel: 'Monitoring Alert', assignedResourceId: null })).toBe('automated');
    expect(classifyTicket({ source: 999, sourceLabel: 'Phone', assignedResourceId: null })).toBe('human');
  });
});

describe('classifyTicket — misfile rescue (dirty source data)', () => {
  it('rescues ticket 34477: source 8 but assigned and worked in Help Desk', () => {
    // Confirmed live: "PENDING LOAD DOCS MOVED" — a real customer request
    // misfiled as source 8. Assigned + non-alert queue → HUMAN.
    expect(classifyTicket({
      source: 8,
      queueId: HELP_DESK_QUEUE,
      queueLabel: 'Help Desk',
      assignedResourceId: 29682938,
    })).toBe('human');
  });

  it('rescues an assigned alert-queue ticket only when real time was logged', () => {
    const base = {
      source: 8,
      queueId: SECURITY_ALERT_QUEUE,
      queueLabel: 'Security Monitoring Alert',
      assignedResourceId: 29682938,
    };
    expect(classifyTicket({ ...base, hoursLogged: 0.5 })).toBe('human');
    expect(classifyTicket({ ...base, hoursLogged: 0 })).toBe('automated');
    expect(classifyTicket({ ...base, hoursLogged: null })).toBe('automated');
    expect(classifyTicket({ ...base })).toBe('automated'); // time unknown
  });

  it('never rescues an unassigned source-8 ticket, regardless of queue or time', () => {
    expect(classifyTicket({
      source: 8,
      queueId: HELP_DESK_QUEUE,
      queueLabel: 'Help Desk',
      assignedResourceId: null,
      hoursLogged: 2,
    })).toBe('automated');
  });

  it('catches ticket 34369: default source ("Phone") on an unassigned alert-queue ticket', () => {
    // Confirmed live: "CLI - User Created on TBT-015…" — a RocketCyber SOC
    // alert whose integration never set the source, so Autotask stamped the
    // default (2 = Phone). Unassigned + alert queue + no time → AUTOMATED.
    expect(classifyTicket({
      source: 2,
      sourceLabel: 'Phone',
      queueId: SECURITY_ALERT_QUEUE,
      queueLabel: 'Security Monitoring Alert',
      assignedResourceId: null,
    })).toBe('automated');
  });

  it('keeps a human-source alert-queue ticket human once a person is on it', () => {
    // Ticket 34221 "BitTorrent - outbound connection…": source 2 in the
    // Security Monitoring Alert queue but ASSIGNED — a tech worked it.
    expect(classifyTicket({
      source: 2,
      queueId: SECURITY_ALERT_QUEUE,
      queueLabel: 'Security Monitoring Alert',
      assignedResourceId: 29682935,
    })).toBe('human');
    // Unassigned but with real logged time also stays human.
    expect(classifyTicket({
      source: 4,
      queueId: SECURITY_ALERT_QUEUE,
      assignedResourceId: null,
      hoursLogged: 0.25,
    })).toBe('human');
  });
});

describe('helpers', () => {
  it('isAutomatedSource / isAlertQueue match the TCT defaults', () => {
    expect(isAutomatedSource(8)).toBe(true);
    expect(isAutomatedSource(2)).toBe(false);
    expect(isAutomatedSource(null)).toBe(false);
    expect(isAlertQueue(8)).toBe(true);
    expect(isAlertQueue(29683494)).toBe(true);
    expect(isAlertQueue(29683495)).toBe(true);
    expect(isAlertQueue(29683496)).toBe(true);
    expect(isAlertQueue(HELP_DESK_QUEUE)).toBe(false);
    expect(isAlertQueue(null, 'Backup Monitoring Alert')).toBe(true);
  });

  it('isAutomatedTicket / isHumanTicket agree with classifyTicket', () => {
    const auto = { source: 8, assignedResourceId: null };
    const human = { source: 2, assignedResourceId: null };
    expect(isAutomatedTicket(auto)).toBe(true);
    expect(isHumanTicket(auto)).toBe(false);
    expect(isAutomatedTicket(human)).toBe(false);
    expect(isHumanTicket(human)).toBe(true);
  });

  it('splitByClassification partitions the June 2026 shape correctly', () => {
    const tickets = [
      // 3 automated alerts
      { id: 'a1', source: 8, queueId: SECURITY_ALERT_QUEUE, assignedResourceId: null },
      { id: 'a2', source: 8, queueId: SECURITY_ALERT_QUEUE, assignedResourceId: null },
      { id: 'a3', source: 8, queueId: 29683496, queueLabel: 'Backup Monitoring Alert', assignedResourceId: null },
      // 2 real support tickets
      { id: 'h1', source: 2, queueId: HELP_DESK_QUEUE, assignedResourceId: 1 },
      { id: 'h2', source: 4, queueId: HELP_DESK_QUEUE, assignedResourceId: 2 },
      // the misfiled one
      { id: 'h3', source: 8, queueId: HELP_DESK_QUEUE, assignedResourceId: 3 },
    ];
    const { human, automated } = splitByClassification(tickets);
    expect(automated.map(t => t.id)).toEqual(['a1', 'a2', 'a3']);
    expect(human.map(t => t.id)).toEqual(['h1', 'h2', 'h3']);
  });
});

describe('picklist cache updates', () => {
  it('refreshes ids from live picklist labels and survives empty fetches', () => {
    updateTicketClassificationFromPicklists({
      source: [
        { value: '8', label: 'Monitoring Alert', isActive: true },
        { value: '99', label: 'RMM Monitoring', isActive: true },
        { value: '2', label: 'Phone', isActive: true },
      ],
      queue: [
        { value: '777', label: 'Security Monitoring Alerts', isActive: true },
        { value: '29683490', label: 'Help Desk', isActive: true },
      ],
    });
    expect(getAutomatedSourceIds()).toEqual([8, 99]);
    expect(getAlertQueueIds()).toEqual([777]);

    // A failed/partial picklist fetch must not blank the classification.
    updateTicketClassificationFromPicklists({ source: [], queue: [] });
    expect(getAutomatedSourceIds()).toEqual([8, 99]);
    expect(getAlertQueueIds()).toEqual([777]);
  });
});

describe('SQL predicates mirror the TS classifier', () => {
  it('encodes the same rule, including the reverse rescue for default-source alerts', () => {
    const sql = automatedTicketSqlCondition('t');
    expect(sql).toContain('t.source IN (8)');
    expect(sql).toContain('t."assignedResourceId" IS NULL');
    expect(sql).toContain('t."queueId" IN (8, 29683494, 29683495, 29683496)');
    expect(sql).toContain('te_cls."hoursWorked" > 0');
    // Reverse rescue branch: NOT automated-source AND alert queue AND unassigned AND no time
    expect(sql).toMatch(/OR \(NOT \(t\.source IS NOT NULL AND t\.source IN \(8\)\)/);
  });

  it('null-guards every atom so the negated (human) condition is two-valued', () => {
    const sql = automatedTicketSqlCondition('t');
    expect(sql).toContain('t.source IS NOT NULL AND');
    expect(sql).toContain('t."queueId" IS NOT NULL AND');
    expect(humanTicketSqlCondition('t')).toBe(`(NOT ${sql})`);
  });
});

describe('classifyMonitoringEvent — breakdown for the monitoring section', () => {
  it('groups the confirmed June 2026 titles by platform', () => {
    expect(classifyMonitoringEvent({ title: 'File Event - Opened [Outside Approved Location]' })).toBe('saas-identity');
    expect(classifyMonitoringEvent({ title: 'File Download Limit Exceeded' })).toBe('saas-identity');
    expect(classifyMonitoringEvent({ title: 'scott@example.com/File Delete Limit Exceeded' })).toBe('saas-identity');
    expect(classifyMonitoringEvent({ title: 'asimut@example.com/IAM Event - Multiple Password Reset' })).toBe('saas-identity');
    expect(classifyMonitoringEvent({ title: 'Respond: Stale Account Clean Up' })).toBe('saas-identity');
    expect(classifyMonitoringEvent({ title: 'Datto EDR SYSTEM/Endpoint Device - Monitoring event' })).toBe('endpoint');
    expect(classifyMonitoringEvent({ title: 'CLI - User Created on TBT-015 for Tri-Bros Transportation (Managed SOC) - 119411' })).toBe('endpoint');
  });

  it('falls back to the queue for network/backup alerts', () => {
    expect(classifyMonitoringEvent({ title: 'Device offline', queueLabel: 'Network Monitoring Alert' })).toBe('network');
    expect(classifyMonitoringEvent({ title: 'Job failed', queueLabel: 'Backup Monitoring Alert' })).toBe('backup');
    expect(classifyMonitoringEvent({ title: 'Something else', queueLabel: 'Security Monitoring Alert' })).toBe('other');
  });
});
