'use client';

// SequenceEditor — the heart of Secuencias. Opens on a matrix cell (level × days)
// and builds the ORDERED chain of microciclos the athlete walks through. Each node
// = one microciclo (referenced via month_template_id, never copied) with its order,
// name and weeks. Nodes reorder by drag (HTML5, adjacent-swap like `ui/list-row`) with
// a keyboard ↑/↓ fallback; the order IS the periodization. Below: the running total
// ribbon + the end/progression panel.
//
// The chain is drawn as LA ESPINA (<CadenaEspina>) — the same shared vertical path
// the athlete sees on his phone and inside his coach's note, so the coach builds
// the sequence reading exactly what the athlete will read («S1-S4 · Primer mes»).
// See docs/DECISIONS.md 2026-08-09: a path is never redrawn per screen.
//
// SAVE = PUT /api/coach/sequences (the atomic full-set cell save): the ordered items
// (the server derives 1..N positions from array order) + end_policy + progression.
// Real persistence; on success the parent refetches the matrix so previews update.

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { Badge } from '@/components/ui/badge';
import { LevelBadge } from '@/components/v2/LevelBadge';
import { NuevoMicrocicloModal } from '@/components/v2/biblioteca/NuevoMicrocicloModal';
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
import { CadenaEspina } from './CadenaEspina';
import type { EslabonCadena } from './cadena';
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
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const microById = useMemo(
    () => new Map(microciclos.map((m) => [m.id, m])),
    [microciclos],
  );

  // Los eslabones tal y como los lee el camino: el nombre en `null` cuando el
  // microciclo ya no está en la biblioteca (así el nodo lo dice en vez de
  // pintarse vacío) y en cuántas celdas más aparece.
  const eslabones = useMemo<EslabonCadena[]>(
    () =>
      items.map((it) => {
        const micro = microById.get(it.month_template_id);
        return {
          clave: it.key,
          month_template_id: it.month_template_id,
          nombre: micro?.name ?? null,
          semanas: micro?.week_count ?? 0,
          usos: usageById[it.month_template_id] ?? 1,
        };
      }),
    [items, microById, usageById],
  );

  const totalWeeks = useMemo(() => eslabones.reduce((sum, e) => sum + e.semanas, 0), [eslabones]);

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

  // ── Persist (PUT atomic full-set) — one source of truth for the cell save ─────
  const persist = useCallback(
    async (itemsToSave: DraftItem[]) => {
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
          items: itemsToSave.map((it) => ({
            month_template_id: Number(it.month_template_id),
          })),
        }),
      });
      if (!res.ok) throw new Error('sequence_save_failed');
    },
    [level.id, days, endPolicy, progressionPct, progressionTarget],
  );

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await persist(items);
      onSaved();
    } catch {
      setError('No se pudo guardar la secuencia · Reintenta.');
    } finally {
      setSaving(false);
    }
  }, [persist, items, onSaved]);

  // Create a brand-new microciclo straight from THIS cell: it's created with the
  // cell's level, appended to the chain, and persisted with the rest of the cell so
  // the association survives navigation — then we land in the microciclo editor.
  const onCreatedFromCell = useCallback(
    async (created: { id: string }) => {
      const nextItems: DraftItem[] = [...items, { key: nextKey(), month_template_id: created.id }];
      await persist(nextItems);
      router.push(`/microciclos/${created.id}`);
    },
    [items, persist, router],
  );

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
              className="v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2 text-label font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
            >
              <MIcon name="arrow_back" size={15} /> Volver
            </button>
            <LevelBadge level={level.name} />
            <span className="rounded-[var(--v2-r-xs)] border border-[color:var(--v2-border-strong)] px-1.5 py-0.5 text-eyebrow font-bold uppercase tracking-[0.04em] text-[color:var(--v2-muted)]">
              {days} días
            </span>
            {isShared ? (
              <Badge tone="neutral">microciclos compartidos</Badge>
            ) : null}
          </div>
          <h2 className="v2-display text-2xl text-[color:var(--v2-fg)]">{level.label}</h2>
          <p className="mt-0.5 text-xs text-[color:var(--v2-muted)]">
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
          className="mb-3 flex items-center gap-2.5 rounded-[var(--v2-r-s)] px-3 py-2.5 text-xs"
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

      {/* the chain, as the path the athlete will walk */}
      <div className="max-w-[560px]">
        <CadenaEspina
          eslabones={eslabones}
          onMove={move}
          onRemove={remove}
          onAdd={() => setPickerOpen(true)}
          levelName={level.name}
          days={days}
        />
      </div>

      {/* running total — the proportion bar is gone: the espina already writes
          each microciclo's week range, so a second, nameless reading of the same
          thing was noise. */}
      {!isEmpty ? (
        <div className="mt-3.5 flex flex-wrap items-center gap-3 rounded-[var(--v2-r-s)] bg-[color:var(--v2-surface-2)] px-3.5 py-2.5 text-xs text-[color:var(--v2-muted)]">
          <span>
            <b className="v2-num text-[color:var(--v2-fg)]">{items.length}</b>{' '}
            {items.length === 1 ? 'microciclo' : 'microciclos'} ·{' '}
            <b className="v2-num text-[color:var(--v2-fg)]">{totalWeeks}</b> semanas en total
          </span>
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
      <div className="mt-3.5 flex items-center gap-3 rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)] px-4 py-3 text-xs text-[color:var(--v2-muted)]">
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
          onCreateNew={() => {
            setPickerOpen(false);
            setCreateOpen(true);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}

      {createOpen ? (
        <NuevoMicrocicloModal
          lockedLevel={{ id: level.id, name: level.name, label: level.label }}
          daysContext={days}
          onCreated={onCreatedFromCell}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}
    </div>
  );
}
