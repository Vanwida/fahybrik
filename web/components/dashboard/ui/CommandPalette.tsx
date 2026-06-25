'use client';

// CommandPalette (⌘K) — fuzzy go-to-athlete / change-lens / run-action launcher
// (SPEC §3/§4/§9). Built natively (no cmdk dependency in this repo) as a proper
// focus-trapped modal dialog — the ONE place a trap is correct (unlike the
// non-modal DetailSidePanel). Keyboard: ⌘K/Ctrl+K to open (wire from the page),
// ↑↓ to move, Enter to run, Esc to close.
//
// Athlete typeahead is injected via `onSearchAthletes` so the page owns the
// /api/coach/search fetch (F1) and this component degrades gracefully when the
// endpoint is absent (it simply shows no athlete results). Static commands
// (lenses, actions) are passed in as `commands`.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

/** Athlete result shape from /api/coach/search (F1 owns the endpoint). */
export interface AthleteSearchResult {
  id: string;
  full_name: string;
}

export interface CommandItem {
  id: string;
  label: string;
  /** Optional group heading, e.g. "Lentes", "Acciones". */
  group?: string;
  icon?: string;
  /** Extra terms to match against (e.g. synonyms). */
  keywords?: string;
  onSelect: () => void;
}

/** A secondary action runnable against the focused athlete (e.g. open chat). */
export interface AthleteAction {
  key: string;
  /** Material icon name for the row affordance. */
  icon: string;
  /** Accessible label, e.g. "Abrir conversación". */
  label: string;
  run: (athlete: AthleteSearchResult) => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Static commands (change-lens, run-action…). */
  commands: ReadonlyArray<CommandItem>;
  /** Athlete typeahead. Return [] / throw → no athlete results (graceful). */
  onSearchAthletes?: (query: string) => Promise<AthleteSearchResult[]>;
  /** Default action when an athlete row is chosen (Enter) — usually go-to-ficha. */
  onSelectAthlete?: (athlete: AthleteSearchResult) => void;
  /** Secondary per-athlete actions shown on the active row (e.g. chat, assign). */
  athleteActions?: ReadonlyArray<AthleteAction>;
  placeholder?: string;
}

/** Subsequence fuzzy match — returns a score (lower = better) or null if no match. */
function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (q.length === 0) return 0;
  let ti = 0;
  let score = 0;
  let lastMatch = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]!;
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    // Penalize gaps so contiguous matches rank higher.
    if (lastMatch !== -1) score += found - lastMatch - 1;
    lastMatch = found;
    ti = found + 1;
  }
  // Prefer matches that start earlier.
  return score + t.indexOf(q[0]!);
}

type Row =
  | { kind: 'command'; item: CommandItem; group: string }
  | { kind: 'athlete'; item: AthleteSearchResult; group: string };

const ATHLETE_GROUP = 'Atletas';

