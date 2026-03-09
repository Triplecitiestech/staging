'use client';

import type { NoteVisibilityFilters } from '@/types/tickets';

export default function TicketNoteToggle({
  visibility,
  onChange,
}: {
  visibility: NoteVisibilityFilters;
  onChange: (filters: NoteVisibilityFilters) => void;
}) {
  const toggle = (key: keyof NoteVisibilityFilters) => {
    onChange({ ...visibility, [key]: !visibility[key] });
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-slate-500 mr-1">Show:</span>
      <TogglePill
        label="Internal"
        active={visibility.showInternal}
        onClick={() => toggle('showInternal')}
        activeColor="bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
      />
      <TogglePill
        label="External"
        active={visibility.showExternal}
        onClick={() => toggle('showExternal')}
        activeColor="bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
      />
      <TogglePill
        label="System"
        active={visibility.showSystem}
        onClick={() => toggle('showSystem')}
        activeColor="bg-slate-500/20 text-slate-300 border-slate-500/40"
      />
    </div>
  );
}

function TogglePill({
  label,
  active,
  onClick,
  activeColor,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  activeColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
        active ? activeColor : 'text-slate-500 border-slate-700 hover:border-slate-600'
      }`}
    >
      {label}
    </button>
  );
}
