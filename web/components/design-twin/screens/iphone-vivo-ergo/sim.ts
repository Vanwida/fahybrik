// EL CUERPO EN LA MÁQUINA — el simulador de la familia ergo: qué dan el
// atleta y el monitor cada segundo. Determinista: el mismo escenario, el
// mismo remo, segundo a segundo. No es dominio (el dominio decide qué se
// pinta con lo que llega; esto solo decide qué llega): por eso vive en la
// pantalla y no en el kit.
//
// Lo que el monitor manda de verdad, y de dónde sale aquí:
//   · el /500 al medio segundo (lo que enseña el monitor);
//   · las paladas o pedaladas por minuto;
//   · los vatios: en el remo y el ski, del /500 (2,8 / (s/m)³, la relación
//     del monitor); en la bici, una curva ilustrativa anclada en 300 W a
//     2:00 /1000;
//   · las calorías acumuladas: ~(4 × W + 300) kcal/h, como cuenta el monitor.
//     En un paso POR calorías, además, son lo hecho (`hecho`): el motor
//     cierra la serie al llegar y el héroe dice las que faltan.

import type { LecturaSim, PasoBase, Simulador } from '../../kit-reloj';

export const ruido = (t: number, a: number) => Math.sin(t * 1.3) * a * 0.6 + Math.sin(t * 0.37 + 1) * a * 0.4;

/** El pulso va hacia `obj` con retraso (τ s): el corazón llega tarde a todo. */
export const hacia = (obj: number, desde: number, t: number, tau = 20) => obj - (obj - desde) * Math.exp(-t / tau);

/** Un /500 del monitor, al medio segundo. */
export const alMedio = (split: number, t: number) => Math.round(2 * (split + ruido(t, 1.2))) / 2;

export const ppm = (x: number, t: number) => Math.round(x + ruido(t + 3, 1));

/** Vatios del remo y del ski a partir del /500: la relación del monitor. */
export function vatiosDeSplit(split500: number): number {
  const sm = split500 / 500;
  return Math.round(2.8 / (sm * sm * sm));
}

/** Vatios de la bici (ilustrativo): 300 W a 2:00 /1000, cúbico como el monitor. */
export function vatiosDeBici(split500: number): number {
  const s1000 = split500 * 2;
  return Math.round(300 * Math.pow(120 / s1000, 3));
}

/** Calorías acumuladas en `t` segundos a `vatios`: ~(4 × W + 300) por hora. */
export const caloriasEn = (vatios: number, t: number) => Math.round((t * (vatios * 4 + 300)) / 3600);

export interface CuerpoErgo {
  /** El /500 nominal en el segundo `t` del paso; null = no se rema (recuperación). */
  split: (p: PasoBase, i: number, t: number) => number | null;
  /** El pulso en el segundo `t` del paso. */
  pulso: (p: PasoBase, i: number, t: number) => number;
  /** Paladas o pedaladas por minuto en el trabajo. */
  cadencia: number;
}

/**
 * El cuerpo sobre una máquina: el monitor manda su /500, su cadencia, sus
 * vatios y sus calorías en el trabajo; en la recuperación parada solo llega el
 * pulso, bajando. Un paso por calorías cuenta las suyas como lo hecho.
 */
export function enMaquina(c: CuerpoErgo): Simulador {
  return (p, i, t) => {
    const base = c.split(p, i, t);
    if (p.rol !== 'trabajo' || base == null) {
      return { ritmo: null, ppm: ppm(c.pulso(p, i, t), t), ppmTendencia: 'baja', gps: 'no-aplica' };
    }
    const split500 = alMedio(base, t);
    const vatios = p.maquina?.tipo === 'bici' ? vatiosDeBici(base) : vatiosDeSplit(base);
    const cal = caloriasEn(vatios, t);
    const l: LecturaSim = {
      ritmo: null,
      split500,
      cadencia: Math.round(c.cadencia + ruido(t, 1.5)),
      vatios: Math.round(vatios + ruido(t + 7, 6)),
      cal,
      ppm: ppm(c.pulso(p, i, t), t),
      gps: 'no-aplica',
    };
    if (p.medida.tipo === 'cal') l.hecho = cal;
    return l;
  };
}

/** Lo que llegaba deja de llegar a partir de `desdeT` (segundos del paso): lo del monitor se marca viejo. */
export function sinMonitorDesde(sim: Simulador, desdeT: number): Simulador {
  return (p, i, t, s) => {
    const l = sim(p, i, t, s);
    return t >= desdeT ? { ...l, viejos: ['split500', 'hecho', 'vatios', 'cadencia', 'cal'] } : l;
  };
}

/** Sin máquina emparejada: el monitor no manda nada; queda el pulso. */
export function sinMaquina(c: Pick<CuerpoErgo, 'pulso'>): Simulador {
  return (p, i, t) => ({ ritmo: null, ppm: ppm(c.pulso(p, i, t), t), ppmTendencia: p.rol === 'trabajo' ? undefined : 'baja', gps: 'no-aplica' });
}
