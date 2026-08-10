// Muchas rondas — el modelo antes que la pantalla.
//
// EL PROBLEMA, EN UNA LÍNEA: la lista de rondas del vivo pinta una fila por
// ronda y la ranura del vivo no scrollea en vertical (§10.3), así que a partir
// de cuatro rondas lo que sobra EMPUJA. El 10-ago eso dejó EMPEZAR fuera de
// pantalla (docs/DECISIONS.md), y el arreglo de aquel día cerró la ruta del
// fartlek pero dejó abierto el caso general: un metcon de muchas rondas.
//
// LA DISTINCIÓN QUE LO GOBIERNA, y que no es de pintura: una lista de 16
// ESTACIONES y una lista de 16 RONDAS no son el mismo problema.
//
//   · Las estaciones son HETEROGÉNEAS — cada fila dice algo que las demás no
//     dicen. Colapsarlas destruye información, y por eso su respuesta es una
//     ventana de tres alrededor del cursor más la hoja entera (`vivo-fortime`).
//   · Las rondas son HOMOGÉNEAS — la fila 7 repite literalmente la fila 6. Una
//     lista de doce rondas escribe el mismo trabajo doce veces y gasta 681 pt
//     en decir lo que cabe en una frase. Colapsarlas no quita información:
//     la CONCENTRA.
//
// De ahí sale el contador, y de ahí sale también que no sea una pantalla nueva
// sino LA MISMA LISTA CON EL CURSOR ABIERTO: la ronda que cerraste arriba, la
// que haces en el numeral, la que viene abajo. El atleta no cambia de modelo
// mental al pasar de cinco rondas a doce.

import type { Modalidad } from '../../datos-reales';

// ---------------------------------------------------------------------------
// El presupuesto de alto — de aquí sale el umbral, y no de una preferencia
// ---------------------------------------------------------------------------

/**
 * Lo que `MarcoVivo` deja para los apoyos en vertical.
 *
 * El lienzo del iPhone 17 Pro son 874 pt y los safe areas se llevan 59 + 34,
 * así que quedan 781 útiles. El marco reparte cromo 34 + contexto 46 + sujeto
 * 340 + acción 76, más cuatro huecos de 12 y 24 de relleno = 568. La resta es
 * el hueco REAL en el que tiene que caber la lista de rondas:
 */
export const APOYOS_PT = 213;

/** Cabecera de la lista: la etiqueta y su relleno de 10 arriba y abajo. */
const CABECERA_PT = 34;

/**
 * La fila de HOY mide dos líneas: «Ronda 7» a 14 pt y debajo su trabajo a 11,
 * con relleno de 11 arriba y abajo (`StrikeList.rowView`). Más su hairline.
 */
export const FILA_HOY_PT = 54;

/**
 * La fila de la PROPUESTA mide una: el trabajo sube a la banda y se escribe
 * UNA vez (§10.6), así que la fila solo lleva la ronda y su parcial. Más su
 * hairline.
 */
export const FILA_PROPUESTA_PT = 35;

/** Alto que ocupa una lista de `rondas` filas. */
export function altoLista(rondas: number, filaPt: number): number {
  return CABECERA_PT + rondas * filaPt;
}

/** Cuántas filas de ese alto entran en el hueco de los apoyos. */
function cabenEn(filaPt: number): number {
  return Math.floor((APOYOS_PT - CABECERA_PT) / filaPt);
}

/** Tres. Por eso el WOD de cuatro rondas de la biblioteca ya se sale hoy. */
export const CABEN_HOY = cabenEn(FILA_HOY_PT);

/** Cinco. Sacar el trabajo de las filas compra dos rondas de lista. */
export const CABEN_PROPUESTA = cabenEn(FILA_PROPUESTA_PT);

/**
 * A partir de aquí la lista se colapsa en el contador. No es un número
 * elegido: es el primero que no cabe.
 */
export const UMBRAL_CONTADOR = CABEN_PROPUESTA + 1;

/**
 * El hilo pinta un tramo por ronda sobre los 354 pt que deja el marco. Por
 * debajo de 4 pt por tramo deja de leerse como tramos y pasa a ser ruido, así
 * que de ahí en adelante es una barra continua: la CUENTA la dice el numeral y
 * el hilo solo dice la forma. Un «death by» de cien rondas lo alcanza.
 */
const ANCHO_HILO_PT = 378 - 24;
const TRAMO_MINIMO_PT = 4;
export const RONDAS_MAX_HILO = Math.floor(ANCHO_HILO_PT / TRAMO_MINIMO_PT);

// ---------------------------------------------------------------------------
// El dominio de un metcon por rondas
// ---------------------------------------------------------------------------

