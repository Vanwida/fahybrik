'use client';

// PrescriptionEditor — STRUCTURED dosage editor for one exercise line in the
// week studio. Authors the FULL unified prescription model across EVERY modality
// (run / row / ski / bike / strength / functional / core / mobility), not just
// strength: a per-line `modality`, a `measure` (reps | distance | duration |
// calories) and a range-capable `target` (%RM | kg | RPE | RIR | bodyweight |
// pace /km·/500m·/mi | HR zone | HR bpm | calories).
//
// Modality drives sensible defaults + which fields surface. Strength stays a
// per-set table (each set now carries the unified `target`); conditioning
// modalities use a scheme + a single block-level measure + target. The detail
// panel owns persistence: it derives `params_json` for back-compat and writes
// both columns on save. No new visual language — reuses the studio's dark tokens,
// focus rings, MIcon, and the shared dense inputs in PrescriptionControls.

import { useId } from 'react';
import type {
  Measure,
  Modality,
  Prescription,
  PrescriptionScheme,
  PrescriptionSet,
  Target,
} from '@fahybrid/shared/domain/prescription';
import { setMeasure, setTarget } from '@fahybrid/shared/domain/prescription';
import { MIcon } from '@/components/ui/MIcon';
import {
  MeasureControl,
  ModalitySelect,
  NumberCell,
  TargetControl,
  TextCell,
} from './PrescriptionControls';
import {
  blockMeasureOf,
  defaultMeasureForModality,
  defaultSchemeForModality,
  defaultTargetForModality,
  isStrengthModality,
  measureToSchemeFields,
} from '@/lib/programming/prescription-model';

// ── Scheme vocab (coach-facing labels) ───────────────────────────────────────
const SCHEME_OPTIONS: { value: PrescriptionScheme; label: string }[] = [
  { value: 'sets', label: 'Series' },
  { value: 'rounds', label: 'Rondas' },
  { value: 'for_time', label: 'For Time (AFAP)' },
  { value: 'emom', label: 'EMOM' },
  { value: 'amrap', label: 'AMRAP' },
  { value: 'interval', label: 'Intervalo' },
  { value: 'steady', label: 'Continuo' },
];

// Default set when the coach adds one to an empty / non-set prescription.
const DEFAULT_SET: PrescriptionSet = { measure: { kind: 'reps', value: 8 } };
// Quick-fill pattern surfaced as the ⚡ shortcut (5 sets × 5 reps @ 70% RM).
const QUICK_FILL = { sets: 5, reps: 5, pct: 70 } as const;

const FILLABLE_SCHEMES = new Set<PrescriptionScheme>(['sets']);

// Per-set schemes show the strength-style table; the rest show the conditioning
// block editor (scheme fields + one block-level measure + target).
const SET_SCHEMES = new Set<PrescriptionScheme>(['sets']);

export function PrescriptionEditor({
  value,
  exerciseName,
  onChange,
}: {
  value: Prescription;
  exerciseName: string;
  onChange: (next: Prescription) => void;
}) {
  const schemeId = useId();
  const modality = value.modality;

  // Switching MODALITY reshapes the line to that modality's natural default:
  // strength → per-set table seeded with %RM; cardio/erg → steady block with the
  // right measure (distance/duration/cal) + pace/zone target. Existing work is
  // preserved where it still makes sense (the scheme + sets carry over for
  // strength↔functional; cardio gets a fresh sensible block).
  const setModality = (next: Modality) => {
    if (next === modality) return;
    const scheme = defaultSchemeForModality(next);
    if (scheme === 'sets') {
      // Keep existing sets if any; otherwise seed one with this modality's defaults.
      const seedSet: PrescriptionSet = {
        measure: defaultMeasureForModality(next),
        ...(defaultTargetForModality(next) ? { target: defaultTargetForModality(next) } : {}),
      };
      onChange({
        scheme: 'sets',
        modality: next,
        sets: value.sets && value.sets.length > 0 ? value.sets : [seedSet],
      });
    } else {
      const blockTarget = defaultTargetForModality(next);
      onChange({
        scheme,
        modality: next,
        ...(blockTarget ? { target: blockTarget } : {}),
        // Carry the measure into a representative single round/steady block.
        ...measureToSchemeFields(scheme, defaultMeasureForModality(next)),
      });
    }
  };

  const setScheme = (scheme: PrescriptionScheme) => {
    if (scheme === value.scheme) return;
    if (scheme === 'sets') {
      onChange({
        ...stripSchemeFields(value),
        scheme,
        sets: value.sets && value.sets.length > 0 ? value.sets : [{ ...DEFAULT_SET }],
      });
    } else {
      const next: Prescription = { scheme, modality: value.modality };
      if (value.rounds !== undefined) next.rounds = value.rounds;
      if (value.work_s !== undefined) next.work_s = value.work_s;
      if (value.rest_s !== undefined) next.rest_s = value.rest_s;
      if (value.total_s !== undefined) next.total_s = value.total_s;
      if (value.target !== undefined) next.target = value.target;
      onChange(next);
    }
  };

  const isSetScheme = SET_SCHEMES.has(value.scheme);

  return (
    <div className="space-y-3">
      {/* Modality — drives defaults + which fields show. Top of the form. */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
          Modalidad
        </span>
        <ModalitySelect value={modality} onChange={setModality} />
      </div>

      {/* Scheme selector — mirrors the panel's dense header treatment. */}
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={schemeId}
          className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]"
        >
          Esquema
        </label>
        <SchemeSelect id={schemeId} value={value.scheme} onChange={setScheme} />
      </div>

      {isSetScheme ? (
        <SetTable
          sets={value.sets ?? []}
          modality={modality}
          exerciseName={exerciseName}
          onChange={(sets) => onChange({ ...value, sets })}
        />
      ) : (
        <ConditioningFields value={value} modality={modality} onChange={onChange} />
      )}
    </div>
  );
}

