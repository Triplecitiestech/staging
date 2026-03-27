'use client';

import type { UnifiedTicketNote, TicketPerspective } from '@/types/tickets';
import { useDemoMode } from '@/components/admin/DemoModeProvider';

export default function TimelineEntry({
  entry,
  perspective,
}: {
  entry: UnifiedTicketNote;
  perspective: TicketPerspective;
}) {
  const demo = useDemoMode();

  const getAuthorLabel = () => {
    const anonAuthor = demo.person(entry.author);
    if (entry.authorType === 'customer') return perspective === 'customer' ? anonAuthor : `${anonAuthor} (Customer)`;
    if (entry.authorType === 'technician') {
      return perspective === 'customer' ? `Triple Cities Tech - ${anonAuthor}` : anonAuthor;
    }
    return anonAuthor;
  };

  const dotColor =
    entry.authorType === 'customer'
      ? 'bg-emerald-500'
      : entry.authorType === 'system'
        ? 'bg-gray-500'
        : entry.type === 'time_entry'
          ? 'bg-indigo-500'
          : 'bg-cyan-500';

  const authorColor =
    entry.authorType === 'customer'
      ? 'text-emerald-400'
      : entry.authorType === 'system'
        ? 'text-slate-400'
        : 'text-cyan-400';

  const cardBg =
    entry.authorType === 'customer'
      ? 'bg-emerald-500/10 border border-emerald-500/20'
      : 'bg-gray-700/30';

  return (
    <div className="relative pl-10 pb-4">
      {/* Line segment: connects this row to the next */}
      <div className="absolute left-[15px] top-0 bottom-0 w-px bg-gray-700/60" />
      {/* Dot — vertically centered with card (bottom-4 excludes pb-4 gap) */}
      <div className="absolute left-0 top-0 bottom-4 flex items-center" style={{ width: '2rem' }}>
        <div className={`mx-auto w-3 h-3 rounded-full border-2 border-gray-800 relative z-10 ${dotColor}`} />
      </div>
      <div className={`rounded-lg px-4 py-3 overflow-hidden ${cardBg}`}>
        <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold ${authorColor}`}>
              {getAuthorLabel()}
            </span>
            {entry.type === 'time_entry' && entry.hoursWorked !== null && (
              <span className="text-xs text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                {entry.hoursWorked}h worked
              </span>
            )}
            {/* Internal badge for staff view */}
            {perspective === 'staff' && entry.isInternal && (
              <span className="text-xs text-slate-400 bg-slate-700/50 px-1.5 py-0.5 rounded border border-slate-600/50">
                Internal
              </span>
            )}
            {/* System badge for staff view */}
            {perspective === 'staff' && entry.authorType === 'system' && (
              <span className="text-xs text-slate-500 bg-slate-800/50 px-1.5 py-0.5 rounded border border-slate-700/50">
                System
              </span>
            )}
          </div>
          <span className="text-xs text-gray-500">
            {entry.timestamp
              ? new Date(entry.timestamp).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : ''}
          </span>
        </div>
        {entry.title && <p className="text-xs text-slate-300 font-medium">{entry.title}</p>}
        <p className="text-sm text-gray-300 whitespace-pre-wrap break-words overflow-hidden">{entry.content}</p>
      </div>
    </div>
  );
}
