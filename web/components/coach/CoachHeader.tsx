'use client';

import { Search, Settings } from 'lucide-react';

interface CoachHeaderProps {
  coach_name: string;
  athlete_count: number;
}

export function CoachHeader({ coach_name, athlete_count }: CoachHeaderProps) {
  const firstLast = formatCoachName(coach_name);
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-[color:var(--hairline)] bg-[color:var(--bg)]/95 px-4 backdrop-blur">
      <div className="flex items-center gap-2 pr-3 border-r border-[color:var(--hairline)]">
        <span
          className="font-display italic font-black text-2xl tracking-tight select-none"
          aria-label="FAHYBRIK"
        >
          <span className="text-[color:var(--accent)]">[F]</span>
          <span className="text-[color:var(--fg)]">AHYBRIK</span>
        </span>
        <span className="hidden md:inline text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
          Coach
        </span>
      </div>

      <div className="flex-1 max-w-md">
        <label className="relative flex h-9 items-center gap-2 rounded-md bg-[color:var(--surface)] px-3 text-sm text-[color:var(--muted)] focus-within:ring-2 focus-within:ring-[color:var(--accent)]/40">
          <Search className="size-4 shrink-0" aria-hidden strokeWidth={1.5} />
          <input
            type="search"
            placeholder="Buscar atletas / eventos…"
            className="w-full bg-transparent text-[color:var(--fg)] placeholder:text-[color:var(--muted)] outline-none"
            aria-label="Buscar atletas o eventos"
          />
          <kbd className="ml-auto hidden rounded border border-[color:var(--hairline)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[color:var(--muted)] sm:inline">
            /
          </kbd>
        </label>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden sm:flex flex-col items-end text-xs leading-tight">
          <span className="uppercase tracking-[0.16em] text-[10px] text-[color:var(--muted)]">
            cohorte
          </span>
          <span className="font-display italic font-black text-base tabular-nums text-[color:var(--fg)]">
            {athlete_count}
          </span>
        </span>
        <button
          type="button"
          aria-label="Ajustes"
          className="flex size-8 items-center justify-center rounded-md text-[color:var(--muted)] hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--fg)]"
        >
          <Settings className="size-4" aria-hidden strokeWidth={1.5} />
        </button>
        <div className="flex items-center gap-2 rounded-md border border-[color:var(--hairline)] px-2.5 py-1.5 text-sm">
          <span className="text-[color:var(--fg)]">{firstLast}</span>
        </div>
      </div>
    </header>
  );
}

function formatCoachName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}
