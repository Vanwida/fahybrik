'use client';

// SteadyForm — the STEADY base pattern (Carrera continua/Z2 · Activación/Tapering
// · Test). ONE line: Modo (duración|distancia) + valor + Objetivo (zona|ritmo|RPE).
// The archetype fixed the modality (run / mobility) and scheme (steady); this form
// shows ONLY the measure and the block target — no modality/measure/objetivo
// toggles. Edits the shared `Prescription` directly via the canonical fields.
//
// Measure on a steady block: a DURATION lives in `total_s`; a DISTANCE lives on a
// single representative set (the model has no native distance scheme field). The
// objective is the block-level `target`. Switching mode/objective reshapes the
// relevant field in place — the ONE allowed inline switch per the UX pase.

import type { Measure, Prescription, Target } from '@fahybrid/shared/domain/prescription';
import { setMeasure } from '@fahybrid/shared/domain/prescription';
import { isErgModality } from '@/lib/programming/prescription-model';
import {
  ClockCell,
  DistanceCell,
  Field,
  InlineToggle,
  PaceCell,
  ScalarTargetCell,
} from './form-controls';

type Mode = 'duration' | 'distance';
// Vatios is offered ONLY on erg surfaces (row/ski/bike); a run/mobility block has no power.
type ObjectiveKind = 'hr_zone' | 'pace' | 'watts' | 'rpe';

const OBJECTIVE_OPTIONS_BASE: { value: ObjectiveKind; label: string }[] = [
  { value: 'hr_zone', label: 'Zona' },
  { value: 'pace', label: 'Ritmo' },
  { value: 'rpe', label: 'RPE' },
];
const OBJECTIVE_OPTIONS_ERG: { value: ObjectiveKind; label: string }[] = [
  { value: 'hr_zone', label: 'Zona' },
  { value: 'pace', label: 'Ritmo' },
  { value: 'watts', label: 'Vatios' },
  { value: 'rpe', label: 'RPE' },
];

const DEFAULT_DURATION_S = 1800; // 30' rodaje
const DEFAULT_DISTANCE_M = 5000; // 5 km

function readMode(p: Prescription): Mode {
  if (p.total_s !== undefined) return 'duration';
  if (p.sets?.[0]) {
    const m = setMeasure(p.sets[0]);
    if (m?.kind === 'distance') return 'distance';
  }
  return 'duration';
}

function readMeasure(p: Prescription): Measure | undefined {
  if (p.total_s !== undefined) return { kind: 'duration', seconds: p.total_s };
  if (p.sets?.[0]) {
    const m = setMeasure(p.sets[0]);
    if (m) return m;
  }
  return undefined;
}

export function SteadyForm({
  value,
  onChange,
}: {
  value: Prescription;
  onChange: (next: Prescription) => void;
}) {
  const mode = readMode(value);
  const measure = readMeasure(value);
  const objKind: ObjectiveKind =
    value.target?.kind === 'pace' ||
    value.target?.kind === 'rpe' ||
    value.target?.kind === 'watts'
      ? value.target.kind
      : 'hr_zone';
  const objectiveOptions = isErgModality(value.modality)
    ? OBJECTIVE_OPTIONS_ERG
    : OBJECTIVE_OPTIONS_BASE;

  const setMode = (next: Mode) => {
    if (next === mode) return;
    const base = { scheme: 'steady' as const, modality: value.modality, target: value.target };
    if (next === 'duration') {
      onChange({ ...base, total_s: DEFAULT_DURATION_S });
    } else {
      onChange({ ...base, sets: [{ measure: { kind: 'distance', meters: DEFAULT_DISTANCE_M } }] });
    }
  };

  const setDuration = (seconds: number | null) =>
    onChange({ scheme: 'steady', modality: value.modality, total_s: seconds ?? 0, target: value.target });

  const setDistance = (meters: number | null) =>
    onChange({
      scheme: 'steady',
      modality: value.modality,
      sets: [{ measure: { kind: 'distance', meters: meters ?? 0 } }],
      target: value.target,
    });

  const setObjectiveKind = (kind: ObjectiveKind) => {
    const target: Target =
      kind === 'pace'
        ? { kind: 'pace', unit: value.modality === 'run' ? 'per_km' : 'per_500m', value_s: 270 }
        : kind === 'rpe'
          ? { kind: 'rpe', value: 5 }
          : kind === 'watts'
            ? { kind: 'watts', value: 200 }
            : { kind: 'hr_zone', value: 2 };
    onChange({ ...value, target });
  };

  const setTargetValue = (target: Target) => onChange({ ...value, target });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr_1fr]">
      <Field label="Modo">
        <InlineToggle
          ariaLabel="Modo de medida"
          value={mode}
          options={[
            { value: 'duration', label: 'Duración' },
            { value: 'distance', label: 'Distancia' },
          ]}
          onChange={setMode}
        />
      </Field>

      {mode === 'duration' ? (
        <Field label="Duración">
          <ClockCell
            seconds={measure?.kind === 'duration' ? measure.seconds : null}
            ariaLabel="Duración (m:ss)"
            onChange={setDuration}
          />
        </Field>
      ) : (
        <Field label="Distancia">
          <DistanceCell
            meters={measure?.kind === 'distance' ? measure.meters : null}
            ariaPrefix="Bloque"
            onChange={setDistance}
          />
        </Field>
      )}

      <Field label="Objetivo">
        <div className="space-y-1.5">
          <InlineToggle
            ariaLabel="Tipo de objetivo"
            value={objKind}
            options={objectiveOptions}
            onChange={setObjectiveKind}
          />
          {objKind === 'pace' ? (
            <PaceCell
              target={value.target}
              modality={value.modality}
              ariaPrefix="Bloque"
              onChange={setTargetValue}
            />
          ) : (
            <ScalarTargetCell
              kind={objKind}
              target={value.target}
              ariaLabel={
                objKind === 'hr_zone'
                  ? 'Zona objetivo'
                  : objKind === 'watts'
                    ? 'Vatios objetivo'
                    : 'RPE objetivo'
              }
              onChange={setTargetValue}
            />
          )}
        </div>
      </Field>
    </div>
  );
}
