'use client';

// AddBlockModal — SCREEN 9. A modal over a dimmed scrim opened from the session
// editor (SCREEN 5) and the day editor (SCREEN 8). Two tabs:
//   ⌂ Desde biblioteca — type rail (modality dots) + search + result rows with
//      usage count + "Añadir".
//   ✎ Crear desde cero — 1·ELIGE EL TIPO (6 type tiles) → 2·CONFIGURA (nombre +
//      empty PrescriptionFields per type) → "Crear y añadir al día".
// Type selection drives the PRESCRIPTION MODEL field schema via seedPrescription.
// Closes on Escape / scrim click; focus-trapped to the dialog. Real library rows
// come from props (loaded server-side); empty → EmptyState.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import type {
  EditorBlock,
  LibraryBlockRow,
} from '@/lib/dashboard/v2/editor-types';
import { MIcon } from '@/components/dashboard/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import { SegmentedControl } from '@/components/v2/SegmentedControl';
import { cn } from '@/lib/utils';
import {
  MODALIDAD_OPTIONS,
  seedPrescription,
  type AxisModalidad,
} from '@/lib/dashboard/v2/editor-axes';
import { PrescriptionFields } from './PrescriptionFields';
import { AthletePreviewLine } from './AthletePreviewLine';
import { TextCell } from './fields';

type Tab = 'biblioteca' | 'nuevo';

// Type tiles for "Crear desde cero" — modality + a couple of structural types,
// each mapping to a seed prescription (PRESCRIPTION MODEL minimums).
const TYPE_TILES: { axis: AxisModalidad; label: string; icon: string }[] = [
  { axis: 'carrera', label: 'Carrera', icon: 'directions_run' },
  { axis: 'ergo', label: 'Ergómetro', icon: 'rowing' },
  { axis: 'fuerza', label: 'Fuerza', icon: 'fitness_center' },
  { axis: 'circuito', label: 'Circuito / Metcon', icon: 'sprint' },
];

const TYPE_FILTERS: { value: string; label: string; slug: string }[] = [
  { value: 'all', label: 'Todos', slug: 'calentamiento' },
  { value: 'fuerza', label: 'Fuerza', slug: 'fuerza' },
  { value: 'circuito', label: 'Metcon', slug: 'circuito' },
  { value: 'carrera', label: 'Carrera', slug: 'carrera' },
  { value: 'ergo', label: 'Ergómetro', slug: 'ergo' },
];

