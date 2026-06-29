'use client';

// ComponentsForm — the COMPONENTS base pattern (WOD/Metcon · Circuito/Core ·
// Fuerza-potencia/EMOM · Simulación HYROX routed here). A conditioning block is
// NOT one nested prescription: per the domain model a "compromised" block is
// MULTIPLE block items, each its OWN exercise + dosis (measure ± target) sharing
// one block. So this form edits the EditorBlock's ITEM LIST:
//   - Formato — the block-level scheme drawn from the shared metcon catalog
//     (For Time | AMRAP | EMOM | Tabata | Death By | Series | Chipper | Escalera |
//     Rondas), applied to every component (one block = one format).
//   - Rondas / Time cap / Ventana de trabajo — the scheme's structural fields,
//     stored on EVERY item's prescription so the persisted shape stays coherent.
//   - Componentes — the reorderable list: movimiento (exercise_name) + dosis
//     (reps | distancia | tiempo) ± carga.
// Edits the same EditorItem[] the serializer persists; zero free text.

import type {
  FormatParam,
  Measure,
  Prescription,
  PrescriptionScheme,
} from '@fahybrid/shared/domain/prescription';
import { formatMeta, formatsByFamily, setMeasure } from '@fahybrid/shared/domain/prescription';
import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import { ExercisePickerField } from '../ExercisePickerField';
import { defaultCategoryForModality } from '@/lib/dashboard/v2/pick-exercise';
import {
  ClockCell,
  DistanceCell,
  Field,
  InlineToggle,
  NumberCell,
} from './form-controls';

// The conditioning formats this WOD/components form offers: the full metcon
// family (minus the dedicated HYROX-sim template, which has its own archetype +
// ordered seed) plus the endurance interval format. The SET is DERIVED from the
// shared catalog (formatsByFamily) so a metcon format added there surfaces here
// automatically — there is no parallel list of format values.
type Format = Extract<
  PrescriptionScheme,
  | 'for_time'
  | 'amrap'
  | 'emom'
  | 'tabata'
  | 'death_by'
  | 'intervals'
  | 'chipper'
  | 'ladder'
  | 'rounds'
>;

const OFFERED_FORMATS: Format[] = [
  ...formatsByFamily('metcon').filter((f) => f !== 'hyrox_sim'),
  'intervals',
] as Format[];

// Spanish picker labels. The catalog `label` is canonical/English; every surface
// localizes its own copy. Keyed by the offered formats only.
const FORMAT_LABEL_ES: Record<Format, string> = {
  for_time: 'For Time',
  amrap: 'AMRAP',
  emom: 'EMOM',
  tabata: 'Tabata',
  death_by: 'Death By',
  intervals: 'Series',
  chipper: 'Chipper',
  ladder: 'Escalera',
  rounds: 'Rondas',
};

const FORMAT_OPTIONS: { value: Format; label: string }[] = OFFERED_FORMATS.map((f) => ({
  value: f,
  label: FORMAT_LABEL_ES[f],
}));

type DoseMode = 'reps' | 'distance' | 'duration';

// Per-format structural defaults. The existing four (for_time/amrap/emom/rounds)
// keep their exact prior values; the rest seed the catalog's new formats.
const DEFAULT_CAP_S = 1080; // 18' — For Time / Chipper / Escalera time cap
const DEFAULT_AMRAP_S = 720; // 12' — AMRAP total duration
const DEFAULT_WORK_S = 60; // EMOM minute window
const DEFAULT_TABATA_WORK_S = 20; // classic Tabata work
const DEFAULT_TABATA_REST_S = 10; // classic Tabata rest
const DEFAULT_TABATA_ROUNDS = 8; // classic Tabata rounds
const DEFAULT_DEATH_BY_WORK_S = 60; // Death By minute window
const DEFAULT_DEATH_BY_START = 1; // Death By round-1 reps
const DEFAULT_DEATH_BY_INCREMENT = 1; // Death By reps added per round
const DEFAULT_INTERVAL_ROUNDS = 4;
const DEFAULT_INTERVAL_WORK_S = 60;
const DEFAULT_INTERVAL_REST_S = 60;

// Every structural scalar a format may carry — the universe cleanScheme strips
// from, keeping only the format's catalog params.
const STRUCTURAL_PARAMS: readonly FormatParam[] = [
  'rounds',
  'work_s',
  'rest_s',
  'total_s',
  'start',
  'increment',
];

function blockFormat(block: EditorBlock): Format {
  const s = block.items[0]?.prescription.scheme;
  if (s && (OFFERED_FORMATS as string[]).includes(s)) return s as Format;
  return 'for_time';
}

