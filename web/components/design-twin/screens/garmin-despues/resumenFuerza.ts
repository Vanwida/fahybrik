// EL RESUMEN DE FUERZA — cada ejercicio con sus series como quedaron. PURO.
//
//   Resumen    «22/22 series», el volumen (Σ reps × kg: solo lo que lleva carga)
//              y cuántas series quedaron sin anotar.
//   Ejercicio  una página por ejercicio: la dosis y su carga más pesada, la carga
//              serie a serie, el RIR y lo que se quedó por defecto.
//
// Honesto (P11): lo que el atleta CONFIRMÓ va en tinta y lo que se quedó con el
// valor por defecto —lo prescrito, que no cuenta como declarado— en tinta2 (en
// un MIP no existe la media luz: es un color, no una opacidad) y se cuenta. Un
// ejercicio de tiempo (el trineo) dice su media y su mejor serie, no una carga.
//
// La superserie A1/A2 se lee junta en la muñeca de Apple (dos ejercicios en una
// página); en un círculo cada ejercicio va en la suya, uno tras otro, con su
// posición arriba («Serie · A1») y su nombre debajo: nada se aprieta hasta el suelo.
//
// Qué NO hacer: sumar como volumen lo que no lleva carga; pintar una serie por
// defecto como hecha; partir un nombre de catálogo por donde no toca (se parte en dos líneas equilibradas).

import { NOMBRE_CLASE_DEFECTO, fmtPrescrito, fmtReloj, num, type Completitud } from '../../kit-reloj';
import { AIRE, REJILLA, TG, altoLinea, altoNota, caja, chica, colocar, heroeEn, lineasContexto, type LineaG, type Tono } from '../../kit-garmin';
import { masPesada, miles, volumen, type EjercicioHecho, type Resultado } from '../reloj-antes-despues/calculo';
import { cargaVaria, kgTexto, porDefecto, tieneRir } from '../reloj-antes-despues/resumen-fuerza';
import { ALTO_NOTA, apilarTexto, lineaDeTokens, partirFichas, repartirJunto, tokensDeTexto, type DisposicionFin, type Tok } from './comun';

const ESTADO = { completa: 'completa', parcial: 'parcial', libre: 'libre' } as const;

/** Las series anotadas y las que se quedaron por defecto, y el volumen. */
export function cuentasDeFuerza(r: Pick<Resultado, 'fuerza'>): { series: number; sinAnotar: number; volumen: number } {
  const series = r.fuerza.flatMap((e) => e.series);
  return { series: series.length, sinAnotar: series.filter((s) => !s.confirmada).length, volumen: r.fuerza.reduce((a, e) => a + volumen(e), 0) };
}

/** LA PRIMERA PÁGINA de fuerza. */
export function disponerResumenFuerza(r: Resultado, c: Completitud, D: number): DisposicionFin {
  const m = /^(\d+) de (\d+)/.exec(c.cuenta ?? '');
  const { series, sinAnotar, volumen: vol } = cuentasDeFuerza(r);
  const lineas: LineaG[] = [...lineasContexto(['Fuerza', ESTADO[c.estado]], D)];
  const heroe = heroeEn(m ? `${m[1]}/${m[2]}` : String(series), 'series', REJILLA.heroe[0], REJILLA.heroe[1], D);
  lineas.push(lineaDeTokens('volumen', [{ v: miles(vol) }, { u: 'kg de volumen' }], TG.tercero, 'banda', D));
  const [dS] = REJILLA.secundaria;
  const total: Tok[] = [{ v: fmtReloj(r.t) }, { u: 'total' }, ...(r.ppmMedio == null ? [] : (['·', { v: String(Math.round(r.ppmMedio)) }, { u: 'ppm' }] as Tok[]))];
  lineas.push(lineaDeTokens('total', total, TG.tercero, caja(dS, altoLinea(TG.tercero, 'cifras')), D));
  const y = dS + altoLinea(TG.tercero, 'cifras') + AIRE.lineas;
  lineas.push(colocar('nota', [chica(sinAnotar > 0 ? `${sinAnotar} sin anotar` : 'Todas anotadas', D)], caja(y, ALTO_NOTA), D));
  return { D, lineas, heroe, pista: null };
}

/** Los valores de cada serie, unos tras otros, cada uno en su tono (lo que quedó por defecto, en tinta2). */
function valoresPorSerie(e: EjercicioHecho, valor: (s: EjercicioHecho['series'][number]) => string): Tok[] {
  return e.series.flatMap((s, k): Tok[] => {
    const tono: Tono = s.confirmada ? 'tinta' : 'tinta2';
    return [...(k > 0 ? (['·'] as Tok[]) : []), ...tokensDeTexto(valor(s), tono)];
  });
}

