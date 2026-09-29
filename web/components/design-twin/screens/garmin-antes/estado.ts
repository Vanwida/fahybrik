// EL ESTADO DE «ANTES» — lo que el reloj Garmin sabe antes de grabar. PURO.
//
// Modelo: docs/garmin-reloj/modelo.md (G01–G07, G9, G10, G26) y §8 (login por
// código de dispositivo). Sesiones y pasos: los de `kit-reloj`; las sesiones
// reales, las de «Muñeca · antes y después» (`reloj-antes-despues/sesiones.ts`):
// una sesión se lee igual en las dos muñecas, cambia el pintor.
//
// Lo que vive aquí es el DOMINIO de la pantalla, sin pintar nada:
//
//   · Hoy            qué toca hoy y en qué estado está el plan que el reloj tiene
//                    (al día, viejo, sin plan; con o sin detalle de cada sesión).
//   · Sistema        lo que el reloj lee antes de salir: GPS, pulso, batería, móvil.
//   · avisosPrevios  lo que hay que decir ANTES de empezar (G26): batería justa para
//                    la duración, pulso ausente en una sesión que lo usa.
//   · entornoEfectivo / necesitaGps   dónde se corre y si hay GPS que esperar.
//
// MÉTODO = DATO (HARD RULE Nº0). Aquí no nace ningún método del coach: ni
// umbral de zona, ni nombre de clase. Lo único con número es la batería
// (`ReglasPrevio`), que es física del reloj y no metodología, y lleva su valor
// por defecto marcado como PROVISIONAL: nadie lo ha medido (prueba T12 de
// `modelo.md` §12) y por eso la pantalla dice los DOS hechos (batería y
// duración) en vez de prometer «no llegarás».
//
// Qué NO hacer: escribir aquí una zona, un ritmo o un nombre propio; pintar; dar
// por bueno un plan sin detalle (DECISIONS 2026-09-28: sin detalle no hay Empezar).

import { duracionEstimada, hoyDe, type Entorno, type PasoBase, type PlanSesion } from '../../kit-reloj';
import type { Familia, Sesion } from '../reloj-antes-despues/sesiones';

// ---------------------------------------------------------------------------
// Hoy
// ---------------------------------------------------------------------------

/** La franja del día que el plan pone a una sesión (dato del plan; puede no decir ninguna). */
export type Franja = 'manana' | 'tarde';

/** Una sesión de hoy, tal como la conoce el reloj. */
export interface SesionDelDia {
  sesion: Sesion;
  franja: Franja | null;
  hecha: boolean;
  /**
   * ¿Tiene el reloj el detalle (los pasos)? Sin él no hay Empezar, ni contra la
   * asignación ni con un sustituto (DECISIONS 2026-09-28): solo se conoce el título.
   */
  detalle: boolean;
}

/** Qué edad tiene lo que el reloj sabe del plan. */
export type FrescuraPlan = { tipo: 'al-dia' } | { tipo: 'viejo'; dias: number } | { tipo: 'sin-plan' };

export interface Hoy {
  sesiones: SesionDelDia[];
  /** Lo de mañana, para el día que no toca. */
  manana: PasoBase[] | null;
  plan: FrescuraPlan;
}

/** Qué pantalla de «antes» toca según lo que hay hoy. */
export type VistaDeHoy = 'sin-plan' | 'no-toca' | 'sin-detalle' | 'una' | 'varias';

export function vistaDeHoy(hoy: Hoy): VistaDeHoy {
  if (hoy.plan.tipo === 'sin-plan') return 'sin-plan';
  if (hoy.sesiones.length === 0) return 'no-toca';
  if (hoy.sesiones.length > 1) return 'varias';
  return hoy.sesiones[0]!.detalle ? 'una' : 'sin-detalle';
}

/** ¿Se puede empezar esta sesión? Solo con su detalle (DECISIONS 2026-09-28). */
export const puedeEmpezar = (s: SesionDelDia): boolean => s.detalle;

/** La sesión que se ofrece primero: la primera sin hacer; si están todas hechas, la primera. */
export function primeraPendiente(sesiones: SesionDelDia[]): number {
  const k = sesiones.findIndex((s) => !s.hecha);
  return k < 0 ? 0 : k;
}

