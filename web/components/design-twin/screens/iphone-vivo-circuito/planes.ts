// LOS PLANES QUE LA MUÑECA NO TENÍA — el iPhone reutiliza las sesiones reales
// de `screens/reloj-circuito/planes.ts` (493, 492, la simulación HYROX con las
// cargas de la 441) y añade aquí solo lo que el encargo del 28-09 pide y no
// existía: el bloque continuo multi-máquina y un circuito LIBRE equivalente.
// Los dos son ILUSTRATIVOS (no hay ninguno asignado) y se dice aquí.

import {
  REGLAS_AVISO_DEFECTO,
  nombreMaquinaCorto,
  type Objetivo,
  type PasoBase,
  type PlanSesion,
  type TipoMaquina,
} from '../../kit-reloj';
import { ZONAS, carrera, circuito, estacion, type Circuito } from '../reloj-circuito/planes';

let n = 0;
const id = (p: string) => `${p}-${++n}`;

const zona = (z: number): Objetivo => ({ eje: 'zona', min: z, max: z, papel: 'principal' });

/** Lo que dura cada máquina del bloque continuo, en s. */
export const TRAMO_CONTINUO_S = 900;

/**
 * BLOQUE CONTINUO MULTI-MÁQUINA (ilustrativo): remo 15′ → ski 15′ → bici 15′ a
 * Z2, sin descanso. Un bloque, TRES pasos (I2: N máquinas son N pasos), cada
 * uno con su máquina, que manda su métrica (§4): /500 y paladas en el remo y
 * el ski, /1000 y rpm en la bici. Hoy es UN tramo con la métrica del remo
 * (causa raíz 2 del modelo). El nombre es el de la máquina en el box.
 */
export function bloqueContinuo(): PlanSesion {
  const maquinas: TipoMaquina[] = ['remo', 'ski', 'bici'];
  const pasos: PasoBase[] = maquinas.map((tipo, k) => ({
    id: id(tipo),
    clase: 'ergo',
    rol: 'trabajo',
    fase: 'principal',
    nombre: nombreMaquinaCorto({ tipo }) ?? tipo,
    maquina: { tipo },
    medida: { tipo: 'tiempo', prescrito: TRAMO_CONTINUO_S, mide: 'ergo' },
    objetivos: [zona(2)],
    posicion: { tramo: { n: k + 1, de: maquinas.length } },
    cierre: 'medida',
    bloque: 0,
  }));
  return { pasos, zonas: ZONAS, reglas: REGLAS_AVISO_DEFECTO };
}

/**
 * UN CIRCUITO LIBRE (ilustrativo): el atleta se monta 4 rondas de Run 400 m ·
 * 15 Wall Balls 9 kg · Row 500 m, sin objetivos y sin coach. Es el MISMO
 * objeto que uno del coach (nada en el vivo sabe de dónde vino): rondas,
 * estaciones medidas (el remo) y sin medir (los wall balls), el total como
 * puntuación. Sin descanso entre rondas: se encadenan.
 */
export function circuitoLibre(): Circuito {
  const rondas = 4;
  const pasos: PasoBase[] = [];
  for (let r = 1; r <= rondas; r++) {
    const ronda = { n: r, de: rondas };
    pasos.push(carrera(400, { ronda }, [], 0));
    pasos.push(estacion({ nombre: 'Wall Balls', medida: { tipo: 'reps', prescrito: 15, mide: 'atleta' }, carga: { kg: 9 } }, { ronda, estacion: { n: 1, de: 2 } }, 0));
    pasos.push(estacion({ nombre: 'Row', medida: { tipo: 'distancia', prescrito: 500, mide: 'ergo' }, maquina: { tipo: 'remo' } }, { ronda, estacion: { n: 2, de: 2 } }, 0));
  }
  return circuito(pasos, { formato: 'rondas', inicio: 0, cap: null, roxzone: false });
}
