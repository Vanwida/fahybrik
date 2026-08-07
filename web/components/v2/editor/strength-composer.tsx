'use client';

// strength-composer — la FUERZA con dedos, no con teclado (rediseño del editor
// de microciclos, mock aprobado). Sustituye la tabla de celdas de
// prescription-field-groups conservando el MISMO contrato (nombre, props,
// esquema de superserie, marcas del importador):
//   · Esquema: «Series iguales | Variar por serie» (ChipGroup de texto).
//   · Iguales → series y reps con Stepper + chips frecuentes, objetivo por
//     chips (%RM en banda de ticks con rango a dos toques, RIR 0-4, kg con
//     paso 2,5), descanso por chips y tempo plegado.
//   · Variar → la rejilla por serie (strength-pyramid): pirámides reales.
// El teclado sigue disponible en todo («rango o teclado», el «otro» del
// descanso, las celdas de la rejilla) — alternativa siempre, único camino nunca.
// Edita `sets[]` del `Prescription` compartido; cero cambios de schema.

import { useState } from 'react';
import type {
  Prescription,
  PrescriptionSet,
  Target,
  TargetKind,
} from '@fahybrid/shared/domain/prescription';
import { setMeasure, setTarget } from '@fahybrid/shared/domain/prescription';
import { emptyTargetOfKind } from '@/lib/programming/prescription-model';
import { ChipGroup } from '@/components/v2/controls/ChipGroup';
import { Stepper } from '@/components/v2/controls/Stepper';
import { TickBand, type TickSelection } from '@/components/v2/controls/TickBand';
import { cn } from '@/lib/utils';
import { ClockCell, NumberCell } from './fields';
import { TargetCell } from './target-cell';
import {
  PCT_TICK_VALUES,
  PROPOSED_CELL,
  proposedAria,
  REPS_CHIP_VALUES,
  RestChips,
  STRENGTH_REST_VALUES,
  TempoDisclosure,
} from './dose-controls';
import { StrengthPyramid } from './strength-pyramid';

// Tipos de objetivo de un ejercicio de fuerza, en orden de uso real (%RM manda).
const OBJECTIVE_OPTIONS: { value: TargetKind; label: string }[] = [
  { value: 'percent_rm', label: '%RM' },
  { value: 'kg', label: 'kg' },
  { value: 'rir', label: 'RIR' },
  { value: 'rpe', label: 'RPE' },
  { value: 'bodyweight', label: 'Corporal' },
];

const RIR_CHIP_VALUES = [0, 1, 2, 3, 4] as const;
const RPE_CHIP_VALUES = [6, 7, 8, 9, 10] as const;
const KG_STEP = 2.5;
const MAX_SERIES_UI = 12; // tope del stepper; con más series (dato heredado) el tope crece solo

type SchemeMode = 'iguales' | 'variar';

// ── Lecturas compartidas ─────────────────────────────────────────────────────
function scalarOf(t: Target | undefined): { lo: number | null; hi: number | null } {
  if (!t || t.kind === 'bodyweight' || t.kind === 'pace' || t.kind === 'time_cap') {
    return { lo: null, hi: null };
  }
  return { lo: t.min ?? t.value ?? null, hi: t.max ?? null };
}

