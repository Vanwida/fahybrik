// LOS DOBLES EN EL VIVO — el turno de cada estación, como DATO del paso.
// Espejo de `ios/FAHYBRIKCore/Vivo/Vivo+Dobles.swift`.
//
// El motor decide quién hace cada estación (toda tuya, toda de tu pareja o
// repartida por reps); el vivo lo LEE y lo pinta con la anatomía de siempre: el
// turno y la pareja en la fila del formato de la cabecera, en la espera lo que
// llevas esperando (nadie mide a tu pareja: `screens/watch-dobles/guion.ts`) y la
// primaria «Relevo», que declara SIEMPRE el atleta. En una estación repartida la
// dosis del paso es TU parte, no la estación entera.

import type { PasoBase } from './paso';
import { fmtPrescrito, fmtReloj } from './reglas';

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

/** «alterna 250 m», «alterna 20», «alterna 30″»: el pacto, escrito desde el dato. */
export function textoAlterna(a: AlternaCada): string {
  return `alterna ${a.n}${a.tipo === 'metros' ? ' m' : a.tipo === 'segundos' ? '″' : ''}`;
}

export const nombrePareja = (d: Dobles) => d.pareja ?? 'tu pareja';

/** ¿Es la estación de la pareja (esperas y das el relevo)? */
export const esRelevo = (p: Pick<PasoBase, 'dobles'>) => p.dobles?.turno === 'pareja';

export function textoTurno(d: Dobles): string {
  if (d.turno === 'tuyo') return 'te toca';
  if (d.turno === 'pareja') return `le toca a ${nombrePareja(d)}`;
  return `con ${nombrePareja(d)}`;
}

/** La parte de la cabecera que dice el turno: «Dobles · le toca a Marta». */
export const formatoDobles = (d: Dobles) => `Dobles · ${textoTurno(d)}`;

/** El pacto de una estación repartida («Tú 60 · Marta 40 · alterna 25»); null fuera de un reparto. */
export function pactoDe(d: Dobles): string | null {
  if (d.turno !== 'reparto') return null;
  const q = nombrePareja(d);
  const quien = q.charAt(0).toUpperCase() + q.slice(1);
  const partes =
    d.tuyas != null && d.suyas != null ? [`Tú ${d.tuyas}`, `${quien} ${d.suyas}`] : [`Tú ${d.pctTuyo} %`, `${quien} ${100 - d.pctTuyo} %`];
  const pacto = d.alternaCada ? textoAlterna(d.alternaCada) : d.nota;
  if (pacto) partes.push(pacto);
  return partes.join(' · ');
}

/** El héroe de la espera: lo que llevas esperando. Tu salida no se estima. */
export const heroeRelevo = (t: number) => ({ clase: 'crono' as const, texto: fmtReloj(t), etiqueta: 'recuperas' });

/** La nota de honestidad bajo el héroe de la espera. */
export const NOTA_RELEVO = 'el relevo lo dices tú';

/** El aviso de deshacer del relevo. */
export const AVISO_RELEVO = 'Relevo · entras tú';
