'use client';

import { useState, useMemo } from 'react';
import type { UnifiedTicketRow, TicketTableProps, SortField, SortDir } from '@/types/tickets';
import PriorityBadge from './PriorityBadge';
import SlaIndicator from './SlaIndicator';
import { formatMinutes, getStatusBadgeColor } from '@/lib/tickets/utils';
import { useDemoMode } from '@/components/admin/DemoModeProvider';

/** Autotask "waiting on customer" ticket statuses (7=Waiting Customer, 12=Customer Note Added) */
const WAITING_ON_CUSTOMER_STATUSES = new Set([7, 12]);
function isWaitingOnCustomer(status: number): boolean {
  return WAITING_ON_CUSTOMER_STATUSES.has(status);
}

/** Get display label for a ticket based on perspective */
function getDisplayStatusLabel(ticket: UnifiedTicketRow, isStaff: boolean): string {
  // Staff view: use internal labels
  if (isStaff) {
    if (ticket.isResolved) return 'Resolved';
    if (isWaitingOnCustomer(ticket.status)) return 'Waiting on Customer';
    return 'Open';
  }
  // Customer view: use the refined statusLabel from the adapter
  if (ticket.isResolved) return 'Closed';
  return ticket.statusLabel || 'Open';
}

/** Get badge color for a ticket based on perspective */
function getDisplayStatusColor(ticket: UnifiedTicketRow, isStaff: boolean): string {
  if (isStaff) {
    // Staff colors unchanged
    if (ticket.isResolved) return 'bg-emerald-400/20 text-emerald-400';
    if (isWaitingOnCustomer(ticket.status)) return 'bg-rose-400/20 text-rose-400';
    return 'bg-cyan-400/20 text-cyan-400';
  }
  // Customer view: use refined color from statusLabel
  if (ticket.isResolved) return 'bg-green-500/20 text-green-300';
  return getStatusBadgeColor(ticket.statusLabel);
}

