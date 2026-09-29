// G29 · EL RESUMEN DE CORREDOR — primero lo que un corredor mira. PURO.
//
//   Resumen   «5/6 dentro» (si las series salieron), la distancia y el tiempo, y
//             el ritmo de lo FUERTE (no la media, que mezcla trote y
//             calentamiento). Sin series: la distancia manda y, debajo, el ritmo
//             medio y cuánto de la sesión fue en la zona que pedía el coach.
//   Series    cada serie contra SU objetivo, en orden, con las que no se
//             hicieron («sin hacer») y las cortadas a mano («cortada»).
//   Kilómetros  cada km de la vuelta automática con su ritmo, su desnivel y su
//             pulso (rodajes y tiradas).
//
// Las cuentas son las de la muñeca (`reloj-antes-despues/resumen-correr`:
// `bloquesDeSeries`, `enZona`), y los juicios, los de `palabraVeredicto`: un
// resumen se lee igual en un reloj que en el otro; solo cambia el lienzo. La
// serie cortada cuenta como hecha desde el umbral del coach (`MetodoResumen`).
//
// Qué NO hacer: juzgar aquí una serie (el veredicto viene hecho); dar un ritmo
// de una serie sin metros (sale «—»); pintar la distancia de un reloj sin GPS
// como cero.

import { fmtDistancia, fmtObjetivo, fmtReloj, fmtRitmo, palabraVeredicto, principal, hoyDe, type Completitud, type MetodoResumen, type PasoBase } from '../../kit-reloj';
import { REJILLA, TG, caja, heroeEn, lineasContexto, type LineaG } from '../../kit-garmin';
import { bloquesDeSeries, enZona } from '../reloj-antes-despues/resumen-correr';
import type { Resultado } from '../reloj-antes-despues/calculo';
import { ALTO_NOTA, lineaDeTokens, type DisposicionFin, type Tok } from './comun';
import { FILAS_POR_PAGINA, type FilaLista } from './lista';

export { bloquesDeSeries };

const ESTADO = { completa: 'completa', parcial: 'parcial', libre: 'libre' } as const;
/** Cuántas filas de km caben por página (medido a 218). */
export const KM_POR_PAGINA = FILAS_POR_PAGINA.sola;

/** «11,62 km · 55:18» y «3:48 /km en las series»: las dos líneas de datos de la primera página. */
export function datosDeResumen(r: Resultado): { heroe: { texto: string; unidad: string }; linea1: Tok[]; linea2: Tok[] } {
  const juzgadas = r.series.filter((s) => s.veredicto != null);
  const dentro = juzgadas.filter((s) => s.veredicto === 'dentro').length;
  const d = r.metros != null ? fmtDistancia(r.metros) : null;
  // El ritmo de lo fuerte: metros y segundos de las series, no la media de la sesión.
  const conMetros = r.series.filter((s) => s.metros != null && s.metros > 0);
  const ritmoSeries = conMetros.length > 0 ? conMetros.reduce((a, s) => a + s.segundos, 0) / (conMetros.reduce((a, s) => a + s.metros!, 0) / 1000) : null;
  const ritmoMedio = r.metros ? r.t / (r.metros / 1000) : null;
  if (juzgadas.length > 0) {
    return {
      heroe: { texto: `${dentro}/${juzgadas.length}`, unidad: 'dentro' },
      linea1: [{ v: d?.valor ?? '—' }, ...(d ? [{ u: d.unidad }] : []), '·', { v: fmtReloj(r.t) }],
      linea2: [{ v: fmtRitmo(ritmoSeries) }, { u: '/km en las series' }],
    };
  }
  const zona = enZona(r);
  return {
    heroe: { texto: d?.valor ?? '—', unidad: d?.unidad ?? 'km' },
    linea1: [{ v: fmtReloj(r.t) }, '·', { v: fmtRitmo(ritmoMedio) }, { u: '/km' }],
    // «98 %» en la bitmap no cabe (espacio y %): el número va en cifras y el «%» con su «hasta Z2», al suelo.
    linea2: zona ? [{ v: zona.pct.replace(/\s*%$/, '') }, { u: `% ${zona.donde}` }] : [{ v: r.ppmMedio == null ? '—' : String(Math.round(r.ppmMedio)) }, { u: 'ppm medio' }],
  };
}

