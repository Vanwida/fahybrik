'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import type { CatalogExercise, ExerciseCategoryToken } from './template-types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; exercises: CatalogExercise[] }
  | { kind: 'error'; message: string };

const CATEGORY_ORDER: ExerciseCategoryToken[] = [
  'hyrox_station',
  'strength',
  'cardio',
  'skill',
  'plyometric',
  'core',
  'mobility',
];

const CATEGORY_LABEL: Record<ExerciseCategoryToken, string> = {
  hyrox_station: 'HYROX',
  strength: 'Fuerza',
  cardio: 'Cardio',
  skill: 'Skill',
  plyometric: 'Pliometría',
  core: 'Core',
  mobility: 'Movilidad',
};

interface PaletteProps {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

export function ExercisePalette({ searchInputRef }: PaletteProps) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Record<ExerciseCategoryToken, boolean>>({
    hyrox_station: true,
    strength: true,
    cardio: true,
    skill: true,
    plyometric: false,
    core: false,
    mobility: false,
  });

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/exercises?limit=400', {
      credentials: 'include',
      signal: ctrl.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error('failed');
        return res.json() as Promise<{ exercises: CatalogExercise[] }>;
      })
      .then((j) => setLoad({ kind: 'ready', exercises: j.exercises }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setLoad({ kind: 'error', message: 'No se pudo cargar el catálogo.' });
      });
    return () => ctrl.abort();
  }, []);

  const grouped = useMemo(() => {
    const exercises = load.kind === 'ready' ? load.exercises : [];
    const term = search.trim().toLowerCase();
    const buckets = new Map<ExerciseCategoryToken, CatalogExercise[]>();
    for (const ex of exercises) {
      if (term && !ex.name.toLowerCase().includes(term) && !ex.slug.includes(term)) continue;
      const arr = buckets.get(ex.category) ?? [];
      arr.push(ex);
      buckets.set(ex.category, arr);
    }
    return CATEGORY_ORDER.map((cat) => ({
      cat,
      items: buckets.get(cat) ?? [],
    })).filter((g) => g.items.length > 0);
  }, [load, search]);

  return (
    <aside className="w-72 shrink-0 border-r border-[var(--hairline)] bg-[var(--surface)] flex flex-col min-h-0">
      <div className="px-3 py-3 border-b border-[var(--hairline)]">
        <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] mb-2">
          Ejercicios
        </div>
        <input
          ref={searchInputRef}
          type="search"
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-8 px-3 text-sm bg-[var(--surface-elevated)] border border-[var(--outline)] rounded-md text-foreground placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {load.kind === 'error' && (
          <p className="text-xs text-[var(--danger)] px-2 py-3">{load.message}</p>
        )}
        {load.kind === 'loading' && (
          <p className="text-xs text-[var(--muted)] px-2 py-3">Cargando catálogo…</p>
        )}
        {load.kind === 'ready' && grouped.length === 0 && (
          <p className="text-xs text-[var(--muted)] px-2 py-3">Sin coincidencias.</p>
        )}
        {grouped.map(({ cat, items }) => (
          <CategoryGroup
            key={cat}
            cat={cat}
            items={items}
            open={open[cat]}
            onToggle={() => setOpen((o) => ({ ...o, [cat]: !o[cat] }))}
          />
        ))}
      </div>
    </aside>
  );
}

function CategoryGroup({
  cat,
  items,
  open,
  onToggle,
}: {
  cat: ExerciseCategoryToken;
  items: CatalogExercise[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] uppercase tracking-[0.16em] text-[var(--muted)] hover:text-foreground"
      >
        <span>
          <span className="mr-2 font-mono">{open ? '▾' : '▸'}</span>
          {CATEGORY_LABEL[cat]}
        </span>
        <span className="font-mono text-[10px]">{items.length}</span>
      </button>
      {open && (
        <ul className="mt-0.5">
          {items.map((ex) => (
            <DraggableExercise key={ex.id} exercise={ex} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DraggableExercise({ exercise }: { exercise: CatalogExercise }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${exercise.id}`,
    data: { source: 'palette', exercise },
  });
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        'group/item px-2 py-1.5 text-sm rounded-md cursor-grab select-none',
        'hover:bg-[var(--surface-elevated)] hover:text-foreground',
        isDragging && 'opacity-40',
      )}
    >
      <div className="truncate">{exercise.name}</div>
      {exercise.hyrox_station_position && (
        <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] mt-0.5">
          Estación {exercise.hyrox_station_position}
        </div>
      )}
    </li>
  );
}
