'use client';

// component-stations — las FILAS de estación del circuito y los campos
// estructurales del formato (rediseño del editor de microciclos): cada estación
// es una fila limpia — asa de orden, movimiento, medida en mono y objetivo —
// sobre la MISMA estructura de datos de siempre (EditorItem con su
// prescription.sets[0]). Sale de ComponentsForm para respetar el techo de 500
// líneas; cero reglas de dominio nuevas.

import type {
  FormatParam,
  Measure,
  Prescription,
  Target,
  TargetKind,
} from '@fahybrid/shared/domain/prescription';
import { setMeasure, setTarget } from '@fahybrid/shared/domain/prescription';
import type { EditorItem } from '@/lib/dashboard/v2/editor-types';
import { emptyTargetOfKind, targetScalar } from '@/lib/programming/prescription-model';
import { OBJETIVO_LABEL } from '@/lib/dashboard/v2/editor-axes';
import { MIcon } from '@/components/ui/MIcon';
import { Stepper } from '@/components/v2/controls/Stepper';
import { ExercisePickerField } from '../ExercisePickerField';
import { defaultCategoryForModality } from '@/lib/dashboard/v2/pick-exercise';
import { RestChips, ROUND_REST_VALUES } from '../dose-controls';
import {
  ClockCell,
  DistanceCell,
  Field,
  InlineToggle,
  NumberCell,
  PaceCell,
  ScalarTargetCell,
} from './form-controls';

type DoseMode = 'reps' | 'distance' | 'duration';

// El objetivo de una estación: nada («—», lo honesto cuando no lo hay), ritmo,
// RPE o carga. Un objetivo heredado de otro tipo (una zona importada) no se
// destruye: su tipo entra en el toggle y se sigue editando.
const STATION_TARGET_KINDS: TargetKind[] = ['pace', 'rpe', 'kg'];
const NONE = 'none' as const;
type StationKind = TargetKind | typeof NONE;

