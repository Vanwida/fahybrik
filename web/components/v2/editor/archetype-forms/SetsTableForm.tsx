'use client';

// SetsTableForm — the SETS-TABLE base pattern (Fuerza · Fuerza-potencia). Reaches
// the per-set strength table DIRECTLY, with zero upstream modality/measure/scheme
// toggles (the archetype fixed modality=strength, measure=reps, scheme=sets). The
// table itself is the EXISTING StrengthFields (DRY — not re-implemented): reps ×
// objetivo × descanso × tempo per set. The ONE switch this form adds is the
// objetivo KIND for the whole exercise (%RM ↔ kg ↔ RPE ↔ RIR ↔ peso corporal),
// since a strength exercise targets one intensity dimension across its sets.

import type { Prescription, Target, TargetKind } from '@fahybrid/shared/domain/prescription';
import { setTarget } from '@fahybrid/shared/domain/prescription';
import { emptyTargetOfKind } from '@/lib/programming/prescription-model';
import { StrengthFields } from '../prescription-field-groups';
import { Field, InlineToggle } from './form-controls';

// Strength objective kinds, ordered default-first (%RM is the most common).
const OBJECTIVE_OPTIONS: { value: TargetKind; label: string }[] = [
  { value: 'percent_rm', label: '%RM' },
  { value: 'kg', label: 'kg' },
  { value: 'rpe', label: 'RPE' },
  { value: 'rir', label: 'RIR' },
  { value: 'bodyweight', label: 'Peso corp.' },
];

function currentObjectiveKind(p: Prescription): TargetKind {
  const first = p.sets?.[0];
  const t = first ? setTarget(first) : undefined;
  return t?.kind ?? 'percent_rm';
}

export function SetsTableForm({
  value,
  onChange,
}: {
  value: Prescription;
  onChange: (next: Prescription) => void;
}) {
  const objKind = currentObjectiveKind(value);

  // Switching the objective kind re-targets EVERY set to that kind, carrying any
  // numeric value across (so the coach doesn't lose what they typed).
  const setObjectiveKind = (kind: TargetKind) => {
    if (kind === objKind) return;
    const sets = (value.sets ?? []).map((s) => {
      const prev = setTarget(s);
      const carry =
        prev && prev.kind !== 'bodyweight' && prev.kind !== 'pace'
          ? prev.value ?? prev.min ?? prev.max
          : undefined;
      const target: Target = emptyTargetOfKind(kind, value.modality, carry);
      // Drop the legacy alias so the canonical target wins on read.
      const { load: _load, rpe: _rpe, rir: _rir, ...rest } = s;
      void _load;
      void _rpe;
      void _rir;
      return { ...rest, target };
    });
    onChange({ ...value, scheme: 'sets', sets });
  };

  return (
    <div className="space-y-3">
      <Field label="Objetivo de carga" hint="aplica a todas las series">
        <InlineToggle
          ariaLabel="Tipo de objetivo de carga"
          value={objKind}
          options={OBJECTIVE_OPTIONS}
          onChange={setObjectiveKind}
        />
      </Field>

      {/* The existing per-set table — reps × objetivo × descanso × tempo. */}
      <div className="rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
        <StrengthFields value={value} onChange={onChange} />
      </div>
    </div>
  );
}
