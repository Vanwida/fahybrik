'use client';

// PrescriptionEditorV2 — the session drawer's INLINE prescription editor (UX
// redesign §4). It expands inside the exercise row (never a nested modal) and
// reads like a coach tool, not a DB form:
//
//   - modality segmented control (Fuerza · Run · Row · Ski · Bike · Funcional ·
//     Core · Movilidad) drives smart defaults on switch
//   - preset chips (1 click) per modality + the coach's last used
//   - fields labeled in natural Spanish (Series, Reps, Distancia, Ritmo
//     objetivo, Descanso) — the words esquema/medida/target never appear
//   - the per-set table is collapsed behind "N series iguales · Variar por
//     serie"; only valid targets are offered for the chosen modality
//
// The canonical data model (modality × scheme × measure × target, per-set
// arrays) is untouched: this is a different INPUT onto the same Prescription.

import { useId } from 'react';
import type {
  Modality,
  Prescription,
  PrescriptionScheme,
  PrescriptionSet,
} from '@fahybrid/shared/domain/prescription';
import { prescriptionToText, safeParsePrescription } from '@fahybrid/shared/domain/prescription';
import { cn } from '@/lib/utils';
import { MIcon } from '@/components/ui/MIcon';
import {
  defaultMeasureForModality,
  defaultSchemeForModality,
  defaultTargetForModality,
  measureToSchemeFields,
} from '@/lib/programming/prescription-model';
import {
  MODALITY_SEGMENT,
  SCHEME_NATURAL_LABEL,
  loadRecentPrescription,
  modalityLabel,
  presetsForModality,
  saveRecentPrescription,
} from './prescription-presets';
import { comboDescription, isPerSetShape, setsView } from './rx-editor-model';
import { ConditioningFieldsV2, PerSetTable, UniformFields } from './RxFields';

const SCHEME_ORDER: PrescriptionScheme[] = [
  'sets',
  'interval',
  'rounds',
  'emom',
  'amrap',
  'for_time',
  'steady',
];

// Sets seeded when switching into a set-based shape without existing sets.
const DEFAULT_SET_COUNT = 3;
const MAX_SETS = 60;

