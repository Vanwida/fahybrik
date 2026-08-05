'use client';

// prescription-field-groups — the two adaptive CAMPOS bodies of PrescriptionFields
// (split out to keep each file modular / under the 500-line cap). StrengthFields
// renders the per-set table {reps, carga, tempo, descanso}; ConditioningFields
// renders the scheme fields + one block measure + one block target. Both edit the
// shared-domain `Prescription` directly (zero free text), via the same v2-native
// cells (./fields) and the editor-axes reads. TargetCell is shared by both: its
// KIND is fixed by the OBJETIVO axis, so it only edits the value/pace.

import type {
  Measure,
  Prescription,
  PrescriptionSet,
} from '@fahybrid/shared/domain/prescription';
import { setMeasure, setTarget } from '@fahybrid/shared/domain/prescription';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import { axesOf } from '@/lib/dashboard/v2/editor-axes';
import {
  ClockCell,
  DistanceCell,
  FieldLabel,
  NumberCell,
  TextCell,
} from './fields';
import { TargetCell } from './target-cell';

/**
 * Un valor que NO escribió el coach: lo propuso el importador porque la fuente no
 * lo enseñaba. Trazo discontinuo ámbar, el mismo lenguaje que la revisión — y es
 * FORMA además de color, así que se distingue sin ver el ámbar. Se acompaña
 * siempre de «, propuesto» en la etiqueta accesible del campo: un lector de
 * pantalla no ve el trazo.
 */
const PROPOSED_CELL =
  'rounded-[var(--v2-r-2xs)] outline outline-1 outline-dashed outline-offset-1 outline-[color:var(--v2-warn)]';

/** La etiqueta accesible de un campo propuesto. */
function proposedAria(label: string, proposed: boolean): string {
  return proposed ? `${label}, propuesto` : label;
}

