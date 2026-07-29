// La ventana y las rondas — el AMRAP del doble.
//
// EL MODELO
// ---------
// Un AMRAP es TIEMPO FIJO × RONDAS LIBRES. Gobierna el reloj (la ventana drena
// y te saca), pero el trabajo lo cuentas TÚ (la ronda se toca). De ahí que su
// marcador tenga siempre DOS partes, y que la segunda casi nunca esté medida:
//
//   rondas cerradas → las que tocaste; el tiempo de cada una lo pone el reloj
//   reps sueltas    → lo que llevabas de la ronda que la ventana cortó
//
// No es una invención de esta pantalla. Es lo que la base guarda desde la
// migración 0069 (`workout_executions.score_rounds` + `score_reps`, «AMRAP
// partial reps in the unfinished round») y lo que declara el catálogo de
// formatos: `WORKOUT_FORMATS.amrap.score = 'rounds_reps'`, con el lead de texto
// `AMRAP 12:00` (shared/domain/prescription/format.ts y to-text.ts).
//
// Y de la 0088 sale la regla que manda en el sellado: `reps_confirmed` es
// verdad SOLO si el atleta tocó el valor, «a real 0 is legal ONLY for
// open/AMRAP score-reps; a silent fabricated 0 is the cardinal sin». Traducido
// a pantalla: lo que marcaste se sella solo; lo que no, se pregunta UNA vez y
// si no lo sabes se queda en lo marcado. Nada se rellena por su cuenta.
//
// PROCEDENCIA DEL CASO (§7)
// -------------------------
// El corpus de composición (`datos-reales.ts`: asignaciones 239, 240, 349 y
// 352) no trae ningún AMRAP — es For Time, fuerza y remo. Así que este entreno
// y los tiempos de sus rondas están FABRICADOS para dirigir la UX, igual que
// `CURSOR_HYROX`, y viven declarados en UN solo sitio: las tres escenas
// describen el MISMO AMRAP en tres instantes y ninguna inventa por su cuenta.

import type { Modalidad } from '../../datos-reales';

/** La ventana del entreno: 12:00. El único número que no depende del atleta. */
export const VENTANA_S = 720;

/** El último tramo, donde el ambiente sube. Un minuto: lo que dice el juez. */
export const AVISO_FINAL_S = 60;

/** El remate, donde la ventana pasa a leerse de reojo cada segundo. */
export const REMATE_FINAL_S = 10;

export interface MovimientoAmrap {
  /** Cómo se llama en el box: «wall balls», «remo», «burpees». */
  nombre: string;
  /** Lo que pide la ronda de este movimiento. */
  dosis: number;
  /**
   * Cómo se cuenta. Las calorías del remo SUMAN al marcador igual que una rep
   * (`score_reps` es un entero sin unidad), pero se dicen «cal», no «reps»:
   * quien lo lee está mirando el monitor del remo, no contando burpees.
   */
  unidad: 'reps' | 'cal';
  modalidad: Modalidad;
}

/** El AMRAP de esta familia: tres movimientos, diez de cada uno. */
export const MOVIMIENTOS: readonly MovimientoAmrap[] = [
  { nombre: 'wall balls', dosis: 10, unidad: 'reps', modalidad: 'functional' },
  { nombre: 'remo', dosis: 10, unidad: 'cal', modalidad: 'row' },
  { nombre: 'burpees', dosis: 10, unidad: 'reps', modalidad: 'functional' },
];

/** Lo que vale una ronda entera en el marcador. */
export const REPS_POR_RONDA = MOVIMIENTOS.reduce((n, m) => n + m.dosis, 0);

/**
 * Cómo se escribe un movimiento en la lista. Una sola grafía para las tres
 * pantallas de la familia (§2): `10 wall balls`, `10 cal de remo`.
 */
export function lineaMovimiento(m: MovimientoAmrap): string {
  return m.unidad === 'cal' ? `${m.dosis} cal de ${m.nombre}` : `${m.dosis} ${m.nombre}`;
}

// ---------------------------------------------------------------------------
// El guion — los tiempos de las rondas que YA estaban cerradas al montar
// ---------------------------------------------------------------------------

/**
 * Duración de cada ronda del guion, en segundos. Fabricados (ver cabecera), y
 * fabricados con una historia: se sale a 1:48, se va cayendo hasta 2:02 y la
 * última se aprieta a 1:52. Suman 694 s de los 720 de la ventana, así que la
 * ronda 7 se queda a medias — que es justo el caso que obliga a preguntar.
 *
 * Las rondas que cierre quien mire el doble NO salen de aquí: se miden contra
 * el reloj de verdad de la pantalla. El guion solo cubre el pasado.
 */
export const SPLITS_GUION_S: readonly number[] = [108, 114, 118, 120, 122, 112];

/** Segundo de la ventana en el que se cerró la ronda `n` del guion (1-based). */
export function cierreGuionS(n: number): number {
  return SPLITS_GUION_S.slice(0, n).reduce((a, b) => a + b, 0);
}

