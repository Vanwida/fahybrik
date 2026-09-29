// EL CIRCUITO, PARA UN RELOJ QUE NO LEE EL ERGÓMETRO — pasos puros.
//
// Los planes son los de `reloj-circuito/planes.ts` (493, 492, 506, la
// simulación completa): no se copian, se PASAN por `paraGarmin`. Lo que
// cambia en la muñeca Garmin de la v1 (docs/garmin-reloj/modelo.md §13):
//
//   · nadie lee el PM5 (sin verificar): el SkiErg y el remo son «lo dices tú»,
//     con el crono de la estación por héroe y el atleta que la cierra (BACK/LAP);
//   · nadie detecta la Roxzone de salida por movimiento (fase 2, T10): la
//     cierra el atleta, igual que la de entrada.
//
// Y los dobles, resueltos como DATO del paso (`kit-reloj/dobles.ts`): la
// estación de la pareja es un paso de espera; la repartida, tu parte. El
// reparto de abajo es un EJEMPLO de este doble, no un dato de nadie: en la app
// lo decide el motor.
//
// Qué NO hacer: escribir aquí lo que varía por coach (el cap, las cargas, si
// hay Roxzone): entra por `Circuito`, con su defecto.

import type { Dobles, PasoBase } from '../../kit-reloj';
import { simulacionHyrox, type Circuito } from '../reloj-circuito/planes';

/** Lo que nadie mide en Garmin (el PM5 y la detección por movimiento) lo dice el atleta. */
function sinMedidor(p: PasoBase): PasoBase {
  if (p.medida.mide !== 'ergo' && p.medida.mide !== 'sensor') return p;
  const abierta = p.medida.tipo === 'abierta';
  return { ...p, medida: { ...p.medida, mide: abierta ? 'reloj' : 'atleta' }, cierre: 'atleta' };
}

/** El mismo circuito del coach, en lo que un reloj Garmin sabe medir hoy. */
export function paraGarmin(c: Circuito): Circuito {
  return { ...c, plan: { ...c.plan, pasos: c.plan.pasos.map(sinMedidor) } };
}

/** Cap del For Time de ejemplo (la plantilla 441 no lo trae): 90′, para ver dónde va. */
export const CAP_EJEMPLO_S = 90 * 60;

/** La simulación completa de HYROX, con Roxzone (dato del coach) y sin lectura de la máquina. */
export const simulacro = (): Circuito => paraGarmin(simulacionHyrox({ pm5: false, roxzone: true, cap: CAP_EJEMPLO_S }));

// ---------------------------------------------------------------------------
// Dobles — el turno como dato del paso
// ---------------------------------------------------------------------------

const PAREJA_EJEMPLO = 'Marta';

/**
 * Quién hace cada estación del simulacro de dobles, por orden de estación
 * (1–8). Es un EJEMPLO para ver las tres formas del turno: tuyo, de tu pareja
 * y repartido. `tuyas`/`suyas` solo si la estación tiene un total de reps.
 */
const TURNOS: Array<Omit<Dobles, 'estacion' | 'pareja' | 'nota'>> = [
  { turno: 'reparto', pctTuyo: 50, alternaCada: { tipo: 'metros', n: 250 } },
  { turno: 'tuyo', pctTuyo: 100 },
  { turno: 'pareja', pctTuyo: 0 },
  { turno: 'tuyo', pctTuyo: 100 },
  { turno: 'pareja', pctTuyo: 0 },
  { turno: 'tuyo', pctTuyo: 100 },
  { turno: 'pareja', pctTuyo: 0 },
  { turno: 'reparto', pctTuyo: 60, tuyas: 60, suyas: 40, alternaCada: { tipo: 'reps', n: 20 } },
];

/** La estación de la pareja: UN paso de espera, que cierra el atleta (nadie mide a tu pareja). */
function esperaDe(p: PasoBase, dobles: Dobles): PasoBase {
  return {
    ...p,
    rol: 'recuperacion',
    modoRecupera: 'parado',
    medida: { tipo: 'abierta', prescrito: null, mide: 'atleta' },
    objetivos: [],
    carga: undefined,
    cierre: 'atleta',
    dobles,
  };
}

/** En una estación repartida la dosis del paso es TU parte, no la estación entera. */
function tuParte(p: PasoBase, d: Dobles): PasoBase {
  const total = p.medida.prescrito;
  if (total == null) return { ...p, dobles: d };
  const parte = d.tuyas ?? Math.round((total * d.pctTuyo) / 100);
  return { ...p, medida: { ...p.medida, prescrito: parte }, dobles: d };
}

/** El simulacro de HYROX en dobles: los 8 kilómetros son de los dos; las estaciones, como diga `TURNOS`. */
export function simulacroDobles(): Circuito {
  const base = simulacro();
  const pasos = base.plan.pasos.map((p) => {
    if (p.clase !== 'estacion') return p;
    const n = p.posicion?.estacion?.n ?? 1;
    const t = TURNOS[n - 1];
    if (!t) return p;
    const dobles: Dobles = { ...t, pareja: PAREJA_EJEMPLO };
    if (t.turno === 'pareja') return esperaDe(p, dobles);
    if (t.turno === 'reparto') return tuParte(p, dobles);
    return { ...p, dobles };
  });
  return { ...base, plan: { ...base.plan, pasos, pareja: PAREJA_EJEMPLO } };
}

// ---------------------------------------------------------------------------
// Rondas — el circuito como el atleta lo cuenta
// ---------------------------------------------------------------------------

/** Una ronda del circuito: los pasos que van de su primer tramo al primero de la siguiente. */
export interface Ronda {
  n: number;
  /** Índices (en el plan) del primer y del último paso de la ronda. */
  desde: number;
  hasta: number;
  /** Los pasos de la lista del coach (tramo, estaciones, AMRAP), en orden. */
  trabajo: PasoBase[];
}

/** ¿Es un paso de la lista del coach? Un tramo de carrera, una estación (o su espera en dobles) o un AMRAP. */
const esDeLista = (p: PasoBase) =>
  (p.clase === 'carrera' || p.clase === 'estacion' || p.clase === 'amrap') && (p.rol === 'trabajo' || p.dobles?.turno === 'pareja');

/**
 * Las rondas de un circuito, por el contador de ronda de cada paso. Lo que
 * viene antes de la primera (el calentamiento) no es una ronda. Cada paso trae
 * el contador de SU ronda —también el descanso y la Roxzone—, así que el
 * descanso entre dos es de la que acaba.
 */
export function rondasDe(pasos: ReadonlyArray<PasoBase>): Ronda[] {
  const rondas: Ronda[] = [];
  pasos.forEach((p, i) => {
    const n = p.posicion?.ronda?.n;
    if (n == null) return;
    const actual = rondas.find((r) => r.n === n);
    if (actual) {
      actual.hasta = i;
      if (esDeLista(p)) actual.trabajo.push(p);
    } else {
      rondas.push({ n, desde: i, hasta: i, trabajo: esDeLista(p) ? [p] : [] });
    }
  });
  return rondas;
}
