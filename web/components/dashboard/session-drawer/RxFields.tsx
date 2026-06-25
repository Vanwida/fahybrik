'use client';

// RxFields — the field groups PrescriptionEditorV2 composes: the uniform
// 4-field grid (Series · trabajo · objetivo · Descanso), the per-set table
// ("Variar por serie") and the conditioning grid (intervalos/EMOM/AMRAP/
// continuo). All labels are natural Spanish; the underlying controls are the
// shared typed inputs from PrescriptionControls, so only valid target kinds
// are ever offered for the chosen modality.

import type {
  Measure,
  Modality,
  Prescription,
  PrescriptionSet,
  Target,
} from '@fahybrid/shared/domain/prescription';
import { setMeasure, setTarget } from '@fahybrid/shared/domain/prescription';
import { MIcon } from '@/components/ui/MIcon';
import {
  ClockCell,
  MeasureControl,
  NumberCell,
  TargetControl,
} from '@/components/dashboard/programming/studio/PrescriptionControls';
import {
  blockMeasureOf,
  measureToSchemeFields,
} from '@/lib/programming/prescription-model';
import { MEASURE_FIELD_LABEL, targetFieldLabel } from './prescription-presets';
import type { SetsView } from './rx-editor-model';

// ── Uniform fields grid: Series · (Reps|Distancia|Tiempo|Calorías) · Objetivo · Descanso ──
export function UniformFields({
  view,
  modality,
  exerciseName,
  onCount,
  onMeasure,
  onTarget,
  onRest,
}: {
  view: SetsView;
  modality: Modality | undefined;
  exerciseName: string;
  onCount: (n: number | null) => void;
  onMeasure: (m: Measure | undefined) => void;
  onTarget: (t: Target | undefined) => void;
  onRest: (restS: number | null) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
      <RxField label="Series">
        <NumberCell
          value={view.count}
          ariaLabel={`Series de ${exerciseName}`}
          min={1}
          max={60}
          onChange={onCount}
        />
      </RxField>
      <RxField label={MEASURE_FIELD_LABEL[view.measure?.kind ?? 'reps']}>
        <MeasureControl
          measure={view.measure}
          ariaPrefix={`${exerciseName} · trabajo por serie`}
          onChange={onMeasure}
        />
      </RxField>
      <RxField label={targetFieldLabel(view.target?.kind)}>
        <TargetControl
          target={view.target}
          modality={modality}
          ariaPrefix={`${exerciseName} · objetivo`}
          onChange={onTarget}
        />
      </RxField>
      <RxField label="Descanso">
        <ClockCell
          seconds={view.rest_s ?? null}
          ariaLabel={`Descanso entre series (m:ss) de ${exerciseName}`}
          placeholder="m:ss"
          onChange={onRest}
        />
      </RxField>
    </div>
  );
}

