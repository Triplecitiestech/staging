'use client';

import { useState } from 'react';
import type { TicketDetailProps, UnifiedTicketNote } from '@/types/tickets';
import { formatMinutes } from '@/lib/tickets/utils';
import TimelineEntry from './TimelineEntry';
import TicketNoteToggle from './TicketNoteToggle';
import TicketReplyForm from './TicketReplyForm';

export default function TicketDetail({
  ticket,
  notes,
  perspective,
  noteVisibility,
  onNoteVisibilityChange,
  onBack,
  loading = false,
  companySlug,
  onReplySent,
}: TicketDetailProps) {
  const isStaff = perspective === 'staff';
  const isCustomer = perspective === 'customer';
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
              <span className="text-white">{ticket.assignedTo}</span>
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
          <div className="mt-3 bg-slate-700/50 border border-white/10 rounded-lg px-4 py-3">
            <p className="text-xs font-semibold text-cyan-400 uppercase mb-1">Description</p>
            <p className="text-sm text-gray-300 whitespace-pre-wrap">{ticket.description}</p>
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
      <div className="space-y-0 relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-700" />

        {/* Created marker */}
        <div className="relative pl-10 pb-4">
          <div className="absolute left-2.5 w-3 h-3 bg-cyan-500 rounded-full border-2 border-gray-800" />
          <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-4 py-3">
            <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
              <span className="text-xs font-semibold text-cyan-400">Ticket Created</span>
              <span className="text-xs text-gray-500">
                {new Date(ticket.createDate).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <p className="text-sm text-gray-300">{ticket.title}</p>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="relative pl-10 pb-4">
            <div className="absolute left-2.5 w-3 h-3 bg-gray-600 rounded-full border-2 border-gray-800 animate-pulse" />
            <p className="text-sm text-gray-500">Loading communications...</p>
          </div>
        )}

        {/* Timeline entries */}
        {!loading && !showAllEntries && hasMiddleEntries && displayedEntries.length > 0 && (
          <>
            <TimelineEntry entry={displayedEntries[0]} perspective={perspective} />
            <div className="relative pl-10 pb-4">
              <div className="absolute left-2.5 w-3 h-3 bg-gray-600 rounded-full border-2 border-gray-800" />
              <button
                onClick={() => setShowAllEntries(true)}
                className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
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

        {!loading && visibleNotes.length === 0 && (
          <div className="relative pl-10 pb-4">
            <div className="absolute left-2.5 w-3 h-3 bg-gray-600 rounded-full border-2 border-gray-800" />
            <p className="text-sm text-gray-500">No communications yet.</p>
          </div>
        )}

        {/* Resolved marker */}
        {ticket.completedDate && (
          <div className="relative pl-10 pb-4">
            <div className="absolute left-2.5 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-800" />
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
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
              <p className="text-sm text-gray-300">This ticket has been completed and closed.</p>
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
