import { describe, it, expect } from 'vitest';
import {
  formatMinutes,
  isResolvedStatus,
  isWaitingCustomerStatus,
  PRIORITY_LABELS,
  mapAutotaskLabelToCustomerStatus,
  resolveCustomerStatusLabel,
  CUSTOMER_CORRESPONDENCE_NOTE_TYPES,
  isCustomerVisibleTicketNote,
  customerReplyTitle,
  parseCustomerReplyAuthor,
  resolveCustomerNoteAuthor,
  portalMayAccessTicket,
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

  it('treats custom statuses with resolved-sounding labels as resolved', () => {
    // Custom instance statuses get NEW picklist IDs — the label is authoritative
    expect(isResolvedStatus(99, 'Complete - No Notify')).toBe(true);
    expect(isResolvedStatus(99, 'Completed')).toBe(true);
    expect(isResolvedStatus(99, 'Closed by Customer')).toBe(true);
    expect(isResolvedStatus(99, 'Cancelled')).toBe(true);
  });

  it('does not treat open-sounding labels as resolved', () => {
    expect(isResolvedStatus(99, 'In Progress')).toBe(false);
    expect(isResolvedStatus(99, 'Waiting Customer')).toBe(false);
    expect(isResolvedStatus(99, 'Billing Reconciliation')).toBe(false);
    expect(isResolvedStatus(99, 'Need to Order Materials')).toBe(false);
    expect(isResolvedStatus(99, null)).toBe(false);
  });

  it('resolved status IDs win regardless of label', () => {
    expect(isResolvedStatus(5, 'In Progress')).toBe(true);
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

// ---------------------------------------------------------------------------
// Customer-visible notes. Fixtures are the real shapes read from ticket 35699
// (T20260908.0006) on 2026-09-13, where the old publish === 3 filter showed the
// customer 0 of 30 notes.
// ---------------------------------------------------------------------------

const PORTAL_API_RESOURCE = 29682943; // "TCT Customer Portal"
const JOE_CONTACT = 30683690;
const CORRESPONDENCE = new Set(CUSTOMER_CORRESPONDENCE_NOTE_TYPES.map(t => t.fallbackId));

const ticket35699 = {
  portalReply: { publish: 1, noteType: 1, creatorResourceID: PORTAL_API_RESOURCE, createdByContactID: null, title: 'Customer Reply from Joe Cronk' },
  emailReply: { publish: 1, noteType: 1, creatorResourceID: null, createdByContactID: JOE_CONTACT, title: '- Your support request has been updated | Datto EDR Isolation Alerts' },
  techMessage: { publish: 1, noteType: 3, creatorResourceID: 29682939, createdByContactID: null, title: 'Hi Joe, I wanted to follow up' },
  internalHandoff: { publish: 2, noteType: 1, creatorResourceID: 29682885, createdByContactID: null, title: 'Handoff for Ben' },
  serviceDeskNotification: { publish: 4, noteType: 2, creatorResourceID: 29682938, createdByContactID: null, title: 'Service Desk Notification' },
  workflowRuleSlaBreach: { publish: 1, noteType: 13, creatorResourceID: 4, createdByContactID: null, title: 'Workflow Rule "SLA Event: Breached" fired.' },
  workflowActionNag: { publish: 1, noteType: 91, creatorResourceID: 4, createdByContactID: null, title: 'Please look at this ticket' },
};

describe('isCustomerVisibleTicketNote', () => {
  it('shows the customer their own portal replies — the reported defect', () => {
    expect(isCustomerVisibleTicketNote(ticket35699.portalReply, CORRESPONDENCE)).toBe(true);
  });

  it('shows email-ingested replies and technician messages sent to the customer', () => {
    expect(isCustomerVisibleTicketNote(ticket35699.emailReply, CORRESPONDENCE)).toBe(true);
    expect(isCustomerVisibleTicketNote(ticket35699.techMessage, CORRESPONDENCE)).toBe(true);
  });

  it('hides internal notes (publish 2 and 4)', () => {
    expect(isCustomerVisibleTicketNote(ticket35699.internalHandoff, CORRESPONDENCE)).toBe(false);
    expect(isCustomerVisibleTicketNote(ticket35699.serviceDeskNotification, CORRESPONDENCE)).toBe(false);
  });

  it('hides Autotask workflow-rule notes even though they carry publish 1', () => {
    // These bodies name staff email addresses and SLA-breach warnings. Fixing
    // the publish number alone would have shown them to customers.
    expect(isCustomerVisibleTicketNote(ticket35699.workflowRuleSlaBreach, CORRESPONDENCE)).toBe(false);
    expect(isCustomerVisibleTicketNote(ticket35699.workflowActionNag, CORRESPONDENCE)).toBe(false);
  });

  it('fails closed on publish values it cannot classify, including the old 3', () => {
    for (const publish of [3, 0, 99, null, undefined]) {
      expect(isCustomerVisibleTicketNote({ ...ticket35699.portalReply, publish }, CORRESPONDENCE)).toBe(false);
    }
  });

  it('fails closed on a note type outside the correspondence list, or none', () => {
    expect(isCustomerVisibleTicketNote({ ...ticket35699.portalReply, noteType: 999 }, CORRESPONDENCE)).toBe(false);
    expect(isCustomerVisibleTicketNote({ ...ticket35699.portalReply, noteType: null }, CORRESPONDENCE)).toBe(false);
  });

  it('hides notes with no human author', () => {
    expect(
      isCustomerVisibleTicketNote({ ...ticket35699.portalReply, creatorResourceID: null, createdByContactID: null }, CORRESPONDENCE)
    ).toBe(false);
  });

  it('the correspondence list excludes every workflow and system note type', () => {
    const labels = CUSTOMER_CORRESPONDENCE_NOTE_TYPES.map(t => t.label.toLowerCase());
    for (const banned of ['workflow', 'merged', 'absorbed', 'copied', 'duplicate', 'survey', 'rmm', 'bdr', 'forward']) {
      expect(labels.some(l => l.includes(banned))).toBe(false);
    }
  });
});

describe('customer reply titles and authorship', () => {
  it('round-trips the title the reply route writes', () => {
    expect(parseCustomerReplyAuthor(customerReplyTitle('Joe Cronk'))).toBe('Joe Cronk');
  });

  it('does not treat other titles as portal replies', () => {
    expect(parseCustomerReplyAuthor('Handoff for Ben')).toBeNull();
    expect(parseCustomerReplyAuthor('Customer Reply from ')).toBeNull();
    expect(parseCustomerReplyAuthor(null)).toBeNull();
    expect(parseCustomerReplyAuthor('Reply from Kurtis Florance (Triple Cities Tech, viewing as Joe Cronk)')).toBeNull();
  });

  it('attributes an already-written portal reply to the customer, not the portal account', () => {
    expect(resolveCustomerNoteAuthor(ticket35699.portalReply, 'TCT Customer Portal')).toEqual({
      author: 'Joe Cronk',
      authorType: 'customer',
    });
  });

  it('a contact id makes a note the customer\'s even when a resource id is also stamped', () => {
    const note = { ...ticket35699.portalReply, createdByContactID: JOE_CONTACT };
    expect(resolveCustomerNoteAuthor(note, 'TCT Customer Portal').authorType).toBe('customer');
    expect(resolveCustomerNoteAuthor(ticket35699.emailReply, undefined)).toEqual({ author: 'Customer', authorType: 'customer' });
  });

  it('technician notes show the technician, or Triple Cities Tech when the name is unknown', () => {
    expect(resolveCustomerNoteAuthor(ticket35699.techMessage, 'Benjamin Miguel')).toEqual({
      author: 'Benjamin Miguel',
      authorType: 'technician',
    });
    expect(resolveCustomerNoteAuthor(ticket35699.techMessage, undefined).author).toBe('Triple Cities Tech');
  });
});

describe('portalMayAccessTicket', () => {
  const ECOSPECT = 287;
  const manager = { autotaskCompanyId: ECOSPECT, isManager: true, autotaskContactId: 111 };
  const user = { autotaskCompanyId: ECOSPECT, isManager: false, autotaskContactId: JOE_CONTACT };

  it('refuses another company\'s ticket, for managers too', () => {
    expect(portalMayAccessTicket({ companyID: 398, contactID: JOE_CONTACT }, manager)).toBe(false);
    expect(portalMayAccessTicket({ companyID: 398, contactID: JOE_CONTACT }, user)).toBe(false);
  });

  it('lets a manager open any ticket in their company', () => {
    expect(portalMayAccessTicket({ companyID: ECOSPECT, contactID: 999 }, manager)).toBe(true);
  });

  it('lets a non-manager open only tickets they are the contact on', () => {
    expect(portalMayAccessTicket({ companyID: ECOSPECT, contactID: JOE_CONTACT }, user)).toBe(true);
    expect(portalMayAccessTicket({ companyID: ECOSPECT, contactID: 999 }, user)).toBe(false);
    expect(portalMayAccessTicket({ companyID: ECOSPECT, contactID: null }, user)).toBe(false);
  });

  it('refuses a non-manager with no linked contact, like the ticket list does', () => {
    expect(portalMayAccessTicket({ companyID: ECOSPECT, contactID: JOE_CONTACT }, { ...user, autotaskContactId: null })).toBe(false);
  });

  it('refuses a ticket with no company id', () => {
    expect(portalMayAccessTicket({ companyID: null, contactID: JOE_CONTACT }, manager)).toBe(false);
  });
});
