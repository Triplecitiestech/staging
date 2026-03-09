'use client';

import { PRIORITY_COLORS } from '@/lib/tickets/utils';

export default function PriorityBadge({ priority, label }: { priority: number; label: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLORS[priority] || 'bg-slate-400/20 text-slate-400'}`}>
      {label}
    </span>
  );
}