export function PrescriptionEditorV2({
  value,
  exerciseName,
  expandedPerSet,
  onTogglePerSet,
  onChange,
  onRemove,
  onDone,
}: {
  value: Prescription;
  exerciseName: string;
  /** Per-set table open ("Variar por serie"). Controlled by the row so it survives re-renders. */
  expandedPerSet: boolean;
  onTogglePerSet: (open: boolean) => void;
  onChange: (next: Prescription) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const editorId = useId();
  const modality = value.modality;
  const perSet = isPerSetShape(value);
  const sets = value.sets ?? [];
  const view = setsView(sets, value.rest_s);
  // Non-uniform sets can only be edited per-set: force the table open.
  const showPerSetTable = perSet && (expandedPerSet || !view.uniform);

  const parsed = safeParsePrescription(value);
  const combo = comboDescription(value);

  const commit = (next: Prescription) => {
    const clean = { ...next };
    (Object.keys(clean) as (keyof Prescription)[]).forEach((k) => {
      if (clean[k] === undefined) delete clean[k];
    });
    onChange(clean);
    saveRecentPrescription(clean.modality, clean);
  };

  // ── Modality switch → that modality's natural default shape ────────────────
  const setModality = (next: Modality) => {
    if (next === modality) return;
    const scheme = defaultSchemeForModality(next);
    if (scheme === 'sets') {
      const target = defaultTargetForModality(next);
      const seed: PrescriptionSet = {
        measure: defaultMeasureForModality(next),
        ...(target ? { target } : {}),
      };
      // Keep the coach's set COUNT when switching between set-based modalities.
      const count = perSet && sets.length > 0 ? sets.length : DEFAULT_SET_COUNT;
      commit({
        scheme: 'sets',
        modality: next,
        sets: Array.from({ length: count }, () => ({ ...seed })),
      });
    } else {
      const target = defaultTargetForModality(next);
      commit({
        scheme,
        modality: next,
        ...(target ? { target } : {}),
        ...measureToSchemeFields(scheme, defaultMeasureForModality(next)),
      });
    }
    onTogglePerSet(false);
  };

  const setScheme = (scheme: PrescriptionScheme) => {
    if (scheme === value.scheme) return;
    if (scheme === 'sets') {
      const target = defaultTargetForModality(modality);
      const seed: PrescriptionSet = {
        measure: defaultMeasureForModality(modality),
        ...(target ? { target } : {}),
      };
      commit({
        scheme: 'sets',
        modality,
        sets:
          sets.length > 0
            ? sets
            : Array.from({ length: DEFAULT_SET_COUNT }, () => ({ ...seed })),
      });
    } else {
      const next: Prescription = { scheme, modality };
      if (value.rounds !== undefined) next.rounds = value.rounds;
      if (value.work_s !== undefined) next.work_s = value.work_s;
      if (value.rest_s !== undefined) next.rest_s = value.rest_s;
      if (value.total_s !== undefined) next.total_s = value.total_s;
      if (value.target !== undefined) next.target = value.target;
      commit(next);
    }
    onTogglePerSet(false);
  };

  // ── Uniform mutations (apply across all sets) ──────────────────────────────
  const patchAllSets = (patch: (s: PrescriptionSet) => PrescriptionSet) => {
    commit({ ...value, sets: sets.map(patch) });
  };

  const setCount = (n: number | null) => {
    const count = Math.max(1, Math.min(MAX_SETS, n ?? 1));
    const template: PrescriptionSet = sets[sets.length - 1] ?? {
      measure: defaultMeasureForModality(modality),
    };
    const next =
      count <= sets.length
        ? sets.slice(0, count)
        : [...sets, ...Array.from({ length: count - sets.length }, () => ({ ...template }))];
    commit({
      ...value,
      sets: next,
      ...(value.scheme === 'interval' || value.scheme === 'rounds' ? { rounds: count } : {}),
    });
  };

  const setRestAll = (restS: number | null) => {
    if (value.scheme === 'sets') {
      patchAllSets((s) => {
        const next = { ...s };
        if (restS == null) delete next.rest_s;
        else next.rest_s = restS;
        return next;
      });
    } else {
      commit({ ...value, rest_s: restS ?? undefined });
    }
  };

  // ── Per-set table mutations ────────────────────────────────────────────────
  const updateSet = (i: number, patch: Partial<PrescriptionSet>) => {
    commit({
      ...value,
      sets: sets.map((s, idx) => {
        if (idx !== i) return s;
        const next = { ...s, ...patch };
        (Object.keys(next) as (keyof PrescriptionSet)[]).forEach((k) => {
          if (next[k] === undefined) delete next[k];
        });
        return next;
      }),
    });
  };

  const equalizeSets = () => {
    const first = sets[0];
    if (first) commit({ ...value, sets: sets.map(() => ({ ...first })) });
    onTogglePerSet(false);
  };

  const presets = presetsForModality(modality);
  const recent = loadRecentPrescription(modality);
  const recentLabel = recent ? prescriptionToText(recent) : null;

  return (
    <div
      id={editorId}
      className="space-y-3.5 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] p-4"
    >
      {/* Modalidad */}
      <div className="space-y-1.5">
        <span className="micro-label tracking-[0.1em]">Modalidad</span>
        <div
          role="radiogroup"
          aria-label={`Modalidad de ${exerciseName}`}
          className="flex flex-wrap gap-1"
        >
          {MODALITY_SEGMENT.map((o) => {
            const active = modality === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setModality(o.value)}
                className={cn(
                  'focus-ring h-7 rounded-[var(--r-pill)] border px-3 text-[11px] font-semibold transition-colors',
                  active
                    ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/10 text-[color:var(--accent)]'
                    : 'border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] text-[color:var(--text-muted)] hover:border-[color:var(--accent)]/40 hover:text-[color:var(--fg)]',
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Presets (1 click) */}
      {presets.length > 0 ? (
        <div className="space-y-1.5">
          <span className="micro-label tracking-[0.1em]">
            Presets de {modalityLabel(modality).toLowerCase()}
          </span>
          <div
            role="group"
            aria-label="Presets de prescripción"
            className="flex flex-wrap items-center gap-1.5"
          >
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  commit(preset.build());
                  onTogglePerSet(false);
                }}
                className="focus-ring metric-num h-7 rounded-[var(--r-s)] border border-transparent bg-[color:var(--surface-container-high)] px-2.5 text-[11px] font-semibold text-[color:var(--fg)] transition-colors hover:border-[color:var(--accent)]/45 hover:bg-[color:var(--surface-container-highest)]"
              >
                {preset.label}
              </button>
            ))}
            {recent && recentLabel ? (
              <button
                type="button"
                title="Último usado"
                onClick={() => {
                  commit(JSON.parse(JSON.stringify(recent)) as Prescription);
                  onTogglePerSet(false);
                }}
                className="focus-ring metric-num inline-flex h-7 max-w-56 items-center gap-1 truncate rounded-[var(--r-s)] border border-[color:var(--border-subtle)] bg-transparent px-2.5 text-[11px] font-semibold text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--fg)]"
              >
                <MIcon name="history" size={13} aria-hidden />
                <span className="truncate">{recentLabel}</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Formato (estructura natural del trabajo) */}
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`${editorId}-scheme`} className="micro-label tracking-[0.1em]">
          Formato
        </label>
        <select
          id={`${editorId}-scheme`}
          value={value.scheme}
          onChange={(e) => setScheme(e.target.value as PrescriptionScheme)}
          className="focus-ring rounded-[var(--r-s)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--fg)] outline-none focus:border-[color:var(--accent)]"
        >
          {SCHEME_ORDER.map((s) => (
            <option key={s} value={s}>
              {SCHEME_NATURAL_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {/* Campos en lenguaje natural */}
      {perSet ? (
        showPerSetTable ? (
          <PerSetTable
            sets={sets}
            modality={modality}
            exerciseName={exerciseName}
            onUpdateSet={updateSet}
            onAddSet={() => setCount(sets.length + 1)}
            onRemoveSet={(i) => commit({ ...value, sets: sets.filter((_, idx) => idx !== i) })}
          />
        ) : (
          <UniformFields
            view={view}
            modality={modality}
            exerciseName={exerciseName}
            onCount={setCount}
            onMeasure={(m) => patchAllSets((s) => ({ ...s, measure: m }))}
            onTarget={(t) => patchAllSets((s) => ({ ...s, target: t }))}
            onRest={setRestAll}
          />
        )
      ) : (
        <ConditioningFieldsV2 value={value} modality={modality} onCommit={commit} />
      )}

      {/* Variar por serie / igualar */}
      {perSet ? (
        <div className="flex items-center justify-between gap-3 rounded-[var(--r-s)] border border-dashed border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 py-2">
          <span className="inline-flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
            <MIcon name="stacked_bar_chart" size={15} aria-hidden />
            {view.uniform
              ? `${view.count} ${view.count === 1 ? 'serie' : 'series iguales'}`
              : `${view.count} series · varían entre sí`}
          </span>
          {showPerSetTable ? (
            <button
              type="button"
              onClick={equalizeSets}
              aria-label="Igualar todas las series a la primera"
              className="focus-ring inline-flex items-center gap-1 rounded-[var(--r-s)] text-xs font-semibold text-[color:var(--accent)] transition-colors hover:text-[color:var(--accent-press)]"
            >
              Igualar series
              <MIcon name="unfold_less" size={15} aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onTogglePerSet(true)}
              aria-expanded={false}
              aria-label="Variar la prescripción serie a serie"
              className="focus-ring inline-flex items-center gap-1 rounded-[var(--r-s)] text-xs font-semibold text-[color:var(--accent)] transition-colors hover:text-[color:var(--accent-press)]"
            >
              Variar por serie
              <MIcon name="unfold_more" size={15} aria-hidden />
            </button>
          )}
        </div>
      ) : null}

      {/* Validez + acciones */}
      <div className="flex items-center justify-between gap-3">
        <span
          className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-[color:var(--text-muted)]"
          role="status"
        >
          <MIcon
            name={parsed.success ? 'check' : 'error'}
            size={14}
            className={parsed.success ? 'text-[color:var(--ok)]' : 'text-[color:var(--warning)]'}
            aria-hidden
          />
          <span className="truncate">
            {parsed.success
              ? combo
                ? `Combinación válida — ${combo}`
                : 'Combinación válida'
              : 'Combinación incompleta — revisa los valores'}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Quitar ${exerciseName} — puedes deshacerlo con Cmd+Z`}
            className="focus-ring inline-flex h-7 items-center gap-1 rounded-[var(--r-s)] px-2 text-xs font-semibold text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--danger)]/10 hover:text-[color:var(--danger)]"
          >
            <MIcon name="delete" size={15} aria-hidden />
            Quitar
          </button>
          <button
            type="button"
            onClick={onDone}
            className="focus-ring inline-flex h-7 items-center rounded-[var(--r-s)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] px-3 text-xs font-semibold text-[color:var(--fg)] transition-colors hover:border-[color:var(--accent)]/40"
          >
            Hecho
          </button>
        </div>
      </div>
    </div>
  );
}
