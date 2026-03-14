# Unified Ticket Display System — Implementation Plan

## Problem

Three different ticket views, zero shared code, inconsistent UX:

1. **Customer Portal** (`CustomerDashboard.tsx`) — fetches live from Autotask API, timeline view
2. **Admin Reporting Board** (`TicketsView.tsx`) — local DB, expandable table rows
3. **Admin Company Detail** (`CompanyDetail.tsx`) — local DB, static table

Same data, different components, different filtering logic, different look.

## Architecture: Two Data Adapters, One Component Set

```
┌─────────────────┐     ┌──────────────────┐
│ Autotask API    │     │ Local DB Cache    │
│ (live, fresh)   │     │ (synced every 2h) │
└────────┬────────┘     └────────┬─────────┘
         │                       │
   ┌─────▼──────┐       ┌───────▼────────┐
   │ Customer   │       │ Staff          │
   │ Adapter    │       │ Adapter        │
   │ (transforms│       │ (transforms    │
   │  AT → UTS) │       │  Prisma → UTS) │
   └─────┬──────┘       └───────┬────────┘
         │                       │
         └───────┬───────────────┘
                 │
         ┌───────▼───────────┐
         │ Unified Type      │
         │ System (UTS)      │
         │ UnifiedTicketRow  │
         │ UnifiedTicketNote │
         └───────┬───────────┘
                 │
    ┌────────────┼─────────────┐
    │            │             │
┌───▼────┐ ┌────▼─────┐ ┌────▼──────┐
│Ticket  │ │Ticket    │ │Ticket     │
│Table   │ │Detail    │ │ReplyForm  │
│        │ │(timeline)│ │(customer) │
└────────┘ └──────────┘ └───────────┘
```

**Key decision**: Customer portal stays on live Autotask API (fresh data, acceptable AT downtime coupling). Admin reporting stays on local DB (handles 930+ tickets with aggregations). Both adapters output identical TypeScript interfaces so components don't care where data came from.

## Shared Types

**New file: `src/types/tickets.ts`**

```typescript
export type TicketPerspective = 'staff' | 'customer';

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
  createDate: string;              // ISO
  completedDate: string | null;
  // Staff-only (null for customer)
  firstResponseMinutes: number | null;
  resolutionMinutes: number | null;
  hoursLogged: number;
  slaResponseMet: boolean | null;
  slaResolutionMet: boolean | null;
  autotaskUrl: string | null;
}

export interface UnifiedTicketNote {
  id: string;
  type: 'note' | 'time_entry';
  timestamp: string;
  author: string;
  authorType: 'technician' | 'customer' | 'system';
  content: string;
  title: string | null;
  publishType: number | null;      // 1=internal, 2=internal-only, 3=external
  hoursWorked: number | null;      // time_entry only
  isInternal: boolean;
}

export interface NoteVisibilityFilters {
  showExternal: boolean;   // publish=3
  showInternal: boolean;   // publish=1 or 2
  showSystem: boolean;     // no creator
}

export const DEFAULT_STAFF_VISIBILITY: NoteVisibilityFilters = {
  showExternal: true,
  showInternal: true,
  showSystem: false,
};

// Hardcoded, never exposed to UI toggle
export const CUSTOMER_VISIBILITY: NoteVisibilityFilters = {
  showExternal: true,
  showInternal: false,
  showSystem: false,
};
```

## Data Adapters

**New file: `src/lib/tickets/adapters.ts`**

### Staff Adapter (local DB → UnifiedTicketRow[])
- Port query logic from `getRealtimeTicketList()` in `realtime-queries.ts`
- Full data: SLA, FRT, hours, Autotask deep links
- Date range filtering, resource filtering

### Customer Adapter (Autotask API → UnifiedTicketRow[])
- Port from existing `/api/customer/tickets/route.ts`
- Calls `AutotaskClient.getCompanyTickets()` live
- Transforms Autotask response → `UnifiedTicketRow[]`
- Strips staff-only fields (FRT, resolution, SLA, hours = null/0)

### Staff Notes Adapter (local DB → UnifiedTicketNote[])
- Port from `/api/reports/tickets/notes/route.ts`
- Returns ALL notes with `publishType` tag
- Also returns time entries from `ticket_time_entries`
- Client-side filtering via `NoteVisibilityFilters` toggles

### Customer Notes Adapter (Autotask API → UnifiedTicketNote[])
- Port from `/api/customer/tickets/timeline/route.ts`
- Calls `getTicketNotes()` and `getTicketTimeEntries()` live
- Server-side enforced: only `publish=3`, never system notes
- Time entries: only those with `summaryNotes` (external-facing)

## Unified API Endpoints

### `GET /api/tickets`

```
Staff:    GET /api/tickets?perspective=staff&companyId=xxx&preset=last_30_days
Customer: GET /api/tickets?perspective=customer&companySlug=ecospect
```

Auth:
- `perspective=staff` → requires Azure AD session
- `perspective=customer` → requires customer session matching slug

Response shape (both perspectives):
```typescript
{
  tickets: UnifiedTicketRow[];
  totalTickets: number;
  openCount: number;
  resolvedCount: number;
  // Staff-only (omitted for customer):
  sla?: { responseCompliance, resolutionCompliance };
}
```

### `GET /api/tickets/[ticketId]/notes`

```
Staff:    GET /api/tickets/12345/notes?perspective=staff
Customer: GET /api/tickets/12345/notes?perspective=customer&companySlug=ecospect
```

Auth: same as above + for customer, verifies ticket belongs to their company.

