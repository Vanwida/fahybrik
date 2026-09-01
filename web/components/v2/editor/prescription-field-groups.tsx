'use client';

// prescription-field-groups — el cuerpo de CAMPOS de acondicionamiento de
// PrescriptionFields: los campos del esquema + una medida de bloque + un
// objetivo de bloque. (El cuerpo de FUERZA vive en ./strength-composer desde el
// rediseño del compositor — chips y steppers en vez de celdas.) Edita el
// `Prescription` del dominio compartido directamente (cero texto libre), con
// las mismas celdas v2 (./fields) y las lecturas de editor-axes.

import type { Measure, Prescription } from '@fahybrid/shared/domain/prescription';
import { setMeasure } from '@fahybrid/shared/domain/prescription';
import { axesOf } from '@/lib/dashboard/v2/editor-axes';
import { ClockCell, DistanceCell, FieldLabel, NumberCell } from './fields';
import { TargetCell } from './target-cell';

// El compositor de fuerza mantiene su casa histórica como re-export para que
// `grep StrengthFields` siga encontrando un solo canónico (CONTRATO-UI §0).
export { StrengthFields } from './strength-composer';

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