// ── Scheme select ───────────────────────────────────────────────────────────
function SchemeSelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: PrescriptionScheme;
  onChange: (v: PrescriptionScheme) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as PrescriptionScheme)}
      className="focus-ring rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--fg)] outline-none focus:border-[color:var(--accent)]"
    >
      {SCHEME_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ── Per-set table (strength / functional) ────────────────────────────────────
function SetTable({
  sets,
  modality,
  exerciseName,
  onChange,
}: {
  sets: PrescriptionSet[];
  modality: Modality | undefined;
  exerciseName: string;
  onChange: (sets: PrescriptionSet[]) => void;
}) {
  const updateSet = (i: number, patch: Partial<PrescriptionSet>) => {
    onChange(
      sets.map((s, idx) => {
        if (idx !== i) return s;
        const next = { ...s, ...patch };
        (Object.keys(next) as (keyof PrescriptionSet)[]).forEach((k) => {
          if (next[k] === undefined) delete next[k];
        });
        return next;
      }),
    );
  };

  const addSet = () => {
    // New set inherits the previous set's target/rest/tempo so a coach building
    // a pyramid only edits the reps that change.
    const last = sets[sets.length - 1];
    const seed: PrescriptionSet = last ? { ...last } : { ...DEFAULT_SET };
    onChange([...sets, seed]);
  };

  const removeSet = (i: number) => onChange(sets.filter((_, idx) => idx !== i));

  const quickFill = () => {
    onChange(
      Array.from({ length: QUICK_FILL.sets }, () => ({
        measure: { kind: 'reps', value: QUICK_FILL.reps } as Measure,
        target: { kind: 'percent_rm', value: QUICK_FILL.pct } as Target,
      })),
    );
  };

  return (
    <div className="space-y-2">
      {/* Column header row — tabular, compact. */}
      <div className="grid grid-cols-[1.5rem_1fr_3rem] items-center gap-1.5 px-0.5 text-[9px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
        <span className="text-center">#</span>
        <span>Medida · Objetivo</span>
        <span className="text-right">Desc.</span>
      </div>

      <div className="space-y-1.5">
        {sets.map((set, i) => (
          <SetRow
            key={i}
            index={i}
            set={set}
            modality={modality}
            exerciseName={exerciseName}
            onChange={(patch) => updateSet(i, patch)}
            onRemove={sets.length > 1 ? () => removeSet(i) : undefined}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={addSet}
          className="focus-ring inline-flex items-center gap-1 rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--fg)] transition-colors hover:border-[color:var(--accent)]"
        >
          <MIcon name="add" size={13} />
          Serie
        </button>
        {isStrengthModality(modality) ? (
          <button
            type="button"
            onClick={quickFill}
            className="focus-ring inline-flex items-center gap-1 rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--fg)]"
          >
            <MIcon name="bolt" size={13} />
            {`Rellenar: ${QUICK_FILL.sets}×${QUICK_FILL.reps} @ ${QUICK_FILL.pct}%`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SetRow({
  index,
  set,
  modality,
  exerciseName,
  onChange,
  onRemove,
}: {
  index: number;
  set: PrescriptionSet;
  modality: Modality | undefined;
  exerciseName: string;
  onChange: (patch: Partial<PrescriptionSet>) => void;
  onRemove?: (() => void) | undefined;
}) {
  const measure = setMeasure(set);
  const target = setTarget(set);

  return (
    <div className="rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] p-1.5">
      <div className="grid grid-cols-[1.5rem_1fr_3rem] items-start gap-1.5">
        <span className="metric-num pt-1.5 text-center text-xs font-bold text-[color:var(--text-muted)]">
          {index + 1}
        </span>
        <div className="min-w-0 space-y-1.5">
          <MeasureControl
            measure={measure}
            ariaPrefix={`Serie ${index + 1} · ${exerciseName} · medida`}
            onChange={(m) => onChange({ measure: m })}
          />
          <TargetControl
            target={target}
            modality={modality}
            ariaPrefix={`Serie ${index + 1} · objetivo`}
            onChange={(t) => onChange({ target: t })}
          />
        </div>
        <NumberCell
          value={set.rest_s ?? null}
          ariaLabel={`Descanso (s) serie ${index + 1}`}
          min={0}
          max={3600}
          suffix="s"
          onChange={(v) => onChange({ rest_s: v ?? undefined })}
        />
      </div>

      {/* Second line: tempo + per-set remove. Kept terse. */}
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
            className="focus-ring shrink-0 rounded-[var(--r-sm)] p-1 text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--danger)]"
          >
            <MIcon name="close" size={13} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ── Conditioning fields (rounds/emom/amrap/interval/steady) ─────────────────
// Scheme structure fields + ONE block-level measure (the work per round / the
// steady distance·duration·cal) + ONE range-capable target (pace / zone / bpm /
// cal / RPE). This is what makes a run, a Z2 ride, an erg sprint or a HYROX
// station authorable with zero free text.
function ConditioningFields({
  value,
  modality,
  onChange,
}: {
  value: Prescription;
  modality: Modality | undefined;
  onChange: (next: Prescription) => void;
}) {
  const patch = (p: Partial<Prescription>) => {
    const next = { ...value, ...p };
    (Object.keys(next) as (keyof Prescription)[]).forEach((k) => {
      if (next[k] === undefined) delete next[k];
    });
    onChange(next as Prescription);
  };

  const scheme = value.scheme;
  const showRounds = scheme === 'rounds' || scheme === 'emom' || scheme === 'interval';
  const showWork = scheme === 'emom' || scheme === 'interval' || scheme === 'rounds';
  const showRest = scheme === 'rounds' || scheme === 'interval' || scheme === 'emom';
  const showTotal = scheme === 'amrap' || scheme === 'steady';

  // The block measure lives in the scheme fields for timed schemes (work_s /
  // total_s) but the coach also needs to express distance / calories per round
  // or for the whole steady block — so we surface a Measure control that maps
  // onto the prescription's work/total/and (for distance/cal) a single-set proxy.
  const blockMeasure = blockMeasureOf(value);

  return (
    <div className="space-y-2.5">
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
            onChange={(v) => patch({ work_s: v ?? undefined })}
          />
        ) : null}
        {showRest ? (
          <LabeledNumber
            label="Descanso (s)"
            value={value.rest_s ?? null}
            min={0}
            max={3600}
            onChange={(v) => patch({ rest_s: v ?? undefined })}
          />
        ) : null}
        {showTotal ? (
          <LabeledNumber
            label="Tiempo total (s)"
            value={value.total_s ?? null}
            min={0}
            max={21600}
            onChange={(v) => patch({ total_s: v ?? undefined })}
          />
        ) : null}
      </div>

      {/* Block-level measure — distance / duration / calories the round covers. */}
      <div className="space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
          Medida
        </span>
        <MeasureControl
          measure={blockMeasure}
          ariaPrefix="Bloque · medida"
          onChange={(m) => patch(measureToSchemeFields(scheme, m))}
        />
      </div>

      {/* Block-level target — pace / zone / bpm / cal / RPE for the whole block. */}
      <div className="space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
          Objetivo
        </span>
        <TargetControl
          target={value.target}
          modality={modality}
          ariaPrefix="Bloque · objetivo"
          onChange={(t) => patch({ target: t })}
        />
      </div>
    </div>
  );
}

// Block-measure plumbing (blockMeasureOf / measureToSchemeFields) lives in
// ./prescription-model — shared with the session-drawer PrescriptionEditorV2.

// Strip the per-set fields when leaving a non-set scheme.
function stripSchemeFields(p: Prescription): Prescription {
  const { rounds: _r, work_s: _w, rest_s: _rs, total_s: _t, ...rest } = p;
  void _r;
  void _w;
  void _rs;
  void _t;
  return rest;
}

// ── Small labeled number (shared) ────────────────────────────────────────────
function LabeledNumber({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number | null;
  min?: number;
  max?: number;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
        {label}
      </span>
      <div className="mt-1">
        <NumberCell value={value} ariaLabel={label} min={min} max={max} onChange={onChange} />
      </div>
    </label>
  );
}

export { FILLABLE_SCHEMES };