Response:
```typescript
{
  notes: UnifiedTicketNote[];
  ticketId: string;
}
```

### `POST /api/customer/tickets/reply` (UNCHANGED)

Stays exactly as-is. Writes directly to Autotask API. Customer sees optimistic "Reply sent" message.

## Shared UI Components

All in `src/components/tickets/`.

### `TicketTable.tsx`

Props:
```typescript
{
  tickets: UnifiedTicketRow[];
  perspective: TicketPerspective;
  onTicketClick: (ticketId: string) => void;
  compact?: boolean;       // "Recent Tickets" snippet mode
  maxRows?: number;
  sortable?: boolean;      // default true for staff, false for customer
  loading?: boolean;
}
```

Staff columns: Ticket#, Title, Priority, Status, Assigned, Resolution, Hours, SLA, Created
Customer columns: Ticket#, Title, Priority, Status, Created

UI matches Benjamin Miguel screenshot: search bar, status pills (All/Open/Resolved), sortable headers.
Compact mode matches Customer Dashboard screenshot: no search, no pills, limited rows.

### `TicketDetail.tsx`

Props:
```typescript
{
  ticket: UnifiedTicketRow;
  notes: UnifiedTicketNote[];
  perspective: TicketPerspective;
  noteVisibility: NoteVisibilityFilters;
  onNoteVisibilityChange?: (f: NoteVisibilityFilters) => void;  // staff only
  onBack: () => void;
  companySlug?: string;    // customer only (for reply form)
  loading?: boolean;
}
```

UI matches EcoSpect Portal screenshot: ticket header, description, vertical timeline with colored dots, author attribution, timestamps. For staff: Autotask link, note toggle, SLA data. For customer: reply form.

### `TicketNoteToggle.tsx`

Staff-only. Three pill buttons: `[Internal ✓] [External ✓] [System]`
Default: internal ON, external ON, system OFF.

### `TicketReplyForm.tsx`

Customer-only, open tickets only. Extracted from CustomerDashboard.tsx.
Textarea + send button + optimistic confirmation.

### Helper components (extracted, shared):
- `PriorityBadge.tsx` — color-coded priority pill
- `SlaIndicator.tsx` — Met/Missed/- display
- `TimelineEntry.tsx` — single timeline item with dot, author, content

## Migration Path

### Phase 1: Foundation
- Create `src/types/tickets.ts`
- Create `src/lib/tickets/adapters.ts` (both adapters)
- Create `src/lib/tickets/utils.ts` (shared helpers)
- Create `src/app/api/tickets/route.ts`
- Create `src/app/api/tickets/[ticketId]/notes/route.ts`
- Build + lint ✓

### Phase 2: Components
- Create all `src/components/tickets/*.tsx` files
- Build + lint ✓

### Phase 3: Admin Integration
- Refactor `TicketsView.tsx` → use `<TicketTable perspective="staff" />`
- Refactor `CompanyDetail.tsx` → use `<TicketTable perspective="staff" />` + add expand
- Both get expandable rows with `<TicketDetail perspective="staff" />`
- Build + lint ✓

### Phase 4: Customer Integration
- Refactor `CustomerDashboard.tsx`:
  - Recent Tickets → `<TicketTable perspective="customer" compact maxRows={5} />`
  - Ticket view → `<TicketDetail perspective="customer" />`
- Remove inline TicketTimeline (~200 lines)
- Build + lint ✓

### Phase 5: Cleanup
- Deprecate old endpoints (add console.warn)
- After verification: delete old endpoint files

## Files Created (13)
- `src/types/tickets.ts`
- `src/lib/tickets/adapters.ts`
- `src/lib/tickets/utils.ts`
- `src/app/api/tickets/route.ts`
- `src/app/api/tickets/[ticketId]/notes/route.ts`
- `src/components/tickets/TicketTable.tsx`
- `src/components/tickets/TicketDetail.tsx`
- `src/components/tickets/TicketNoteToggle.tsx`
- `src/components/tickets/TicketReplyForm.tsx`
- `src/components/tickets/TimelineEntry.tsx`
- `src/components/tickets/PriorityBadge.tsx`
- `src/components/tickets/SlaIndicator.tsx`
- `src/components/tickets/index.ts`

## Files Refactored (3)
- `src/components/reporting/TicketsView.tsx`
- `src/components/reporting/CompanyDetail.tsx`
- `src/components/onboarding/CustomerDashboard.tsx`

## Files Deprecated Then Deleted (4)
- `src/app/api/customer/tickets/route.ts`
- `src/app/api/customer/tickets/timeline/route.ts`
- `src/app/api/reports/companies/tickets/route.ts`
- `src/app/api/reports/tickets/notes/route.ts`

## Risk Mitigations

1. **Customer data freshness** — Live Autotask API, no lag. This is by design.
2. **Reply visibility gap** — After customer sends reply via Autotask API, show optimistic "Reply sent" in timeline. The actual note appears on next page refresh (Autotask returns it immediately on the next `getTicketNotes` call).
3. **Internal data leak** — Server-side enforcement: customer adapter never fetches `publish≠3` notes. Field stripping happens in adapter, not UI.
4. **Demo mode** — Check for `contoso-industries` slug early, return `DEMO_TICKETS`/`DEMO_TIMELINE` from `demo-mode.ts`.
5. **Breaking admin reporting** — New `/api/tickets` accepts same query params (`companyId`, `resourceId`, `preset`, `from`, `to`). `parseFiltersFromParams()` reused from `src/lib/reporting/filters.ts`.
