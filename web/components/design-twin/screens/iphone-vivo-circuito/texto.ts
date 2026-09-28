// LA CABECERA DEL CIRCUITO EN EL IPHONE — funciones puras (el Swift las espeja).
//
// Dos filas, dos preguntas. Fila 1 = QUÉ haces, con el nombre delante: «Sled
// Push», «SkiErg · 1000 m» (medida: lo prescrito no va en la fila del trabajo),
// «Run 5/8 · 1000 m» (en HYROX el atleta cuenta runs), «Run · 1000 m»,
// «Roxzone». Fila 2 = DÓNDE estás, detrás del formato: «HYROX · Estación 2/8»,
// «Circuito · Ronda 2/5 · Estación 2/3». Así ninguna fila compite con el crono
// total por el ancho a 390 pt, y la posición no se pierde: lo que no cabe
// junto a los chips lo quita la cabecera por el final. Un dato, un sitio: la
// posición solo en la fila 2; la dosis de una estación sin medir, solo en el
// trabajo.

import { NOMBRE_CLASE_DEFECTO, fmtPrescrito, posicionDe as posicionDelKit, type PasoBase } from '../../kit-reloj';
import type { Circuito } from '../reloj-circuito/planes';
import { estacionMedida } from '../reloj-circuito/texto';

/** Cómo se llama en pantalla una simulación de HYROX (el formato del circuito `hyrox`). */
export const NOMBRE_HYROX = 'HYROX';

/** FILA 1 — qué haces, el nombre delante. */
export function tituloDe(p: PasoBase, c: Circuito): string[] {
  const nombre = p.nombre ?? NOMBRE_CLASE_DEFECTO[p.clase];
  const r = p.posicion?.ronda;
  switch (p.clase) {
    case 'carrera':
      return c.formato === 'hyrox' && r ? [`${nombre} ${r.n}/${r.de}`, fmtPrescrito(p.medida)] : [nombre, fmtPrescrito(p.medida)];
    case 'estacion':
      return estacionMedida(p) ? [nombre, fmtPrescrito(p.medida)] : [nombre];
    case 'roxzone':
      return [NOMBRE_CLASE_DEFECTO.roxzone];
    default:
      return posicionDelKit(p);
  }
}

/** FILA 2 — el formato y dónde estás. `formatoKit` es lo que dice el kit («Circuito»). */
export function formatoDe(p: PasoBase, c: Circuito, formatoKit: string): string[] {
  const base = c.formato === 'hyrox' ? NOMBRE_HYROX : formatoKit;
  const r = p.posicion?.ronda;
  const e = p.posicion?.estacion;
  if (c.formato === 'hyrox') {
    // El run ya se cuenta en la fila 1 («Run 5/8»); la estación y la Roxzone, aquí.
    if (p.clase === 'carrera') return [base];
    if (e) return [base, `Estación ${e.n}/${e.de}`];
    if (r) return [base, `Ronda ${r.n}/${r.de}`];
    return [base];
  }
  return [base, r && r.de > 1 ? `Ronda ${r.n}/${r.de}` : null, e && e.de > 1 ? `Estación ${e.n}/${e.de}` : null].filter((x): x is string => !!x);
}
