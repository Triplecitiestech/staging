'use client';

import type { UnifiedTicketNote, TicketPerspective } from '@/types/tickets';

export default function TimelineEntry({
  entry,
  perspective,
}: {
  entry: UnifiedTicketNote;
  perspective: TicketPerspective;
}) {
  const getAuthorLabel = () => {
    if (entry.authorType === 'customer') return perspective === 'customer' ? entry.author : `${entry.author} (Customer)`;
    if (entry.authorType === 'technician') {
      return perspective === 'customer' ? `Triple Cities Tech - ${entry.author}` : entry.author;
    }
    return entry.author;
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
      <div className={`absolute left-2.5 w-3 h-3 rounded-full border-2 border-gray-800 ${dotColor}`} />
      <div className={`rounded-lg px-4 py-3 ${cardBg}`}>
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
        <p className="text-sm text-gray-300 whitespace-pre-wrap">{entry.content}</p>
      </div>
    </div>
  );
}