export function CommandPalette({
  open,
  onOpenChange,
  commands,
  onSearchAthletes,
  onSelectAthlete,
  athleteActions,
  placeholder = 'Buscar atleta o ejecutar acción…',
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [athletes, setAthletes] = useState<AthleteSearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  // Reset + focus on open. Resetting local UI state when the `open` prop flips
  // is the canonical "sync external state into React" effect (same idiom as
  // AddAthleteModal); the scoped disable matches the codebase convention.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setAthletes([]);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Debounced athlete typeahead; degrade silently on error/absence. The clear
  // (when the query is too short / endpoint absent) runs inside the timeout too,
  // so setAthletes is only ever called from the async callback — no flash, no
  // synchronous setState in the effect body.
  useEffect(() => {
    let cancelled = false;
    const qualifies = open && onSearchAthletes && query.trim().length >= 2;
    const handle = setTimeout(async () => {
      if (!qualifies) {
        if (!cancelled) setAthletes((prev) => (prev.length === 0 ? prev : []));
        return;
      }
      try {
        const results = await onSearchAthletes!(query.trim());
        if (!cancelled) setAthletes(results);
      } catch {
        if (!cancelled) setAthletes((prev) => (prev.length === 0 ? prev : []));
      }
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, query, onSearchAthletes]);

  // Filter + rank static commands by fuzzy score.
  const commandRows = useMemo<Row[]>(() => {
    const scored = commands
      .map((item) => {
        const hay = `${item.label} ${item.keywords ?? ''}`;
        const score = fuzzyScore(query.trim(), hay);
        return score == null ? null : { item, score };
      })
      .filter((x): x is { item: CommandItem; score: number } => x !== null)
      .sort((a, b) => a.score - b.score);
    return scored.map(({ item }) => ({
      kind: 'command' as const,
      item,
      group: item.group ?? 'Acciones',
    }));
  }, [commands, query]);

  const rows = useMemo<Row[]>(() => {
    const athleteRows: Row[] = athletes.map((a) => ({
      kind: 'athlete',
      item: a,
      group: ATHLETE_GROUP,
    }));
    // Athletes first when present (the primary "go to" intent), then commands.
    return [...athleteRows, ...commandRows];
  }, [athletes, commandRows]);

  // Clamp at read time instead of via an effect: as results shrink, the active
  // index stays valid without a cascading setState.
  const safeActiveIndex = rows.length === 0 ? 0 : Math.min(activeIndex, rows.length - 1);

  const runRow = useCallback(
    (row: Row | undefined) => {
      if (!row) return;
      onOpenChange(false);
      if (row.kind === 'command') row.item.onSelect();
      else onSelectAthlete?.(row.item);
    },
    [onOpenChange, onSelectAthlete],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(rows.length === 0 ? 0 : (safeActiveIndex + 1) % rows.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(rows.length === 0 ? 0 : (safeActiveIndex - 1 + rows.length) % rows.length);
        break;
      case 'Enter':
        e.preventDefault();
        runRow(rows[safeActiveIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        onOpenChange(false);
        break;
    }
  };

  // Scroll the active row into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${safeActiveIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [safeActiveIndex]);

  if (!open) return null;

  // Group rows preserving order, for section headings.
  const grouped: Array<{ group: string; items: Array<{ row: Row; index: number }> }> = [];
  rows.forEach((row, index) => {
    const last = grouped[grouped.length - 1];
    if (last && last.group === row.group) last.items.push({ row, index });
    else grouped.push({ group: row.group, items: [{ row, index }] });
  });

  const activeId = rows.length > 0 ? `${baseId}-row-${safeActiveIndex}` : undefined;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      {/* Scrim — this IS a modal launcher (focus-trapped), unlike the side panel. */}
      <div aria-hidden className="absolute inset-0 bg-[color:var(--scrim)]" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar y ejecutar"
        className={cn(
          'relative z-10 w-full max-w-xl overflow-hidden rounded-[var(--r-l)]',
          'border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] shadow-[var(--shadow-modal)]',
          'animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none',
        )}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-[color:var(--border-subtle)] px-4">
          <MIcon name="search" size={18} className="text-[color:var(--text-muted)]" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded
            aria-controls={`${baseId}-list`}
            aria-activedescendant={activeId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-transparent py-3.5 text-sm text-[color:var(--fg)] outline-none placeholder:text-[color:var(--text-muted)]"
          />
          <kbd className="metric-num hidden shrink-0 rounded-[var(--r-s)] border border-[color:var(--border-subtle)] px-1.5 py-0.5 text-[10px] text-[color:var(--text-muted)] sm:inline-block">
            ESC
          </kbd>
        </div>

        <div
          ref={listRef}
          id={`${baseId}-list`}
          role="listbox"
          className="max-h-[52vh] overflow-y-auto py-2"
        >
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[color:var(--text-muted)]">
              Sin resultados
            </p>
          ) : (
            grouped.map(({ group, items }) => (
              <div key={group} className="mb-1">
                <p className="micro-label px-4 py-1.5">{group}</p>
                {items.map(({ row, index }) => {
                  const active = index === safeActiveIndex;
                  const label = row.kind === 'command' ? row.item.label : row.item.full_name;
                  const icon = row.kind === 'command' ? (row.item.icon ?? 'bolt') : 'person';
                  const showActions =
                    row.kind === 'athlete' && active && (athleteActions?.length ?? 0) > 0;
                  return (
                    // Athlete rows with secondary actions can't be a <button>
                    // (no nested buttons), so they render as a div with a role.
                    <div
                      key={row.kind === 'command' ? row.item.id : `a-${row.item.id}`}
                      id={`${baseId}-row-${index}`}
                      data-row={index}
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => runRow(row)}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors',
                        active
                          ? 'bg-[color:var(--surface-container)] text-[color:var(--fg)]'
                          : 'text-[color:var(--text-muted)]',
                      )}
                    >
                      <MIcon
                        name={icon}
                        size={16}
                        className={active ? 'text-[color:var(--accent)]' : undefined}
                      />
                      <span className="min-w-0 flex-1 truncate text-[color:var(--fg)]">
                        {label}
                      </span>
                      {showActions ? (
                        <span className="flex shrink-0 items-center gap-0.5">
                          {athleteActions!.map((a) => (
                            <button
                              key={a.key}
                              type="button"
                              aria-label={`${a.label}: ${(row as { item: AthleteSearchResult }).item.full_name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenChange(false);
                                a.run((row as { item: AthleteSearchResult }).item);
                              }}
                              className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-[var(--r-s)] text-[color:var(--text-muted)] hover:bg-[color:var(--surface-container-high)] hover:text-[color:var(--fg)]"
                            >
                              <MIcon name={a.icon} size={15} />
                            </button>
                          ))}
                        </span>
                      ) : active ? (
                        <MIcon
                          name="keyboard_return"
                          size={14}
                          className="text-[color:var(--text-muted)]"
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
