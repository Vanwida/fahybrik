// LO QUE DICE CADA PASO DEL CIRCUITO — funciones puras (el Swift las espeja).
//
//   posicionDe   «Ronda 2/5 · Run 1000 m», «Ronda 5/5 · Estación 2/2»,
//                «Run 3/8 · 1000 m», «Estación 3/8», «Ronda 2/4 · AMRAP 4′».
//   dosisDe      lo que NADIE mide, dicho: «50 m · 152 kg», «1000 m · sin PM5».
//   vieneDe      el «Viene:» del descanso: «Ronda 3/5 · Run 1000 m · RPE 8»,
//                «Sled Pull · 25 m · 135 kg» (la carga del kit, M7).
//   avisoDe      el texto del deshacer: el del kit, salvo la carrera («Run 3 cerrado»).
//   accionDe     la acción del momento, dicha corta.

import {
  avisoDeCierre,
  contextoDe,
  fmtDuracion,
  fmtObjetivo,
  fmtPrescrito,
  principal,
  textoCargaImplemento,
  type Paso,
  type PasoBase,
} from '../../kit-reloj';
import type { Circuito } from './planes';

const NBSP = ' ';

/** ¿La mide algo que no sea el atleta? El PM5 (ergo) o un sensor de reps. */
export const estacionMedida = (p: PasoBase) => p.medida.mide === 'ergo' || p.medida.mide === 'sensor';

export function objetivoTexto(p: PasoBase): string | null {
  const o = principal(p);
  return o ? fmtObjetivo(o) : null;
}

/** La posición, por partes y por prioridad (la línea de contexto quita por el final si no cabe). */
export function posicionDe(p: PasoBase, c: Circuito): string[] {
  const r = p.posicion?.ronda;
  const e = p.posicion?.estacion;
  const ronda = r && r.de > 1 ? `Ronda ${r.n}/${r.de}` : null;
  switch (p.clase) {
    case 'carrera':
      if (c.formato === 'hyrox' && r) return [`Run ${r.n}/${r.de}`, fmtPrescrito(p.medida)];
      return [ronda, `Run ${fmtPrescrito(p.medida)}`].filter((x): x is string => !!x);
    case 'amrap':
      return [ronda, `AMRAP ${fmtDuracion(p.wod?.formato === 'amrap' ? p.wod.duracionS : (p.medida.prescrito ?? 0))}`].filter((x): x is string => !!x);
    case 'estacion':
      if (c.formato === 'hyrox' && e) return [`Estación ${e.n}/${e.de}`];
      // Una sola estación por ronda (493): basta «Ronda 2/5». El nombre de la
      // estación es el título de justo debajo; un «Estación» suelto parecía cortado.
      return [ronda ?? 'Estación', e && e.de > 1 ? `Estación ${e.n}/${e.de}` : null].filter(
        (x): x is string => !!x,
      );
    default:
      return contextoDe(p);
  }
}

/**
 * La dosis de lo que nadie mide, con su carga y su objetivo. Lo que mide el
 * PM5 no la repite: ya la dice lo que falta. Un ergo sin PM5 lo dice («sin
 * PM5»): el atleta esperaba que contara solo.
 */
export function dosisDe(p: PasoBase): string[] {
  if (estacionMedida(p)) return [];
  const partes = [fmtPrescrito(p.medida) || null, textoCargaImplemento(p.carga), objetivoTexto(p), p.maquina ? 'sin PM5' : null];
  return partes.filter((x): x is string => !!x);
}

/** La dosis entera, mida quien mida: para lo que AÚN no ha empezado (Roxzone, «Entras a…»). */
export function dosisCompleta(p: PasoBase): string[] {
  if (p.clase === 'amrap') return [`AMRAP ${fmtDuracion(p.medida.prescrito ?? 0)}`];
  return [fmtPrescrito(p.medida) || null, textoCargaImplemento(p.carga), objetivoTexto(p)].filter((x): x is string => !!x);
}

/** Las partes unidas con « · », y cada parte entera: la línea solo se parte en un « · ». */
const juntas = (partes: Array<string | null>) =>
  partes
    .filter((x): x is string => !!x)
    .map((x) => x.replace(/ /g, NBSP))
    .join(`${NBSP}· `);

/**
 * Lo que viene, para el «Viene:» del descanso, con la carga (el trineo hay que
 * cargarlo antes). Propio del circuito: la carrera se nombra «Run 1000 m» y la
 * ronda que abre va delante; el `textoViene` del kit diría «Run · 1000 m a RPE 8».
 */
export function vieneDe(p: PasoBase, c: Circuito): string {
  const r = p.posicion?.ronda;
  const abre = r && r.de > 1 && (p.posicion?.estacion?.n ?? 1) === 1 && c.formato !== 'hyrox' ? `Ronda ${r.n}/${r.de}` : null;
  if (p.clase === 'carrera') return juntas([abre, `Run ${fmtPrescrito(p.medida)}`, objetivoTexto(p)]);
  return juntas([abre, p.nombre ?? null, fmtPrescrito(p.medida) || null, textoCargaImplemento(p.carga), objetivoTexto(p)]);
}

/** Debajo del 3-2-1 y del GO: contra qué entras. */
export function cortoDe(p: PasoBase): string {
  if (p.clase === 'carrera') {
    const o = objetivoTexto(p);
    return o ? `a ${o}` : fmtPrescrito(p.medida);
  }
  return [p.nombre ?? null, fmtPrescrito(p.medida) || null, textoCargaImplemento(p.carga)].filter(Boolean).join(' · ');
}

/** Lo que dice el aviso de deshacer: el del kit; la carrera, con su número de Run. */
export function avisoDe(p: Paso, c: Circuito): string {
  if (p.clase === 'carrera') {
    const r = p.posicion?.ronda;
    return c.formato === 'hyrox' && r ? `Run ${r.n} cerrado` : 'Tramo cerrado';
  }
  return avisoDeCierre(p);
}

/** Lo que hace la acción del momento, dicho corto (la cronología y la pista). `null` = no hay (el AMRAP: manda el reloj). */
export function accionDe(p: PasoBase): string | null {
  if (p.rol === 'descanso') return 'empezar ya';
  if (p.wod?.formato === 'puntuacion') return 'guardar';
  if (p.roxzone === 'entrada') return 'empiezo';
  if (p.roxzone === 'salida') return 'salgo a correr';
  if (p.clase === 'estacion') return 'estación hecha';
  if (p.clase === 'amrap') return null;
  if (p.clase === 'carrera') return 'cerrar el tramo';
  return 'siguiente paso';
}