/** Las líneas de dato de un ejercicio: la dosis con su carga, lo hecho serie a serie, el RIR, lo que falta anotar. */
export function fichasDeEjercicio(e: EjercicioHecho): { dosis: Tok[]; hecho: Tok[]; rir: Tok[] | null; nota: string | null } {
  const pr = e.paso.medida;
  const pesada = masPesada(e);
  const iguales = pr.tipo === 'reps' && e.series.every((s) => s.reps === pr.prescrito);
  const dosis = pr.tipo === 'reps' ? (iguales ? `${e.series.length} × ${pr.prescrito}` : `${e.series.length} series`) : `${e.series.length} × ${fmtPrescrito(pr)}`;
  const carga = pesada ? `${cargaVaria(e) ? 'máx ' : ''}${kgTexto(e, pesada)} kg` : pr.tipo === 'reps' ? 'reps' : null;
  const tiempos = e.series.map((s) => s.segundos).filter((x): x is number => x != null);
  const hecho = cargaVaria(e)
    ? valoresPorSerie(e, (s) => kgTexto(e, s))
    : tiempos.length > 0
      ? tokensDeTexto(`media ${fmtReloj(tiempos.reduce((a, x) => a + x, 0) / tiempos.length)} · mejor ${fmtReloj(Math.min(...tiempos))}`)
      : valoresPorSerie(e, (s) => (s.reps == null ? '—' : String(s.reps)));
  const defecto = porDefecto(e);
  return {
    dosis: tokensDeTexto(carga ? `${dosis} · ${carga}` : dosis),
    hecho,
    rir: tieneRir(e) ? [{ u: 'RIR' }, ...valoresPorSerie(e, (s) => (s.rir == null ? '—' : num(s.rir)))] : null,
    nota: defecto === 0 ? null : defecto === e.series.length ? 'Sin anotar' : `${defecto} sin anotar`,
  };
}

/**
 * UNA PÁGINA POR EJERCICIO: arriba su clase y su posición («Fuerza · A1»), su
 * nombre de catálogo en una o dos líneas (los hay largos: «Bulgarian Split
 * Squat») y, debajo, las líneas de dato juntas y centradas. Una línea que no
 * cabe entera (ocho cargas serie a serie) se parte en dos por un «·».
 */
export function disponerEjercicio(e: EjercicioHecho, D: number): DisposicionFin {
  const f = fichasDeEjercicio(e);
  const slot = e.paso.posicion?.slot;
  const lineas: LineaG[] = [...lineasContexto([NOMBRE_CLASE_DEFECTO[e.paso.clase], ...(slot ? [slot] : [])], D, 'tinta2')];
  const nombre = apilarTexto('nombre', e.paso.nombre ?? '', REJILLA.heroe[0], TG.tercero, D, { cara: 'texto' });
  lineas.push(...nombre.lineas);
  const filas: Array<{ rol: string; toks: Tok[] }> = [
    { rol: 'dosis', toks: f.dosis },
    { rol: 'hecho', toks: f.hecho },
    ...(f.rir ? [{ rol: 'rir', toks: f.rir }] : []),
  ];
  const alto = altoLinea(TG.tercero, 'cifras');
  const franja: readonly [number, number] = [nombre.y1, REJILLA.secundaria[1]];
  // Primero una línea por fila; las que no caben en la suya se parten en dos y se vuelve a repartir.
  const previas = repartirJunto(filas.length + (f.nota ? 1 : 0), alto, franja, altoNota);
  const partidas = filas.map((fila, k) => (!lineaDeTokens(fila.rol, fila.toks, TG.tercero, previas[k]!, D).cabe ? partirFichas(fila.toks) : null));
  const total = filas.length + partidas.filter(Boolean).length + (f.nota ? 1 : 0);
  const cajas = repartirJunto(total, alto, franja, altoNota);
  let c = 0;
  filas.forEach((fila, k) => {
    const dos = partidas[k];
    if (dos) dos.forEach((toks) => lineas.push(lineaDeTokens(fila.rol, toks, TG.tercero, cajas[c++]!, D)));
    else lineas.push(lineaDeTokens(fila.rol, fila.toks, TG.tercero, cajas[c++]!, D));
  });
  if (f.nota) lineas.push(colocar('nota', [chica(f.nota, D)], caja(cajas[c]!.y, ALTO_NOTA), D));
  return { D, lineas, heroe: null, pista: null };
}