/** LA PRIMERA PÁGINA del corredor. */
export function disponerResumenCorrer(r: Resultado, c: Completitud, D: number): DisposicionFin {
  const libre = c.estado === 'libre';
  const titulo = libre ? 'Correr libre' : hoyDe(r.pasos).titulo;
  const lineas: LineaG[] = [...lineasContexto(libre ? [titulo] : [titulo, ESTADO[c.estado]], D)];
  const dat = datosDeResumen(r);
  const heroe = heroeEn(dat.heroe.texto, dat.heroe.unidad, REJILLA.heroe[0], REJILLA.heroe[1], D);
  lineas.push(lineaDeTokens('datos', dat.linea1, TG.tercero, 'banda', D));
  const [dS] = REJILLA.secundaria;
  lineas.push(lineaDeTokens('datos', dat.linea2, TG.tercero, caja(dS, ALTO_NOTA), D));
  return { D, lineas, heroe, pista: null };
}

/** El título de una página de series: «Series · 3:45–3:55». */
export function tituloDeSeries(pasos: PasoBase[]): string[] {
  const o = principal(pasos[0]!);
  return ['Series', ...(o ? [fmtObjetivo(o)] : [])];
}

/**
 * Las series de un bloque en orden, cada una contra su objetivo. Una serie sin
 * hacer sale «—» y «sin hacer»; una cortada por debajo del umbral del coach,
 * lo que se corrió y «cortada» (sin juicio: no llegó a ser la serie del coach).
 */
export function filasDeSeries(r: Resultado, pasos: PasoBase[], metodo: MetodoResumen): FilaLista[] {
  return pasos.map((p) => {
    const s = r.series.find((x) => x.pasoId === p.id);
    const pos = p.posicion!;
    const n = `${pos.tanda ? `${pos.tanda.n}·` : ''}${(pos.serie ?? pos.tramo)!.n}`;
    if (!s) return { n, valor: '—', cola: { texto: 'sin hacer', fuerte: false }, tenue: true };
    const prescrito = p.medida.prescrito ?? 0;
    const hecho = p.medida.tipo === 'distancia' ? (s.metros ?? 0) : s.segundos;
    if (hecho < prescrito * metodo.umbralHecho) {
      return { n, valor: p.medida.tipo === 'distancia' && s.metros != null ? `${s.metros} m` : fmtReloj(s.segundos), cola: { texto: 'cortada', fuerte: false } };
    }
    const j = s.veredicto ? palabraVeredicto(s.eje ?? 'ritmo', s.veredicto) : null;
    return {
      n,
      valor: fmtReloj(s.segundos),
      apoyo: s.metros != null && s.metros !== 1000 ? fmtRitmo(s.ritmo) : null,
      cola: j ? { texto: j.marca ? `${j.marca} ${j.texto}` : j.texto, fuerte: !!j.marca } : null,
    };
  });
}

const conSigno = (m: number) => (m > 0 ? `+${m} m` : m < 0 ? `−${-m} m` : '0 m');

/** Los km de la vuelta automática: su ritmo, su desnivel (sin barómetro, «—») y su pulso. El último, si no llegó al km, con lo que corrió. */
export function filasDeKm(r: Resultado): FilaLista[] {
  return r.km.map((k) => ({
    n: k.metros != null && k.metros < 1000 ? (k.metros / 1000).toFixed(2).replace('.', ',') : String(k.n),
    valor: fmtRitmo(k.ritmo),
    apoyo: k.desnivel == null ? '—' : conSigno(k.desnivel),
    cola: { texto: k.ppm == null ? '—' : String(k.ppm), fuerte: false },
  }));
}

/** El título de una página de km: la primera lleva el desnivel de la sesión; las demás, qué km. */
export function tituloDeKm(r: Resultado, desde: number, hasta: number): string[] {
  return desde === 0 && r.desnivel != null ? ['Kilómetros', `+${r.desnivel} m`] : ['Kilómetros', `${desde + 1}–${hasta}`];
}
