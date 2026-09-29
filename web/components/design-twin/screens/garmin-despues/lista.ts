// UNA LISTA DE FILAS EN EL CÍRCULO — la página de series, de kilómetros, de la
// carrera de un circuito, de las estaciones. PURA.
//
// Las filas van EN ORDEN (a diferencia de la página Vueltas del vivo, que pone
// la última arriba): un resumen se lee de la primera a la última, con lo que no
// se hizo también. Cada fila es un valor grande con lo que le acompaña (su
// número, un apoyo, un juicio a la derecha) y, si hace falta, una segunda línea
// al suelo (la dosis de una estación).
//
// Cuánto cabe lo dice el círculo, no una cifra: la cuerda se estrecha al bajar,
// así que una fila con detalle ocupa dos y caben menos (`FILAS_POR_PAGINA`).
// Una lista larga se reparte en páginas de las MISMAS filas (17 km = 5 + 4 + 4 +
// 4, no 5 + 5 + 5 + 2).
//
// Qué NO hacer: meter más filas de las que caben (se pagina); atenuar con una
// opacidad lo que no se hizo (en un MIP no existe la media luz: va en tinta2).

import {
  AIRE,
  TG,
  altoLinea,
  ajustarPartes,
  caja,
  chica,
  colocar,
  cuerpoPx,
  cuerpoQueCabe,
  enSubconjunto,
  lineasContexto,
  type LineaG,
  type Pieza,
} from '../../kit-garmin';
import { ALTO_NOTA, CUERPO, repartirJunto, type DisposicionFin } from './comun';

export interface FilaLista {
  /** «3», «2·4», «km 5»: el número de la fila (nota, tinta2). */
  n?: string;
  /** El valor grande: «3:49», «620 m», «—». Con unidad («620 m»), el número va en la bitmap y la unidad al suelo. */
  valor: string;
  /** Lo que le acompaña al suelo: el ritmo de una serie, el desnivel de un km. */
  apoyo?: string | null;
  /** A la derecha: el veredicto («▲ rápido», «dentro») o el pulso de un km. `fuerte` = en tinta. */
  cola?: { texto: string; fuerte: boolean } | null;
  /** Una segunda línea al suelo bajo la fila (la dosis de una estación). */
  detalle?: string | null;
  /** Lo que no se hizo: todo en tinta2. */
  tenue?: boolean;
}

/**
 * Cuántas filas caben en una página sin y con segunda línea. El examen mide la fila más cargada a los cuatro
 * tamaños: sin segunda línea caben 7 (con la última pegada al pie); se dejan 6 para que respire. Con segunda
 * línea (una estación: su tiempo, su nombre y debajo su dosis), 3.
 */
export const FILAS_POR_PAGINA = { sola: 6, conDetalle: 3 } as const;

/** Reparte `n` filas en páginas del mismo tamaño (± 1): 6 con capacidad 4 → 3 + 3; 17 con 5 → 5 + 4 + 4 + 4. */
export function repartoEnPaginas(n: number, capacidad: number): number[] {
  if (n <= 0) return [];
  const paginas = Math.ceil(n / capacidad);
  const base = Math.floor(n / paginas);
  const extra = n % paginas;
  return Array.from({ length: paginas }, (_, k) => base + (k < extra ? 1 : 0));
}

/** Las filas de una página `k` de un reparto (los índices que le tocan). */
export function filasDePagina<T>(filas: readonly T[], reparto: readonly number[], k: number): T[] {
  const desde = reparto.slice(0, k).reduce((a, x) => a + x, 0);
  return filas.slice(desde, desde + (reparto[k] ?? 0));
}

/** El título de una lista repartida: «Series · 3:45–3:55 · 1/2» (el «1/2» solo si hay más de una página). */
export const tituloDePagina = (titulo: readonly string[], k: number, de: number): string[] => (de > 1 ? [...titulo, `${k + 1}/${de}`] : [...titulo]);

/** Las piezas de una fila a un cuerpo de valor, con o sin su apoyo. */
function piezasFila(f: FilaLista, cuerpo: number, D: number, conApoyo: boolean): Pieza[] {
  const aire = AIRE.piezas * D;
  const tinta = f.tenue ? 'tinta2' : 'tinta';
  const ps: Pieza[] = [];
  if (f.n) ps.push(chica(f.n, D, 'tinta2'));
  // «620 m»: el número es de la bitmap, la unidad va al suelo.
  const [, num, unidad] = /^(\S+) (\S+)$/.exec(f.valor) ?? [];
  const partido = Boolean(num && unidad && enSubconjunto(num));
  ps.push({ texto: partido ? num! : f.valor, cara: partido || enSubconjunto(f.valor) ? 'cifras' : 'texto', cuerpo, tono: tinta, antes: f.n ? aire : 0 });
  if (partido) ps.push(chica(unidad!, D, 'tinta2', AIRE.unidad * D));
  if (conApoyo && f.apoyo) ps.push(chica(f.apoyo, D, 'tinta2', aire));
  if (f.cola) ps.push({ texto: f.cola.texto, cara: f.cola.fuerte ? 'texto' : 'nota', cuerpo: cuerpoPx(TG.nota, D), tono: f.cola.fuerte ? 'tinta' : 'tinta2', antes: aire });
  return ps;
}

/** LA LISTA: el título arriba (tinta2) y las filas repartidas en el cuerpo de la página. La cola no se pierde nunca; antes se quita el apoyo. */
export function disponerLista(titulo: readonly string[], filas: readonly FilaLista[], D: number, vacia = 'Nada que contar'): DisposicionFin {
  const lineas: LineaG[] = [...lineasContexto(titulo, D, 'tinta2')];
  if (filas.length === 0) {
    lineas.push(colocar('vacia', [chica(vacia, D)], caja(0.5 - ALTO_NOTA / 2, ALTO_NOTA), D));
    return { D, lineas, heroe: null, pista: null };
  }
  const conDetalle = filas.some((f) => f.detalle);
  const altoFila = altoLinea(TG.tercero, 'cifras');
  const cajas = repartirJunto(filas.length, altoFila + (conDetalle ? ALTO_NOTA + AIRE.lineas : 0), CUERPO, AIRE.piezas);
  filas.forEach((f, k) => {
    const c = cajas[k]!;
    const primera = caja(c.y, altoFila);
    const ancho = Math.floor(primera.ancho * D);
    let r = cuerpoQueCabe((cu) => piezasFila(f, cu, D, true), TG.tercero, D, ancho);
    if (!r.cabe) r = cuerpoQueCabe((cu) => piezasFila(f, cu, D, false), TG.tercero, D, ancho);
    lineas.push(colocar('fila', r.piezas, primera, D, 'centro', r.cabe));
    if (f.detalle) {
      const segunda = caja(c.y + altoFila + AIRE.lineas, ALTO_NOTA);
      const a = ajustarPartes(f.detalle.split(' · '), 'nota', TG.nota, D, Math.floor(segunda.ancho * D));
      lineas.push(colocar('detalle', [{ texto: a.texto, cara: 'nota', cuerpo: a.cuerpo, tono: 'tinta2' }], segunda, D, 'centro', a.cabe));
    }
  });
  return { D, lineas, heroe: null, pista: null };
}