export default function TicketTable({
  tickets,
  perspective,
  onTicketClick,
  search: externalSearch,
  onSearchChange,
  statusFilter: externalStatusFilter,
  onStatusFilterChange,
  compact = false,
  maxRows,
  showViewAll = false,
  onViewAll,
  loading = false,
  autotaskWebUrl,
}: TicketTableProps) {
  const isStaff = perspective === 'staff';
  const demo = useDemoMode();

  // Internal state (used when no external control provided)
  const [internalSearch, setInternalSearch] = useState('');
  const [internalStatusFilter, setInternalStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [sortField, setSortField] = useState<SortField>('createDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const search = externalSearch ?? internalSearch;
  const setSearch = onSearchChange ?? setInternalSearch;
  const statusFilter = externalStatusFilter ?? internalStatusFilter;
  const setStatusFilter = onStatusFilterChange ?? setInternalStatusFilter;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'createDate' ? 'desc' : 'asc');
    }
  };

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' \u2191' : ' \u2193';
  };

  const filteredTickets = useMemo(() => {
    let result = tickets.filter(t => {
      if (statusFilter === 'open' && t.isResolved) return false;
      if (statusFilter === 'resolved' && !t.isResolved) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.ticketNumber.toLowerCase().includes(q) ||
          (isStaff && t.assignedTo.toLowerCase().includes(q))
        );
      }
      return true;
    });

    if (isStaff) {
      result = result.sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1;
        switch (sortField) {
          case 'ticketNumber':
            return a.ticketNumber.localeCompare(b.ticketNumber) * dir;
          case 'priority':
            return (a.priority - b.priority) * dir;
          case 'status':
            return (Number(a.isResolved) - Number(b.isResolved)) * dir;
          case 'assignedTo':
            return a.assignedTo.localeCompare(b.assignedTo) * dir;
          case 'createDate':
            return (new Date(a.createDate).getTime() - new Date(b.createDate).getTime()) * dir;
          case 'hoursLogged':
            return (a.hoursLogged - b.hoursLogged) * dir;
          case 'resolutionMinutes':
            return ((a.resolutionMinutes || 0) - (b.resolutionMinutes || 0)) * dir;
          default:
            return 0;
        }
      });
    } else {
      // Customer view: waiting-on-customer first, then open/in-progress, then closed
      // Within each group, sort by createDate descending (newest first)
      const WAITING_STATUSES = new Set([7, 12]);
      const RESOLVED_STATUSES = new Set([5, 13, 29]);
      const statusGroup = (t: UnifiedTicketRow) => {
        if (WAITING_STATUSES.has(t.status)) return 0; // Top
        if (!RESOLVED_STATUSES.has(t.status)) return 1; // Middle (open/in-progress)
        return 2; // Bottom (closed)
      };
      result = result.sort((a, b) => {
        const groupDiff = statusGroup(a) - statusGroup(b);
        if (groupDiff !== 0) return groupDiff;
        return new Date(b.createDate).getTime() - new Date(a.createDate).getTime();
      });
    }

    if (maxRows) result = result.slice(0, maxRows);
    return result;
  }, [tickets, statusFilter, search, isStaff, sortField, sortDir, maxRows]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
      </div>
    );
  }

  // Compact mode — simple card list (like customer dashboard "Recent Tickets")
  if (compact) {
    return (
      <div className="space-y-2">
        {filteredTickets.map(ticket => (
          <button
            key={ticket.ticketId}
            onClick={() => onTicketClick(ticket.ticketId)}
            className="w-full flex items-center justify-between bg-gray-700/30 hover:bg-gray-700/50 rounded-lg px-4 py-3 transition-colors text-left group cursor-pointer"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white truncate group-hover:text-cyan-300 transition-colors">{demo.title(ticket.title)}</p>
              <p className="text-xs text-gray-500 mt-0.5">#{ticket.ticketNumber} - {new Date(ticket.createDate).toLocaleDateString()}</p>
            </div>
            <div className="flex items-center gap-2 ml-3">
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${getDisplayStatusColor(ticket, isStaff)}`}>
                {getDisplayStatusLabel(ticket, isStaff)}
              </span>
              <svg className="w-4 h-4 text-gray-500 group-hover:text-cyan-400 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        ))}
        {filteredTickets.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">
            {search ? 'No tickets match your search.' : 'No recent tickets.'}
          </p>
        )}
        {showViewAll && onViewAll && tickets.length > (maxRows || 0) && (
          <button
            onClick={onViewAll}
            className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            View All ({tickets.length})
          </button>
        )}
      </div>
    );
  }

  // Full table mode
  return (
    <div className="space-y-4">
      {/* Search + status filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search tickets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64 px-3 py-1.5 text-sm bg-slate-900/50 border border-slate-600/50 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
        />
        <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1">
          {(['all', 'open', 'resolved'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                statusFilter === s ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">{filteredTickets.length} tickets</span>
      </div>

      {/* Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50">
                <SortableHeader label="Ticket" field="ticketNumber" current={sortField} dir={sortDir} onSort={handleSort} sortIndicator={sortIndicator} sortable={isStaff} />
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3 hidden md:table-cell">Title</th>
                <SortableHeader label="Priority" field="priority" current={sortField} dir={sortDir} onSort={handleSort} sortIndicator={sortIndicator} className="text-center" sortable={isStaff} />
                <SortableHeader label="Status" field="status" current={sortField} dir={sortDir} onSort={handleSort} sortIndicator={sortIndicator} className="text-center" sortable={isStaff} />
                {isStaff && (
                  <>
                    <SortableHeader label="Assigned" field="assignedTo" current={sortField} dir={sortDir} onSort={handleSort} sortIndicator={sortIndicator} className="hidden lg:table-cell" sortable />
                    <SortableHeader label="Resolution" field="resolutionMinutes" current={sortField} dir={sortDir} onSort={handleSort} sortIndicator={sortIndicator} className="text-right hidden lg:table-cell" sortable />
                    <SortableHeader label="Hours" field="hoursLogged" current={sortField} dir={sortDir} onSort={handleSort} sortIndicator={sortIndicator} className="text-right hidden md:table-cell" sortable />
                    <th className="text-center text-xs text-slate-400 font-medium px-4 py-3 hidden lg:table-cell">SLA</th>
                  </>
                )}
                <SortableHeader label="Created" field="createDate" current={sortField} dir={sortDir} onSort={handleSort} sortIndicator={sortIndicator} className="text-right" sortable={isStaff} />
              </tr>
            </thead>
            <tbody>
              {filteredTickets.map(ticket => (
                <TicketRow
                  key={ticket.ticketId}
                  ticket={ticket}
                  perspective={perspective}
                  onClick={() => onTicketClick(ticket.ticketId)}
                  autotaskWebUrl={autotaskWebUrl}
                  demo={demo}
                />
              ))}
              {filteredTickets.length === 0 && (
                <tr>
                  <td colSpan={isStaff ? 9 : 5} className="text-center py-8 text-slate-500">
                    No tickets found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TicketRow({
  ticket,
  perspective,
  onClick,
  autotaskWebUrl,
  demo,
}: {
  ticket: UnifiedTicketRow;
  perspective: 'staff' | 'customer';
  onClick: () => void;
  autotaskWebUrl?: string | null;
  demo: ReturnType<typeof useDemoMode>;
}) {
  const isStaff = perspective === 'staff';

  return (
    <tr
      onClick={onClick}
      className="border-b border-slate-700/30 hover:bg-slate-700/20 cursor-pointer"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{'\u25B6'}</span>
          <div>
            {isStaff && autotaskWebUrl ? (
              <a
                href={`${autotaskWebUrl}?ticketId=${ticket.ticketId}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-sm text-cyan-400 font-mono hover:text-cyan-300 hover:underline"
                title="Open in Autotask"
              >
                {ticket.ticketNumber}
              </a>
            ) : (
              <span className="text-sm text-cyan-400 font-mono">{ticket.ticketNumber}</span>
            )}
            <div className="text-xs text-slate-400 md:hidden truncate max-w-[200px]">{demo.title(ticket.title)}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        <span className="text-sm text-white truncate block max-w-[300px]">{demo.title(ticket.title)}</span>
      </td>
      <td className="text-center px-4 py-3">
        <PriorityBadge priority={ticket.priority} label={ticket.priorityLabel} />
      </td>
      <td className="text-center px-4 py-3">
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${getDisplayStatusColor(ticket, isStaff)}`}
        >
          {getDisplayStatusLabel(ticket, isStaff)}
        </span>
      </td>
      {isStaff && (
        <>
          <td className="px-4 py-3 text-sm text-slate-300 hidden lg:table-cell">{demo.person(ticket.assignedTo)}</td>
          <td className="text-right px-4 py-3 text-sm text-slate-300 hidden lg:table-cell">
            {ticket.resolutionMinutes !== null ? formatMinutes(ticket.resolutionMinutes) : '-'}
          </td>
          <td className="text-right px-4 py-3 text-sm text-white hidden md:table-cell">
            {ticket.hoursLogged > 0 ? `${Math.round(ticket.hoursLogged * 10) / 10}h` : '-'}
          </td>
          <td className="text-center px-4 py-3 hidden lg:table-cell">
            <SlaIndicator responseMet={ticket.slaResponseMet} resolutionMet={ticket.slaResolutionMet} />
          </td>
        </>
      )}
      <td className="text-right px-4 py-3 text-xs text-slate-400">
        {new Date(ticket.createDate).toLocaleDateString()}
      </td>
    </tr>
  );
}

function SortableHeader({
  label,
  field,
  onSort,
  sortIndicator,
  className = '',
  sortable = true,
}: {
  label: string;
  field: SortField;
  current?: SortField;
  dir?: SortDir;
  onSort: (f: SortField) => void;
  sortIndicator: (f: SortField) => string;
  className?: string;
  sortable?: boolean;
}) {
  if (!sortable) {
    return (
      <th className={`text-xs text-slate-400 font-medium px-4 py-3 ${className}`}>
        {label}
      </th>
    );
  }
  return (
    <th
      onClick={() => onSort(field)}
      className={`text-xs text-slate-400 font-medium px-4 py-3 cursor-pointer hover:text-white transition-colors select-none ${className}`}
    >
      {label}{sortIndicator(field)}
    </th>
  );
}
