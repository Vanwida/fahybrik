'use client';

// SequenceEditor — the heart of Secuencias. Opens on a matrix cell (level × days)
// and builds the ORDERED chain of microciclos the athlete walks through. Each card
// = one microciclo (referenced via month_template_id, never copied) with its order,
// name and weeks. Cards reorder by drag (HTML5, adjacent-swap like ReorderRow) with
// keyboard ↑/↓ fallback; the order IS the periodization. Below: the running total
// ribbon + the end/progression panel.
//
// SAVE = PUT /api/coach/sequences (the atomic full-set cell save): the ordered items
// (the server derives 1..N positions from array order) + end_policy + progression.
// Real persistence; on success the parent refetches the matrix so previews update.

import { useCallback, useMemo, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import { LevelBadge } from '@/components/v2/LevelBadge';
import type {
  SequenceEndPolicy,
  SequenceProgressionTarget,
} from '@fahybrid/shared/schema/program-sequences';
import type {
  V2Sequence,
  V2SequenceMicrociclo,
  V2SequenceItem,
} from '@/lib/dashboard/v2/secuencias';
import type { V2LevelItem } from '@/lib/dashboard/v2/periodizacion';
import { AddMicrocicloPicker } from './AddMicrocicloPicker';
import { EndPolicyPanel } from './EndPolicyPanel';

// A working item: the persisted month_template_id + a client-only key so React can
// track cards across reorders without a server id.
interface DraftItem {
  key: string;
  month_template_id: string;
}

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `it_${keySeq}`;
}

function toDraftItems(items: V2SequenceItem[]): DraftItem[] {
  return items.map((it) => ({
    key: nextKey(),
    month_template_id: it.month_template_id,
  }));
}