/** El título de una sesión, en su lenguaje (la misma línea que el brief y la Estructura): «6 × 1000 m», «Rodaje 50′». */
export function tituloDe(s: Sesion): string {
  return hoyDe(s.plan.pasos).titulo;
}

/** La duración estimada, en segundos (la de `duracionEstimada`, sumada). */
export function duracionS(plan: PlanSesion): number {
  return plan.pasos.reduce((a, p) => a + duracionEstimada(p), 0);
}

// ---------------------------------------------------------------------------
// Dónde se corre, y si hay GPS que esperar
// ---------------------------------------------------------------------------

/** Las familias que se corren (hay entorno y, fuera de cinta, GPS). Fuerza no tiene entorno. */
const CORREN: ReadonlySet<Familia> = new Set<Familia>(['correr', 'circuito', 'libre']);

export const seCorre = (familia: Familia): boolean => CORREN.has(familia);

/**
 * El entorno con el que se sale: el de la prescripción si lo dice (M3); si no, el
 * elegido en el brief; si no, el por defecto de Ajustes. `null` en fuerza.
 */
export function entornoEfectivo(s: Sesion, elegido: Entorno | null, porDefecto: Entorno): Entorno | null {
  if (!seCorre(s.familia)) return null;
  return s.entorno ?? elegido ?? porDefecto;
}

/** ¿Se puede cambiar el entorno en el brief? Solo si se corre y la prescripción no lo fija. */
export const entornoElegible = (s: Sesion): boolean => seCorre(s.familia) && s.entorno == null;

/** ¿Hay GPS que esperar? Se corre y no es en cinta (la cinta da los metros). */
export const necesitaGps = (s: Sesion, entorno: Entorno | null): boolean => seCorre(s.familia) && entorno !== 'cinta';

export const ENTORNOS: readonly Entorno[] = ['calle', 'cinta', 'pista'];
export const NOMBRE_ENTORNO: Record<Entorno, string> = { calle: 'Calle', cinta: 'Cinta', pista: 'Pista' };

/** El entorno con el que sale un reloj recién vinculado, hasta que el atleta lo cambie en Ajustes. */
export const ENTORNO_POR_DEFECTO: Entorno = 'calle';

/** Lo poco que un atleta cambia en la muñeca (Ajustes): nada de método, que es del coach. */
export interface Ajustes {
  entornoPorDefecto: Entorno;
}

export const AJUSTES_DEFECTO: Ajustes = { entornoPorDefecto: ENTORNO_POR_DEFECTO };

/** Entrenos libres: qué tipos sabe grabar el reloj sin plan. Mecanismo nuestro (familias del motor), no método. */
export const TIPOS_LIBRES = [
  { id: 'correr', texto: 'Correr' },
  { id: 'fuerza', texto: 'Fuerza' },
  { id: 'circuito', texto: 'Circuito' },
  { id: 'ergo', texto: 'Ergo' },
] as const;
export type TipoLibre = (typeof TIPOS_LIBRES)[number]['id'];

// ---------------------------------------------------------------------------
// Lo que el reloj lee antes de salir
// ---------------------------------------------------------------------------

/** El pulso antes de salir: aún fijando (el óptico tarda unos segundos), leyendo, o sin sensor que lo dé (banda sin emparejar, reloj flojo). */
export type Pulso = { tipo: 'fijando' } | { tipo: 'ok'; ppm: number } | { tipo: 'ausente' };

export interface Sistema {
  gps: 'buscando' | 'listo';
  pulso: Pulso;
  /** Carga del reloj, %. */
  bateriaPct: number;
  /** ¿Hay móvil a tiro? Sin él se graba igual (§9). */
  movil: boolean;
}

/** El pulso que se pinta: el valor, o `null` (la raya «—», jamás un cero: G1, G7). */
export const ppmDe = (p: Pulso): number | null => (p.tipo === 'ok' ? p.ppm : null);

// ---------------------------------------------------------------------------
// G26 · lo que se dice ANTES de empezar
// ---------------------------------------------------------------------------

export type AvisoPrevio = 'bateria-baja' | 'pulso-ausente';