export function AddBlockModal({
  destinationLabel,
  libraryBlocks,
  onClose,
  onAdd,
}: {
  /** e.g. "Sesión AM · Lunes 12" or "Calentamiento" — shown in the header. */
  destinationLabel: string;
  libraryBlocks: LibraryBlockRow[];
  onClose: () => void;
  onAdd: (block: EditorBlock) => void;
}) {
  const [tab, setTab] = useState<Tab>('biblioteca');
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape to close; focus the dialog on mount.
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal
        aria-label="Añadir bloque"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="v2-focus flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]"
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-[color:var(--v2-border)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="v2-display text-xl">Añadir bloque</h2>
            <p className="v2-micro mt-0.5 truncate">→ {destinationLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="v2-focus flex h-8 w-8 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </header>

        {/* Tabs */}
        <div className="border-b border-[color:var(--v2-border)] px-5 py-3">
          <SegmentedControl
            options={[
              { value: 'biblioteca', label: 'Desde biblioteca' },
              { value: 'nuevo', label: 'Crear desde cero' },
            ]}
            value={tab}
            onChange={setTab}
            ariaLabel="Origen del bloque"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'biblioteca' ? (
            <LibraryTab blocks={libraryBlocks} onAdd={onAdd} />
          ) : (
            <CreateTab onAdd={onAdd} onCancel={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Desde biblioteca ─────────────────────────────────────────────────────────
function LibraryTab({
  blocks,
  onAdd,
}: {
  blocks: LibraryBlockRow[];
  onAdd: (block: EditorBlock) => void;
}) {
  const [typeFilter, setTypeFilter] = useState('all');
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return blocks.filter((b) => {
      const okType = typeFilter === 'all' || b.modality_slug === typeFilter;
      const okQuery = !q || b.title.toLowerCase().includes(q);
      return okType && okQuery;
    });
  }, [blocks, typeFilter, query]);

  return (
    <div className="grid grid-cols-1 gap-0 sm:grid-cols-[160px_1fr]">
      {/* Type rail */}
      <nav className="border-b border-[color:var(--v2-border)] p-3 sm:border-b-0 sm:border-r">
        <ul className="flex flex-wrap gap-1.5 sm:flex-col">
          {TYPE_FILTERS.map((t) => {
            const active = t.value === typeFilter;
            return (
              <li key={t.value}>
                <button
                  type="button"
                  onClick={() => setTypeFilter(t.value)}
                  className={cn(
                    'v2-focus flex w-full items-center gap-2 rounded-[var(--v2-r-s)] px-2.5 py-1.5 text-left text-xs font-semibold transition-colors',
                    active
                      ? 'bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent)]'
                      : 'text-[color:var(--v2-muted)] hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]',
                  )}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: `var(--v2-mod-${t.slug})` }}
                  />
                  {t.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Search + results */}
      <div className="flex min-h-0 flex-col">
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <label className="relative flex flex-1 items-center">
            <span className="pointer-events-none absolute left-2.5 text-[color:var(--v2-faint)]">
              <MIcon name="search" size={16} />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="buscar bloque…"
              aria-label="Buscar bloque"
              className="v2-focus h-9 w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] pl-8 pr-3 text-sm text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-border-strong)]"
            />
          </label>
          <span className="v2-num shrink-0 text-xs text-[color:var(--v2-muted)]">
            {results.length} bloques
          </span>
        </div>

        <div className="space-y-1.5 p-4">
          {results.length === 0 ? (
            <EmptyState
              icon="inventory_2"
              title="Sin bloques"
              description="No hay bloques en la biblioteca que coincidan. Prueba a crear uno desde cero."
            />
          ) : (
            results.map((b) => (
              <LibraryBlockResultRow key={b.id} block={b} onAdd={onAdd} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function LibraryBlockResultRow({
  block,
  onAdd,
}: {
  block: LibraryBlockRow;
  onAdd: (block: EditorBlock) => void;
}) {
  const handleAdd = () => {
    // Insert a reference to the library block; its items are hydrated by the
    // server when the day/session is saved (source_block_id carries the link).
    onAdd({
      uid: `lib-${block.id}-${Date.now()}`,
      title: block.title,
      format: block.format,
      methodology_group_id: block.methodology_group_id,
      group: 'principal',
      source_block_id: block.id,
      items: [],
    });
  };
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] py-2.5 pl-3.5 pr-2.5">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{ background: `var(--v2-mod-${block.modality_slug})` }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">{block.title}</p>
        <p className="v2-num mt-0.5 text-xs text-[color:var(--v2-muted)]">
          {block.format ?? 'bloque'}
          {block.usage_count > 0 ? ` · usado ${block.usage_count}×` : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={handleAdd}
        className="v2-focus inline-flex shrink-0 items-center gap-1 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 py-1.5 text-xs font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
      >
        <MIcon name="add" size={14} />
        Añadir
      </button>
    </div>
  );
}

// ── Crear desde cero ─────────────────────────────────────────────────────────
function CreateTab({
  onAdd,
  onCancel,
}: {
  onAdd: (block: EditorBlock) => void;
  onCancel: () => void;
}) {
  const [axis, setAxis] = useState<AxisModalidad | null>(null);
  const [name, setName] = useState('');
  const [prescription, setPrescription] = useState<Prescription | null>(null);

  const pickType = (a: AxisModalidad) => {
    setAxis(a);
    setPrescription(seedPrescription(a));
    if (!name) setName(MODALIDAD_OPTIONS.find((o) => o.value === a)?.label ?? '');
  };

  const canCreate = axis !== null && prescription !== null && name.trim() !== '';

  const handleCreate = () => {
    if (!canCreate || !prescription) return;
    onAdd({
      uid: `new-${Date.now()}`,
      title: name.trim(),
      format: null,
      group: 'principal',
      items: [
        {
          uid: `new-item-${Date.now()}`,
          exercise_id: null,
          exercise_name: name.trim(),
          prescription,
        },
      ],
    });
  };

  return (
    <div className="space-y-5 p-5">
      {/* 1 · ELIGE EL TIPO */}
      <section className="space-y-2.5">
        <h3 className="v2-micro">1 · Elige el tipo</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TYPE_TILES.map((t) => {
            const active = t.axis === axis;
            return (
              <button
                key={t.axis}
                type="button"
                onClick={() => pickType(t.axis)}
                aria-pressed={active}
                className={cn(
                  'v2-focus flex flex-col items-center gap-2 rounded-[var(--v2-r-m)] border bg-[color:var(--v2-surface-2)] px-3 py-4 text-center transition-colors',
                  active
                    ? 'border-[color:var(--v2-accent)] ring-1 ring-[color:var(--v2-accent)]'
                    : 'border-[color:var(--v2-border)] hover:border-[color:var(--v2-border-strong)]',
                )}
              >
                <span
                  className="text-[color:var(--v2-fg)]"
                  style={{ color: `var(--v2-mod-${slugForAxis(t.axis)})` }}
                >
                  <MIcon name={t.icon} size={24} filled={active} />
                </span>
                <span className="text-xs font-semibold text-[color:var(--v2-fg)]">{t.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2 · CONFIGURA */}
      {axis && prescription ? (
        <section className="space-y-3">
          <h3 className="v2-micro">2 · Configura</h3>
          <label className="block space-y-1.5">
            <span className="v2-micro">Nombre del bloque</span>
            <TextCell
              value={name}
              ariaLabel="Nombre del bloque"
              maxLength={120}
              placeholder="p. ej. Tirada larga Z2"
              onChange={setName}
            />
          </label>
          <PrescriptionFields value={prescription} onChange={setPrescription} />
          <AthletePreviewLine prescription={prescription} exerciseName={name} />
        </section>
      ) : (
        <p className="text-sm text-[color:var(--v2-muted)]">
          Elige un tipo para configurar la prescripción.
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t border-[color:var(--v2-border)] pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="v2-focus rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-4 py-2 text-sm font-semibold text-[color:var(--v2-fg)] transition-colors hover:bg-[color:var(--v2-surface-2)]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!canCreate}
          className="v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 py-2 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-40"
        >
          Crear y añadir
          <MIcon name="arrow_forward" size={16} />
        </button>
      </div>
    </div>
  );
}

function slugForAxis(axis: AxisModalidad): string {
  return axis === 'carrera' ? 'carrera' : axis === 'ergo' ? 'ergo' : axis === 'fuerza' ? 'fuerza' : 'circuito';
}