export function SequenceEditor({
  level,
  days,
  sequence,
  microciclos,
  usageById,
  isShared,
  onClose,
  onSaved,
}: {
  level: V2LevelItem;
  days: number;
  /** The existing sequence for this cell, or null when creating a new one. */
  sequence: V2Sequence | null;
  microciclos: V2SequenceMicrociclo[];
  /** month_template_id → how many sequences use it (for the picker hint). */
  usageById: Record<string, number>;
  /** True when this same cell's microciclos appear in >1 matrix cell. */
  isShared: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<DraftItem[]>(() => toDraftItems(sequence?.items ?? []));
  const [endPolicy, setEndPolicy] = useState<SequenceEndPolicy>(sequence?.end_policy ?? 'repeat');
  const [progressionPct, setProgressionPct] = useState<number | null>(
    sequence?.progression_pct ?? null,
  );
  const [progressionTarget, setProgressionTarget] = useState<SequenceProgressionTarget | null>(
    sequence?.progression_applies_to ?? null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const microById = useMemo(
    () => new Map(microciclos.map((m) => [m.id, m])),
    [microciclos],
  );

  const totalWeeks = useMemo(
    () => items.reduce((sum, it) => sum + (microById.get(it.month_template_id)?.week_count ?? 0), 0),
    [items, microById],
  );

  // ── Chain mutations ───────────────────────────────────────────────────────
  const move = useCallback((index: number, delta: -1 | 1) => {
    setItems((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      const tmp = next[index]!;
      next[index] = next[target]!;
      next[target] = tmp;
      return next;
    });
    setError(null);
  }, []);

  const remove = useCallback((key: string) => {
    setItems((prev) => prev.filter((it) => it.key !== key));
    setError(null);
  }, []);

  const addMicrociclo = useCallback((m: V2SequenceMicrociclo) => {
    setItems((prev) => [...prev, { key: nextKey(), month_template_id: m.id }]);
    setPickerOpen(false);
    setError(null);
  }, []);

  // ── Save (PUT atomic full-set) ──────────────────────────────────────────────
  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/coach/sequences', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          level_id: Number(level.id),
          days_per_week: days,
          end_policy: endPolicy,
          // The all-or-nothing pair: only send when the loop repeats.
          progression_pct: endPolicy === 'repeat' ? progressionPct : null,
          progression_applies_to: endPolicy === 'repeat' ? progressionTarget : null,
          items: items.map((it) => ({
            month_template_id: Number(it.month_template_id),
          })),
        }),
      });
      if (!res.ok) {
        setError('No se pudo guardar la secuencia · Reintenta.');
        return;
      }
      onSaved();
    } catch {
      setError('No se pudo guardar la secuencia · Reintenta.');
    } finally {
      setSaving(false);
    }
  }, [level.id, days, endPolicy, progressionPct, progressionTarget, items, onSaved]);

  const isEmpty = items.length === 0;

  return (
    <div>
      {/* header */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2 text-[11px] font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
            >
              <MIcon name="arrow_back" size={15} /> Volver
            </button>
            <LevelBadge level={level.name} />
            <span className="rounded-[var(--v2-r-xs)] border border-[color:var(--v2-border-strong)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-[color:var(--v2-muted)]">
              {days} días
            </span>
            {isShared ? (
              <span className="rounded-[var(--v2-r-pill)] bg-[color:var(--v2-surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--v2-muted)]">
                microciclos compartidos
              </span>
            ) : null}
          </div>
          <h2 className="v2-display text-2xl text-[color:var(--v2-fg)]">{level.label}</h2>
          <p className="mt-0.5 text-[12.5px] text-[color:var(--v2-muted)]">
            La cadena que recorre todo atleta clasificado a {level.name} · {days} días.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="v2-focus inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3.5 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <MIcon name="check" size={16} /> {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          className="mb-3 flex items-center gap-2.5 rounded-[var(--v2-r-s)] px-3 py-2.5 text-[12.5px]"
          style={{
            background: 'var(--v2-danger-soft)',
            color: 'var(--v2-danger)',
            border: '1px solid color-mix(in srgb, var(--v2-danger) 30%, transparent)',
          }}
        >
          <MIcon name="error" size={16} />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Descartar" className="v2-focus rounded">
            <MIcon name="close" size={15} />
          </button>
        </div>
      ) : null}

      {/* the chain */}
      <div className="flex flex-wrap items-stretch gap-0">
        {items.map((it, i) => {
          const micro = microById.get(it.month_template_id);
          return (
            <div key={it.key} className="flex items-stretch">
              <MicrocicloCard
                order={i + 1}
                index={i}
                total={items.length}
                name={micro?.name ?? 'Microciclo eliminado'}
                weeks={micro?.week_count ?? 0}
                missing={!micro}
                onMove={move}
                onRemove={() => remove(it.key)}
              />
              <div className="flex w-[26px] items-center justify-center text-lg font-bold text-[color:var(--v2-accent)]">
                →
              </div>
            </div>
          );
        })}
        <AddCard onClick={() => setPickerOpen(true)} levelName={level.name} days={days} empty={isEmpty} />
      </div>

      {/* running total */}
      {!isEmpty ? (
        <div className="mt-3.5 flex flex-wrap items-center gap-3 rounded-[var(--v2-r-s)] bg-[color:var(--v2-surface-2)] px-3.5 py-2.5 text-[12px] text-[color:var(--v2-muted)]">
          <span>
            <b className="v2-num text-[color:var(--v2-fg)]">{items.length}</b>{' '}
            {items.length === 1 ? 'microciclo' : 'microciclos'} ·{' '}
            <b className="v2-num text-[color:var(--v2-fg)]">{totalWeeks}</b> semanas en total
          </span>
          <TotalBar items={items} microById={microById} />
          {endPolicy === 'repeat' && progressionPct != null ? (
            <span className="text-[color:var(--v2-faint)]">↻ vuelve a empezar con +{progressionPct}%</span>
          ) : endPolicy === 'level_up' ? (
            <span className="text-[color:var(--v2-faint)]">↑ al acabar, sube de nivel</span>
          ) : endPolicy === 'stop' ? (
            <span className="text-[color:var(--v2-faint)]">■ al acabar, para</span>
          ) : null}
        </div>
      ) : null}

      {/* end + progression */}
      <EndPolicyPanel
        endPolicy={endPolicy}
        progressionPct={progressionPct}
        progressionTarget={progressionTarget}
        disabled={isEmpty}
        onChange={(next) => {
          setEndPolicy(next.endPolicy);
          setProgressionPct(next.progressionPct);
          setProgressionTarget(next.progressionTarget);
        }}
      />

      {/* purpose strip */}
      <div className="mt-3.5 flex items-center gap-3 rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)] px-4 py-3 text-[12.5px] text-[color:var(--v2-muted)]">
        <span className="shrink-0 text-[color:var(--v2-accent)]">
          <MIcon name="my_location" size={18} />
        </span>
        <span className="flex-1">
          Todo atleta clasificado a <b className="text-[color:var(--v2-fg)]">{level.name} · {days} días</b> recorrerá esta
          secuencia automáticamente — empieza en el microciclo 1 y avanza una semana cada vez. La montas{' '}
          <b className="text-[color:var(--v2-fg)]">una vez</b>.
        </span>
      </div>

      {pickerOpen ? (
        <AddMicrocicloPicker
          microciclos={microciclos}
          usageById={usageById}
          onPick={addMicrociclo}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  );
}

// ── Microciclo card ─────────────────────────────────────────────────────────────