// ── Per-set table ("Variar por serie") ───────────────────────────────────────
export function PerSetTable({
  sets,
  modality,
  exerciseName,
  onUpdateSet,
  onAddSet,
  onRemoveSet,
}: {
  sets: PrescriptionSet[];
  modality: Modality | undefined;
  exerciseName: string;
  onUpdateSet: (i: number, patch: Partial<PrescriptionSet>) => void;
  onAddSet: () => void;
  onRemoveSet: (i: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[1.4rem_1fr_1fr_4.5rem_1.4rem] items-center gap-1.5 px-0.5">
        <span className="micro-label text-center">#</span>
        <span className="micro-label">Trabajo</span>
        <span className="micro-label">Objetivo</span>
        <span className="micro-label">Desc.</span>
        <span aria-hidden />
      </div>
      {sets.map((set, i) => (
        <div
          key={i}
          className="grid grid-cols-[1.4rem_1fr_1fr_4.5rem_1.4rem] items-center gap-1.5"
        >
          <span className="metric-num text-center text-xs font-bold text-[color:var(--text-muted)]">
            {i + 1}
          </span>
          <MeasureControl
            measure={setMeasure(set)}
            ariaPrefix={`Serie ${i + 1} de ${exerciseName} · trabajo`}
            onChange={(m) => onUpdateSet(i, { measure: m })}
          />
          <TargetControl
            target={setTarget(set)}
            modality={modality}
            ariaPrefix={`Serie ${i + 1} · objetivo`}
            onChange={(t) => onUpdateSet(i, { target: t })}
          />
          <ClockCell
            seconds={set.rest_s ?? null}
            ariaLabel={`Descanso serie ${i + 1} (m:ss)`}
            placeholder="m:ss"
            onChange={(s) => onUpdateSet(i, { rest_s: s ?? undefined })}
          />
          <button
            type="button"
            onClick={() => onRemoveSet(i)}
            disabled={sets.length <= 1}
            aria-label={`Quitar serie ${i + 1}`}
            className="focus-ring rounded-[var(--r-s)] p-1 text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--danger)] disabled:opacity-30"
          >
            <MIcon name="close" size={13} aria-hidden />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={onAddSet}
        className="focus-ring inline-flex items-center gap-1 rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--fg)] transition-colors hover:border-[color:var(--accent)]"
      >
        <MIcon name="add" size={13} aria-hidden />
        Añadir serie
      </button>
    </div>
  );
}

// ── Conditioning fields (intervalos/rondas/EMOM/AMRAP/continuo sin per-set) ──
export function ConditioningFieldsV2({
  value,
  modality,
  onCommit,
}: {
  value: Prescription;
  modality: Modality | undefined;
  onCommit: (next: Prescription) => void;
}) {
  const scheme = value.scheme;
  const patch = (p: Partial<Prescription>) => onCommit({ ...value, ...p });

  const showRounds = scheme === 'interval' || scheme === 'rounds';
  const showMinutes = scheme === 'emom';
  const showDuration = scheme === 'amrap' || scheme === 'for_time';
  const showMeasure = scheme === 'steady' || scheme === 'interval' || scheme === 'rounds';
  const showRest = scheme === 'interval' || scheme === 'rounds' || scheme === 'emom';
  const blockMeasure = blockMeasureOf(value);

  return (
    <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
      {showRounds ? (
        <RxField label="Repeticiones">
          <NumberCell
            value={value.rounds ?? null}
            ariaLabel="Repeticiones del intervalo"
            min={1}
            max={60}
            onChange={(v) => patch({ rounds: v ?? undefined })}
          />
        </RxField>
      ) : null}
      {showMinutes ? (
        <RxField label="Minutos">
          <NumberCell
            value={value.rounds ?? null}
            ariaLabel="Minutos del EMOM"
            min={1}
            max={60}
            suffix="min"
            onChange={(v) => patch({ rounds: v ?? undefined })}
          />
        </RxField>
      ) : null}
      {showDuration ? (
        <RxField label={scheme === 'for_time' ? 'Tiempo cap' : 'Duración'}>
          <ClockCell
            seconds={value.total_s ?? null}
            ariaLabel={scheme === 'for_time' ? 'Tiempo cap (mm:ss)' : 'Duración total (mm:ss)'}
            placeholder="mm:ss"
            onChange={(s) => patch({ total_s: s ?? undefined })}
          />
        </RxField>
      ) : null}
      {showMeasure ? (
        <RxField label={MEASURE_FIELD_LABEL[blockMeasure?.kind ?? 'duration']}>
          <MeasureControl
            measure={blockMeasure}
            ariaPrefix="Trabajo del bloque"
            onChange={(m) => patch(measureToSchemeFields(scheme, m))}
          />
        </RxField>
      ) : null}
      <RxField label={targetFieldLabel(value.target?.kind)}>
        <TargetControl
          target={value.target}
          modality={modality}
          ariaPrefix="Objetivo del bloque"
          onChange={(t) => patch({ target: t })}
        />
      </RxField>
      {showRest ? (
        <RxField label="Descanso">
          <ClockCell
            seconds={value.rest_s ?? null}
            ariaLabel="Descanso entre repeticiones (m:ss)"
            placeholder="m:ss"
            onChange={(s) => patch({ rest_s: s ?? undefined })}
          />
        </RxField>
      ) : null}
    </div>
  );
}

export function RxField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="micro-label tracking-[0.1em]">{label}</span>
      {children}
    </div>
  );
}
