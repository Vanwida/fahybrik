// EL ESTADO DEL WOD — lo que el atleta declara con los cinco botones y el
// motor de `kit-reloj` no sabe. PURO.
//
// El motor lleva el tiempo, los cierres y los avisos; NO sabe qué tarea de un
// EMOM se hizo ni cuántas rondas y reps lleva un AMRAP. Eso lo declara el
// atleta y vive aquí, en dato:
//
//   hechas       EMOM: en qué segundo de la ventana se marcó la tarea, por
//                paso. Marcarla NO cierra la ventana (el reloj no se para
//                porque acabes antes): convierte lo que queda en respiro.
//   marcadores   AMRAP: las rondas cerradas (con su segundo) y las reps de la
//                ronda en curso, por VENTANA. `null` = sin declarar, nunca 0
//                (G7, DECISIONS 28-09). La campana de después lee y mueve el
//                MISMO marcador, así que lo contado en vivo ya es la
//                puntuación: no hay que volver a decirla.
//
// Las cosas que tocan las teclas (§5, filas «AMRAP con ≥ 2 movimientos», «Ventana
// que no se salta» y «Campana de un AMRAP»):
//   BACK/LAP   ronda hecha (cierra una ronda, las reps de la nueva quedan sin declarar);
//              en la campana, solo si hay una en curso
//   UP / DOWN  reps +1 / −1 de la ronda en curso, con el acarreo a la ronda
//              (29 → 30 en una ronda de 30 es una ronda más: `girarDial`);
//              mantenidos, repiten y aceleran (lo hace la carcasa)
//
// Qué NO hacer: contar aquí el tiempo o las rondas «por si acaso»; guardar un 0
// que nadie dijo; escribir un número de reps por ronda (sale de las tareas).

import type { EstadoMandos, IdControl } from '../../kit-garmin';
import {
  girarDial,
  repsPorRonda,
  wodDe,
  type Dial,
  type Lecturas,
  type Paso,
  type PasoBase,
  type PlanSesion,
  type Secuencia,
  type Vuelta,
} from '../../kit-reloj';
import type { EstadoSecuencia } from '../../kit-reloj/secuencia';

// ---------------------------------------------------------------------------
// Lo declarado
// ---------------------------------------------------------------------------

/** Las rondas cerradas de un AMRAP (el segundo de la ventana de cada cierre) y las reps de la que se corre. */
export interface Marcador {
  cierres: number[];
  reps: number | null;
}

export const MARCADOR_VACIO: Marcador = { cierres: [], reps: null };

export interface EstadoWod {
  /** EMOM: segundo de la ventana en que se marcó la tarea, por id de paso. */
  hechas: Record<string, number>;
  /** AMRAP: el marcador de cada ventana, por id del paso de la ventana. */
  marcadores: Record<string, Marcador>;
}

/** El estado de partida de un escenario, por ÍNDICE de paso (los ids se generan al montar el plan). */
export interface WodInicial {
  hechas?: Record<number, number>;
  marcadores?: Record<number, Marcador>;
}

function porId<T>(plan: PlanSesion, porIndice: Record<number, T> | undefined): Record<string, T> {
  const r: Record<string, T> = {};
  for (const [k, v] of Object.entries(porIndice ?? {})) {
    const p = plan.pasos[Number(k)];
    if (p) r[p.id] = v;
  }
  return r;
}

export function estadoWodInicial(plan: PlanSesion, ini: WodInicial | undefined): EstadoWod {
  return { hechas: porId(plan, ini?.hechas), marcadores: porId(plan, ini?.marcadores) };
}

// ---------------------------------------------------------------------------
// El marcador del AMRAP
// ---------------------------------------------------------------------------

/** El dial de la puntuación: rondas cerradas y reps sueltas. */
export const dialDe = (m: Marcador): Dial => ({ rondas: m.cierres.length, reps: m.reps });

/** Reps de una ronda entera (12 + 10 + 8 = 30); 0 en un AMRAP de un solo movimiento (no hay ronda que llevar). */
export function porRondaDe(paso: PasoBase): number {
  const w = wodDe(paso);
  if (w?.formato !== 'amrap' && w?.formato !== 'puntuacion') return 0;
  return w.tareas.length > 1 ? repsPorRonda(w.tareas) : 0;
}

/** UP / DOWN: mueve las reps de la ronda en curso; si llevan a otra ronda (o la devuelven), los cierres siguen al dial. */
export function moverReps(m: Marcador, mas: 1 | -1, porRonda: number, t: number): Marcador {
  const d = girarDial(dialDe(m), mas, porRonda);
  const extra = d.rondas - m.cierres.length;
  const cierres = extra > 0 ? [...m.cierres, ...Array<number>(extra).fill(t)] : m.cierres.slice(0, d.rondas);
  return { cierres, reps: d.reps };
}

/** BACK/LAP: ronda hecha. Las reps de la ronda nueva están sin declarar (no son 0: nadie las ha dicho). */
export const rondaHecha = (m: Marcador, t: number): Marcador => ({ cierres: [...m.cierres, t], reps: null });

/** Cuánto tardó cada ronda, en s (la diferencia entre cierres). */
export const tiemposDeRonda = (m: Marcador): number[] => m.cierres.map((c, k) => c - (m.cierres[k - 1] ?? 0));

