'use client';

import { MessageSquare, ClipboardList, CalendarClock, Sliders, X } from 'lucide-react';

interface CohortBulkActionsProps {
  selected_count: number;
  onClear: () => void;
}

export function CohortBulkActions({ selected_count, onClear }: CohortBulkActionsProps) {
  if (selected_count === 0) return null;
  return (
    <div
      role="toolbar"
      aria-label="Acciones por lote"
      className="sticky bottom-4 z-20 mx-auto flex w-fit items-center gap-1.5 rounded-full border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2.5 py-1.5 shadow-[var(--shadow-modal)]"
    >
      <span className="px-2 text-xs uppercase tracking-[0.16em] text-[color:var(--muted)] tabular-nums">
        {selected_count} sel.
      </span>
      <BulkButton icon={MessageSquare} label="Mensaje" />
      <BulkButton icon={ClipboardList} label="Asignar" />
      <BulkButton icon={CalendarClock} label="Reprogramar" />
      <BulkButton icon={Sliders} label="Ajuste masivo" emphasis />
      <button
        type="button"
        onClick={onClear}
        aria-label="Limpiar selección"
        className="ml-1 flex size-7 items-center justify-center rounded-full text-[color:var(--muted)] hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--fg)]"
      >
        <X className="size-3.5" aria-hidden strokeWidth={1.5} />
      </button>
    </div>
  );
}

interface BulkButtonProps {
  icon: typeof MessageSquare;
  label: string;
  emphasis?: boolean;
}

function BulkButton({ icon: Icon, label, emphasis }: BulkButtonProps) {
  return (
    <button
      type="button"
      className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-xs ${
        emphasis
          ? 'bg-[color:var(--accent)] text-[color:var(--accent-on)] hover:bg-[color:var(--accent-press)]'
          : 'text-[color:var(--fg)] hover:bg-[color:var(--surface-elevated)]'
      }`}
    >
      <Icon className="size-3.5" aria-hidden strokeWidth={1.5} />
      {label}
    </button>
  );
}
