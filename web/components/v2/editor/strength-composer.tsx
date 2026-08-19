'use client';

// strength-composer — la FUERZA con dedos, no con teclado (rediseño del editor
// de microciclos, mock aprobado). Sustituye la tabla de celdas de
// prescription-field-groups conservando el MISMO contrato (nombre, props,
// esquema de superserie, marcas del importador):
//   · Esquema: «Series iguales | Variar por serie» (ChipGroup de texto).
//   · Iguales → series y reps con Stepper + chips frecuentes, objetivo por
//     chips (%RM en banda de ticks con rango a dos toques, RIR 0-4, kg con
//     paso 2,5), descanso por chips y tempo plegado
//     (strength-shared-controls).
//   · Variar → la rejilla por serie (strength-pyramid): pirámides reales.
// El teclado sigue disponible en todo («rango o teclado», el «otro» del
// descanso, las celdas de la rejilla) — alternativa siempre, único camino
// nunca. Edita `sets[]` del `Prescription` compartido; cero cambios de schema.

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
import {
  Control,
  proposedAria,
  RestChips,
  STRENGTH_REST_VALUES,
  TempoDisclosure,
} from './dose-controls';
import { SharedControls, SharedTargetValue } from './strength-shared-controls';
import { StrengthPyramid } from './strength-pyramid';

// Tipos de objetivo de un ejercicio de fuerza, en orden de uso real (%RM manda).
const OBJECTIVE_OPTIONS: { value: TargetKind; label: string }[] = [
  { value: 'percent_rm', label: '%RM' },
  { value: 'kg', label: 'kg' },
  { value: 'rir', label: 'RIR' },
  { value: 'rpe', label: 'RPE' },
  { value: 'bodyweight', label: 'Corporal' },
];

type SchemeMode = 'iguales' | 'variar';

/** ¿Las series difieren en algo (medida, objetivo, descanso o tempo)? */
function setsAreVaried(sets: PrescriptionSet[]): boolean {
  if (sets.length <= 1) return false;
  const key = (s: PrescriptionSet) =>
    JSON.stringify([setMeasure(s) ?? null, setTarget(s) ?? null, s.rest_s ?? null, s.tempo ?? null]);
  const first = key(sets[0]!);
  return sets.some((s) => key(s) !== first);
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

  const addSet = () =>
    writeSets([
      ...sets,
      sets.length > 0 ? { ...sets[sets.length - 1]! } : { measure: { kind: 'reps', value: 8 } },
    ]);
  const removeSet = (i: number) => writeSets(sets.filter((_, idx) => idx !== i));
  const applyDown = (i: number) => writeSets(sets.map((s, idx) => (idx > i ? { ...sets[i]! } : s)));

  const setMode = (next: SchemeMode) => {
    if (next === mode) return;
    setForcedMode(next);
    if (next === 'iguales' && sets.length > 0) {
      // Colapsar = la primera serie manda y se escribe N veces (copias, nunca
      // la misma referencia compartida) — exactamente lo que hacía addSet.
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

  if (sets.length === 0) {
    return (
      <div className="space-y-2">
        <p className="px-1 py-1 text-xs text-[color:var(--v2-muted)]">
          Sin series: añade la primera.
        </p>
        <button
          type="button"
          onClick={addSet}
          className="v2-focus inline-flex h-[34px] items-center rounded-[var(--v2-r-pill)] border border-dashed border-[color:var(--v2-border)] px-3.5 text-body font-bold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
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
            onChange={(t) => applyShared({ target: t })}
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
