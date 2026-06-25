'use client';

// ComponentsForm — the COMPONENTS base pattern (WOD/Metcon · Circuito/Core ·
// Fuerza-potencia/EMOM · Simulación HYROX routed here). A conditioning block is
// NOT one nested prescription: per the domain model a "compromised" block is
// MULTIPLE block items, each its OWN exercise + dosis (measure ± target) sharing
// one block. So this form edits the EditorBlock's ITEM LIST:
//   - Formato (For Time | AMRAP | EMOM | Rondas) — the block-level scheme, applied
//     to every component (one block = one format).
//   - Rondas / Time cap / Ventana de trabajo — the scheme's structural fields,
//     stored on EVERY item's prescription so the persisted shape stays coherent.
//   - Componentes — the reorderable list: movimiento (exercise_name) + dosis
//     (reps | distancia | tiempo) ± carga.
// Edits the same EditorItem[] the serializer persists; zero free text.

import type {
  Measure,
  Prescription,
  PrescriptionScheme,
} from '@fahybrid/shared/domain/prescription';
import { setMeasure } from '@fahybrid/shared/domain/prescription';
import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import {
  ClockCell,
  DistanceCell,
  Field,
  InlineToggle,
  NumberCell,
  TextCell,
} from './form-controls';

// The conditioning formats this form offers (block-level scheme).
type Format = Extract<PrescriptionScheme, 'for_time' | 'amrap' | 'emom' | 'rounds'>;

const FORMAT_OPTIONS: { value: Format; label: string }[] = [
  { value: 'for_time', label: 'For Time' },
  { value: 'amrap', label: 'AMRAP' },
  { value: 'emom', label: 'EMOM' },
  { value: 'rounds', label: 'Rondas' },
];

type DoseMode = 'reps' | 'distance' | 'duration';

const DEFAULT_CAP_S = 1080; // 18'
const DEFAULT_AMRAP_S = 720; // 12'
const DEFAULT_WORK_S = 60; // EMOM window

function blockFormat(block: EditorBlock): Format {
  const s = block.items[0]?.prescription.scheme;
  if (s === 'amrap' || s === 'emom' || s === 'rounds' || s === 'for_time') return s;
  return 'for_time';
}

// The block-level structural fields (rounds / cap / work window) read off the
// first item (every item carries the same — kept coherent by `applyFormat`).
function blockHead(block: EditorBlock): Prescription | undefined {
  return block.items[0]?.prescription;
}