/**
 * Las rondas cerradas como «vueltas» para la página Vueltas del kit (Controles de
 * un AMRAP): una por ronda, con su tiempo y sin nada más (ni metros, ni pulso, ni
 * veredicto: nadie los midió). El kit titula esa página «Rondas» en un AMRAP.
 */
export const vueltasDeRondas = (m: Marcador): Vuelta[] =>
  tiemposDeRonda(m).map((segundos, k) => ({ n: k + 1, clase: 'serie', segundos, metros: null, ritmo: null, ppm: null, veredicto: null }));

/**
 * LA PUNTUACIÓN EN UN NÚMERO para el héroe: «7+18» (rondas + reps, sin espacios:
 * la bitmap de cifras no lleva espacio y el «+» sí), «7+—» si las reps están sin
 * declarar. Un solo movimiento: las reps, o «—».
 */
export function textoPuntuacion(d: Dial, variasTareas: boolean): string {
  const reps = d.reps == null ? '—' : String(d.reps);
  return variasTareas ? `${d.rondas}+${reps}` : reps;
}

// ---------------------------------------------------------------------------
// Qué es cada paso para las teclas
// ---------------------------------------------------------------------------

/**
 * Lo que un paso del WOD pide a los botones. El kit deduce la fila de §5 de los
 * AMRAP (rondas, ventana de UNO, campana) y de un Tabata (`estadoDelPaso`); aquí
 * solo lo que depende de lo declarado: un EMOM con dosis marca la tarea con
 * BACK/LAP (fila «Serie de fuerza», sin cerrar la ventana) y, marcada ya, o si
 * es un minuto entero de máquina, es una ventana que no se salta.
 */
export type TipoMando = 'emom-tarea' | 'emom-ventana' | 'amrap-rondas' | 'amrap-reps' | 'puntuacion' | 'pared' | 'kit';

/** ¿Es esta ventana una tarea con dosis (la que se marca «hecha»)? Un minuto entero de remo o una ventana de correr, no. */
export function esTareaMarcable(paso: PasoBase): boolean {
  const w = wodDe(paso);
  return w?.formato === 'emom' && !!w.tarea.dosis && w.tarea.dosis.tipo !== 'abierta' && !w.tarea.corre;
}

export function tipoDeMando(paso: PasoBase, wod: EstadoWod): TipoMando {
  const w = wodDe(paso);
  if (!w) return 'kit';
  switch (w.formato) {
    case 'emom':
      // Solo una tarea con dosis se marca «hecha», y una vez; lo demás lo cierra el reloj.
      return esTareaMarcable(paso) && wod.hechas[paso.id] == null ? 'emom-tarea' : 'emom-ventana';
    case 'amrap':
      return w.tareas.length > 1 ? 'amrap-rondas' : 'amrap-reps';
    case 'puntuacion':
      return 'puntuacion';
    case 'pared':
      return 'pared';
    default:
      return 'kit';
  }
}

/** La fila de §5 que el WOD impone a un EMOM (`null` = la que deduce el kit). */
export const ESTADO_DE_EMOM: Partial<Record<TipoMando, EstadoMandos>> = {
  'emom-tarea': 'fuerza',
  'emom-ventana': 'ventana',
};

// ---------------------------------------------------------------------------
// Lo que ve una cara
// ---------------------------------------------------------------------------

/** Todo lo que una cara del WOD necesita: el paso, las lecturas, el plan, el motor y lo declarado. */
export interface VistaWod {
  paso: Paso;
  lecturas: Lecturas;
  plan: PlanSesion;
  estado: EstadoSecuencia;
  wod: EstadoWod;
  /** El paso anterior del plan (el AMRAP que acaba de sonar, la ronda anterior del tabata). */
  anterior: PasoBase | null;
}

export function vistaDe(seq: Secuencia, wod: EstadoWod): VistaWod {
  return { paso: seq.paso, lecturas: seq.lecturas, plan: seq.plan, estado: seq.estado, wod, anterior: seq.plan.pasos[seq.estado.i - 1] ?? null };
}

/** La clave del marcador de un paso: el de su ventana (la campana lee el de la ventana que acaba de sonar). */
export function claveDeMarcador(v: Pick<VistaWod, 'paso' | 'anterior'>): string {
  return wodDe(v.paso)?.formato === 'puntuacion' && v.anterior ? v.anterior.id : v.paso.id;
}

export const marcadorDe = (v: VistaWod): Marcador => v.wod.marcadores[claveDeMarcador(v)] ?? MARCADOR_VACIO;

/**
 * Los Controles de un paso de WOD: los del kit (`controlesPorDefecto`: incluye Datos,
 * Rondas y Estructura en un AMRAP y «Cambiar entorno» solo si se corre de verdad), con
 * un cambio que es del WOD: un descanso de reloj de pared (Tabata) no lleva «+30 s»: el
 * reloj no se estira (DECISIONS 28-09).
 */
export function controlesDeWod(paso: PasoBase, porDefecto: IdControl[]): IdControl[] {
  return wodDe(paso)?.formato === 'pared' ? porDefecto.filter((id) => id !== 'mas30') : porDefecto;
}
