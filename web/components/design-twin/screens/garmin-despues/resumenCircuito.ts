// G30 · EL RESUMEN DE CIRCUITO — cada tramo de carrera y cada estación fue su
// propia vuelta (P10), así que el resumen los tiene. PURO.
//
//   Resumen     el tiempo del circuito (la puntuación), la carrera y las
//               estaciones por separado y la Roxzone si el coach la activó.
//   Carrera     cada tramo con su tiempo, su ritmo y lo que pierde tras una
//               estación («+14 s») o «fresco» (el que llegó sin estación antes).
//   Estaciones  cada una con su tiempo, su nombre de catálogo y su dosis.
//   Tras estación  EL COSTE DE LA CARRERA COMPROMETIDA, en s/km sobre el ritmo
//               fresco del propio atleta. Solo con los pares que pide el coach
//               (`MetodoResumen.paresMinimos`, 4 por defecto); con menos no se
//               da un número, se dice cuántos hay y por qué no (P10, Alex 25-09:
//               el cálculo sigue en prueba). Los segundos de más por tramo
//               tampoco se enseñan sin pares suficientes: serían el mismo
//               número sin validar, por la puerta de atrás.
//
// Las cuentas son las de la muñeca (`costeTrasEstacion` de kit-reloj y los
// ayudantes de `reloj-antes-despues/resumen-circuito`).
//
// Qué NO hacer: calcular aquí el coste (es `costeTrasEstacion`); dar un número
// con menos pares de los que pide el coach; pintar «HYROX» (aquí es «Circuito»).

import { fmtPrescrito, fmtReloj, fmtRitmo, costeTrasEstacion, type Coste, type Completitud, type MetodoResumen } from '../../kit-reloj';
import { AIRE, REJILLA, TG, altoLinea, caja, cajaEnFila, chica, colocar, heroeEn, lineaDePartes, lineasContexto, type LineaG } from '../../kit-garmin';
import type { Resultado } from '../reloj-antes-despues/calculo';
import { tiempoCircuito } from '../reloj-antes-despues/resultados';
import { carreras, dosisEstacion, estaciones, objetivoTexto, suma } from '../reloj-antes-despues/resumen-circuito';
import { ALTO_NOTA, apilarBloques, lineaDeTokens, lineaNota, type DisposicionFin } from './comun';
import { FILAS_POR_PAGINA, type FilaLista } from './lista';

export { carreras, estaciones, tiempoCircuito };

const ESTADO = { completa: 'completa', parcial: 'parcial', libre: 'libre' } as const;
/** Cuántas estaciones caben por página (cada una lleva su tiempo, su nombre y debajo su dosis). */
export const ESTACIONES_POR_PAGINA = FILAS_POR_PAGINA.conDetalle;

export const costeDe = (r: Resultado, metodo: MetodoResumen): Coste => costeTrasEstacion(r.circuito, metodo);

/** LA PRIMERA PÁGINA del circuito. */
export function disponerResumenCircuito(r: Resultado, c: Completitud, D: number): DisposicionFin {
  const lineas: LineaG[] = [...lineasContexto([c.cuenta ?? 'Circuito', ESTADO[c.estado]], D)];
  const y0 = REJILLA.heroe[0];
  lineas.push(colocar('etiqueta', [chica('circuito', D)], caja(y0, ALTO_NOTA), D));
  const heroe = heroeEn(fmtReloj(tiempoCircuito(r)), undefined, y0 + ALTO_NOTA + AIRE.lineas, REJILLA.heroe[1], D);
  lineas.push(lineaDeTokens('carrera', [{ t: 'Carrera' }, { v: fmtReloj(suma(carreras(r))) }], TG.tercero, 'banda', D));
  const [dS] = REJILLA.secundaria;
  lineas.push(lineaDeTokens('estaciones', [{ t: 'Estaciones' }, { v: fmtReloj(suma(estaciones(r))) }], TG.tercero, caja(dS, altoLinea(TG.tercero, 'cifras')), D));
  if (r.roxzoneS != null) lineas.push(lineaNota('roxzone', `Roxzone ${fmtReloj(r.roxzoneS)}`, dS + altoLinea(TG.tercero, 'cifras') + AIRE.lineas, D));
  return { D, lineas, heroe, pista: null };
}