// The block-level structural fields (rounds / cap / work window) read off the
// first item (every item carries the same — kept coherent by `applyHead`).
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
    // Reset EVERY structural field, then seed the new format's natural defaults.
    const base: Partial<Prescription> = {
      scheme: next,
      rounds: undefined,
      total_s: undefined,
      work_s: undefined,
      rest_s: undefined,
      start: undefined,
      increment: undefined,
    };
    switch (next) {
      case 'for_time':
        base.rounds = head?.rounds ?? 3;
        base.total_s = head?.total_s ?? DEFAULT_CAP_S;
        break;
      case 'amrap':
        base.total_s = head?.total_s ?? DEFAULT_AMRAP_S;
        break;
      case 'emom':
        base.rounds = head?.rounds ?? 10;
        base.work_s = head?.work_s ?? DEFAULT_WORK_S;
        break;
      case 'rounds':
        base.rounds = head?.rounds ?? 3;
        base.rest_s = head?.rest_s ?? 60;
        break;
      case 'tabata':
        base.work_s = head?.work_s ?? DEFAULT_TABATA_WORK_S;
        base.rest_s = head?.rest_s ?? DEFAULT_TABATA_REST_S;
        base.rounds = head?.rounds ?? DEFAULT_TABATA_ROUNDS;
        break;
      case 'death_by':
        base.work_s = head?.work_s ?? DEFAULT_DEATH_BY_WORK_S;
        base.start = head?.start ?? DEFAULT_DEATH_BY_START;
        base.increment = head?.increment ?? DEFAULT_DEATH_BY_INCREMENT;
        break;
      case 'intervals':
        base.rounds = head?.rounds ?? DEFAULT_INTERVAL_ROUNDS;
        base.work_s = head?.work_s ?? DEFAULT_INTERVAL_WORK_S;
        base.rest_s = head?.rest_s ?? DEFAULT_INTERVAL_REST_S;
        break;
      case 'chipper':
      case 'ladder':
        base.total_s = head?.total_s ?? DEFAULT_CAP_S;
        break;
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
      {/* Formato + per-format structural fields (driven by the catalog params) */}
      <div className="space-y-3">
        <Field label="Formato">
          <InlineToggle
            ariaLabel="Formato del bloque"
            value={format}
            options={FORMAT_OPTIONS}
            onChange={setFormat}
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(formatMeta(format)?.params ?? []).map((param) => (
            <FormatParamField
              key={param}
              param={param}
              format={format}
              head={head}
              onPatch={applyHead}
            />
          ))}
        </div>
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
        <div className="min-w-0 flex-1">
          <ExercisePickerField
            item={item}
            destinationLabel={`Componente ${index + 1}`}
            defaultCategory={defaultCategoryForModality(item.prescription.modality)}
            onChange={onChange}
            compact
          />
        </div>
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

// One structural input for a metcon format, chosen by the catalog param key. The
// labels localize per format (e.g. `rounds` reads "Minutos" for an EMOM); Death By
// adds the reps-based `start`/`increment` NumberCells.
function FormatParamField({
  param,
  format,
  head,
  onPatch,
}: {
  param: FormatParam;
  format: Format;
  head: Prescription | undefined;
  onPatch: (p: Partial<Prescription>) => void;
}) {
  switch (param) {
    case 'rounds':
      return (
        <Field label={format === 'emom' ? 'Minutos' : 'Rondas'}>
          <NumberCell
            value={head?.rounds ?? null}
            ariaLabel={format === 'emom' ? 'Minutos del EMOM' : 'Número de rondas'}
            min={1}
            max={60}
            suffix={format === 'emom' ? 'min' : 'rondas'}
            onChange={(v) => onPatch({ rounds: v ?? undefined })}
          />
        </Field>
      );
    case 'total_s': {
      const label = format === 'amrap' ? 'Duración total' : 'Time cap';
      return (
        <Field label={label}>
          <ClockCell
            seconds={head?.total_s ?? null}
            ariaLabel={`${label} (m:ss)`}
            onChange={(s) => onPatch({ total_s: s ?? undefined })}
          />
        </Field>
      );
    }
    case 'work_s': {
      const label = format === 'tabata' ? 'Trabajo' : 'Ventana trabajo';
      return (
        <Field label={label}>
          <ClockCell
            seconds={head?.work_s ?? null}
            ariaLabel={`${label} (m:ss)`}
            onChange={(s) => onPatch({ work_s: s ?? undefined })}
          />
        </Field>
      );
    }
    case 'rest_s':
      return (
        <Field label="Descanso">
          <ClockCell
            seconds={head?.rest_s ?? null}
            ariaLabel="Descanso (m:ss)"
            onChange={(s) => onPatch({ rest_s: s ?? undefined })}
          />
        </Field>
      );
    case 'start':
      return (
        <Field label="Inicio">
          <NumberCell
            value={head?.start ?? null}
            ariaLabel="Reps en la primera ronda"
            min={1}
            max={1000}
            suffix="reps"
            onChange={(v) => onPatch({ start: v ?? undefined })}
          />
        </Field>
      );
    case 'increment':
      return (
        <Field label="Incremento">
          <NumberCell
            value={head?.increment ?? null}
            ariaLabel="Reps añadidas cada ronda"
            min={1}
            max={1000}
            suffix="reps"
            onChange={(v) => onPatch({ increment: v ?? undefined })}
          />
        </Field>
      );
    default:
      return null;
  }
}

// Strip the structural fields a scheme doesn't use, so the persisted prescription
// stays clean (an AMRAP carries total_s, not rounds; EMOM carries work_s, etc.).
// The keep-set is the format's catalog `params`; everything else (including Death
// By's start/increment when not death_by) is dropped — one rule, every format.
function cleanScheme(p: Prescription): Prescription {
  const keep = new Set<FormatParam>(formatMeta(p.scheme)?.params ?? []);
  const out: Prescription = { ...p };
  for (const param of STRUCTURAL_PARAMS) {
    if (!keep.has(param)) delete out[param];
  }
  return out;
}
