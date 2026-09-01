'use client';

// strength-shared-controls — los controles del modo «Series iguales» del
// compositor de fuerza (strength-composer): series y reps con Stepper + chips
// frecuentes, y el VALOR del objetivo con dedos (banda de %RM, chips de RIR y
// RPE, stepper de kg) con el teclado siempre a un toque («rango o teclado»).
// Sale del compositor para respetar el techo de 500 líneas; comparte sus
// mismas piezas (dose-controls) y escribe por los callbacks del compositor.

import type {
  Prescription,
  PrescriptionSet,
  Target,
  TargetKind,
} from '@fahybrid/shared/domain/prescription';
import { isScalarTarget, setMeasure } from '@fahybrid/shared/domain/prescription';
import { ChipGroup } from '@/components/v2/controls/ChipGroup';
import { Stepper } from '@/components/v2/controls/Stepper';
import { TickBand, type TickSelection } from '@/components/v2/controls/TickBand';
import { ClockCell, NumberCell } from './fields';
import { TargetCell } from './target-cell';
import {
  Control,
  PCT_TICK_VALUES,
  proposedAria,
  REPS_CHIP_VALUES,
} from './dose-controls';

const RIR_CHIP_VALUES = [0, 1, 2, 3, 4] as const;
const RPE_CHIP_VALUES = [6, 7, 8, 9, 10] as const;
const KG_STEP = 2.5;
const MAX_SERIES_UI = 12; // tope del stepper; con más series (dato heredado) el tope crece solo
const MAX_REPS_UI = 100; // mismo tope que el Stepper de reps
const REPS_RANGE_DEFAULT_SPAN = 2; // "12" → "12-14" al activar; el coach ajusta el techo después

/** Botón fantasma para activar algo opcional (mismo lenguaje que «＋ tempo», «＋ serie»). */
const GHOST_ADD_CLASS =
  'v2-focus inline-flex h-[34px] items-center gap-1.5 self-start rounded-[var(--v2-r-pill)] border border-dashed border-[color:var(--v2-border)] px-3.5 text-body font-bold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]';

/** El par valor/rango de un objetivo escalar (%RM, kg, RIR, RPE…). */
export function scalarOf(t: Target | undefined): { lo: number | null; hi: number | null } {
  if (!t || !isScalarTarget(t)) {
    return { lo: null, hi: null };
  }
  return { lo: t.min ?? t.value ?? null, hi: t.max ?? null };
}

/** ¿El valor compartido necesita el teclado porque los chips no pueden pintarlo? */
function needsKeyboard(kind: TargetKind, lo: number | null, hi: number | null): boolean {
  if (lo == null) return false;
  switch (kind) {
    case 'percent_rm':
      return (
        !(PCT_TICK_VALUES as readonly number[]).includes(lo) ||
        (hi != null && !(PCT_TICK_VALUES as readonly number[]).includes(hi))
      );
    case 'rir':
      return hi != null || !(RIR_CHIP_VALUES as readonly number[]).includes(lo);
    case 'rpe':
      return hi != null || !(RPE_CHIP_VALUES as readonly number[]).includes(lo);
    case 'kg':
      return hi != null; // el rango de kg no cabe en un stepper de un solo número
    default:
      return false;
  }
}

