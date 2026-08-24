// Sellar un objetivo relativo al ejecutar: el número ya resuelto viaja en el
// snapshot, para que el histórico no se reescriba si el atleta se retestea.
//
// Puro. No toca la plantilla. Sin anclas o sin relativo, devuelve el JSON
// tal cual (el camino de hoy).

import { safeParsePrescription } from '@fahybrid/shared/domain/prescription';
import {
  prescriptionHasRelativeTarget,
  resolvePrescriptionReferences,
  type AthleteAnchors,
} from '@fahybrid/shared/domain/prescription/resolve-relative';

export function sealPrescriptionJson(
  raw: unknown,
  anchors: AthleteAnchors | null,
): unknown {
  if (raw == null || !anchors) return raw;
  const parsed = safeParsePrescription(raw);
  if (!parsed.success) return raw;
  if (!prescriptionHasRelativeTarget(parsed.data)) return raw;
  return resolvePrescriptionReferences(parsed.data, anchors).prescription;
}
