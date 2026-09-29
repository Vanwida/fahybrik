// LA PÁGINA DEL PULSO — cuánto se estuvo en cada zona del coach. PURA.
//
// Una fila por zona: su nombre («Z2») en el color de la zona, una barra
// proporcional al tiempo y el tiempo. Solo las zonas que la sesión tocó, de la
// más baja a la más alta usada (una tirada suave no lista las cinco del coach
// con tres ceros): lo que hay entre medias sin tiempo sale con «—», nunca con
// un cero, y lo que queda fuera del rango no se cuenta como cero, no se cuenta.
// Encima, el pulso medio y el máximo. Sin lectura de pulso, la página lo dice.
//
// Las zonas y sus colores son del coach (`ZonasCoach`, `colorZona`); aquí no
// hay ninguna banda. En MIP el color pasa por `aMip` al pintar (el pintor).
//
// Qué NO hacer: pintar el pulso de un reloj sin correa como medido; usar el
// naranja (es de la acción); poner una barra sin su tiempo al lado.

import { colorZona } from '../../kit-reloj/tokens';
import { fmtReloj } from '../../kit-reloj/reglas';
import {
  AIRE,
  PISTA,
  TG,
  altoLinea,
  anchoPieza,
  caja,
  chica,
  colocar,
  cuerpoPx,
  lineasContexto,
  type LineaG,
  type Pieza,
} from '../../kit-garmin';
import type { Resultado } from '../reloj-antes-despues/calculo';
import { ALTO_NOTA, CUERPO, lineaDeTokens, repartirJunto, type BarraG, type DisposicionFin } from './comun';
import { repartoEnPaginas } from './lista';

/** Cuántas filas de zona caben en una página (con el pulso medio en la primera): medido a 218. */
export const ZONAS_POR_PAGINA = 6;

/** Las zonas (índices 0-based) de la más baja a la más alta con tiempo: el rango que se lista. */
export function zonasUsadas(zonasS: readonly number[]): number[] {
  const con = zonasS.map((s, i) => (s > 0 ? i : -1)).filter((i) => i >= 0);
  if (con.length === 0) return [];
  const [desde, hasta] = [con[0]!, con[con.length - 1]!];
  return Array.from({ length: hasta - desde + 1 }, (_, k) => desde + k);
}

/** Cuántas páginas de pulso tiene un resultado y cuántas zonas lleva cada una. */
export const repartoDePulso = (r: Pick<Resultado, 'zonasS'>): number[] => repartoEnPaginas(zonasUsadas(r.zonasS).length, ZONAS_POR_PAGINA);

/** La página `k` del pulso. */
export function disponerPulso(r: Pick<Resultado, 'zonas' | 'zonasS' | 'ppmMedio' | 'ppmMax'>, k: number, D: number): DisposicionFin {
  const usadas = zonasUsadas(r.zonasS);
  const reparto = repartoEnPaginas(usadas.length, ZONAS_POR_PAGINA);
  const titulo = reparto.length > 1 ? ['Pulso', `${k + 1}/${reparto.length}`] : ['Pulso'];
  const lineas: LineaG[] = [...lineasContexto(titulo, D, 'tinta2')];
  if (usadas.length === 0) {
    lineas.push(colocar('sin-pulso', [chica(r.ppmMedio == null ? 'Sin pulso en esta sesión' : 'Sin tiempo en zonas', D)], caja(0.5 - ALTO_NOTA / 2, ALTO_NOTA), D));
    return { D, lineas, heroe: null, pista: null, barras: [] };
  }
  const desde = reparto.slice(0, k).reduce((a, x) => a + x, 0);
  const propias = usadas.slice(desde, desde + (reparto[k] ?? 0));
  const cabecera = k === 0 && r.ppmMedio != null;
  const filas = propias.length + (cabecera ? 1 : 0);
  const altoFila = altoLinea(TG.nota, 'texto');
  const cajas = repartirJunto(filas, altoFila, CUERPO, AIRE.piezas);
  if (cabecera) {
    lineas.push(
      lineaDeTokens('medio', [{ v: String(Math.round(r.ppmMedio!)) }, { u: 'medio' }, ...(r.ppmMax != null ? (['·', { v: String(r.ppmMax) }, { u: 'máx' }] as const) : [])], TG.tercero, cajas[0]!, D),
    );
  }
  const max = Math.max(1, ...r.zonasS);
  const n = r.zonas.techos.length;
  const barras: BarraG[] = [];
  propias.forEach((z, j) => {
    const c = cajas[j + (cabecera ? 1 : 0)]!;
    const s = r.zonasS[z] ?? 0;
    const etiqueta: Pieza = { texto: `Z${z + 1}`, cara: 'texto', cuerpo: cuerpoPx(TG.nota, D), tono: { dato: colorZona(z + 1, n) } };
    const tiempo: Pieza = s > 0 ? { texto: fmtReloj(s), cara: 'cifras', cuerpo: cuerpoPx(TG.nota, D), tono: 'tinta' } : { texto: '—', cara: 'cifras', cuerpo: cuerpoPx(TG.nota, D), tono: 'tinta2' };
    const l = colocar('zona', [etiqueta, tiempo], c, D, 'extremos');
    lineas.push(l);
    // La barra ocupa lo que dejan la etiqueta y el tiempo dentro de la cuerda de su fila.
    const izq = (D - l.anchoUtil) / 2 + anchoPieza(etiqueta) + AIRE.piezas * D;
    const der = (D + l.anchoUtil) / 2 - anchoPieza(tiempo) - AIRE.piezas * D;
    const alto = Math.max(1, Math.round(PISTA.alto * D));
    barras.push({ x: izq, y: c.y * D + (c.alto * D - alto) / 2, ancho: Math.max(0, der - izq), alto, llena: s > 0 ? Math.max(alto / Math.max(1, der - izq), s / max) : 0, color: colorZona(z + 1, n) });
  });
  return { D, lineas, heroe: null, pista: null, barras };
}
