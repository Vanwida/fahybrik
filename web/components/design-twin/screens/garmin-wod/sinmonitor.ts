// DEL PLAN DE LA MUÑECA AL RELOJ GARMIN — el ergómetro no se lee (modelo §13).
//
// Los planes y los casos de «Muñeca · EMOM, AMRAP, For Time y ergo» se
// IMPORTAN, no se copian (`reloj-wod/planes.ts`, `reloj-wod/casos.ts`). Pero en
// la muñeca el monitor de la máquina da metros y ritmo por Bluetooth; el reloj
// Garmin v1 NO lo lee (docs/garmin-reloj/modelo.md §13: «el ergo es "lo dices
// tú" o crono»). Así que un caso de la muñeca solo vale aquí tras quitarle lo
// que solo el monitor sabía:
//
//   · `sinMonitor`               un paso cuya medida la daba el monitor pasa a
//                                «la dices tú» (distancia: la cierra el atleta)
//                                o a «la mide el reloj» (tiempo).
//   · `sinLecturaDeMaquina`      el cuerpo simulado deja de dar /500, metros,
//                                vatios, cadencia y calorías de la máquina.
//   · `sinMetrosDeMaquina`       las vueltas de partida de un escenario no
//                                traen metros que ningún reloj midió.
//
// Sin esto el motor acumularía metros que nadie mide, el héroe caería a «lo que
// queda» (con un cero inventado) y una serie que solo cierra el atleta nunca se
// cerraría sola. Lo que SÍ mide el Garmin (tiempo, pulso, GPS y cinta) queda
// tal cual.
//
// Qué NO hacer: quitar aquí lo del GPS o la cinta (un 5K y una ventana de correr
// se miden); inventar un ritmo «estimado» de una máquina que nadie lee.

import type { PasoBase, PlanSesion, Simulador, Vuelta } from '../../kit-reloj';

function sinMonitorDelPaso(p: PasoBase): PasoBase {
  if (p.medida.mide !== 'ergo') return p;
  const distancia = p.medida.tipo === 'distancia';
  return {
    ...p,
    medida: { ...p.medida, mide: distancia ? 'atleta' : 'reloj' },
    // Una distancia que solo dice el atleta la cierra el atleta: nadie la cuenta.
    cierre: distancia ? 'atleta' : p.cierre,
  };
}

/** El plan con cada paso que dependía del monitor de la máquina, medido por quien de verdad lo mide. */
export function sinMonitor(plan: PlanSesion): PlanSesion {
  return { ...plan, pasos: plan.pasos.map(sinMonitorDelPaso) };
}

/** El mismo cuerpo, sin lo que solo lee el monitor de la máquina. El pulso, el GPS y la cinta se quedan. */
export function sinLecturaDeMaquina(sim: Simulador): Simulador {
  return (p, i, t, sesionT) => ({ ...sim(p, i, t, sesionT), split500: null, metros: null, vatios: null, cadencia: null, cal: null });
}

/** Las vueltas de partida sin los metros de un ergómetro (`corridas`: qué vueltas se corrieron de verdad y los conservan). */
export function sinMetrosDeMaquina(vueltas: Vuelta[] | undefined, corridas: (v: Vuelta) => boolean = () => false): Vuelta[] | undefined {
  return vueltas?.map((v) => (corridas(v) ? v : { ...v, metros: null, ritmo: null }));
}
