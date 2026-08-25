// LA VOZ DEL VEREDICTO — el mecanismo es compartido, las palabras son de aquí.
//
// `RUN_COMPLIANCE_LABEL` (shared/domain/adherence) es del panel del coach: «En
// banda», «Más rápido». El atleta habla de SUS repeticiones, que son femeninas y
// no llevan la palabra «banda» en la cabeza. Mismo veredicto, misma clasificación,
// otra boca — y por eso vive aparte del modelo, que no sabe de palabras.

import type { RunComplianceVerdict } from '@fahybrid/shared/domain/adherence';
import type { Sesgo } from './modelo';

export const VOZ_ATLETA: Record<RunComplianceVerdict, string> = {
  dentro: '',
  fuera_rapido: '',
  fuera_lento: '',
  sin_dato: '',
};

export const TONO_VEREDICTO: Record<RunComplianceVerdict, string> = {
  dentro: 'var(--twin-ok)',
  fuera_rapido: 'var(--twin-warning)',
  fuera_lento: 'var(--twin-warning)',
  sin_dato: 'var(--twin-muted)',
};

/** Cómo se cuenta lo que se salió, en una línea de gimnasio. */
export function fraseSesgo(sesgo: Sesgo | null, fuera: number): string | null {
  if (sesgo == null || fuera === 0) return null;
  return null;
}
