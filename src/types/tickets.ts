/**
 * Unified Ticket Type System
 *
 * Shared interfaces for ticket display across all views.
 * Both the customer portal (live Autotask API) and admin reporting (local DB)
 * transform their data into these types before rendering.
 */

// ================================================
// Perspective — controls what data is visible
// ================================================
export type TicketPerspective = 'staff' | 'customer';

// ================================================
// Autotask note publish values
// ================================================
export const NOTE_PUBLISH = {
  ALL_AUTOTASK_USERS: 1, // Internal — AT staff only
  INTERNAL_ONLY: 2,      // Resources only
  CUSTOMER_PORTAL: 3,    // External — customer-visible
} as const;

export type NotePublishType = (typeof NOTE_PUBLISH)[keyof typeof NOTE_PUBLISH];

// ================================================
// Unified ticket row (table display)
// ================================================
export interface UnifiedTicketRow {
  ticketId: string;
  ticketNumber: string;
  title: string;
  description: string | null;
  status: number;
  statusLabel: string;
  isResolved: boolean;
  priority: number;
  priorityLabel: string;
  assignedTo: string;
  createDate: string; // ISO
  completedDate: string | null;
  // Staff-only (null/0 for customer perspective)
  firstResponseMinutes: number | null;
  resolutionMinutes: number | null;
  hoursLogged: number;
  slaResponseMet: boolean | null;
  slaResolutionMet: boolean | null;
  autotaskUrl: string | null;
}

// ================================================
// Unified ticket note (timeline display)
// ================================================
export interface UnifiedTicketNote {
  id: string;
  type: 'note' | 'time_entry';
  timestamp: string; // ISO
  author: string;
  authorType: 'technician' | 'customer' | 'system';
  content: string;
  title: string | null;
  publishType: NotePublishType | null; // null for time entries
  hoursWorked: number | null;          // time_entry only
  isInternal: boolean;                 // derived from publishType
}

// ================================================
// Note visibility filters (staff toggle state)
// ================================================
export interface NoteVisibilityFilters {
  showExternal: boolean;  // publish=3
  showInternal: boolean;  // publish=1 or 2
  showSystem: boolean;    // no creator
}

export const DEFAULT_STAFF_VISIBILITY: NoteVisibilityFilters = {
  showExternal: true,
  showInternal: true,
  showSystem: false,
};

// Hardcoded — never exposed to UI toggle for customers
export const CUSTOMER_VISIBILITY: NoteVisibilityFilters = {
  showExternal: true,
  showInternal: false,
  showSystem: false,
};

// ================================================
// API response shapes
// ================================================
export interface TicketListResponse {
  tickets: UnifiedTicketRow[];
  totalTickets: number;
  openCount: number;
  resolvedCount: number;
  companyName: string;
  // Staff-only (omitted for customer)
  sla?: {
    responseCompliance: number | null;
    resolutionPlanCompliance: number | null;
    resolutionCompliance: number | null;
    responseSampleSize: number;
    resolutionPlanSampleSize: number;
    resolutionSampleSize: number;
  };
  autotaskWebUrl?: string | null;
  meta?: {
    period: { from: string; to: string };
    generatedAt: string;
  };
}

export interface TicketNotesResponse {
  notes: UnifiedTicketNote[];
  ticketId: string;
}

// ================================================
// Component prop interfaces
// ================================================
export interface TicketTableProps {
  tickets: UnifiedTicketRow[];
  perspective: TicketPerspective;
  onTicketClick: (ticketId: string) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  statusFilter?: 'all' | 'open' | 'resolved';
  onStatusFilterChange?: (value: 'all' | 'open' | 'resolved') => void;
  compact?: boolean;
  maxRows?: number;
  showViewAll?: boolean;
  onViewAll?: () => void;
  loading?: boolean;
  autotaskWebUrl?: string | null;
}

export interface TicketDetailProps {
  ticket: UnifiedTicketRow;
  notes: UnifiedTicketNote[];
  perspective: TicketPerspective;
  noteVisibility: NoteVisibilityFilters;
  onNoteVisibilityChange?: (filters: NoteVisibilityFilters) => void;
  onBack: () => void;
  loading?: boolean;
  notesError?: string | null;
  // Customer-only
  companySlug?: string;
  onReplySent?: () => void;
}

export type SortField =
  | 'ticketNumber'
  | 'priority'
  | 'status'
  | 'assignedTo'
  | 'createDate'
  | 'hoursLogged'
  | 'resolutionMinutes';
export type SortDir = 'asc' | 'desc';