export function ComponentsForm({
  block,
  onChange,
}: {
  block: EditorBlock;
  onChange: (next: EditorBlock) => void;
}) {
  const format = blockFormat(block);
  const head = blockHead(block);

  // Apply a block-level field (scheme / rounds / total_s / work_s / rest_s) to
  // EVERY item's prescription so the persisted shape stays coherent across the
  // block (all components share the format + cap).
  const applyHead = (p: Partial<Prescription>) => {
    onChange({
      ...block,
      items: block.items.map((it) => ({
        ...it,
        prescription: cleanScheme({ ...it.prescription, ...p }),
      })),
    });
  };

  const setFormat = (next: Format) => {
    if (next === format) return;
    // Reset the structural fields to the new format's natural defaults.
    const base: Partial<Prescription> = {
      scheme: next,
      rounds: undefined,
      total_s: undefined,
      work_s: undefined,
      rest_s: undefined,
    };
    if (next === 'for_time') {
      base.rounds = head?.rounds ?? 3;
      base.total_s = head?.total_s ?? DEFAULT_CAP_S;
    } else if (next === 'amrap') {
      base.total_s = head?.total_s ?? DEFAULT_AMRAP_S;
    } else if (next === 'emom') {
      base.rounds = head?.rounds ?? 10;
      base.work_s = head?.work_s ?? DEFAULT_WORK_S;
    } else if (next === 'rounds') {
      base.rounds = head?.rounds ?? 3;
      base.rest_s = head?.rest_s ?? 60;
    }
    applyHead(base);
  };

  const updateItem = (uid: string, patch: Partial<EditorItem>) =>
    onChange({
      ...block,
      items: block.items.map((it) => (it.uid === uid ? { ...it, ...patch } : it)),
    });

  const addComponent = () => {
    const next: EditorItem = {
      uid: `comp-${Date.now()}`,
      exercise_id: null,
      exercise_name: '',
      prescription: cleanScheme({
        ...(head ?? { scheme: format }),
        modality: head?.modality ?? 'functional',
        sets: [{ measure: { kind: 'reps', value: 10 } }],
        // structural fields are inherited from the head via the spread above.
      }),
    };
    onChange({ ...block, items: [...block.items, next] });
  };

  const removeComponent = (uid: string) =>
    onChange({ ...block, items: block.items.filter((it) => it.uid !== uid) });

  const moveComponent = (uid: string, dir: -1 | 1) => {
    const idx = block.items.findIndex((it) => it.uid === uid);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= block.items.length) return;
    const items = block.items.slice();
    [items[idx], items[swap]] = [items[swap]!, items[idx]!];
    onChange({ ...block, items });
  };

  return (
    <div className="space-y-4">
      {/* Formato + structural fields */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Formato">
          <InlineToggle
            ariaLabel="Formato del bloque"
            value={format}
            options={FORMAT_OPTIONS}
            onChange={setFormat}
          />
        </Field>

        {format === 'for_time' || format === 'emom' || format === 'rounds' ? (
          <Field label={format === 'emom' ? 'Minutos' : 'Rondas'}>
            <NumberCell
              value={head?.rounds ?? null}
              ariaLabel={format === 'emom' ? 'Minutos del EMOM' : 'Número de rondas'}
              min={1}
              max={60}
              suffix={format === 'emom' ? 'min' : 'rondas'}
              onChange={(v) => applyHead({ rounds: v ?? undefined })}
            />
          </Field>
        ) : null}

        {format === 'for_time' ? (
          <Field label="Time cap">
            <ClockCell
              seconds={head?.total_s ?? null}
              ariaLabel="Time cap (m:ss)"
              onChange={(s) => applyHead({ total_s: s ?? undefined })}
            />
          </Field>
        ) : null}

        {format === 'amrap' ? (
          <Field label="Duración total">
            <ClockCell
              seconds={head?.total_s ?? null}
              ariaLabel="Duración total (m:ss)"
              onChange={(s) => applyHead({ total_s: s ?? undefined })}
            />
          </Field>
        ) : null}

        {format === 'emom' ? (
          <Field label="Ventana trabajo">
            <ClockCell
              seconds={head?.work_s ?? null}
              ariaLabel="Ventana de trabajo (m:ss)"
              onChange={(s) => applyHead({ work_s: s ?? undefined })}
            />
          </Field>
        ) : null}

        {format === 'rounds' ? (
          <Field label="Descanso">
            <ClockCell
              seconds={head?.rest_s ?? null}
              ariaLabel="Descanso entre rondas (m:ss)"
              onChange={(s) => applyHead({ rest_s: s ?? undefined })}
            />
          </Field>
        ) : null}
      </div>

      {/* Componentes */}
      <div className="space-y-1.5">
        <span className="v2-micro">
          Componentes {format === 'amrap' || format === 'rounds' ? '(cada ronda)' : ''}
        </span>
        <div className="space-y-2">
          {block.items.map((it, i) => (
            <ComponentRow
              key={it.uid}
              index={i}
              item={it}
              count={block.items.length}
              onChange={(patch) => updateItem(it.uid, patch)}
              onRemove={() => removeComponent(it.uid)}
              onMove={(dir) => moveComponent(it.uid, dir)}
            />
          ))}
          {block.items.length === 0 ? (
            <p className="px-1 py-2 text-xs text-[color:var(--v2-muted)]">
              Sin componentes — añade el primer movimiento.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={addComponent}
          className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-2.5 py-1 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
        >
          <MIcon name="add" size={13} />
          Añadir movimiento
        </button>
      </div>
    </div>
  );
}

// One component row: orden · movimiento · dosis (reps|distancia|tiempo) ± carga.
function ComponentRow({
  index,
  item,
  count,
  onChange,
  onRemove,
  onMove,
}: {
  index: number;
  item: EditorItem;
  count: number;
  onChange: (patch: Partial<EditorItem>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const measure = item.prescription.sets?.[0]
    ? setMeasure(item.prescription.sets[0])
    : undefined;
  const doseMode: DoseMode =
    measure?.kind === 'distance' ? 'distance' : measure?.kind === 'duration' ? 'duration' : 'reps';

  const setMeasureOnItem = (m: Measure) =>
    onChange({ prescription: { ...item.prescription, sets: [{ measure: m }] } });

  const setDoseMode = (next: DoseMode) => {
    if (next === doseMode) return;
    const m: Measure =
      next === 'distance'
        ? { kind: 'distance', meters: 200 }
        : next === 'duration'
          ? { kind: 'duration', seconds: 30 }
          : { kind: 'reps', value: 10 };
    setMeasureOnItem(m);
  };

  return (
    <div className="rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-2">
      <div className="flex items-center gap-2">
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            aria-label={`Subir componente ${index + 1}`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="v2-focus text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)] disabled:opacity-30"
          >
            <MIcon name="keyboard_arrow_up" size={15} />
          </button>
          <button
            type="button"
            aria-label={`Bajar componente ${index + 1}`}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            className="v2-focus text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)] disabled:opacity-30"
          >
            <MIcon name="keyboard_arrow_down" size={15} />
          </button>
        </div>
        <span className="v2-num w-5 shrink-0 text-center text-xs font-bold text-[color:var(--v2-faint)]">
          {index + 1}
        </span>
        <TextCell
          value={item.exercise_name}
          ariaLabel={`Movimiento ${index + 1}`}
          placeholder="p. ej. Wall balls"
          maxLength={200}
          className="flex-1"
          onChange={(name) => onChange({ exercise_name: name })}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar componente ${index + 1}`}
          className="v2-focus shrink-0 rounded-[var(--v2-r-s)] p-1 text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-danger)]"
        >
          <MIcon name="close" size={14} />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2 pl-9">
        <InlineToggle
          ariaLabel={`Dosis del componente ${index + 1}`}
          value={doseMode}
          options={[
            { value: 'reps', label: 'Reps' },
            { value: 'distance', label: 'Dist' },
            { value: 'duration', label: 'Tiempo' },
          ]}
          onChange={setDoseMode}
        />
        <div className={cn('min-w-0 flex-1')}>
          {doseMode === 'reps' ? (
            <NumberCell
              value={measure?.kind === 'reps' ? measure.value : null}
              ariaLabel={`Reps del componente ${index + 1}`}
              min={0}
              max={1000}
              suffix="reps"
              onChange={(v) => setMeasureOnItem({ kind: 'reps', value: v ?? 0 })}
            />
          ) : doseMode === 'distance' ? (
            <DistanceCell
              meters={measure?.kind === 'distance' ? measure.meters : null}
              ariaPrefix={`Componente ${index + 1}`}
              onChange={(m) => setMeasureOnItem({ kind: 'distance', meters: m ?? 0 })}
            />
          ) : (
            <ClockCell
              seconds={measure?.kind === 'duration' ? measure.seconds : null}
              ariaLabel={`Tiempo del componente ${index + 1} (m:ss)`}
              onChange={(s) => setMeasureOnItem({ kind: 'duration', seconds: s ?? 0 })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Strip the structural fields a scheme doesn't use, so the persisted prescription
// stays clean (an AMRAP carries total_s, not rounds; EMOM carries work_s, etc.).
function cleanScheme(p: Prescription): Prescription {
  const out: Prescription = { ...p };
  switch (out.scheme) {
    case 'amrap':
      delete out.rounds;
      delete out.work_s;
      delete out.rest_s;
      break;
    case 'emom':
      delete out.total_s;
      delete out.rest_s;
      break;
    case 'for_time':
      delete out.work_s;
      delete out.rest_s;
      break;
    case 'rounds':
      delete out.total_s;
      delete out.work_s;
      break;
    default:
      break;
  }
  return out;
}