// ── STRENGTH — per-set table {reps, carga, tempo, descanso} ──────────────────
export function StrengthFields({
  value,
  onChange,
  scheme = 'sets',
  showRest = true,
  proposedPaths,
}: {
  value: Prescription;
  onChange: (next: Prescription) => void;
  /**
   * El esquema con el que se reescribe la prescripción al editar. Por defecto
   * 'sets'. La SUPERSERIE usa esta misma tabla pero su bloque es 'superset': sin
   * este parámetro, tocar una serie devolvía el bloque a series rectas y la
   * rotación se perdía en silencio.
   */
  scheme?: Prescription['scheme'];
  /**
   * La superserie descansa al cerrar la VUELTA, no entre series de un mismo
   * ejercicio (encadenarlas es justo lo que la define), así que allí la columna se
   * oculta y el descanso vive una sola vez a nivel de bloque.
   */
  showRest?: boolean;
  /**
   * Rutas de esta prescripción cuyo valor puso el importador, no el coach
   * (`sets[0].rest_s`, `sets[0].measure`, `sets[0].target`). Solo la pasa la
   * revisión de una importación: SIN ella la tabla se pinta exactamente como
   * siempre y no sabe que existen las importaciones.
   */
  proposedPaths?: ReadonlyMap<string, string>;
}) {
  const sets = value.sets ?? [];
  const anyProposed = proposedPaths !== undefined && proposedPaths.size > 0;
  const gridCols = showRest
    ? 'grid-cols-[1.25rem_1fr_1fr_2.5rem]'
    : 'grid-cols-[1.25rem_1fr_1fr]';

  const updateSet = (i: number, patch: Partial<PrescriptionSet>) => {
    const nextSets = sets.map((s, idx) => {
      if (idx !== i) return s;
      const merged = { ...s, ...patch };
      (Object.keys(merged) as (keyof PrescriptionSet)[]).forEach((k) => {
        if (merged[k] === undefined) delete merged[k];
      });
      return merged;
    });
    onChange({ ...value, scheme, sets: nextSets });
  };

  const addSet = () => {
    const last = sets[sets.length - 1];
    const seed: PrescriptionSet = last ? { ...last } : { measure: { kind: 'reps', value: 8 } };
    onChange({ ...value, scheme, sets: [...sets, seed] });
  };

  const removeSet = (i: number) =>
    onChange({ ...value, scheme, sets: sets.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-2">
      <div className={cn('grid items-center gap-1.5 px-0.5', gridCols)}>
        <span className="v2-micro text-center">#</span>
        <span className="v2-micro">Reps</span>
        <span className="v2-micro">Carga</span>
        {showRest ? <span className="v2-micro text-right">Desc</span> : null}
      </div>

      <div className="space-y-1.5">
        {sets.map((set, i) => (
          <StrengthSetRow
            key={i}
            index={i}
            set={set}
            modality={value.modality}
            gridCols={gridCols}
            showRest={showRest}
            proposed={{
              measure: proposedPaths?.has(`sets[${i}].measure`) ?? false,
              target: proposedPaths?.has(`sets[${i}].target`) ?? false,
              rest: proposedPaths?.has(`sets[${i}].rest_s`) ?? false,
            }}
            onChange={(patch) => updateSet(i, patch)}
            onRemove={sets.length > 1 ? () => removeSet(i) : undefined}
          />
        ))}
        {sets.length === 0 ? (
          <p className="px-1 py-2 text-xs text-[color:var(--v2-muted)]">
            Sin series — añade la primera.
          </p>
        ) : null}
      </div>

      {anyProposed ? (
        <p className="px-0.5 text-label leading-snug text-[color:var(--v2-warn)]">
          Lo del trazo discontinuo no salía en la fuente: lo pusimos con tus valores por defecto.
        </p>
      ) : null}

      <button
        type="button"
        onClick={addSet}
        className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-2.5 py-1 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
      >
        <MIcon name="add" size={13} />
        Serie
      </button>
    </div>
  );
}

function StrengthSetRow({
  index,
  set,
  modality,
  gridCols,
  showRest,
  proposed,
  onChange,
  onRemove,
}: {
  index: number;
  set: PrescriptionSet;
  modality: Prescription['modality'];
  gridCols: string;
  showRest: boolean;
  /** Qué celdas de ESTA serie las puso el importador. Todo false = normal. */
  proposed?: { measure: boolean; target: boolean; rest: boolean };
  onChange: (patch: Partial<PrescriptionSet>) => void;
  onRemove?: () => void;
}) {
  const measure = setMeasure(set);
  const target = setTarget(set);
  const reps = measure?.kind === 'reps' ? measure.value : null;

  return (
    <div className="rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-1.5">
      <div className={cn('grid items-center gap-1.5', gridCols)}>
        <span className="v2-num text-center text-xs font-bold text-[color:var(--v2-muted)]">
          {index + 1}
        </span>
        <NumberCell
          value={reps}
          ariaLabel={proposedAria(`Serie ${index + 1} · reps`, proposed?.measure ?? false)}
          className={proposed?.measure ? PROPOSED_CELL : undefined}
          min={0}
          max={1000}
          onChange={(v) => onChange({ measure: v == null ? undefined : { kind: 'reps', value: v } })}
        />
        {/* El objetivo cambia de forma según su tipo (una cifra, un rango, un
            reloj de ritmo), así que la marca va en el contenedor y no dentro:
            así vale para las tres. El «(propuesto)» viaja por `ariaPrefix`, que
            ya se cuela en la etiqueta de todos sus campos. */}
        <div className={proposed?.target ? PROPOSED_CELL : undefined}>
          <TargetCell
            target={target}
            modality={modality}
            ariaPrefix={proposed?.target ? `Serie ${index + 1} (propuesto)` : `Serie ${index + 1}`}
            onChange={(t) => onChange({ target: t })}
          />
        </div>
        {showRest ? (
          <NumberCell
            value={set.rest_s ?? null}
            ariaLabel={proposedAria(`Descanso (s) serie ${index + 1}`, proposed?.rest ?? false)}
            className={proposed?.rest ? PROPOSED_CELL : undefined}
            min={0}
            max={3600}
            suffix="s"
            onChange={(v) => onChange({ rest_s: v ?? undefined })}
          />
        ) : null}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <TextCell
          value={set.tempo ?? ''}
          ariaLabel={`Tempo serie ${index + 1}`}
          placeholder="Tempo (3-1-1)"
          maxLength={20}
          onChange={(v) => onChange({ tempo: v || undefined })}
        />
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Quitar serie ${index + 1}`}
            className="v2-focus shrink-0 rounded-[var(--v2-r-s)] p-1 text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-danger)]"
          >
            <MIcon name="close" size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ── CONDITIONING — scheme fields + one block measure + one block target ──────
export function ConditioningFields({
  value,
  onChange,
}: {
  value: Prescription;
  onChange: (next: Prescription) => void;
}) {
  const patch = (p: Partial<Prescription>) => {
    const next = { ...value, ...p };
    (Object.keys(next) as (keyof Prescription)[]).forEach((k) => {
      if (next[k] === undefined) delete next[k];
    });
    onChange(next as Prescription);
  };

  const { scheme } = value;
  const showRounds = scheme === 'rounds' || scheme === 'emom' || scheme === 'intervals';
  const showWork = scheme === 'emom' || scheme === 'intervals' || scheme === 'rounds';
  const showRest = scheme === 'rounds' || scheme === 'intervals' || scheme === 'emom';
  const showTotal = scheme === 'amrap' || scheme === 'steady';

  const axes = axesOf(value);
  const medidaLabel =
    axes.medida === 'distance'
      ? 'distancia'
      : axes.medida === 'duration'
        ? 'tiempo'
        : axes.medida === 'calories'
          ? 'calorías'
          : 'reps';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        {showRounds ? (
          <LabeledNumber
            label="Rondas"
            value={value.rounds ?? null}
            min={1}
            max={60}
            onChange={(v) => patch({ rounds: v ?? undefined })}
          />
        ) : null}
        {showWork ? (
          <LabeledNumber
            label="Trabajo (s)"
            value={value.work_s ?? null}
            min={0}
            max={7200}
            suffix="s"
            onChange={(v) => patch({ work_s: v ?? undefined })}
          />
        ) : null}
        {showRest ? (
          <LabeledNumber
            label="Descanso (s)"
            value={value.rest_s ?? null}
            min={0}
            max={3600}
            suffix="s"
            onChange={(v) => patch({ rest_s: v ?? undefined })}
          />
        ) : null}
        {showTotal ? (
          <LabeledNumber
            label={scheme === 'amrap' ? 'Cap total (s)' : 'Tiempo total (s)'}
            value={value.total_s ?? null}
            min={0}
            max={21600}
            suffix="s"
            onChange={(v) => patch({ total_s: v ?? undefined })}
          />
        ) : null}
      </div>

      {/* Block measure — the distance / time / cal the work covers. */}
      <div className="space-y-1.5">
        <FieldLabel>Medida ({medidaLabel})</FieldLabel>
        <BlockMeasureCell value={value} onChange={onChange} />
      </div>

      {/* Block target — pace / zone / RPE for the whole block. */}
      <div className="space-y-1.5">
        <FieldLabel>Objetivo</FieldLabel>
        <TargetCell
          target={value.target}
          modality={value.modality}
          ariaPrefix="Bloque"
          onChange={(t) => patch({ target: t })}
        />
      </div>
    </div>
  );
}

// Block-level measure cell — distance/duration/cal per the active medida axis.
function BlockMeasureCell({
  value,
  onChange,
}: {
  value: Prescription;
  onChange: (next: Prescription) => void;
}) {
  const axes = axesOf(value);
  const m = currentBlockMeasure(value);
  const set = (next: Measure) => onChange(applyMeasureToBlock(value, next));

  switch (axes.medida) {
    case 'distance':
      return (
        <DistanceCell
          meters={m?.kind === 'distance' ? m.meters : null}
          ariaPrefix="Bloque"
          onChange={(meters) => set({ kind: 'distance', meters: meters ?? 0 })}
        />
      );
    case 'duration':
      return (
        <ClockCell
          seconds={m?.kind === 'duration' ? m.seconds : null}
          ariaLabel="Bloque · tiempo (m:ss)"
          onChange={(s) => set({ kind: 'duration', seconds: s ?? 0 })}
        />
      );
    case 'calories':
      return (
        <NumberCell
          value={m?.kind === 'calories' ? m.value : null}
          ariaLabel="Bloque · calorías"
          min={0}
          max={100000}
          suffix="cal"
          onChange={(v) => set({ kind: 'calories', value: v ?? 0 })}
        />
      );
    case 'reps':
      return (
        <NumberCell
          value={m?.kind === 'reps' ? m.value : null}
          ariaLabel="Bloque · reps"
          min={0}
          max={1000}
          onChange={(v) => set({ kind: 'reps', value: v ?? 0 })}
        />
      );
  }
}

function currentBlockMeasure(p: Prescription): Measure | undefined {
  if (p.sets && p.sets.length === 1) {
    const m = setMeasure(p.sets[0]!);
    if (m) return m;
  }
  if ((p.scheme === 'steady' || p.scheme === 'amrap') && p.total_s !== undefined) {
    return { kind: 'duration', seconds: p.total_s };
  }
  if (p.work_s !== undefined) return { kind: 'duration', seconds: p.work_s };
  return undefined;
}

function applyMeasureToBlock(p: Prescription, m: Measure): Prescription {
  if (m.kind === 'duration') {
    if (p.scheme === 'steady' || p.scheme === 'amrap') {
      const { sets: _s, ...rest } = p;
      void _s;
      return { ...rest, total_s: m.seconds };
    }
    const { sets: _s, ...rest } = p;
    void _s;
    return { ...rest, work_s: m.seconds };
  }
  // distance / calories / reps carry on a single representative set.
  return { ...p, sets: [{ measure: m }] };
}

function LabeledNumber({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number | null;
  min?: number;
  max?: number;
  suffix?: string;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <FieldLabel>{label}</FieldLabel>
      <NumberCell value={value} ariaLabel={label} min={min} max={max} suffix={suffix} onChange={onChange} />
    </label>
  );
}