/** Un campo estructural del formato (rondas / cap / ventana…), por clave del catálogo. */
export function FormatParamField({
  param,
  format,
  head,
  onPatch,
}: {
  param: FormatParam;
  format: Prescription['scheme'];
  head: Prescription | undefined;
  onPatch: (p: Partial<Prescription>) => void;
}) {
  switch (param) {
    case 'rounds': {
      const label = format === 'emom' ? 'Minutos' : 'Rondas';
      const value = head?.rounds ?? 1;
      return (
        <Field label={label}>
          {/* Rondas con dedos: SIN rango (3-4) — eso es fase 2. */}
          <Stepper
            value={value}
            min={1}
            max={Math.max(60, value)}
            ariaLabel={format === 'emom' ? 'Minutos del EMOM' : 'Número de rondas'}
            onChange={(v) => onPatch({ rounds: v })}
          />
        </Field>
      );
    }
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
        <Field label={format === 'rounds' ? 'Descanso entre rondas' : 'Descanso'} className="sm:col-span-2">
          {/* Chips + «—» honesto (sin descanso marcado) + «otro» de teclado. */}
          <RestChips
            seconds={head?.rest_s ?? null}
            values={ROUND_REST_VALUES}
            allowNone
            ariaLabel="Descanso entre rondas"
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

/** Una estación: asa de orden · movimiento · medida (mono) · objetivo. */
export function ComponentStationRow({
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
  const set = item.prescription.sets?.[0];
  const measure = set ? setMeasure(set) : undefined;
  const target = set ? setTarget(set) : undefined;
  const doseMode: DoseMode =
    measure?.kind === 'distance' ? 'distance' : measure?.kind === 'duration' ? 'duration' : 'reps';

  // La medida y el objetivo viven JUNTOS en sets[0]: escribir una no puede
  // borrar el otro (antes, cambiar la medida tiraba el objetivo en silencio).
  const writeSet = (patch: { measure?: Measure; target?: Target | undefined }) => {
    const next = { ...(set ?? {}), ...patch };
    if (next.target === undefined) delete next.target;
    if (next.measure === undefined) delete next.measure;
    onChange({ prescription: { ...item.prescription, sets: [next] } });
  };

  const setDoseMode = (next: DoseMode) => {
    if (next === doseMode) return;
    const m: Measure =
      next === 'distance'
        ? { kind: 'distance', meters: 200 }
        : next === 'duration'
          ? { kind: 'duration', seconds: 30 }
          : { kind: 'reps', value: 10 };
    writeSet({ measure: m });
  };

  const kind: StationKind = target?.kind ?? NONE;
  const kindOptions: { value: StationKind; label: string }[] = [
    { value: NONE, label: '—' },
    ...(kind !== NONE && !STATION_TARGET_KINDS.includes(kind as TargetKind)
      ? [{ value: kind, label: OBJETIVO_LABEL[kind as TargetKind] }]
      : []),
    { value: 'pace', label: 'Ritmo' },
    { value: 'rpe', label: 'RPE' },
    { value: 'kg', label: 'kg' },
  ];

  const setKind = (next: StationKind) => {
    if (next === kind) return;
    if (next === NONE) return writeSet({ target: undefined });
    // El número que ya había viaja al tipo nuevo (mismo criterio que la fuerza).
    writeSet({
      target: emptyTargetOfKind(next as TargetKind, item.prescription.modality, targetScalar(target)),
    });
  };

  return (
    <div className="rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-2">
      <div className="flex items-center gap-2">
        <div className="flex shrink-0 flex-col" aria-label={`Ordenar la estación ${index + 1}`}>
          <button
            type="button"
            aria-label={`Subir la estación ${index + 1}`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="v2-focus text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)] disabled:opacity-30"
          >
            <MIcon name="keyboard_arrow_up" size={15} />
          </button>
          <button
            type="button"
            aria-label={`Bajar la estación ${index + 1}`}
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
            destinationLabel={`Estación ${index + 1}`}
            defaultCategory={defaultCategoryForModality(item.prescription.modality)}
            onChange={onChange}
            compact
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar la estación ${index + 1}`}
          className="v2-focus shrink-0 rounded-[var(--v2-r-s)] p-1 text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-danger)]"
        >
          <MIcon name="close" size={14} />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 pl-9 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <InlineToggle
            ariaLabel={`Medida de la estación ${index + 1}`}
            value={doseMode}
            options={[
              { value: 'reps', label: 'Reps' },
              { value: 'distance', label: 'Dist' },
              { value: 'duration', label: 'Tiempo' },
            ]}
            onChange={setDoseMode}
          />
          <div className="min-w-0 flex-1">
            {doseMode === 'reps' ? (
              <NumberCell
                value={measure?.kind === 'reps' ? measure.value : null}
                ariaLabel={`Reps de la estación ${index + 1}`}
                min={0}
                max={1000}
                suffix="reps"
                onChange={(v) => writeSet({ measure: { kind: 'reps', value: v ?? 0 } })}
              />
            ) : doseMode === 'distance' ? (
              <DistanceCell
                meters={measure?.kind === 'distance' ? measure.meters : null}
                ariaPrefix={`Estación ${index + 1}`}
                onChange={(m) => writeSet({ measure: { kind: 'distance', meters: m ?? 0 } })}
              />
            ) : (
              <ClockCell
                seconds={measure?.kind === 'duration' ? measure.seconds : null}
                ariaLabel={`Tiempo de la estación ${index + 1} (m:ss)`}
                onChange={(s) => writeSet({ measure: { kind: 'duration', seconds: s ?? 0 } })}
              />
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <InlineToggle
            ariaLabel={`Objetivo de la estación ${index + 1}`}
            value={kind}
            options={kindOptions}
            onChange={setKind}
          />
          <div className="min-w-0 flex-1">
            {kind === NONE ? null : kind === 'pace' ? (
              <PaceCell
                target={target}
                modality={item.prescription.modality}
                ariaPrefix={`Estación ${index + 1}`}
                onChange={(t) => writeSet({ target: t })}
              />
            ) : kind === 'bodyweight' ? (
              <span className="text-xs text-[color:var(--v2-muted)]">corporal</span>
            ) : kind === 'time_cap' ? (
              <ClockCell
                seconds={target?.kind === 'time_cap' ? target.max_s ?? target.value_s ?? null : null}
                ariaLabel={`Tope de la estación ${index + 1} (m:ss)`}
                onChange={(s) =>
                  writeSet({ target: s == null ? undefined : { kind: 'time_cap', max_s: s } })
                }
              />
            ) : (
              <ScalarTargetCell
                kind={kind}
                target={target}
                ariaLabel={`${OBJETIVO_LABEL[kind]} de la estación ${index + 1}`}
                onChange={(t) => writeSet({ target: t })}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
