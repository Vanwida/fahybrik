'use client';

// PrescriptionFields — THE adaptive prescription editor (spec PRESCRIPTION
// MODEL). ONE component, reused across SCREEN 5 (session editor), SCREEN 8 (day
// editor) and SCREEN 9 (add-block modal). Three SegmentedControls drive the
// fields:
//   ① MODALIDAD   (Carrera | Ergómetro | Fuerza | Circuito)
//   ② CÓMO SE MIDE (Distancia | Tiempo | Reps | Calorías)
//   ③ OBJETIVO     (Ritmo | Zona | RPE | %máx | RIR | …)
// Changing ANY axis re-renders the CAMPOS below. It never authors free text: the
// state is a shared-domain `Prescription` and every edit goes through the
// editor-axes helpers (which delegate defaults to the shared prescription-model).
// The two CAMPOS bodies (strength per-set table / conditioning block) live in
// ./prescription-field-groups to keep this file modular.
//
// Field minimums per modality (incomplete = wrong, per spec):
//   - Correr: (distancia|tiempo) + objetivo; series → reps×medida + descanso.
//   - Ergo:   (distancia|tiempo|cal) + (ritmo/500m|RPE).
//   - Fuerza: sets → por serie {reps, carga, tempo, descanso}.
//   - Circuito/Metcon: formato + componentes + objetivo/cap.

import { useId } from 'react';
import type { Prescription, PrescriptionScheme } from '@fahybrid/shared/domain/prescription';
import { setMeasure } from '@fahybrid/shared/domain/prescription';
import { SegmentedControl } from '@/components/v2/SegmentedControl';
import {
  axesOf,
  applyErgSubmodality,
  applyMedida,
  applyModalidad,
  applyObjetivo,
  ERGO_SUBMODALITIES,
  isStrengthModality,
  MEDIDA_OPTIONS,
  medidasForModalidad,
  MODALIDAD_OPTIONS,
  OBJETIVO_LABEL,
  objetivosForModalidad,
} from '@/lib/dashboard/v2/editor-axes';
import { v2SelectCell } from './fields';
import { ConditioningFields, StrengthFields } from './prescription-field-groups';

// Conditioning format options (CÓMO se estructura el trabajo) — the metcon axis.
const FORMAT_OPTIONS: { value: PrescriptionScheme; label: string }[] = [
  { value: 'steady', label: 'Continuo' },
  { value: 'interval', label: 'Intervalos' },
  { value: 'amrap', label: 'AMRAP' },
  { value: 'emom', label: 'EMOM' },
  { value: 'for_time', label: 'For Time' },
  { value: 'rounds', label: 'Rondas' },
];

export function PrescriptionFields({
  value,
  onChange,
}: {
  value: Prescription;
  onChange: (next: Prescription) => void;
}) {
  const axes = axesOf(value);
  const formatId = useId();

  const medidaOptions = MEDIDA_OPTIONS.filter((o) =>
    medidasForModalidad(axes.modalidad).includes(o.value),
  );
  const objetivoOptions = objetivosForModalidad(axes.modalidad).map((k) => ({
    value: k,
    label: OBJETIVO_LABEL[k],
  }));

  const isStrength = isStrengthModality(value.modality);

  return (
    <div className="space-y-4">
      {/* ── ① MODALIDAD ─────────────────────────────────────────────────── */}
      <Axis label="Modalidad">
        <SegmentedControl
          options={MODALIDAD_OPTIONS}
          value={axes.modalidad}
          onChange={(m) => onChange(applyModalidad(value, m))}
          ariaLabel="Modalidad"
        />
        {axes.modalidad === 'ergo' ? (
          <SegmentedControl
            size="sm"
            options={ERGO_SUBMODALITIES.map((o) => ({ value: o.value, label: o.label }))}
            value={
              value.modality === 'row' || value.modality === 'ski' || value.modality === 'bike'
                ? value.modality
                : 'row'
            }
            onChange={(m) => onChange(applyErgSubmodality(value, m))}
            ariaLabel="Tipo de ergómetro"
            className="ml-2"
          />
        ) : null}
      </Axis>

      {/* ── ② CÓMO SE MIDE ──────────────────────────────────────────────── */}
      <Axis label="Cómo se mide">
        <SegmentedControl
          options={medidaOptions}
          value={
            medidaOptions.some((o) => o.value === axes.medida)
              ? axes.medida
              : medidaOptions[0]!.value
          }
          onChange={(m) => onChange(applyMedida(value, m))}
          ariaLabel="Cómo se mide"
        />
      </Axis>

      {/* ── ③ CONTRA QUÉ OBJETIVO ───────────────────────────────────────── */}
      <Axis label="Contra qué objetivo">
        <SegmentedControl
          options={objetivoOptions}
          value={
            objetivoOptions.some((o) => o.value === axes.objetivo)
              ? axes.objetivo
              : objetivoOptions[0]!.value
          }
          onChange={(k) => onChange(applyObjetivo(value, k))}
          ariaLabel="Contra qué objetivo"
        />
      </Axis>

      {/* ── Conditioning format (only for circuito/metcon-style blocks) ──── */}
      {!isStrength ? (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={formatId} className="v2-micro">
            Formato
          </label>
          <select
            id={formatId}
            value={value.scheme === 'sets' ? 'steady' : value.scheme}
            onChange={(e) => onChange(applyScheme(value, e.target.value as PrescriptionScheme))}
            className={v2SelectCell}
          >
            {FORMAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* ── Adaptive CAMPOS card ─────────────────────────────────────────── */}
      <div className="rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
        {isStrength ? (
          <StrengthFields value={value} onChange={onChange} />
        ) : (
          <ConditioningFields value={value} onChange={onChange} />
        )}
      </div>
    </div>
  );
}

function Axis({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="v2-micro">{label}</span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

// ── Format switch — carry the scheme structural fields + representative set ───
function applyScheme(p: Prescription, scheme: PrescriptionScheme): Prescription {
  if (scheme === p.scheme) return p;
  const next: Prescription = { scheme, modality: p.modality };
  if (p.rounds !== undefined) next.rounds = p.rounds;
  if (p.work_s !== undefined) next.work_s = p.work_s;
  if (p.rest_s !== undefined) next.rest_s = p.rest_s;
  if (p.total_s !== undefined) next.total_s = p.total_s;
  if (p.target !== undefined) next.target = p.target;
  // Carry the representative distance/cal set if present.
  if (p.sets && p.sets.length === 1) {
    const m = setMeasure(p.sets[0]!);
    if (m && (m.kind === 'distance' || m.kind === 'calories')) next.sets = [{ measure: m }];
  }
  return next;
}
