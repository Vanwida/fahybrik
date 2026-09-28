// LA FAMILIA DEL PASO Y SU FORMATO — funciones PURAS (I4 del modelo del
// iPhone; el Swift las espeja). Qué pintor pinta el paso (una pregunta por
// familia) y cómo se llama su formato en castellano de box, desde UN sitio.

import { esFuerza } from './fuerza';
import { NOMBRE_CLASE_DEFECTO, type PasoBase } from './paso';
import { esCarrera, fmtDuracion } from './reglas';
import { wodDe } from './tarea';

// ---------------------------------------------------------------------------
// La familia
// ---------------------------------------------------------------------------

/**
 * Lo que haces, para elegir el pintor (I4): una pregunta por familia. No es
 * la clase del paso ni el formato del bloque: un SkiErg en una estación de
 * HYROX es `ski` (la máquina manda su métrica), y un Run dentro de un EMOM es
 * `cinta` o `correr` (la cara de correr, P10).
 */
export type Familia =
  | 'correr'
  | 'cinta'
  | 'remo'
  | 'ski'
  | 'bici'
  | 'fuerza'
  | 'emom'
  | 'amrap'
  | 'fortime'
  | 'pared'
  | 'estacion'
  | 'roxzone'
  | 'movilidad'
  | 'recupera'
  | 'descanso'
  | 'transicion';

const FAMILIA_MAQUINA = { remo: 'remo', ski: 'ski', bici: 'bici', cinta: 'cinta' } as const;

export function familiaDe(p: PasoBase): Familia {
  if (p.rol === 'recuperacion') return 'recupera';
  if (p.rol === 'descanso') return 'descanso';
  if (p.clase === 'roxzone') return 'roxzone';
  const w = p.wod?.formato;
  if (p.rol === 'transicion') return w === 'puntuacion' ? 'amrap' : 'transicion';
  if (w === 'emom') return p.wod?.formato === 'emom' && p.wod.tarea.corre ? 'cinta' : 'emom';
  if (w === 'amrap') return 'amrap';
  if (w === 'fortime') return 'fortime';
  if (w === 'pared') return 'pared';
  if (esFuerza(p) || p.clase === 'fuerza') return 'fuerza';
  if (p.clase === 'movilidad') return 'movilidad';
  // Una máquina que mide (el remo, el ski, la bici con monitor) manda su
  // métrica aunque sea una estación; sin monitor, la estación la dices tú.
  if (p.maquina && (p.medida.mide === 'ergo' || p.clase === 'ergo' || p.clase === 'test' || p.maquina.tipo === 'cinta')) return FAMILIA_MAQUINA[p.maquina.tipo];
  if (p.entorno === 'cinta' || p.medida.mide === 'cinta') return 'cinta';
  if (p.clase === 'estacion') return 'estacion';
  if (esCarrera(p)) return 'correr';
  return 'estacion';
}

/** ¿Es un test? La cabecera lo marca: un test no puede confundirse con un WOD en vivo. */
export const esTest = (p: PasoBase): boolean => p.clase === 'test';

/**
 * CÓMO SE LLAMA EL FORMATO EN LA PANTALLA — castellano de box, desde UN sitio.
 * Método del coach con defecto (HARD RULE Nº0): otro coach dice «Por tiempo»
 * en vez de «For Time» o «Tabata» en vez de «A reloj»; lo cambia aquí, no en
 * cada pantalla. La auditoría del 28-09 encontró «Intervals», «Steady»,
 * «Strength», «Warm-up» en el vivo: cada vista traducía por su cuenta.
 */
export const NOMBRE_FORMATO_DEFECTO = {
  emom: 'EMOM',
  amrap: 'AMRAP',
  fortime: 'For Time',
  pared: 'Tabata',
  circuito: 'Circuito',
  test: 'Test',
} as const;

/**
 * El formato del paso con su tamaño, para la cabecera y el brief: «EMOM 12′»,
 * «AMRAP 15′», «For Time · cap 20′», «Tabata 8 × 20″/10″», «Circuito»; si no
 * es un WOD, el nombre de su clase («Series», «Rodaje», «Serie» de fuerza…).
 */
export function formatoDe(p: PasoBase, nombres = NOMBRE_FORMATO_DEFECTO): string {
  const w = wodDe(p);
  switch (w?.formato) {
    case 'emom':
      return `${nombres.emom} ${fmtDuracion(w.ventanas * w.ventanaS)}`;
    case 'amrap':
    case 'puntuacion':
      return `${nombres.amrap} ${fmtDuracion(w.duracionS)}`;
    case 'fortime':
      return w.capS != null ? `${nombres.fortime} · cap ${fmtDuracion(w.capS)}` : nombres.fortime;
    case 'pared':
      return `${nombres.pared} ${w.rondas} × ${fmtDuracion(w.trabajoS)}/${fmtDuracion(w.descansoS)}`;
    default:
      break;
  }
  if (esTest(p)) return nombres.test;
  if (p.clase === 'estacion' || p.clase === 'roxzone' || (p.clase === 'carrera' && p.posicion?.ronda)) return nombres.circuito;
  if (p.clase === 'series') return 'Series';
  if (p.clase === 'fuerza') return 'Fuerza';
  // «Ergo» no es palabra de box: el formato es por series o continuo. Un
  // tramo (remo 15′ → ski 15′ → bici 15′, la escalera de 536) es continuo:
  // no hay descanso entre tramos, solo cambia la máquina o la zona.
  if (p.clase === 'ergo') return p.posicion?.serie ? 'Series' : 'Continuo';
  return NOMBRE_CLASE_DEFECTO[p.clase];
}

/** Ergo y cinta admiten horizontal (soportes de remo y consolas de cinta, §3 del modelo). */
export function admiteHorizontal(f: Familia): boolean {
  return f === 'remo' || f === 'ski' || f === 'bici' || f === 'cinta';
}
