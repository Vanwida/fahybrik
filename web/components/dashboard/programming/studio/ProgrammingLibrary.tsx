'use client';

import { useMemo, useState } from 'react';
import { filterExercises } from '@/lib/dashboard/exercises/filter-exercises';
import { EXERCISE_FILTER_CHIPS } from '@/lib/dashboard/exercises/filter-chips';
import type { CatalogExercise } from '@/lib/dashboard/exercises/types';
import { FilterChip } from '@/components/dashboard/ui/FilterChip';
import { SearchInput } from '@/components/dashboard/ui/SearchInput';
import { DraggableExerciseCard } from '@/components/dashboard/programming/studio/DraggableExerciseCard';
import { PROGRAM_LEVEL_LABELS, type ProgramLevel } from '@/lib/dashboard/constants/program-levels';
import { cn } from '@/lib/utils';

export interface LibraryWeekRow {
  id: string;
  name: string;
  level: string;
  focus: string | null;
}

type LibraryTab = 'exercises' | 'weeks';

interface ProgrammingLibraryProps {
  exercises: CatalogExercise[];
  loading?: boolean | undefined;
  /** Optional: when provided, the library exposes a "Semanas" tab with the list of week templates. */
  weeks?: LibraryWeekRow[] | undefined;
  activeWeekId?: string | null | undefined;
  onSelectWeek?: ((weekId: string) => void) | undefined;
  onCreateWeek?: (() => void) | undefined;
  /** When provided, each exercise card exposes an edit affordance. */
  onEditExercise?: ((exercise: CatalogExercise) => void) | undefined;
}

export function ProgrammingLibrary({
  exercises,
  loading,
  weeks,
  activeWeekId,
  onSelectWeek,
  onCreateWeek,
  onEditExercise,
}: ProgrammingLibraryProps) {
  const hasWeekTabs = Array.isArray(weeks) && (onSelectWeek != null || onCreateWeek != null);
  const [tab, setTab] = useState<LibraryTab>('exercises');
  const [search, setSearch] = useState('');
  const [chip, setChip] = useState<string>('all');

  const filteredExercises = useMemo(
    () => filterExercises(exercises, { search, chip }),
    [exercises, search, chip],
  );

  const filteredWeeks = useMemo(() => {
    if (!hasWeekTabs || !weeks) return [];
    const q = search.trim().toLowerCase();
    if (!q) return weeks;
    return weeks.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.focus?.toLowerCase().includes(q) ?? false),
    );
  }, [hasWeekTabs, weeks, search]);

  const showingWeeks = hasWeekTabs && tab === 'weeks';

  return (
    <aside
      className={cn(
        // En el drawer móvil (<lg) ocupa todo el ancho sin borde propio (el
        // drawer aporta el chrome). En lg+ es el panel fijo de 320px de siempre.
        'flex h-full w-full shrink-0 flex-col overflow-hidden lg:w-80',
        'bg-[color:var(--surface-container-lowest)] lg:border-r lg:border-[color:var(--border-subtle)]',
      )}
    >
      {/* Cabecera propia solo en lg+: en móvil el drawer ya muestra el título. */}
      <div className="hidden border-b border-[color:var(--border-subtle)] p-4 lg:block">
        <h2 className="font-display text-lg font-bold text-[color:var(--fg)]">Librería</h2>
        <p className="mt-1 text-xs text-[color:var(--text-muted)]">
          {showingWeeks
            ? 'Selecciona una semana para editarla'
            : 'Arrastra al día para añadir un bloque'}
        </p>
      </div>

      <div className="space-y-3 border-b border-[color:var(--border-subtle)] p-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={showingWeeks ? 'Buscar semana…' : 'Buscar ejercicios…'}
        />

        {hasWeekTabs ? (
          <div className="flex w-full rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] p-0.5">
            {(['exercises', 'weeks'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  'flex-1 rounded-[var(--r-sm)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors',
                  tab === t
                    ? 'bg-[color:var(--accent)] text-[color:var(--accent-on)]'
                    : 'text-[color:var(--text-muted)] hover:text-[color:var(--fg)]',
                )}
              >
                {t === 'exercises' ? 'Ejercicios' : 'Semanas'}
              </button>
            ))}
          </div>
        ) : null}

        {!showingWeeks ? (
          <>
            <div className="flex flex-wrap gap-1">
              {EXERCISE_FILTER_CHIPS.map((c) => (
                <FilterChip
                  key={c.id}
                  label={c.label}
                  active={chip === c.id}
                  onClick={() => setChip(c.id)}
                />
              ))}
            </div>
            <p className="text-[10px] text-[color:var(--text-muted)]">
              {filteredExercises.length} ejercicios
            </p>
          </>
        ) : (
          <p className="text-[10px] text-[color:var(--text-muted)]">
            {filteredWeeks.length} {filteredWeeks.length === 1 ? 'semana' : 'semanas'}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {showingWeeks ? (
          <div className="space-y-2">
            {onCreateWeek ? (
              <button
                type="button"
                onClick={onCreateWeek}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-[var(--r-l)]',
                  'border border-dashed border-[color:var(--border-subtle)] px-3 py-2.5',
                  'text-[11px] font-bold uppercase tracking-wider text-[color:var(--accent)]',
                  'hover:border-[color:var(--accent)] hover:bg-[color:var(--surface-container-low)]',
                  'transition-colors',
                )}
              >
                <span aria-hidden>+</span>
                <span>Nueva semana</span>
              </button>
            ) : null}

            {filteredWeeks.length === 0 ? (
              <p className="px-1 pt-2 text-sm text-[color:var(--text-muted)]">
                {weeks && weeks.length === 0
                  ? 'Crea tu primera semana plantilla.'
                  : 'Sin resultados.'}
              </p>
            ) : (
              filteredWeeks.map((w) => {
                const isActive = activeWeekId === w.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => onSelectWeek?.(w.id)}
                    className={cn(
                      'flex w-full flex-col gap-1 rounded-[var(--r-l)] border px-3 py-2.5 text-left transition-colors',
                      isActive
                        ? 'border-[color:var(--accent)] bg-[color:var(--surface-card)]'
                        : 'border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] hover:border-[color:var(--accent)]',
                    )}
                  >
                    <span
                      className={cn(
                        'truncate font-display text-sm font-bold',
                        isActive ? 'text-[color:var(--accent)]' : 'text-[color:var(--fg)]',
                      )}
                    >
                      {w.name}
                    </span>
                    <span className="truncate text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
                      {PROGRAM_LEVEL_LABELS[w.level as ProgramLevel] ?? w.level}
                      {w.focus ? ` · ${w.focus}` : ''}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {loading ? (
              <p className="text-sm text-[color:var(--text-muted)]">Cargando…</p>
            ) : filteredExercises.length === 0 ? (
              <p className="text-sm text-[color:var(--text-muted)]">Sin resultados.</p>
            ) : (
              filteredExercises.map((exercise) => (
                <DraggableExerciseCard
                  key={exercise.id}
                  exercise={exercise}
                  onEdit={onEditExercise}
                />
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