/**
 * La batería que pide una sesión: física del reloj, no método del coach.
 * PROVISIONAL: sin medir (prueba T12, `modelo.md` §12: 90′ con GPS + pulso). Se
 * cambia aquí, en un sitio, cuando T12 diga cuánto gasta un Forerunner grabando.
 */
export interface ReglasPrevio {
  /** Lo que gasta el reloj por hora grabando con GPS y pulso, en % de batería. */
  consumoPctPorHora: number;
  /** Lo que tiene que sobrar al acabar, en %. */
  margenPct: number;
}

export const REGLAS_PREVIO_DEFECTO: ReglasPrevio = { consumoPctPorHora: 12, margenPct: 5 };

/** La batería que hace falta para una sesión de `duracionS` segundos. */
export function bateriaNecesaria(duracionSegundos: number, r: ReglasPrevio = REGLAS_PREVIO_DEFECTO): number {
  return Math.ceil((duracionSegundos / 3600) * r.consumoPctPorHora + r.margenPct);
}

/** ¿Una sesión usa el pulso para juzgar (zona o pulso como objetivo)? Sin él, «—» en lo que va a zona. */
export function usaPulso(plan: PlanSesion): boolean {
  return plan.pasos.some((p) => p.objetivos.some((o) => o.eje === 'zona' || o.eje === 'ppm'));
}

/**
 * Lo que hay que decir antes de empezar, por orden de gravedad. Solo lo que
 * cambia lo que el atleta va a ver o a poder hacer: una batería que no da para
 * la sesión, un pulso ausente en una sesión que va a zona. El móvil ausente no
 * bloquea nada («se graba igual») y va en el brief, no aquí.
 */
export function avisosPrevios(s: Sesion, sistema: Sistema, reglas: ReglasPrevio = REGLAS_PREVIO_DEFECTO): AvisoPrevio[] {
  const avisos: AvisoPrevio[] = [];
  if (sistema.bateriaPct < bateriaNecesaria(duracionS(s.plan), reglas)) avisos.push('bateria-baja');
  if (sistema.pulso.tipo === 'ausente' && usaPulso(s.plan)) avisos.push('pulso-ausente');
  return avisos;
}

// ---------------------------------------------------------------------------
// G05 · la frescura del plan, dicha
// ---------------------------------------------------------------------------

/** «Plan de hace 3 días», «Plan de ayer»: lo que el reloj sabe de su propia edad, en palabras de atleta. */
export function textoEdadPlan(dias: number): string {
  if (dias <= 1) return 'Plan de ayer';
  return `Plan de hace ${dias} días`;
}

// ---------------------------------------------------------------------------
// G06 · vincular el reloj (§8: código de dispositivo)
// ---------------------------------------------------------------------------

/**
 * El código que da el servidor. El reloj lo pinta tal cual: el alfabeto, la
 * longitud y cuánto dura los decide el servidor (`expires_in`); aquí solo se
 * agrupa para leerlo (tres y tres).
 */
export interface CodigoDeVinculo {
  codigo: string;
  /** Lo que queda de vida, en s. */
  restanteS: number;
}

/** Cuántos caracteres van juntos al leer el código. */
export const GRUPO_CODIGO = 3;

/** «K7M4QX» → «K7M 4QX». Un espacio fino entre grupos; nada más. */
export function agruparCodigo(codigo: string): string {
  const grupos: string[] = [];
  for (let k = 0; k < codigo.length; k += GRUPO_CODIGO) grupos.push(codigo.slice(k, k + GRUPO_CODIGO));
  return grupos.join(' ');
}

// ---------------------------------------------------------------------------
// G07 · la sesión que la app dejó a medias (G10)
// ---------------------------------------------------------------------------

/**
 * Lo que el último punto de control guardó (G10: cada cambio de paso y cada
 * 30 s). El reloj NO puede reanudar el FIT (Garmin no lo permite): «Seguir» es
 * una grabación nueva de la misma sesión, y así se dice.
 */
export interface PuntoDeControl {
  /** El paso en el que iba. */
  i: number;
  /** Segundos de sesión grabados hasta el punto de control. */
  sesionT: number;
  sesionM: number;
}