export interface Movimiento {
  /** Como se guarda en `exercises.name` (inglés, igual que en datos-reales). */
  nombre: string;
  /** Cuánto: «10 cal» · «12,5 m» · «2:00» · «8». */
  dosis: string;
  /** La carga cuando el movimiento la lleva. Nula cuando no. */
  carga: string | null;
  modalidad: Modalidad;
  /**
   * Si el cruce de este movimiento lo lee alguien: la máquina sus calorías, el
   * reloj sus metros y sus segundos. Las repeticiones y los metros de un
   * trineo no los cuenta nadie — están en el suelo, no en un aparato.
   */
  loMide: boolean;
}

export interface Metcon {
  /** De dónde sale el dato, para poder auditarlo contra la base. */
  procedencia: string;
  titulo: string;
  /** Como lo nombra la cabecera del formato, en versales. */
  formato: string;
  rondas: number;
  /** El trabajo de UNA ronda. Es el mismo en todas: eso es lo que la hace ronda. */
  ronda: readonly Movimiento[];
  /** Tope de tiempo en segundos. Nulo = sin tope. */
  capS: number | null;
  /**
   * Parciales de las rondas ya cerradas al abrir la escena, y el crono del
   * bloque en ese instante.
   *
   * FABRICADOS, igual que los de `vivo-fortime`: ninguno de estos bloques
   * tiene ejecuciones medidas en el corpus, y sin parciales no se puede juzgar
   * ni el hilo ni la lectura de ritmo, que son la mitad de la propuesta. La
   * PRESCRIPCIÓN de arriba sí es real, verbatim de la biblioteca.
   */
  cerradas: readonly number[];
  aperturaS: number;
}

/**
 * Quién puede cerrar una ronda.
 *
 * Una ronda se cierra SOLA únicamente si todos sus movimientos los mide
 * alguien: basta un trineo, una zancada o un burpee para que la única salida
 * sea tu toque. De aquí sale el peso de la franja de acción (§10.5), que es lo
 * que dice quién gobierna la transición — no una preferencia de color.
 */
export function soloTuLaCierras(m: Metcon): boolean {
  return m.ronda.some((mov) => !mov.loMide);
}

/** La lista se colapsa cuando no cabe. Con una ronda no hay ni lista ni cuenta. */
export function toca(m: Metcon): 'nada' | 'lista' | 'contador' {
  if (m.rondas <= 1) return 'nada';
  return m.rondas >= UMBRAL_CONTADOR ? 'contador' : 'lista';
}

/**
 * La media de lo CERRADO. Con una sola ronda cerrada no se dice: un punto no
 * es un ritmo (la misma regla que la proyección de `vivo-fortime`).
 */
export function mediaS(cerradas: readonly number[]): number | null {
  if (cerradas.length < 2) return null;
  return cerradas.reduce((a, b) => a + b, 0) / cerradas.length;
}

/**
 * Dónde acabas al ritmo de lo cerrado. Solo con lo medible: las rondas que
 * cerraste tienen tiempo real, y la que está en vuelo no cuenta porque nadie
 * sabe por dónde vas dentro de ella.
 */
export function proyeccionS(m: Metcon, cerradas: readonly number[]): number | null {
  const media = mediaS(cerradas);
  return media == null ? null : Math.round(media * m.rondas);
}

/** Cómo se dice un movimiento en una línea: la dosis manda, el nombre la sigue. */
export function lineaDe(mov: Movimiento): string {
  const cuerpo = `${mov.dosis} ${mov.nombre}`;
  return mov.carga ? `${cuerpo} · ${mov.carga}` : cuerpo;
}

/** El trabajo de la ronda en una sola línea, para las filas de la lista de hoy. */
export function trabajoEnUnaLinea(m: Metcon): string {
  return m.ronda.map((mov) => mov.nombre).join(' · ');
}

// ---------------------------------------------------------------------------
// LOS CINCO CASOS REALES — la escalera de rondas que hay en la biblioteca
// ---------------------------------------------------------------------------
//
// Verbatim de `blocks.description` (la fuente de verdad del método según la
// migración 0037: la descripción es lo que escribió el coach, no un derivado).
// Se cogieron TODOS los bloques de la base con rondas repetidas, que son estos
// cinco: 4, 6, 8, 10 y 12. No hay ninguno de 16 — el único 16 del corpus es el
// fartlek 16 × 500 (plantilla 609), que es una carrera y el 10-ago se le
// arregló la ruta. Inventar un metcon de 16 para que la propuesta luciera más
// habría sido exactamente lo que el §7 prohíbe: el alto del contador no
// depende del número de rondas, y eso se demuestra con la escalera real.