// ── Series y reps del modo «Series iguales» ──────────────────────────────────
export function SharedControls({
  sets,
  proposed,
  applyShared,
  onCount,
}: {
  sets: PrescriptionSet[];
  proposed: { measure: boolean; target: boolean; rest: boolean };
  applyShared: (patch: Partial<PrescriptionSet>) => void;
  onCount: (n: number) => void;
}) {
  const measure = setMeasure(sets[0]!);
  const reps = measure?.kind === 'reps' ? measure : undefined;

  const stepReps = (v: number) => {
    if (!reps) return;
    // Una banda («8-10») se desplaza entera: subir reps no la aplasta a un punto.
    const delta = v - reps.value;
    applyShared({
      measure: {
        kind: 'reps',
        value: v,
        ...(reps.max !== undefined ? { max: Math.max(v, reps.max + delta) } : {}),
      },
    });
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Control label="Series">
        <Stepper
          value={sets.length}
          min={1}
          max={Math.max(MAX_SERIES_UI, sets.length)}
          ariaLabel="Número de series"
          onChange={onCount}
        />
      </Control>
      <Control label="Reps por serie" proposed={proposed.measure}>
        {reps ? (
          <div className="flex flex-wrap items-center gap-2">
            <Stepper
              value={reps.value}
              min={1}
              max={MAX_REPS_UI}
              format={reps.max !== undefined ? (v) => `${v}-${reps.max}` : undefined}
              ariaLabel={proposedAria('Reps por serie', proposed.measure)}
              onChange={stepReps}
            />
            {reps.max === undefined ? (
              reps.value < MAX_REPS_UI ? (
                <button
                  type="button"
                  onClick={() =>
                    applyShared({
                      measure: {
                        kind: 'reps',
                        value: reps.value,
                        max: Math.min(MAX_REPS_UI, reps.value + REPS_RANGE_DEFAULT_SPAN),
                      },
                    })
                  }
                  className={GHOST_ADD_CLASS}
                >
                  ＋ rango
                </button>
              ) : null
            ) : (
              <>
                <Stepper
                  value={reps.max}
                  min={reps.value + 1}
                  max={MAX_REPS_UI}
                  size="sm"
                  format={(v) => `hasta ${v}`}
                  ariaLabel="Techo del rango de reps"
                  onChange={(v) => applyShared({ measure: { kind: 'reps', value: reps.value, max: v } })}
                />
                <button
                  type="button"
                  onClick={() => applyShared({ measure: { kind: 'reps', value: reps.value } })}
                  className="v2-focus rounded-[var(--v2-r-2xs)] text-label font-semibold text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
                >
                  quitar rango
                </button>
              </>
            )}
            <ChipGroup
              options={REPS_CHIP_VALUES.map((v) => ({ value: v, label: String(v) }))}
              value={reps.max === undefined ? reps.value : null}
              ariaLabel="Reps frecuentes"
              onChange={(v) => applyShared({ measure: { kind: 'reps', value: v } })}
            />
          </div>
        ) : measure?.kind === 'duration' ? (
          // Trabajo por tiempo (planchas, isométricos): el reloj es el camino.
          <ClockCell
            seconds={measure.seconds}
            ariaLabel={proposedAria('Tiempo por serie (m:ss)', proposed.measure)}
            className="max-w-[7rem]"
            onChange={(s) =>
              applyShared({ measure: s == null ? undefined : { kind: 'duration', seconds: s } })
            }
          />
        ) : (
          <NumberCell
            value={measure?.kind === 'distance' ? measure.meters : measure?.kind === 'calories' ? measure.value : null}
            ariaLabel={proposedAria('Trabajo por serie', proposed.measure)}
            min={0}
            max={100000}
            suffix={measure?.kind === 'distance' ? 'm' : measure?.kind === 'calories' ? 'cal' : undefined}
            className="max-w-[8rem]"
            onChange={(v) =>
              applyShared({
                measure:
                  v == null
                    ? undefined
                    : measure?.kind === 'calories'
                      ? { kind: 'calories', value: v }
                      : measure?.kind === 'distance'
                        ? { kind: 'distance', meters: v }
                        : { kind: 'reps', value: v },
              })
            }
          />
        )}
      </Control>
    </div>
  );
}

// ── El VALOR del objetivo compartido, con dedos y con teclado ────────────────
export function SharedTargetValue({
  kind,
  target,
  modality,
  kbOpen,
  onToggleKb,
  onChange,
}: {
  kind: TargetKind;
  target: Target | undefined;
  modality: Prescription['modality'];
  kbOpen: boolean;
  onToggleKb: () => void;
  onChange: (t: Target | undefined) => void;
}) {
  const { lo, hi } = scalarOf(target);
  const keyboard = kbOpen || needsKeyboard(kind, lo, hi);

  const point = (v: number): Target => ({ kind, value: v }) as Target;

  if (kind === 'bodyweight') {
    return <p className="text-xs text-[color:var(--v2-muted)]">Sin carga externa.</p>;
  }

  return (
    <div className="space-y-1.5">
      {kind === 'percent_rm' ? (
        <>
          <TickBand
            values={PCT_TICK_VALUES}
            selection={
              keyboard || lo == null
                ? null
                : ({ min: lo, ...(hi != null ? { max: hi } : {}) } as TickSelection)
            }
            ariaLabel="%RM objetivo"
            onChange={(sel) =>
              onChange(
                sel == null
                  ? undefined
                  : sel.max != null
                    ? ({ kind, min: sel.min, max: sel.max } as Target)
                    : point(sel.min),
              )
            }
          />
          <p className="text-label leading-snug text-[color:var(--v2-faint)]">
            Toca un valor; toca otro y se convierte en rango (así entra el 65-80%).
          </p>
        </>
      ) : kind === 'rir' ? (
        <ChipGroup
          options={RIR_CHIP_VALUES.map((v) => ({ value: v, label: String(v) }))}
          value={keyboard ? null : lo}
          ariaLabel="RIR objetivo"
          onChange={(v) => onChange(point(v))}
        />
      ) : kind === 'rpe' ? (
        <ChipGroup
          options={RPE_CHIP_VALUES.map((v) => ({ value: v, label: String(v) }))}
          value={keyboard ? null : lo}
          ariaLabel="RPE objetivo"
          onChange={(v) => onChange(point(v))}
        />
      ) : (
        <Stepper
          value={lo ?? 0}
          min={0}
          max={Math.max(300, lo ?? 0)}
          step={KG_STEP}
          format={(v) => String(v).replace('.', ',')}
          ariaLabel="Carga en kg"
          onChange={(v) => onChange(point(v))}
        />
      )}

      {keyboard ? (
        <div className="max-w-[16rem]">
          <TargetCell
            target={target}
            modality={modality}
            kind={kind}
            ariaPrefix="Objetivo"
            onChange={onChange}
          />
        </div>
      ) : null}
      <button
        type="button"
        aria-expanded={keyboard}
        onClick={onToggleKb}
        className="v2-focus rounded-[var(--v2-r-2xs)] text-label font-semibold text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
      >
        {keyboard ? 'ocultar teclado' : 'rango o teclado'}
      </button>
    </div>
  );
}
