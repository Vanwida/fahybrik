// LA RUTA DE UN CIRCUITO — funciones PURAS (P10 de la muñeca, I6 del iPhone;
// el Swift las espeja). La lista del coach (tramos de carrera, estaciones,
// AMRAP) en el orden en que se hace, con lo hecho y su parcial (el que deja el
// motor por paso), lo de ahora y lo que viene. Lo que no está en la lista del
// coach (Roxzone, descanso, campana) es «suelto»: sale solo mientras pasa o,
// si el pintor tiene sitio, también cuando ya pasó. La muñeca y el iPhone
// pintan ESTA misma ruta: un dato, un sitio.
//
//   rutaDe        las filas (cabeceras de ronda + pasos) según el estado del motor
//   nombreEnRuta  «Run 4» (HYROX), «Run 1000 m», «Sled Push», «Roxzone», «Descanso»
//   roxzoneDe     la Roxzone sumada (lo cerrado más lo de ahora); null si no hay
//   ritmoDeParcial  lo que dice un parcial medido: /km al correr, /500 en la máquina

import { NOMBRE_CLASE_DEFECTO, type Parcial, type PasoBase } from './paso';
import type { EstadoSecuencia } from './secuencia';
import { fmtPrescrito, fmtRitmo, fmtSplit, unidadSplit } from './reglas';

export type EstadoRuta = 'hecho' | 'ahora' | 'pendiente';

export interface FilaRondaRuta {
  tipo: 'ronda';
  n: number;
  de: number;
}

export interface FilaPasoRuta {
  tipo: 'paso';
  /** El índice del paso en el plan. */
  i: number;
  paso: PasoBase;
  estado: EstadoRuta;
  /** El parcial que dejó el motor al cerrarlo; null si aún no. */
  parcial: Parcial | null;
  /** No está en la lista del coach (Roxzone, descanso, campana del AMRAP). */
  suelta: boolean;
}

export type FilaRuta = FilaRondaRuta | FilaPasoRuta;

export interface OpcionesRuta {
  /** Primer paso de la ruta (el calentamiento no está en ella). */
  desde?: number;
  /** Una cabecera «Ronda n/N» al cambiar de ronda (no en HYROX: ahí el atleta cuenta runs y estaciones). */
  cabecerasDeRonda?: boolean;
  /** Los pasos sueltos: solo el de ahora (la muñeca, sin sitio) o también los ya pasados (el iPhone). */
  sueltas?: 'ahora' | 'pasadas';
}

/** ¿Está en la lista del coach? Un tramo de carrera, una estación o un AMRAP de trabajo. */
export const enRuta = (p: PasoBase): boolean => (p.clase === 'carrera' || p.clase === 'estacion' || p.clase === 'amrap') && p.rol === 'trabajo';

/**
 * El nombre de un paso en la ruta. En HYROX los runs se cuentan («Run 4»);
 * en rondas se dicen con su dosis («Run 1000 m»). Una estación, su nombre de
 * catálogo; lo suelto, su clase.
 */
export function nombreEnRuta(p: PasoBase, runsNumerados: boolean): string {
  if (p.roxzone) return NOMBRE_CLASE_DEFECTO.roxzone;
  if (p.wod?.formato === 'puntuacion') return 'Puntuación';
  if (p.rol === 'descanso' || p.rol === 'recuperacion') return NOMBRE_CLASE_DEFECTO[p.clase];
  const nombre = p.nombre ?? NOMBRE_CLASE_DEFECTO[p.clase];
  if (p.clase !== 'carrera') return nombre;
  const r = p.posicion?.ronda;
  if (runsNumerados && r) return `${nombre} ${r.n}`;
  return `${nombre} ${fmtPrescrito(p.medida)}`;
}

/** LA RUTA según el estado del motor: cabeceras de ronda y pasos con su parcial. */
export function rutaDe(pasos: ReadonlyArray<PasoBase>, e: EstadoSecuencia, o: OpcionesRuta = {}): FilaRuta[] {
  const desde = o.desde ?? 0;
  const hechos = new Map(e.parciales.map((x) => [x.i, x]));
  const filas: FilaRuta[] = [];
  let ronda: number | null = null;
  pasos.forEach((p, i) => {
    if (i < desde) return;
    const parcial = hechos.get(i) ?? null;
    const ahora = i === e.i && !e.terminado;
    const estado: EstadoRuta = parcial ? 'hecho' : ahora ? 'ahora' : 'pendiente';
    if (!enRuta(p)) {
      const sale = ahora || (o.sueltas === 'pasadas' && !!parcial);
      if (sale) filas.push({ tipo: 'paso', i, paso: p, estado, parcial, suelta: true });
      return;
    }
    const r = p.posicion?.ronda;
    if (o.cabecerasDeRonda && r && r.n !== ronda) {
      ronda = r.n;
      filas.push({ tipo: 'ronda', n: r.n, de: r.de });
    }
    filas.push({ tipo: 'paso', i, paso: p, estado, parcial, suelta: false });
  });
  return filas;
}

/** La Roxzone sumada: lo cerrado más lo de ahora. `null` si el plan no lleva Roxzone. */
export function roxzoneDe(pasos: ReadonlyArray<PasoBase>, e: EstadoSecuencia): number | null {
  if (!pasos.some((p) => p.clase === 'roxzone')) return null;
  const cerrada = e.parciales.filter((x) => pasos[x.i]?.clase === 'roxzone').reduce((a, x) => a + x.segundos, 0);
  return cerrada + (pasos[e.i]?.clase === 'roxzone' && !e.terminado ? e.t : 0);
}

/**
 * Lo que dice un parcial medido en metros, además de su tiempo: el /km de un
 * tramo corrido (salvo un km justo: sería el mismo número) o el /500 (/1000
 * en la bici) de la máquina. `null` si nadie midió metros.
 */
export function ritmoDeParcial(p: PasoBase, x: Parcial): string | null {
  if (x.metros == null || x.metros <= 50 || x.segundos <= 0) return null;
  if (p.medida.mide === 'ergo') {
    return `${fmtSplit((x.segundos * 500) / x.metros, p.maquina)} ${unidadSplit(p.maquina)}`;
  }
  if (x.metros === 1000) return null;
  return `${fmtRitmo(x.segundos / (x.metros / 1000))} /km`;
}