/** ¿Las series difieren en algo (medida, objetivo, descanso o tempo)? */
function setsAreVaried(sets: PrescriptionSet[]): boolean {
  if (sets.length <= 1) return false;
  const key = (s: PrescriptionSet) =>
    JSON.stringify([setMeasure(s) ?? null, setTarget(s) ?? null, s.rest_s ?? null, s.tempo ?? null]);
  const first = key(sets[0]!);
  return sets.some((s) => key(s) !== first);
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
   * 'sets'. La SUPERSERIE usa este mismo compositor pero su bloque es
   * 'superset': sin este parámetro, tocar una serie devolvía el bloque a series
   * rectas y la rotación se perdía en silencio.
   */
  scheme?: Prescription['scheme'];
  /**
   * La superserie descansa al cerrar la VUELTA, no entre series de un mismo
   * ejercicio (encadenarlas es justo lo que la define): allí el descanso se
   * oculta aquí y vive una sola vez a nivel de bloque.
   */
  showRest?: boolean;
  /**
   * Rutas de esta prescripción cuyo valor puso el importador, no el coach
   * (`sets[0].rest_s`, `sets[0].measure`, `sets[0].target`). Solo la pasa la
   * revisión de una importación: SIN ella el compositor se pinta exactamente
   * como siempre y no sabe que existen las importaciones.
   */
  proposedPaths?: ReadonlyMap<string, string>;
}) {
  const sets = value.sets ?? [];
  const varied = setsAreVaried(sets);
  // El coach puede forzar el modo; sin forzar, lo dicta el dato (una pirámide
  // cargada abre en «Variar por serie», nunca aplastada a compartido).
  const [forcedMode, setForcedMode] = useState<SchemeMode | null>(null);
  const mode: SchemeMode = forcedMode ?? (varied ? 'variar' : 'iguales');
  const [kbOpen, setKbOpen] = useState(false);

  const anyProposed = proposedPaths !== undefined && proposedPaths.size > 0;
  const proposedShared = {
    measure: proposedPaths?.has('sets[0].measure') ?? false,
    target: proposedPaths?.has('sets[0].target') ?? false,
    rest: proposedPaths?.has('sets[0].rest_s') ?? false,
  };

  const writeSets = (nextSets: PrescriptionSet[]) =>
    onChange({ ...value, scheme, sets: nextSets });

  const updateSet = (i: number, patch: Partial<PrescriptionSet>) => {
    writeSets(
      sets.map((s, idx) => {
        if (idx !== i) return s;
        const merged = { ...s, ...patch };
        (Object.keys(merged) as (keyof PrescriptionSet)[]).forEach((k) => {
          if (merged[k] === undefined) delete merged[k];
        });
        return merged;
      }),
    );
  };

  /** En «Series iguales» todo cambio se escribe en TODAS las series. */
  const applyShared = (patch: Partial<PrescriptionSet>) => {
    writeSets(
      sets.map((s) => {
        const merged = { ...s, ...patch };
        (Object.keys(merged) as (keyof PrescriptionSet)[]).forEach((k) => {
          if (merged[k] === undefined) delete merged[k];
        });
        return merged;
      }),
    );
  };

  const seedSet = (): PrescriptionSet =>
    sets.length > 0 ? { ...sets[sets.length - 1]! } : { measure: { kind: 'reps', value: 8 } };

  const addSet = () => writeSets([...sets, seedSet()]);
  const removeSet = (i: number) => writeSets(sets.filter((_, idx) => idx !== i));
  const applyDown = (i: number) => writeSets(sets.map((s, idx) => (idx > i ? { ...sets[i]! } : s)));

  const setMode = (next: SchemeMode) => {
    if (next === mode) return;
    setForcedMode(next);
    if (next === 'iguales' && sets.length > 0) {
      // Colapsar = la primera serie manda y se escribe N veces (copias, nunca
      // la misma referencia compartida).
      const shared = sets[0]!;
      writeSets(sets.map(() => ({ ...shared })));
    } else if (next === 'variar') {
      writeSets(sets.map((s) => ({ ...s })));
    }
  };

  // ── Objetivo (el TIPO aplica a todas las series, en los dos modos) ─────────
  const sharedTarget = sets[0] ? setTarget(sets[0]) : undefined;
  const objKind: TargetKind = sharedTarget?.kind ?? 'percent_rm';

  const setObjectiveKind = (kind: TargetKind) => {
    if (kind === objKind) return;
    // Cambiar el tipo re-apunta TODAS las series arrastrando el número que ya
    // había (el coach no pierde lo escrito) y retira los alias antiguos.
    const nextSets = sets.map((s) => {
      const prev = setTarget(s);
      const carry =
        prev && prev.kind !== 'bodyweight' && prev.kind !== 'pace' && prev.kind !== 'time_cap'
          ? prev.value ?? prev.min ?? prev.max
          : undefined;
      const target: Target = emptyTargetOfKind(kind, value.modality, carry);
      const { load: _load, rpe: _rpe, rir: _rir, ...rest } = s;
      void _load;
      void _rpe;
      void _rir;
      return { ...rest, target };
    });
    writeSets(nextSets);
  };

  const applySharedTarget = (t: Target | undefined) => applyShared({ target: t });

  if (sets.length === 0) {
    return (
      <div className="space-y-2">
        <p className="px-1 py-1 text-xs text-[color:var(--v2-muted)]">
          Sin series — añade la primera.
        </p>
        <button
          type="button"
          onClick={addSet}
          className="v2-focus inline-flex h-[34px] items-center rounded-[var(--v2-r-pill)] border border-dashed border-[color:var(--v2-border)] px-3.5 text-[13px] font-bold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
        >
          ＋ serie
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Control label="Esquema">
        <ChipGroup
          mono={false}
          options={[
            { value: 'iguales', label: 'Series iguales' },
            { value: 'variar', label: 'Variar por serie' },
          ]}
          value={mode}
          ariaLabel="Esquema de las series"
          onChange={setMode}
        />
      </Control>

      {mode === 'iguales' ? (
        <SharedControls
          sets={sets}
          showRest={showRest}
          proposed={proposedShared}
          applyShared={applyShared}
          onCount={(n) => {
            if (n < sets.length) return writeSets(sets.slice(0, n));
            const extra = Array.from({ length: n - sets.length }, () => ({ ...sets[sets.length - 1]! }));
            writeSets([...sets, ...extra]);
          }}
        />
      ) : null}

      <Control
        label="Carga · contra qué objetivo"
        proposed={mode === 'iguales' && proposedShared.target}
      >
        <ChipGroup
          mono={false}
          options={OBJECTIVE_OPTIONS}
          value={objKind}
          ariaLabel={proposedAria('Tipo de objetivo de carga', mode === 'iguales' && proposedShared.target)}
          onChange={setObjectiveKind}
        />
        {mode === 'iguales' ? (
          <SharedTargetValue
            kind={objKind}
            target={sharedTarget}
            modality={value.modality}
            kbOpen={kbOpen}
            onToggleKb={() => setKbOpen((v) => !v)}
            onChange={applySharedTarget}
          />
        ) : null}
      </Control>

      {mode === 'variar' ? (
        <StrengthPyramid
          sets={sets}
          targetKind={objKind}
          showRest={showRest}
          proposedPaths={proposedPaths}
          onUpdateSet={updateSet}
          onRemoveSet={removeSet}
          onApplyDown={applyDown}
          onAddSet={addSet}
        />
      ) : null}

      {showRest && mode === 'iguales' ? (
        <Control label="Descanso entre series" proposed={proposedShared.rest}>
          <RestChips
            seconds={sets[0]?.rest_s ?? value.rest_s ?? null}
            values={STRENGTH_REST_VALUES}
            ariaLabel={proposedAria('Descanso entre series', proposedShared.rest)}
            onChange={(s) => applyShared({ rest_s: s ?? undefined })}
          />
        </Control>
      ) : null}

      <Control label="Tempo" hint="opcional">
        {/* Se escribe en todas las series: el tempo es del ejercicio, no de una serie. */}
        <TempoDisclosure
          tempo={sets[0]?.tempo ?? ''}
          onChange={(t) => applyShared({ tempo: t || undefined })}
        />
      </Control>

      {anyProposed ? (
        <p className="px-0.5 text-label leading-snug text-[color:var(--v2-warn)]">
          Lo del trazo discontinuo no salía en la fuente: lo pusimos con tus valores por defecto.
        </p>
      ) : null}
    </div>
  );
}

// ── Los controles del modo «Series iguales» ──────────────────────────────────
function SharedControls({
  sets,
  showRest,
  proposed,
  applyShared,
  onCount,
}: {
  sets: PrescriptionSet[];
  showRest: boolean;
  proposed: { measure: boolean; target: boolean; rest: boolean };
  applyShared: (patch: Partial<PrescriptionSet>) => void;
  onCount: (n: number) => void;
}) {
  void showRest;
  const measure = setMeasure(sets[0]!);
  const reps = measure?.kind === 'reps' ? measure : undefined;

  const stepReps = (v: number) => {
    if (!reps) return;
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
              max={100}
              format={reps.max !== undefined ? (v) => `${v}-${reps.max}` : undefined}
              ariaLabel={proposedAria('Reps por serie', proposed.measure)}
              onChange={stepReps}
            />
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
function SharedTargetValue({
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

function Control({
  label,
  hint,
  proposed = false,
  children,
}: {
  label: string;
  hint?: string;
  proposed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', proposed && `${PROPOSED_CELL} p-1`)}>
      <span className="v2-micro flex items-baseline gap-2">
        {label}
        {hint ? (
          <span className="font-medium normal-case tracking-normal text-[color:var(--v2-faint)]">
            {hint}
          </span>
        ) : null}
      </span>
      {children}
    </div>
  );
}
