'use client';

// SetsTableForm — the SETS-TABLE base pattern (Fuerza · Fuerza-potencia).
// Reaches the strength composer DIRECTLY, with zero upstream modality/measure/
// scheme toggles (the archetype fixed modality=strength, measure=reps,
// scheme=sets). The body is the EXISTING StrengthFields (DRY — not
// re-implemented): esquema iguales/variar, steppers + chips, banda de %RM y la
// rejilla por serie. El selector de TIPO de objetivo (%RM ↔ kg ↔ RIR ↔ RPE ↔
// corporal) vive DENTRO del compositor desde el rediseño: aquí ya no se
// duplica.

import type { Prescription } from '@fahybrid/shared/domain/prescription';
import { StrengthFields } from '../strength-composer';

export function SetsTableForm({
  value,
  onChange,
  scheme = 'sets',
  showRest = true,
}: {
  value: Prescription;
  onChange: (next: Prescription) => void;
  /**
   * Esquema con el que se reescribe la prescripción al editar. La SUPERSERIE
   * reutiliza este formulario entero con `scheme="superset"`: sin esto, cambiar
   * el objetivo de carga devolvía el bloque a series rectas y se perdía la
   * rotación.
   */
  scheme?: Prescription['scheme'];
  /** La superserie lleva el descanso a nivel de bloque (el de la vuelta). */
  showRest?: boolean;
}) {
  return (
    <div className="rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
      <StrengthFields value={value} onChange={onChange} scheme={scheme} showRest={showRest} />
    </div>
  );
}
