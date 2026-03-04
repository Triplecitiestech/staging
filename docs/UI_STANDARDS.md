# UI Standards

## Core Principle: No Success Without Confirmation

The UI must **never** display "created", "saved", or "success" unless the backend has confirmed persistence and returned:
- An `id` (the persisted record's identifier)
- A canonical `url` (where the record can be viewed)
- A `requestId` for traceability

If the backend returns an error or the request times out, the UI must show the error clearly and never navigate away from the form.

## Form Patterns

### Submit Flow

1. User clicks submit → button shows spinner + "Creating..." text, form inputs disabled
2. `fetch()` fires to the API route
3. On **success** (`response.ok` + `data.success === true`):
   - Show inline success banner (green) with the record name
   - Navigate to the list/detail page after 1s delay
4. On **error** (`!response.ok` OR `data.success === false`):
   - Show inline error banner (red) with `data.error` message
   - Keep form data intact — user can fix and retry
   - Include `requestId` in error display for support reference
5. On **timeout** (no response within 25s):
   - Show timeout message with retry button
   - Do NOT show success

### Validation

- Required fields marked with `*` in label
- Client-side validation before submit (HTML5 `required`, type checks)
- Server-side validation always authoritative
- Display server validation errors inline next to fields when possible

## Loading States

### Buttons
- Disabled during submission
- Text changes to present participle: "Create" → "Creating..."
- No double-click / double-submit possible (disabled state + dedup)

### Pages
- Show skeleton or spinner while data loads
- Never show empty state before data has been fetched
- Timeout after 10s → show "Taking longer than expected, please refresh"

### AI Operations
- Show animated typing indicator (bouncing dots)
- Display elapsed time after 5s: "Still working... (8s)"
- Hard timeout at 25s → show error with retry option

## Error States

### Inline Errors (Forms)
```
┌─────────────────────────────────────────────┐
│ ⚠ Failed to create company: duplicate slug  │
│ Request ID: abc-123 — Contact support if    │
│ this persists.                    [Dismiss]  │
└─────────────────────────────────────────────┘
```

### Page-Level Errors (Error Boundary)
```
┌─────────────────────────────────────────────┐
│          Something went wrong               │
│                                             │
│   We hit an unexpected error. Our team has  │
│   been notified.                            │
│                                             │
│   Error: [brief message]                    │
│   Request ID: [if available]                │
│                                             │
│   [Try Again]    [Go to Dashboard]          │
└─────────────────────────────────────────────┘
```

### Empty States
- Always show a helpful message: "No companies yet. Create your first one."
- Include a CTA button linking to the create page

## Table Layout Rules

### Alignment
- **Text columns**: left-aligned
- **Number columns**: right-aligned
- **Status badges**: center-aligned
- **Action buttons**: right-aligned, last column

### Sizing
- Tables are full-width within their container
- Minimum column widths to prevent text wrapping on key fields (name, status)
- Action column: fixed width, does not shrink

### Responsive
- On small screens: tables become card layouts
- Priority columns (name, status, actions) always visible
- Secondary columns hidden on mobile

### Pagination
- Default: 20 items per page
- Show total count: "Showing 1-20 of 47"
- Previous / Next navigation

## Color Palette (Admin)

| Element | Color | Tailwind |
|---------|-------|----------|
| Background | Dark slate | `bg-slate-900` |
| Card | Slate with glass | `bg-slate-800/80 backdrop-blur` |
| Primary action | Cyan gradient | `from-cyan-500 to-cyan-600` |
| AI/Creative | Purple gradient | `from-purple-500 to-indigo-600` |
| Success | Green | `text-green-400`, `bg-green-500/10` |
| Error | Red | `text-red-400`, `bg-red-500/10` |
| Warning | Amber | `text-amber-400` |
| Border | White 10-20% | `border-white/10` |

## Component Conventions

- All admin forms use the `bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-6` container pattern
- Inputs use `bg-slate-900/50 border-white/20 rounded-lg text-white placeholder-slate-400 focus:ring-cyan-500`
- Labels use `text-sm font-medium text-slate-200 mb-2`
- Cancel buttons: ghost style (`border-white/20, hover:bg-white/10`)
- Submit buttons: filled gradient