export interface Arranque {
  /** Segundos de ventana ya gastados al montar la escena. */
  transcurridoS: number;
  /** Rondas del guion ya cerradas. */
  rondas: number;
  /** Movimientos marcados de la ronda en curso (0 a 3). */
  marcados: number;
}

/**
 * El mismo AMRAP en tres instantes. Los tres cuadran entre sí: `en-faena` cae
 * 40 s después de cerrar la ronda 4 (cierre en 7:40), `ultimo-minuto` cae
 * 1:18 dentro de la ronda 6 (la 5 cerró en 9:42) y el sellado llega con las
 * seis cerradas (11:34) y 26 s de ronda 7 sin cerrar.
 */
export const ARRANQUE: Record<'en-faena' | 'ultimo-minuto', Arranque> = {
  'en-faena': { transcurridoS: cierreGuionS(4) + 40, rondas: 4, marcados: 1 },
  'ultimo-minuto': { transcurridoS: VENTANA_S - AVISO_FINAL_S, rondas: 5, marcados: 2 },
};

/** Lo que quedó sin cerrar cuando sonó la bocina: los wall balls marcados. */
export const SELLADO = { rondas: SPLITS_GUION_S.length, marcados: 1 } as const;

// ---------------------------------------------------------------------------
// El pulso — solo existe porque hay reloj en la muñeca (§7)
// ---------------------------------------------------------------------------

/**
 * FC del tramo: curva fija, monótona, del arranque al remate. Fabricada como
 * los splits — y con la misma condición que en el resto del doble: si el
 * atleta no lleva reloj esto no se llama, y la franja no se pinta. Nunca un
 * guion ni un cero en su sitio.
 */
export function pulsoEn(segundo: number): number {
  const f = Math.min(1, Math.max(0, segundo / VENTANA_S));
  return Math.round(148 + 34 * f ** 0.55);
}

/** El máximo del tramo — el que se sella. Es el final de la curva. */
export const PULSO_MAX_PPM = pulsoEn(VENTANA_S);

// ---------------------------------------------------------------------------
// Formateadores del AMRAP — uno por concepto (§2)
// ---------------------------------------------------------------------------

/**
 * LA ventana que corre, con ancho fijo (`mm:ss`). Es la variante `anchoFijo`
 * que el §2 reserva justo para el cronómetro en marcha: sin ella el número
 * baila al cruzar de 10:00 a 9:59, con el móvil en el suelo y a tres metros.
 *
 * DEUDA DECLARADA (§2.1): `reloj()` de `datos-reales.ts` no acepta todavía ese
 * parámetro, aunque el canónico de iOS (`Formato.clock(anchoFijo:)`) sí. En
 * cuanto otra pantalla del doble tenga un cronómetro que corre, esto sube a
 * `reloj()` como parámetro. No se copia a una segunda pantalla.
 */
export function ventana(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * EL marcador: `6 rondas y 14 reps`. Es la forma en que se dice un resultado
 * de AMRAP en un box y la forma en que lo guarda la base (score_rounds +
 * score_reps). Sin reps sueltas se calla la segunda mitad: «6 rondas» a secas
 * es un resultado redondo de verdad, y escribir «y 0 reps» lo estropearía.
 */
export function marcador(rondas: number, reps: number): string {
  const r = `${rondas} ${palabraRondas(rondas)}`;
  if (reps <= 0) return r;
  return `${r} y ${reps} ${palabraReps(reps)}`;
}

/**
 * Las dos palabras del marcador, sueltas — porque el sellado no pinta la frase
 * entera: pone la cifra en la voz de instrumento y la palabra en cursiva, a
 * otro tamaño. Salen de aquí y no de un ternario dentro de la vista para que
 * el singular no se pierda justo en la pantalla que enseña el resultado.
 */
export function palabraRondas(n: number): string {
  return n === 1 ? 'ronda' : 'rondas';
}

export function palabraReps(n: number): string {
  return n === 1 ? 'rep' : 'reps';
}

export interface ComparaRonda {
  /** «12 s más lenta que la 1». */
  texto: string;
  /** Positivo = más lenta. Sirve para elegir el color, no para el texto. */
  deltaS: number;
}

/**
 * El ritmo honesto: una ronda contra la PRIMERA DE HOY, y solo eso. Ni contra
 * el histórico, ni contra una media del box, ni contra un objetivo que nadie
 * escribió — de este AMRAP no hay nada más que estas rondas (§7).
 *
 * Con una sola ronda cerrada no hay nada que comparar y devuelve `null`: la
 * línea desaparece en vez de enseñar un cero.
 */
export function comparaConLaPrimera(splitsS: readonly number[], indice: number): ComparaRonda | null {
  if (indice <= 0 || indice >= splitsS.length) return null;
  const deltaS = Math.round(splitsS[indice] - splitsS[0]);
  if (deltaS === 0) return { texto: `clavada a la 1`, deltaS };
  const signo = deltaS > 0 ? 'más lenta' : 'más rápida';
  return { texto: `${Math.abs(deltaS)} s ${signo} que la 1`, deltaS };
}
