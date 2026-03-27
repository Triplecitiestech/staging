'use client';

import { useState } from 'react';
import type { TicketDetailProps, UnifiedTicketNote } from '@/types/tickets';
import { formatMinutes } from '@/lib/tickets/utils';
import TimelineEntry from './TimelineEntry';
import TicketNoteToggle from './TicketNoteToggle';
import TicketReplyForm from './TicketReplyForm';
import { useDemoMode } from '@/components/admin/DemoModeProvider';

export default function TicketDetail({
  ticket,
  notes,
  perspective,
  noteVisibility,
  onNoteVisibilityChange,
  onBack,
  loading = false,
  notesError,
  companySlug,
  onReplySent,
}: TicketDetailProps) {
  const isStaff = perspective === 'staff';
  const isCustomer = perspective === 'customer';
  const demo = useDemoMode();
  const [showAllEntries, setShowAllEntries] = useState(false);

  // Filter notes client-side based on visibility (for staff toggle)
  const visibleNotes = notes;

  // Show first + last with expand for middle entries
  const hasMiddleEntries = visibleNotes.length > 2;
  const displayedEntries =
    showAllEntries || !hasMiddleEntries
      ? visibleNotes
      : [visibleNotes[0], visibleNotes[visibleNotes.length - 1]].filter(Boolean);

  return (
    <div className="bg-gray-800/50 border border-white/10 rounded-lg p-6">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors mb-4 text-sm"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {isCustomer ? 'Back to Dashboard' : 'Back'}
      </button>

      {/* Ticket header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h3 className="text-xl font-bold text-white">{ticket.title}</h3>
          <span
            className={`px-2.5 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${
              ticket.isResolved
                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
            }`}
          >
            {ticket.isResolved ? 'Closed' : 'Open'}
          </span>
        </div>
        <p className="text-sm text-gray-400">Ticket #{ticket.ticketNumber}</p>

        {/* Staff metadata row */}
        {isStaff && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm mt-3">
            <div>
              <span className="text-slate-500">Assigned:</span>{' '}
              <span className="text-white">{demo.person(ticket.assignedTo)}</span>
            </div>
            {ticket.autotaskUrl && (
              <div>
                <a
                  href={ticket.autotaskUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:text-cyan-300 hover:underline text-xs"
                >
                  Open in Autotask &rarr;
                </a>
              </div>
            )}
            <div>
              <span className="text-slate-500">Created:</span>{' '}
              <span className="text-white">{new Date(ticket.createDate).toLocaleString()}</span>
            </div>
            {ticket.completedDate && (
              <div>
                <span className="text-slate-500">Completed:</span>{' '}
                <span className="text-white">{new Date(ticket.completedDate).toLocaleString()}</span>
              </div>
            )}
            {ticket.firstResponseMinutes !== null && (
              <div>
                <span className="text-slate-500">First Response:</span>{' '}
                <span className="text-white">{formatMinutes(ticket.firstResponseMinutes)}</span>
              </div>
            )}
            {ticket.resolutionMinutes !== null && (
              <div>
                <span className="text-slate-500">Resolution:</span>{' '}
                <span className="text-white">{formatMinutes(ticket.resolutionMinutes)}</span>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        {ticket.description && (
          <div className="mt-3 bg-slate-700/50 border border-white/10 rounded-lg px-4 py-3 overflow-hidden">
            <p className="text-xs font-semibold text-cyan-400 uppercase mb-1">Description</p>
            <p className="text-sm text-gray-300 whitespace-pre-wrap break-words overflow-hidden">{ticket.description}</p>
          </div>
        )}
      </div>

      {/* Note visibility toggle (staff only) */}
      {isStaff && onNoteVisibilityChange && (
        <div className="mb-4">
          <TicketNoteToggle visibility={noteVisibility} onChange={onNoteVisibilityChange} />
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line — drawn behind all items, from first dot to last dot center.
            Each non-last row draws a line segment from its dot center down through the gap. */}

        {/* Created marker */}
        <div className="relative pl-10 pb-4">
          {/* Line segment: from this dot center down to bottom of row (connects to next item) */}
          <div className="absolute left-[15px] top-1/2 bottom-0 w-px bg-gray-700/60" />
          {/* Dot centered vertically — bottom-4 excludes pb-4 gap from centering */}
          <div className="absolute left-0 top-0 bottom-4 flex items-center" style={{ width: '2rem' }}>
            <div className="mx-auto w-3 h-3 bg-gray-600 rounded-full border-2 border-gray-800 relative z-10" />
          </div>
          <div className="bg-slate-700/40 border border-white/5 rounded-lg px-4 py-2.5">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <span className="text-xs font-medium text-gray-400">Ticket Created</span>
              <span className="text-xs text-gray-600">
                {new Date(ticket.createDate).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="relative pl-10 pb-4">
            <div className="absolute left-[15px] top-0 bottom-0 w-px bg-gray-700/60" />
            <div className="absolute left-0 top-0 bottom-4 flex items-center" style={{ width: '2rem' }}>
              <div className="mx-auto w-3 h-3 bg-gray-600 rounded-full border-2 border-gray-800 animate-pulse relative z-10" />
            </div>
            <p className="text-sm text-gray-500 py-2">Loading communications...</p>
          </div>
        )}

        {/* Error */}
        {!loading && notesError && (
          <div className="relative pl-10 pb-4">
            <div className="absolute left-[15px] top-0 bottom-0 w-px bg-gray-700/60" />
            <div className="absolute left-0 top-0 bottom-4 flex items-center" style={{ width: '2rem' }}>
              <div className="mx-auto w-3 h-3 bg-rose-500 rounded-full border-2 border-gray-800 relative z-10" />
            </div>
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg px-4 py-3">
              <p className="text-sm text-rose-400">Failed to load notes: {notesError}</p>
              <p className="text-xs text-rose-300/60 mt-1">The ticket notes sync may need to be run. Check reporting sync status.</p>
            </div>
          </div>
        )}

        {/* Timeline entries */}
        {!loading && !showAllEntries && hasMiddleEntries && displayedEntries.length > 0 && (
          <>
            <TimelineEntry entry={displayedEntries[0]} perspective={perspective} />
            <div className="relative pl-10 pb-4">
              <div className="absolute left-[15px] top-0 bottom-0 w-px bg-gray-700/60" />
              <div className="absolute left-0 top-0 bottom-4 flex items-center" style={{ width: '2rem' }}>
                <div className="mx-auto w-3 h-3 bg-gray-600 rounded-full border-2 border-gray-800 relative z-10" />
              </div>
              <button
                onClick={() => setShowAllEntries(true)}
                className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors py-2"
              >
                Show conversation history ({visibleNotes.length - 2} more{' '}
                {visibleNotes.length - 2 === 1 ? 'entry' : 'entries'})
              </button>
            </div>
            {displayedEntries.length > 1 && (
              <TimelineEntry
                entry={displayedEntries[displayedEntries.length - 1]}
                perspective={perspective}
              />
            )}
          </>
        )}

        {!loading && (showAllEntries || !hasMiddleEntries) &&
          visibleNotes.map(entry => (
            <TimelineEntry key={entry.id} entry={entry} perspective={perspective} />
          ))}

        {!loading && visibleNotes.length === 0 && !ticket.completedDate && (
          <div className="relative pl-10 pb-4">
            <div className="absolute left-[15px] top-0 bottom-0 w-px bg-gray-700/60" />
            <div className="absolute left-0 top-0 bottom-4 flex items-center" style={{ width: '2rem' }}>
              <div className="mx-auto w-3 h-3 bg-gray-600 rounded-full border-2 border-gray-800 relative z-10" />
            </div>
            <p className="text-sm text-gray-400 py-2">
              Updates from our team will appear here.
            </p>
          </div>
        )}

        {!loading && visibleNotes.length === 0 && ticket.completedDate && (
          <div className="relative pl-10 pb-4">
            <div className="absolute left-[15px] top-0 bottom-0 w-px bg-gray-700/60" />
            <div className="absolute left-0 top-0 bottom-4 flex items-center" style={{ width: '2rem' }}>
              <div className="mx-auto w-3 h-3 bg-gray-600 rounded-full border-2 border-gray-800 relative z-10" />
            </div>
            <p className="text-sm text-gray-400 py-2">
              This request was completed automatically. No additional communication was needed.
            </p>
          </div>
        )}

        {/* Last item — NO line below the dot */}
        {ticket.completedDate ? (
          <div className="relative pl-10">
            {/* Line segment: only from top to dot center (no trailing line below) */}
            <div className="absolute left-[15px] top-0 bottom-1/2 w-px bg-gray-700/60" />
            <div className="absolute left-0 top-0 bottom-0 flex items-center" style={{ width: '2rem' }}>
              <div className="mx-auto w-3 h-3 bg-green-500 rounded-full border-2 border-gray-800 ring-2 ring-green-500/20 relative z-10" />
            </div>
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2.5">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="text-xs font-semibold text-green-400">Ticket Resolved</span>
                <span className="text-xs text-gray-500">
                  {new Date(ticket.completedDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative pl-10">
            {/* Line segment: only from top to dot center (no trailing line below) */}
            <div className="absolute left-[15px] top-0 bottom-1/2 w-px bg-gray-700/60" />
            <div className="absolute left-0 top-0 bottom-0 flex items-center" style={{ width: '2rem' }}>
              <div className="mx-auto w-3 h-3 bg-cyan-500 rounded-full border-2 border-gray-800 ring-2 ring-cyan-500/20 relative z-10" />
            </div>
            <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-lg px-4 py-2.5">
              <span className="text-xs font-medium text-cyan-400">Open</span>
            </div>
          </div>
        )}
      </div>

      {/* Reply form (customer only, open tickets only) */}
      {isCustomer && !ticket.completedDate && companySlug && onReplySent && (
        <TicketReplyForm
          ticketId={ticket.ticketId}
          companySlug={companySlug}
          onReplySent={onReplySent}
        />
      )}
    </div>
  );
}
