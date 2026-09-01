// LA VOZ DEL VEREDICTO — el mecanismo es compartido, las palabras son de aquí.
//
// `RUN_COMPLIANCE_LABEL` (shared/domain/adherence) es del panel del coach: «En
// banda», «Más rápido». El atleta habla de SUS repeticiones, que son femeninas y
// no llevan la palabra «banda» en la cabeza. Mismo veredicto, misma clasificación,
// otra boca — y por eso vive aparte del modelo, que no sabe de palabras.

import type { RunComplianceVerdict } from '@fahybrid/shared/domain/adherence';
import type { Sesgo } from './modelo';

export const VOZ_ATLETA: Record<RunComplianceVerdict, string> = {
  dentro: 'Dentro',
  fuera_rapido: 'Más rápida',
  fuera_lento: 'Más lenta',
  sin_dato: 'Sin medir',
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
  const cuantas = fuera === 1 ? 'La que se salió' : `Las ${fuera} que se salieron`;
  if (sesgo === 'mixto') return `${cuantas} se fueron por los dos lados`;
  return `${cuantas} ${fuera === 1 ? 'fue' : 'fueron'} ${sesgo === 'lento' ? 'más lenta' : 'más rápida'}${fuera === 1 ? '' : 's'}`;
}
