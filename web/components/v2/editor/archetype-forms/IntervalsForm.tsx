'use client';

// IntervalsForm — the INTERVALS base pattern (Series / Intervalos, run o ergo).
// N × (distancia | tiempo de trabajo) @ ritmo | RPE + descanso. The archetype
// fixed scheme = interval; this form exposes: superficie/ergo (run ↔ row/ski/bike),
// repeticiones (rounds), cada-repetición (work distance|duration), objetivo
// (ritmo|RPE), descanso (rest_s). No modality/measure/objetivo board — the form is
// the prescription.
//
// Work measure on an interval block: a DURATION lives in `work_s`; a DISTANCE
// lives on a single representative set (no native distance scheme field). The
// objective is the block-level `target`. The modality is chosen via the first
// field (run vs an ergo) — derived, never a separate toggle.

import type { Measure, Modality, Prescription, Target } from '@fahybrid/shared/domain/prescription';
import { setMeasure } from '@fahybrid/shared/domain/prescription';
import { defaultTargetForModality } from '@/lib/programming/prescription-model';
import {
  ClockCell,
  DistanceCell,
  Field,
  InlineToggle,
  NumberCell,
  PaceCell,
  ScalarTargetCell,
  SelectCell,
} from './form-controls';

type WorkMode = 'distance' | 'duration';
type ObjectiveKind = 'pace' | 'rpe';

// Surface / ergo choice — drives the modality (run ↔ row/ski/bike). The pace unit
// follows: run → /km, ergo → /500m (defaultTargetForModality).
const SURFACE_OPTIONS: { value: Modality; label: string }[] = [
  { value: 'run', label: 'Pista (carrera)' },
  { value: 'row', label: 'RowErg' },
  { value: 'ski', label: 'SkiErg' },
  { value: 'bike', label: 'BikeErg' },
];

const DEFAULT_WORK_DISTANCE_M = 800;
const DEFAULT_WORK_DURATION_S = 180;

function readWorkMode(p: Prescription): WorkMode {
  if (p.work_s !== undefined) return 'duration';
  if (p.sets?.[0]) {
    const m = setMeasure(p.sets[0]);
    if (m?.kind === 'distance') return 'distance';
  }
  return 'distance';
}

function readWorkMeasure(p: Prescription): Measure | undefined {
  if (p.work_s !== undefined) return { kind: 'duration', seconds: p.work_s };
  if (p.sets?.[0]) {
    const m = setMeasure(p.sets[0]);
    if (m) return m;
  }
  return undefined;
}

export function IntervalsForm({
  value,
  onChange,
}: {
  value: Prescription;
  onChange: (next: Prescription) => void;
}) {
  const modality: Modality = value.modality ?? 'run';
  const workMode = readWorkMode(value);
  const workMeasure = readWorkMeasure(value);
  const objKind: ObjectiveKind = value.target?.kind === 'rpe' ? 'rpe' : 'pace';

  const patch = (p: Partial<Prescription>) => onChange({ ...value, scheme: 'interval', ...p });

  const setSurface = (m: Modality) => {
    if (m === modality) return;
    // Re-seed the target to the new modality's natural pace unit (run → /km).
    const target = value.target?.kind === 'rpe' ? value.target : defaultTargetForModality(m);
    onChange({ ...value, scheme: 'interval', modality: m, ...(target ? { target } : {}) });
  };

  const setWorkMode = (next: WorkMode) => {
    if (next === workMode) return;
    if (next === 'duration') {
      const { sets: _s, ...rest } = value;
      void _s;
      onChange({ ...rest, scheme: 'interval', work_s: DEFAULT_WORK_DURATION_S });
    } else {
      const { work_s: _w, ...rest } = value;
      void _w;
      onChange({
        ...rest,
        scheme: 'interval',
        sets: [{ measure: { kind: 'distance', meters: DEFAULT_WORK_DISTANCE_M } }],
      });
    }
  };

  const setWorkDuration = (seconds: number | null) => {
    const { sets: _s, ...rest } = value;
    void _s;
    onChange({ ...rest, scheme: 'interval', work_s: seconds ?? 0 });
  };

  const setWorkDistance = (meters: number | null) => {
    const { work_s: _w, ...rest } = value;
    void _w;
    onChange({
      ...rest,
      scheme: 'interval',
      sets: [{ measure: { kind: 'distance', meters: meters ?? 0 } }],
    });
  };

  const setObjectiveKind = (kind: ObjectiveKind) => {
    const target: Target =
      kind === 'rpe'
        ? { kind: 'rpe', value: 8 }
        : { kind: 'pace', unit: modality === 'run' ? 'per_km' : 'per_500m', value_s: 205 };
    onChange({ ...value, scheme: 'interval', target });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Superficie / ergo">
          <SelectCell
            value={modality}
            options={SURFACE_OPTIONS}
            ariaLabel="Superficie o ergómetro"
            onChange={setSurface}
          />
        </Field>
        <Field label="Repeticiones">
          <NumberCell
            value={value.rounds ?? null}
            ariaLabel="Número de repeticiones"
            min={1}
            max={60}
            suffix="× series"
            onChange={(v) => patch({ rounds: v ?? undefined })}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Cada repetición">
          <div className="space-y-1.5">
            <InlineToggle
              ariaLabel="Medida del trabajo"
              value={workMode}
              options={[
                { value: 'distance', label: 'Distancia' },
                { value: 'duration', label: 'Tiempo' },
              ]}
              onChange={setWorkMode}
            />
            {workMode === 'distance' ? (
              <DistanceCell
                meters={workMeasure?.kind === 'distance' ? workMeasure.meters : null}
                ariaPrefix="Trabajo"
                onChange={setWorkDistance}
              />
            ) : (
              <ClockCell
                seconds={workMeasure?.kind === 'duration' ? workMeasure.seconds : null}
                ariaLabel="Tiempo de trabajo (m:ss)"
                onChange={setWorkDuration}
              />
            )}
          </div>
        </Field>

        <Field label="Objetivo">
          <div className="space-y-1.5">
            <InlineToggle
              ariaLabel="Tipo de objetivo"
              value={objKind}
              options={[
                { value: 'pace', label: 'Ritmo' },
                { value: 'rpe', label: 'RPE' },
              ]}
              onChange={setObjectiveKind}
            />
            {objKind === 'pace' ? (
              <PaceCell
                target={value.target}
                modality={modality}
                ariaPrefix="Trabajo"
                onChange={(t) => onChange({ ...value, scheme: 'interval', target: t })}
              />
            ) : (
              <ScalarTargetCell
                kind="rpe"
                target={value.target}
                ariaLabel="RPE objetivo"
                onChange={(t) => onChange({ ...value, scheme: 'interval', target: t })}
              />
            )}
          </div>
        </Field>

        <Field label="Descanso">
          <ClockCell
            seconds={value.rest_s ?? null}
            ariaLabel="Descanso entre series (m:ss)"
            onChange={(s) => patch({ rest_s: s ?? undefined })}
          />
        </Field>
      </div>
    </div>
  );
}