/** `blocks.id` 393 · «Fuerza-potencia + WOD HYROX (Perfil Fuerza)», la parte del WOD. */
export const WOD_HYROX_4: Metcon = {
  procedencia: 'bloque 393 · «WOD 4 rounds»',
  titulo: 'WOD HYROX',
  formato: 'POR RONDAS',
  rondas: 4,
  ronda: [
    { nombre: 'Sled Push', dosis: '20 m', carga: '150 kg', modalidad: 'functional', loMide: false },
    { nombre: 'Walking Lunge', dosis: '10', carga: '30 kg', modalidad: 'functional', loMide: false },
    { nombre: 'Wall Balls', dosis: '12', carga: '9 kg', modalidad: 'functional', loMide: false },
  ],
  capS: null,
  cerradas: [96, 104],
  aperturaS: 241,
};

/** `blocks.id` 401 · «WOD corto AFAP» (Semana 11), formato `for_time`. */
export const WOD_AFAP_6: Metcon = {
  procedencia: 'bloque 401 · «6 rounds AFAP»',
  titulo: 'WOD corto AFAP',
  formato: 'AFAP POR RONDAS',
  rondas: 6,
  ronda: [
    { nombre: 'Back Squat', dosis: '8', carga: '75%', modalidad: 'strength', loMide: false },
    { nombre: 'Sled Push', dosis: '12,5 m', carga: '260 kg', modalidad: 'functional', loMide: false },
    { nombre: 'Run', dosis: '2:00', carga: '3:50 /km', modalidad: 'run', loMide: true },
    { nombre: 'Burpee Broad Jump', dosis: '10', carga: null, modalidad: 'functional', loMide: false },
  ],
  capS: null,
  cerradas: [232, 241, 248],
  aperturaS: 817,
};

/** `blocks.id` 61 · «WOD 8r», el único bloque de la base con formato `metcon`. */
export const WOD_8R_CAP: Metcon = {
  procedencia: 'bloque 61 · «WOD 8r … TC17\'»',
  titulo: 'WOD 8 rondas',
  formato: 'POR RONDAS · TOPE',
  rondas: 8,
  ronda: [
    { nombre: 'Assault Bike', dosis: '10 cal', carga: null, modalidad: 'bike', loMide: true },
    { nombre: 'Burpee Box Jump', dosis: '7', carga: null, modalidad: 'functional', loMide: false },
    { nombre: 'Chest to Bar', dosis: '10', carga: null, modalidad: 'functional', loMide: false },
  ],
  capS: 1020,
  cerradas: [104, 113, 121],
  aperturaS: 384,
};

/** `blocks.id` 65 · el bloque que la biblioteca titula literalmente «METCON». */
export const METCON_SLED_10: Metcon = {
  procedencia: 'bloque 65 · «METCON: 45\'\' on/15\'\' off x10r»',
  titulo: 'METCON trineo',
  formato: 'POR RONDAS · 45/15',
  rondas: 10,
  ronda: [
    { nombre: 'Sled Push', dosis: '45 s', carga: '170 kg', modalidad: 'functional', loMide: true },
  ],
  capS: 720,
  // Cada ronda son 45'' de trabajo y 15'' de transición: la cierra el reloj, y
  // por eso todos los parciales miden exactamente lo mismo.
  cerradas: [60, 60, 60, 60],
  aperturaS: 267,
};

/** `blocks.id` 37 · el más largo de la base: doce rondas. */
export const RONDAS_400_12: Metcon = {
  procedencia: 'bloque 37 · «12 rounds x 400m run – 1\' rest»',
  titulo: '12 rondas de 400',
  formato: 'POR RONDAS',
  rondas: 12,
  ronda: [
    { nombre: 'Run', dosis: '400 m', carga: null, modalidad: 'run', loMide: true },
    { nombre: 'Descanso', dosis: '1:00', carga: null, modalidad: 'mobility', loMide: true },
  ],
  capS: null,
  cerradas: [146, 149, 152, 150, 155],
  aperturaS: 813,
};

export const CASOS: Record<string, Metcon> = {
  'cuatro-rondas': WOD_HYROX_4,
  'seis-rondas': WOD_AFAP_6,
  'ocho-con-tope': WOD_8R_CAP,
  'diez-trineo': METCON_SLED_10,
  'doce-rondas': RONDAS_400_12,
};

// ---------------------------------------------------------------------------
// El guion del vivo
// ---------------------------------------------------------------------------

/** El doble avanza 4 s de entreno por segundo real, igual que `vivo-fortime`. */
export const SIM_X = 4;

/**
 * FC del guion: sube despacio dentro de la ronda y se queda arriba. Existe
 * para que el lienzo tenga zona que teñir (§10.1) — sin ancla de FC el tinte
 * no se pinta, y ese caso ya lo enseñan otras pantallas.
 */
export function fcEn(parcialS: number): number {
  return 156 + Math.round(10 * Math.min(1, Math.max(0, parcialS) / 120));
}
