// LOS DOBLES COMO DATO DEL PASO — el turno de cada estación. Tipos y `estacionDe`
// (la estación derivada del paso), compartidos con el servidor: el plan compacto
// los lleva y los decodifica. La lectura y el pintado siguen en
// `kit-reloj/dobles.ts`, que re-exporta esto.

import type { PasoBase } from './paso';
import { fmtPrescrito } from './texto';

export type TurnoDobles = 'tuyo' | 'pareja' | 'reparto';

/** Cada cuánto se alternan en una estación repartida: «alterna 250 m», «alterna 20», «alterna 30″». */
export interface AlternaCada {
  tipo: 'metros' | 'reps' | 'segundos';
  n: number;
}

export interface Dobles {
  turno: TurnoDobles;
  /**
   * El nombre de pila de la pareja. Sin él → «tu pareja» (nunca se inventa).
   * En el contrato es UNO por sesión (`PlanSesion.pareja`); aquí es lo que el
   * pintor lee, copiado del plan a cada estación al cargarlo.
   */
  pareja?: string;
  /**
   * La estación tal como la nombra el coach («SkiErg 1km»). DERIVADA del paso
   * (`estacionDe`): el cable no la lleva y el contrato no la exige.
   */
  estacion?: string;
  /** Tus reps y las suyas, solo si la estación tiene un total de reps. */
  tuyas?: number;
  suyas?: number;
  /** Tu parte, 0…100. */
  pctTuyo: number;
  /** El pacto del coach como dato: cada cuánto alternan. */
  alternaCada?: AlternaCada;
  /**
   * El pacto en texto libre (legado). El contrato lleva `alternaCada`; el
   * texto se DERIVA (`textoAlterna`) y solo lo usa quien aún no migró.
   */
  nota?: string;
}

/** «SkiErg 1000 m»: la estación, derivada del nombre y la dosis del paso (nunca un texto aparte). */
export function estacionDe(p: Pick<PasoBase, 'nombre' | 'clase' | 'medida'>): string {
  return [p.nombre ?? p.clase, fmtPrescrito(p.medida)].filter(Boolean).join(' ');
}
