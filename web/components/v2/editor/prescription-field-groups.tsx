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
  Target,
} from '@fahybrid/shared/domain/prescription';
import { setMeasure, setTarget } from '@fahybrid/shared/domain/prescription';
import { MIcon } from '@/components/ui/MIcon';
import { axesOf } from '@/lib/dashboard/v2/editor-axes';
import {
  ClockCell,
  DistanceCell,
  FieldLabel,
  NumberCell,
  TextCell,
} from './fields';

// ── STRENGTH — per-set table {reps, carga, tempo, descanso} ──────────────────
export function StrengthFields({
  value,
  onChange,
}: {
  value: Prescription;
  onChange: (next: Prescription) => void;
}) {
  const sets = value.sets ?? [];

  const updateSet = (i: number, patch: Partial<PrescriptionSet>) => {
    const nextSets = sets.map((s, idx) => {
      if (idx !== i) return s;
      const merged = { ...s, ...patch };
      (Object.keys(merged) as (keyof PrescriptionSet)[]).forEach((k) => {
        if (merged[k] === undefined) delete merged[k];
      });
      return merged;
    });
    onChange({ ...value, scheme: 'sets', sets: nextSets });
  };

  const addSet = () => {
    const last = sets[sets.length - 1];
    const seed: PrescriptionSet = last ? { ...last } : { measure: { kind: 'reps', value: 8 } };
    onChange({ ...value, scheme: 'sets', sets: [...sets, seed] });
  };

  const removeSet = (i: number) =>
    onChange({ ...value, scheme: 'sets', sets: sets.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1.25rem_1fr_1fr_2.5rem] items-center gap-1.5 px-0.5">
        <span className="v2-micro text-center">#</span>
        <span className="v2-micro">Reps</span>
        <span className="v2-micro">Carga</span>
        <span className="v2-micro text-right">Desc</span>
      </div>

      <div className="space-y-1.5">
        {sets.map((set, i) => (
          <StrengthSetRow
            key={i}
            index={i}
            set={set}
            modality={value.modality}
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
  onChange,
  onRemove,
}: {
  index: number;
  set: PrescriptionSet;
  modality: Prescription['modality'];
  onChange: (patch: Partial<PrescriptionSet>) => void;
  onRemove?: () => void;
}) {
  const measure = setMeasure(set);
  const target = setTarget(set);
  const reps = measure?.kind === 'reps' ? measure.value : null;

  return (
    <div className="rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-1.5">
      <div className="grid grid-cols-[1.25rem_1fr_1fr_2.5rem] items-center gap-1.5">
        <span className="v2-num text-center text-xs font-bold text-[color:var(--v2-muted)]">
          {index + 1}
        </span>
        <NumberCell
          value={reps}
          ariaLabel={`Serie ${index + 1} · reps`}
          min={0}
          max={1000}
          onChange={(v) => onChange({ measure: v == null ? undefined : { kind: 'reps', value: v } })}
        />
        <TargetCell
          target={target}
          modality={modality}
          ariaPrefix={`Serie ${index + 1}`}
          onChange={(t) => onChange({ target: t })}
        />
        <NumberCell
          value={set.rest_s ?? null}
          ariaLabel={`Descanso (s) serie ${index + 1}`}
          min={0}
          max={3600}
          suffix="s"
          onChange={(v) => onChange({ rest_s: v ?? undefined })}
        />
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

// ── TargetCell — kind is fixed by the OBJETIVO axis; this edits the value ─────
function TargetCell({
  target,
  modality,
  ariaPrefix,
  onChange,
}: {
  target: Target | undefined;
  modality: Prescription['modality'];
  ariaPrefix: string;
  onChange: (t: Target | undefined) => void;
}) {
  const kind = target?.kind ?? 'rpe';

  if (kind === 'bodyweight') {
    return (
      <span className="flex items-center px-1 text-xs text-[color:var(--v2-muted)]">
        Sin carga externa
      </span>
    );
  }

  if (kind === 'pace') {
    const t = target?.kind === 'pace' ? target : undefined;
    const unit = t?.unit ?? (modality === 'run' ? 'per_km' : 'per_500m');
    const unitLabel = unit === 'per_km' ? '/km' : unit === 'per_500m' ? '/500m' : '/mi';
    return (
      <div className="flex min-w-0 items-center gap-1">
        <ClockCell
          seconds={t?.value_s ?? null}
          ariaLabel={`${ariaPrefix} · ritmo (m:ss)`}
          className="flex-1"
          onChange={(s) => onChange({ kind: 'pace', unit, value_s: s ?? undefined })}
        />
        <span className="shrink-0 text-[11px] font-semibold text-[color:var(--v2-muted)]">
          {unitLabel}
        </span>
      </div>
    );
  }

  // Scalar kinds (%RM / kg / RPE / RIR / zona / bpm / cal). RANGE-capable: the
  // Target model carries either a point (`value`) or a range (`min`/`max`), and
  // the athlete preview already renders ranges ("@ 65-80% RM") — so the editable
  // cell must too. A "desde – hasta" pair: a single point fills `desde` and
  // leaves `hasta` empty; a range fills both. Reading prefers min/max, falling
  // back to the point on the lower bound.
  const suffix = SCALAR_SUFFIX[kind];
  const bounds = scalarBounds(kind);
  const scalar =
    target && target.kind !== 'bodyweight' && target.kind !== 'pace' && target.kind !== 'time_cap'
      ? target
      : undefined;
  const lo = scalar ? scalar.min ?? scalar.value ?? null : null;
  const hi = scalar ? scalar.max ?? null : null;
  const build = (nextLo: number | null, nextHi: number | null): Target | undefined => {
    if (nextLo == null && nextHi == null) return undefined;
    if (nextLo != null && nextHi != null && nextLo !== nextHi) {
      return { kind, min: Math.min(nextLo, nextHi), max: Math.max(nextLo, nextHi) } as Target;
    }
    return { kind, value: (nextLo ?? nextHi)! } as Target;
  };
  return (
    <div className="flex min-w-0 items-center gap-1">
      <NumberCell
        value={lo}
        ariaLabel={`${ariaPrefix} · objetivo (desde)`}
        min={bounds.min}
        max={bounds.max}
        className="flex-1"
        onChange={(val) => onChange(build(val, hi))}
      />
      <span
        className="shrink-0 text-[11px] font-semibold text-[color:var(--v2-faint)]"
        aria-hidden
      >
        –
      </span>
      <NumberCell
        value={hi}
        ariaLabel={`${ariaPrefix} · objetivo (hasta)`}
        min={bounds.min}
        max={bounds.max}
        className="flex-1"
        onChange={(val) => onChange(build(lo, val))}
      />
      {suffix ? (
        <span className="shrink-0 text-[11px] font-semibold text-[color:var(--v2-muted)]">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

const SCALAR_SUFFIX: Partial<Record<Target['kind'], string>> = {
  percent_rm: '%',
  kg: 'kg',
  hr_zone: 'Z',
  hr_bpm: 'ppm',
  calories: 'cal',
  rpe: 'RPE',
  rir: 'RIR',
};

function scalarBounds(kind: Target['kind']): { min: number; max: number } {
  switch (kind) {
    case 'percent_rm':
      return { min: 0, max: 200 };
    case 'rpe':
      return { min: 0, max: 10 };
    case 'rir':
      return { min: 0, max: 50 };
    case 'hr_zone':
      return { min: 1, max: 5 };
    case 'hr_bpm':
      return { min: 20, max: 250 };
    default:
      return { min: 0, max: 100000 };
  }
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