function MicrocicloCard({
  order,
  index,
  total,
  name,
  weeks,
  missing,
  onMove,
  onRemove,
}: {
  order: number;
  index: number;
  total: number;
  name: string;
  weeks: number;
  missing: boolean;
  onMove: (index: number, delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const from = Number.parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!Number.isFinite(from) || from === index) return;
    const delta: -1 | 1 = from < index ? 1 : -1;
    let cur = from;
    while (cur !== index) {
      onMove(cur, delta);
      cur += delta;
    }
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        'group relative flex w-[188px] flex-col gap-2.5 rounded-[var(--v2-r-m)] border bg-[color:var(--v2-surface)] p-3',
        missing ? 'border-[color:var(--v2-danger)]' : 'border-[color:var(--v2-border)]',
      )}
    >
      {/* remove (hover) */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Quitar de la secuencia (no lo borra de la biblioteca)"
        title="Quitar de la secuencia (no lo borra de la biblioteca)"
        className="v2-focus absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-elevated)] text-[color:var(--v2-muted)] transition-colors group-hover:flex hover:text-[color:var(--v2-danger)]"
      >
        <MIcon name="close" size={12} />
      </button>

      <div className="flex items-center gap-2">
        <span
          className="shrink-0 cursor-grab select-none text-[color:var(--v2-faint)] active:cursor-grabbing"
          title="Arrastra para reordenar"
          aria-hidden
        >
          <MIcon name="drag_indicator" size={16} />
        </span>
        <span className="v2-num flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-[color:var(--v2-surface-2)] text-[11px] font-bold text-[color:var(--v2-muted)]">
          {order}
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[13px] font-bold',
            missing ? 'text-[color:var(--v2-danger)]' : 'text-[color:var(--v2-fg)]',
          )}
          title={name}
        >
          {name}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-[color:var(--v2-muted)]">
        <MIcon name="date_range" size={13} className="opacity-70" />
        <b className="v2-num">{weeks}</b> {weeks === 1 ? 'semana' : 'semanas'}
      </div>

      {/* reorder fallback (keyboard / touch) */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
          aria-label="Mover antes"
          className={cn(
            'v2-focus flex h-[18px] flex-1 items-center justify-center rounded-[4px] border border-[color:var(--v2-border)] text-[color:var(--v2-faint)] transition-colors',
            index === 0 ? 'cursor-not-allowed opacity-30' : 'hover:text-[color:var(--v2-fg)]',
          )}
        >
          <MIcon name="chevron_left" size={14} />
        </button>
        <button
          type="button"
          onClick={() => onMove(index, 1)}
          disabled={index === total - 1}
          aria-label="Mover después"
          className={cn(
            'v2-focus flex h-[18px] flex-1 items-center justify-center rounded-[4px] border border-[color:var(--v2-border)] text-[color:var(--v2-faint)] transition-colors',
            index === total - 1 ? 'cursor-not-allowed opacity-30' : 'hover:text-[color:var(--v2-fg)]',
          )}
        >
          <MIcon name="chevron_right" size={14} />
        </button>
      </div>
    </div>
  );
}

function AddCard({
  onClick,
  levelName,
  days,
  empty,
}: {
  onClick: () => void;
  levelName: string;
  days: number;
  empty: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="v2-focus flex min-h-[128px] w-[188px] flex-col items-center justify-center gap-1.5 rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border)] px-3 text-center text-[color:var(--v2-faint)] transition-colors hover:border-[color:var(--v2-accent)] hover:text-[color:var(--v2-accent)]"
    >
      <MIcon name="add" size={22} />
      <span className="text-[11.5px] font-bold">Añadir microciclo</span>
      {empty ? (
        <span className="text-[10.5px] font-normal leading-snug text-[color:var(--v2-faint)]">
          Encadena microciclos para montar la periodización de {levelName} · {days} días
        </span>
      ) : null}
    </button>
  );
}

// The running-total ribbon's segmented bar — one segment per microciclo, width ∝
// weeks.
function TotalBar({
  items,
  microById,
}: {
  items: DraftItem[];
  microById: Map<string, V2SequenceMicrociclo>;
}) {
  const segs = items.map((it) => ({
    weeks: Math.max(microById.get(it.month_template_id)?.week_count ?? 1, 1),
  }));
  const total = segs.reduce((sum, s) => sum + s.weeks, 0);
  if (total === 0) return null;
  return (
    <div className="flex h-2 max-w-[420px] flex-1 items-center gap-[2px]" aria-hidden>
      {segs.map((s, i) => (
        <span
          key={i}
          className="h-2 rounded-[2px]"
          style={{
            width: `${(s.weeks / total) * 100}%`,
            background: 'var(--v2-muted)',
          }}
        />
      ))}
    </div>
  );
}