/** El título de la página de carrera: «Carrera · 1000 m · RPE 8». */
export function tituloDeCarrera(r: Resultado): string[] {
  const primero = carreras(r)[0]?.paso;
  return ['Carrera', ...(primero ? [fmtPrescrito(primero.medida)] : []), ...(primero && objetivoTexto(primero) ? [objetivoTexto(primero)!] : [])];
}

/** Los tramos de carrera: «fresco» el que llegó sin estación; los demás, lo que pierden si el coste se da. */
export function filasDeCarrera(r: Resultado, coste: Coste): FilaLista[] {
  const fresco = coste.estado === 'hay' ? coste.fresco : null;
  return carreras(r).map((t) => {
    const ritmo = t.metros ? t.segundos / (t.metros / 1000) : null;
    const d = fresco != null && ritmo != null && t.tras != null ? Math.round(ritmo - fresco) : null;
    return {
      n: String(t.ronda),
      valor: fmtReloj(t.segundos),
      apoyo: t.metros != null && t.metros !== 1000 ? fmtRitmo(ritmo) : null,
      cola: t.tras == null ? { texto: 'fresco', fuerte: false } : d != null ? { texto: `${d >= 0 ? '+' : '−'}${Math.abs(d)} s`, fuerte: true } : null,
    };
  });
}

/** Las estaciones: su tiempo, su nombre de catálogo y debajo su dosis. */
export function filasDeEstaciones(r: Resultado): FilaLista[] {
  return estaciones(r).map((t) => ({ valor: fmtReloj(t.segundos), cola: { texto: t.paso.nombre ?? '', fuerte: true }, detalle: dosisEstacion(t.paso) || null }));
}

/** El total de estaciones, para el título de sus páginas. */
export const totalEstaciones = (r: Resultado): string => fmtReloj(suma(estaciones(r)));

/** LA PÁGINA DEL COSTE — el número si lo hay; si no, cuántos pares hay frente a los que pide el coach y por qué no. */
export function disponerCoste(coste: Coste, D: number): DisposicionFin {
  const hay = coste.estado === 'hay';
  // Con número, cuántos pares lo sostienen va en el contexto (si no cabe, se pierde antes que el título).
  const lineas: LineaG[] = [...lineasContexto(['Tus km tras estación', ...(hay ? [`${coste.pares} pares`] : [])], D, 'tinta2')];
  const [dS] = REJILLA.secundaria;
  const faltan = coste.estado === 'faltan';
  const heroe = hay
    ? heroeEn(`${coste.seg >= 0 ? '+' : '−'}${Math.abs(coste.seg)}`, 's/km', REJILLA.heroe[0], REJILLA.heroe[1], D)
    : heroeEn(faltan ? `${coste.pares}/${coste.minimo}` : '—', faltan ? 'pares' : undefined, REJILLA.heroe[0], REJILLA.heroe[1], D, 'tinta2');
  const instruccion = lineaDePartes('instruccion', [hay ? 'sobre tu fresco' : faltan ? 'Aún sin coste' : 'Sin km fresco'], TG.tercero, cajaEnFila('banda', altoLinea(TG.tercero, 'texto')), D);
  lineas.push(...instruccion);
  // Las notas bajan de la instrucción (que en la franja de la banda es más alta que ella).
  const yNotas = Math.max(dS, ...instruccion.map((l) => (l.y + l.alto) / D + AIRE.lineas));
  lineas.push(
    ...apilarBloques(
      hay
        ? [{ rol: 'nota', texto: `${fmtRitmo(coste.fresco)} fresco · ${fmtRitmo(coste.tras)} tras` }, { rol: 'nota', texto: 'En prueba' }]
        : [{ rol: 'nota', texto: faltan ? 'Sería adivinar' : 'Nada con qué comparar' }],
      yNotas,
      TG.nota,
      D,
    ).lineas,
  );
  return { D, lineas, heroe, pista: null };
}

